import type { SupabaseClient } from '@supabase/supabase-js';

import { deriveWizardLifecyclePhase } from '@/lib/rentalWizard/rentalWizardGates';
import { getProfileNameForUserId, prefetchProfileNamesForUserIds } from '@/lib/profileDisplayName';
import { fetchRentalWizardEnrichment } from '@/lib/rentalWizard/fetchRentalWizardEnrichment';
import { resolveListingHeroUrl } from '@/lib/rentalWizard/resolveListingHeroUrl';
import {
  deriveDualConfirmation,
  fetchVerificationPhotos,
  fetchVerificationRows,
} from '@/lib/rentalVerification';
import {
  buildRentalWizardContextFlags,
} from '@/lib/rentalWizard/rentalWizardContextFlags';
import {
  isPickupHandoffBilaterallyComplete,
  isReturnBilaterallyComplete,
} from '@/lib/rentalWizard/rentalWizardStepResolver';
import { fetchRentalWizardState } from '@/lib/rentalWizard/rentalWizardSeenState';
import type { RentalWizardContext, RentalWizardRentalRow } from '@/lib/rentalWizard/types';
import { resolveAcceptedRentalPickupIso } from '@/lib/rentalWizard/acceptedPickupCoordination';
import { logPickupCoordinationDiagnostic } from '@/lib/rentalWizard/pickupCoordinationDiagnostics';
import { assertNoPhaseRegression } from '@/lib/rentalLifecycle/operationalIntegrity';
import { assertRentalLifecycleIntegrity } from '@/lib/rentalLifecycle/lifecycleTransitionValidator';
import { logScenario } from '@/lib/rentalLifecycle/scenarioDevLog';
import { resolveRentalReturnIso } from '@/lib/rentalExtensionProposal';

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

export async function buildRentalWizardContext(
  supabase: SupabaseClient,
  rentalId: string,
  viewerUserId: string
): Promise<RentalWizardContext | null> {
  const { data: rentalData, error } = await supabase
    .from('rentals')
    .select('*')
    .eq('id', rentalId)
    .maybeSingle();

  if (error || !rentalData) return null;

  const rental = rentalData as RentalWizardRentalRow;
  if (rental.renter_user_id !== viewerUserId) {
    return null;
  }

  const { meetingCompleted, hasPendingProposal } = buildRentalWizardContextFlags(rental);
  const termsCompleted = rental.price != null && Number.isFinite(Number(rental.price));

  let verificationRows: Awaited<ReturnType<typeof fetchVerificationRows>> = [];
  let ownerPickupPhotoCount = 0;
  if (meetingCompleted) {
    verificationRows = await fetchVerificationRows(supabase, rentalId);
    const pickupPhotos = await fetchVerificationPhotos(supabase, rentalId, 'pickup');
    ownerPickupPhotoCount = pickupPhotos.filter((p) => p.role === 'owner').length;
  }

  const pickupAck = deriveDualConfirmation(verificationRows, 'pickup');
  const returnAck = deriveDualConfirmation(verificationRows, 'return');
  const pickupHandoffComplete = isPickupHandoffBilaterallyComplete({
    pickupAck,
    signedAt: rental.signed_at,
  });
  const returnHandoffComplete = isReturnBilaterallyComplete(returnAck);

  const wizardState = await fetchRentalWizardState(supabase, rentalId, viewerUserId);
  let wizardProgress = wizardState.wizardProgress;
  if (meetingCompleted && wizardProgress.coordinate_pickup_draft != null) {
    const { coordinate_pickup_draft: _draft, ...rest } = wizardProgress;
    wizardProgress = rest;
  }
  const [displayTitle, enrichment] = await Promise.all([
    resolveDisplayTitle(supabase, rental),
    fetchRentalWizardEnrichment(supabase, rental),
  ]);

  await prefetchProfileNamesForUserIds([rental.owner_user_id]);

  const heroImageUrl = resolveListingHeroUrl(
    enrichment.listingSnapshot,
    enrichment.listingSnapshotRaw
  );
  const snapshotTitle = enrichment.listingSnapshot?.title?.trim();

  const ctxDraft: RentalWizardContext = {
    rentalId,
    viewerUserId,
    viewerRole: 'renter',
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
    hasPendingProposal,
    pickupHandoffComplete,
    returnHandoffComplete,
    pickupAck,
    returnAck,
    ownerPickupPhotoCount,
    pickupIso: resolveAcceptedRentalPickupIso(rental),
    returnIso: resolveRentalReturnIso(rental),
    seenTransitions: wizardState.seenTransitions,
    wizardProgress,
    verificationRows,
  };

  const fullCtx = {
    ...ctxDraft,
    lifecyclePhase: deriveWizardLifecyclePhase(ctxDraft),
  };

  logPickupCoordinationDiagnostic(fullCtx, 'buildRentalWizardContext', {
    logicalStepHint: 'see resolveLogicalWizardStep',
  });

  assertRentalLifecycleIntegrity(fullCtx, 'buildRentalWizardContext');
  assertNoPhaseRegression(fullCtx, 'buildRentalWizardContext');
  logScenario('lifecycle', {
    event: 'context_built',
    rentalId,
    source: 'buildRentalWizardContext',
    status: fullCtx.rental.status,
    cancellation_status: fullCtx.rental.cancellation_status,
    pickupHandoffComplete: fullCtx.pickupHandoffComplete,
  });

  return fullCtx;
}
