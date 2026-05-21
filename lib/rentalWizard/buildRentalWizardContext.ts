import type { SupabaseClient } from '@supabase/supabase-js';

import {
  detectMissingActivationColumns,
  isActivationSchemaDegraded,
  logRentalActivationSchema,
  normalizeRentalRowForWizard,
  parsePostgrestMissingColumn,
  pickupHandoffCompleteForContext,
  safeResolveRentalActivationState,
} from '@/lib/rentalActivationSchema';
import { deriveWizardLifecyclePhase } from '@/lib/rentalWizard/rentalWizardGates';
import { safeResolveLogicalWizardStep } from '@/lib/rentalWizard/rentalWizardStepResolver';
import { logRentalStageTransitionAudit } from '@/lib/rentalStageTransitionAudit';
import { getProfileNameForUserId, prefetchProfileNamesForUserIds } from '@/lib/profileDisplayName';
import { fetchRentalWizardEnrichment } from '@/lib/rentalWizard/fetchRentalWizardEnrichment';
import { resolveListingHeroUrl } from '@/lib/rentalWizard/resolveListingHeroUrl';
import { fetchOwnerPickupEvidenceDisplay } from '@/lib/pickupEvidenceDisplay';
import { evaluatePickupEvidenceReadiness } from '@/lib/pickupEvidenceReadiness';
import { computeOwnerPickupEvidenceRevision } from '@/lib/rentalPickupViewerFlags';
import { deriveDualConfirmation, fetchVerificationRows } from '@/lib/rentalVerification';
import { buildRentalWizardContextFlags } from '@/lib/rentalWizard/rentalWizardContextFlags';
import {
  buildPickupHandoffCompletionInputFromParts,
  logPickupLifecycleDesync,
} from '@/lib/pickupHandoffCompletion';
import { logRentalActivation } from '@/lib/rentalActivation';
import { isReturnBilaterallyComplete } from '@/lib/rentalOperationalAttention';
import { fetchRentalWizardState, updateWizardProgress } from '@/lib/rentalWizard/rentalWizardSeenState';
import type { RentalWizardContext, RentalWizardRentalRow } from '@/lib/rentalWizard/types';
import { logPickupCoordinationDiagnostic } from '@/lib/rentalWizard/pickupCoordinationDiagnostics';
import { assertNoPhaseRegression } from '@/lib/rentalLifecycle/operationalIntegrity';
import { assertRentalLifecycleIntegrity } from '@/lib/rentalLifecycle/lifecycleTransitionValidator';
import { logScenario } from '@/lib/rentalLifecycle/scenarioDevLog';
import {
  recordCanonicalMeetupCoordinationSnapshot,
  resolveCanonicalMeetupCoordinationState,
  roleForViewerOnRental,
} from '@/lib/canonicalMeetupCoordination';
import { recordMeetupCoordinationSurfaceSnapshot } from '@/lib/rentalMeetupCoordinationState';

function rentalCodeFromId(id: string): string {
  const compact = id.replace(/-/g, '').slice(0, 6).toUpperCase();
  return `Rental #${compact}`;
}

async function resolveDisplayTitle(
  supabase: SupabaseClient,
  rental: RentalWizardRentalRow
): Promise<string> {
  if (rental.listing_id) {
    const { data } = await supabase.from('listings').select('title').eq('id', rental.listing_id).maybeSingle();
    if (data?.title && String(data.title).trim()) return String(data.title).trim();
  }
  if (rental.request_id) {
    const { data } = await supabase.from('requests').select('title').eq('id', rental.request_id).maybeSingle();
    if (data?.title && String(data.title).trim()) return String(data.title).trim();
  }
  return 'Rental item';
}

export type BuildRentalWizardContextResult = {
  ctx: RentalWizardContext | null;
  buildError: string | null;
};

export async function buildRentalWizardContext(
  supabase: SupabaseClient,
  rentalId: string,
  viewerUserId: string
): Promise<RentalWizardContext | null> {
  const result = await buildRentalWizardContextWithDiagnostics(supabase, rentalId, viewerUserId);
  return result.ctx;
}

export async function buildRentalWizardContextWithDiagnostics(
  supabase: SupabaseClient,
  rentalId: string,
  viewerUserId: string
): Promise<BuildRentalWizardContextResult> {
  const schemaLog = (phase: string, extra?: Partial<Parameters<typeof logRentalActivationSchema>[0]>) => {
    logRentalActivationSchema({
      rentalId,
      wizardBuildPhase: phase,
      ...extra,
    });
  };

  try {
    schemaLog('fetch_rental_start');
    const { data: rentalData, error } = await supabase
      .from('rentals')
      .select('*')
      .eq('id', rentalId)
      .maybeSingle();

    if (error) {
      const missingCol = parsePostgrestMissingColumn(error);
      schemaLog('fetch_rental_error', {
        failedSelectFields: missingCol ? [missingCol] : undefined,
        error: error.message,
      });
      return { ctx: null, buildError: error.message || 'Failed to load rental.' };
    }

    if (!rentalData) {
      schemaLog('fetch_rental_missing');
      return { ctx: null, buildError: 'Rental not found.' };
    }

    const rawRow = rentalData as Record<string, unknown>;
    const missingColumns = detectMissingActivationColumns(rawRow);
    const schemaDegraded = isActivationSchemaDegraded(missingColumns);
    if (missingColumns.length > 0) {
      schemaLog('schema_parity', { missingColumns, schemaDegraded });
    }

    const rental = normalizeRentalRowForWizard(rentalData as RentalWizardRentalRow);
    if (rental.renter_user_id !== viewerUserId) {
      return { ctx: null, buildError: 'This rental is not available for the guided flow.' };
    }

    schemaLog('flags');
    const flags = buildRentalWizardContextFlags(rental);
    const {
      meetingCompleted,
      meetingAgreementCleared,
      pickupCoordinationComplete,
      returnCoordinationAgreed,
      meetupCoordinationComplete,
      hasPendingProposal,
    } = flags;
    const termsCompleted = rental.price != null && Number.isFinite(Number(rental.price));

    schemaLog('verification_evidence');
    let verificationRows: Awaited<ReturnType<typeof fetchVerificationRows>> = [];
    let ownerPickupEvidence: Awaited<ReturnType<typeof fetchOwnerPickupEvidenceDisplay>> = [];
    try {
      if (pickupCoordinationComplete) {
        verificationRows = await fetchVerificationRows(supabase, rentalId);
        ownerPickupEvidence = await fetchOwnerPickupEvidenceDisplay(supabase, rentalId);
      }
    } catch (err) {
      schemaLog('verification_evidence_error', {
        resolverCrashLocation: 'fetchVerificationRows|fetchOwnerPickupEvidenceDisplay',
        error: err instanceof Error ? err.message : String(err),
        schemaDegraded: true,
      });
    }

    const pickupEvidenceReadiness = evaluatePickupEvidenceReadiness(ownerPickupEvidence);
    const ownerPickupPhotoCount = pickupEvidenceReadiness.ownerPhotoCount;

    const pickupAck = deriveDualConfirmation(verificationRows, 'pickup');
    const returnAck = deriveDualConfirmation(verificationRows, 'return');

    schemaLog('wizard_state');
    const wizardState = await fetchRentalWizardState(supabase, rentalId, viewerUserId);
    let wizardProgress = wizardState.wizardProgress;
    const evidenceRevision = computeOwnerPickupEvidenceRevision(
      ownerPickupEvidence.map((p) => ({
        id: p.id,
        path: p.storagePath,
        pickupPhotoCategory: p.pickupPhotoCategory,
        createdAt: p.createdAt,
      }))
    );
    const priorEvidenceRevision = wizardProgress.renter_pickup_evidence_seen_revision?.trim() || null;
    if (
      priorEvidenceRevision != null &&
      priorEvidenceRevision !== evidenceRevision &&
      wizardProgress.renter_pickup_evidence_review_opened_at
    ) {
      wizardProgress = {
        ...wizardProgress,
        renter_pickup_evidence_review_opened_at: null,
      };
      try {
        await updateWizardProgress(rentalId, viewerUserId, {
          renter_pickup_evidence_review_opened_at: null,
        });
      } catch (err) {
        schemaLog('wizard_progress_patch_error', {
          resolverCrashLocation: 'updateWizardProgress',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    if (pickupCoordinationComplete && wizardProgress.coordinate_pickup_draft != null) {
      const { coordinate_pickup_draft: _draft, ...rest } = wizardProgress;
      wizardProgress = rest;
    }

    schemaLog('activation_resolve');
    const handoffInput = buildPickupHandoffCompletionInputFromParts({
      rental,
      pickupAck,
      wizardProgress,
      verificationRows,
      viewerUserId,
    });
    const rentalActivation = safeResolveRentalActivationState(handoffInput, {
      rentalId,
      wizardBuildPhase: 'activation_resolve',
      schemaDegraded,
      missingColumns,
    });
    const pickupHandoffComplete = pickupHandoffCompleteForContext({
      rentalActivation,
      schemaDegraded,
      missingColumns,
    });
    logRentalActivation({
      rentalId,
      surface: 'buildRentalWizardContext',
      activation: rentalActivation,
      transitionReason: schemaDegraded ? 'schema_degraded' : undefined,
    });
    const returnHandoffComplete = isReturnBilaterallyComplete(returnAck);

    schemaLog('enrichment');
    const [displayTitle, enrichment] = await Promise.all([
      resolveDisplayTitle(supabase, rental),
      fetchRentalWizardEnrichment(supabase, rental),
    ]);

    try {
      await prefetchProfileNamesForUserIds([rental.owner_user_id]);
    } catch {
      /* non-fatal */
    }

    const heroImageUrl = resolveListingHeroUrl(
      enrichment.listingSnapshot,
      enrichment.listingSnapshotRaw
    );
    const snapshotTitle = enrichment.listingSnapshot?.title?.trim();

    const viewerRole = roleForViewerOnRental(
      rental as import('@/lib/rentalMeetupProposalLifecycle').RentalMeetupRow,
      viewerUserId
    );
    const meetupCoordination = resolveCanonicalMeetupCoordinationState({
      rental: rental as import('@/lib/rentalMeetupProposalLifecycle').RentalMeetupRow,
      viewerUserId,
      viewerRole,
      presentationSurface: viewerRole === 'owner' ? 'owner_workspace' : 'renter_wizard',
      requestSchedulingMeta: enrichment.requestSchedulingMeta,
      pickupHandoffComplete,
      revision: 0,
    });

    const ctxDraft: RentalWizardContext = {
      rentalId,
      viewerUserId,
      viewerRole,
      rental,
      displayTitle: snapshotTitle || displayTitle,
      ownerDisplayName: getProfileNameForUserId(rental.owner_user_id),
      heroImageUrl,
      listingSnapshot: enrichment.listingSnapshot,
      agreedDeliveryMethod: enrichment.agreedDeliveryMethod,
      agreedDeliveryFee: enrichment.agreedDeliveryFee,
      scheduleHints: enrichment.scheduleHints,
      requestSchedulingMeta: enrichment.requestSchedulingMeta,
      rentalCodeLabel: rentalCodeFromId(rentalId),
      lifecyclePhase: 'pickup',
      termsCompleted,
      meetingCompleted,
      meetingAgreementCleared,
      pickupCoordinationComplete: meetupCoordination.pickupCoordinationComplete,
      returnCoordinationAgreed: meetupCoordination.returnCoordinationComplete,
      meetupCoordinationComplete: meetupCoordination.meetupCoordinationComplete,
      hasPendingProposal: meetupCoordination.hasPendingProposal,
      pickupHandoffComplete,
      returnHandoffComplete,
      pickupAck,
      returnAck,
      ownerPickupPhotoCount,
      ownerPickupEvidence,
      pickupEvidenceReadiness,
      pickupIso: meetupCoordination.pickupIso,
      returnIso: meetupCoordination.returnIso,
      meetupCoordination,
      seenTransitions: wizardState.seenTransitions,
      wizardProgress,
      verificationRows,
      schemaDegraded,
      missingActivationColumns: missingColumns.length > 0 ? [...missingColumns] : undefined,
    };

    const fullCtx = {
      ...ctxDraft,
      lifecyclePhase: deriveWizardLifecyclePhase(ctxDraft),
    };

    schemaLog('routing_resolve');
    const logicalStep = safeResolveLogicalWizardStep(fullCtx);
    logPickupCoordinationDiagnostic(fullCtx, 'buildRentalWizardContext', {
      logicalStepHint: logicalStep,
    });
    logPickupLifecycleDesync({
      rentalId,
      surface: 'buildRentalWizardContext',
      wizardLogicalStep: logicalStep,
      lifecyclePhase: fullCtx.lifecyclePhase,
      completion: rentalActivation.physical,
      rentalActivated: rentalActivation.rentalActivated,
      transitionReason: `logicalStep=${logicalStep}; rentalActivated=${rentalActivation.rentalActivated}; auth=${rentalActivation.authorization.phase}; schemaDegraded=${schemaDegraded}`,
    });

    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      try {
        logRentalStageTransitionAudit({
          rentalId,
          triggeredBy: 'buildRentalWizardContext',
          transitionReason: `logicalStep=${logicalStep}`,
          resolvedOwnerPhase: null,
          resolvedRenterPhase: logicalStep,
          rental,
          pickupComplete: pickupCoordinationComplete,
          returnComplete: returnCoordinationAgreed,
          meetupComplete: meetupCoordinationComplete,
        });
      } catch {
        /* audit only */
      }
    }

    try {
      recordCanonicalMeetupCoordinationSnapshot({
        rentalId,
        surface: 'renter_wizard',
        state: meetupCoordination,
        lifecyclePhase: fullCtx.lifecyclePhase,
      });
      recordMeetupCoordinationSurfaceSnapshot({
        rentalId,
        surface: 'wizard',
        resolver: 'resolveCanonicalMeetupCoordinationState',
        rental,
        requestSchedulingMeta: enrichment.requestSchedulingMeta,
        hasPendingProposal: meetupCoordination.hasPendingProposal,
        wizardCtx: fullCtx,
        lifecyclePhase: fullCtx.lifecyclePhase,
        viewerUserId,
        pickupHandoffComplete,
      });
    } catch (err) {
      schemaLog('coordination_snapshot_error', {
        resolverCrashLocation: 'recordMeetupCoordinationSurfaceSnapshot',
        error: err instanceof Error ? err.message : String(err),
      });
    }

    try {
      assertRentalLifecycleIntegrity(fullCtx, 'buildRentalWizardContext');
      assertNoPhaseRegression(fullCtx, 'buildRentalWizardContext');
    } catch {
      /* DEV assertions must not block wizard */
    }

    logScenario('lifecycle', {
      event: 'context_built',
      rentalId,
      source: 'buildRentalWizardContext',
      status: fullCtx.rental.status,
      cancellation_status: fullCtx.rental.cancellation_status,
      pickupHandoffComplete: fullCtx.pickupHandoffComplete,
      schemaDegraded,
    });

    schemaLog('complete', { schemaDegraded });
    return { ctx: fullCtx, buildError: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    schemaLog('fatal', {
      resolverCrashLocation: 'buildRentalWizardContext',
      error: message,
      schemaDegraded: true,
    });
    return { ctx: null, buildError: message };
  }
}
