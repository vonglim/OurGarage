import type { SupabaseClient } from '@supabase/supabase-js';
import * as Device from 'expo-device';

import { normalizeLegalName } from '@/lib/legalName';
import { calculatePreauthAmount } from '@/lib/rentalProtection';
import { insertRentalAgreementSnapshot } from '@/lib/rentalAgreement';
import {
  LIABILITY_DISCLOSURE_VERSION,
  RENTAL_AGREEMENT_VERSION,
} from '@/lib/rentalAuthorization/constants';
import { finalizeRentalActivation } from '@/lib/pickupHandoffMilestones';
import { updateWizardProgress } from '@/lib/rentalWizard/rentalWizardSeenState';
import type { RentalWizardContext } from '@/lib/rentalWizard/types';

export type AuthorizationActionResult = { ok: true } | { ok: false; error: string };

function deviceMetadata(): Record<string, string | null> {
  return {
    device_model: Device.modelName ?? null,
    os_name: Device.osName ?? null,
    os_version: Device.osVersion ?? null,
    app_version: null,
  };
}

export async function persistEquipmentConditionAcknowledgment(
  client: SupabaseClient,
  ctx: RentalWizardContext,
  at = new Date().toISOString()
): Promise<AuthorizationActionResult> {
  const { error } = await client
    .from('rentals')
    .update({ equipment_condition_acknowledged_at: at })
    .eq('id', ctx.rentalId);
  if (error) return { ok: false, error: error.message };

  await updateWizardProgress(ctx.rentalId, ctx.viewerUserId, {
    equipment_condition_acknowledged_at: at,
  });
  return { ok: true };
}

export async function persistRentalAgreementReview(
  client: SupabaseClient,
  ctx: RentalWizardContext,
  at = new Date().toISOString()
): Promise<AuthorizationActionResult> {
  const { error } = await client
    .from('rentals')
    .update({
      agreement_acknowledged_at: at,
      signed_agreement_version: RENTAL_AGREEMENT_VERSION,
    })
    .eq('id', ctx.rentalId);
  if (error) return { ok: false, error: error.message };

  await updateWizardProgress(ctx.rentalId, ctx.viewerUserId, {
    rental_agreement_acknowledged_at: at,
  });
  return { ok: true };
}

export type LiabilityDisclosureInput = {
  lateFeePolicyAccepted: boolean;
  protectionDeclinedAcknowledged: boolean;
  protectionCoverageAccepted: boolean;
  riskInitials: string;
};

export async function persistLiabilityDisclosures(
  client: SupabaseClient,
  ctx: RentalWizardContext,
  input: LiabilityDisclosureInput,
  at = new Date().toISOString()
): Promise<AuthorizationActionResult> {
  if (!input.lateFeePolicyAccepted) {
    return { ok: false, error: 'Accept the late return policy to continue.' };
  }
  if (!input.protectionDeclinedAcknowledged && !input.protectionCoverageAccepted) {
    return { ok: false, error: 'Acknowledge protection coverage or declined coverage responsibility.' };
  }
  const riskInitials = input.riskInitials.trim();
  if (riskInitials.length < 2) {
    return { ok: false, error: 'Enter your initials for the inherent risk acknowledgment.' };
  }

  const patch: Record<string, unknown> = {
    liability_disclosure_acknowledged_at: at,
    late_fee_policy_acknowledged_at: at,
    signed_liability_disclosure_version: LIABILITY_DISCLOSURE_VERSION,
    protection_coverage_acknowledged: input.protectionCoverageAccepted,
  };
  if (input.protectionDeclinedAcknowledged) {
    patch.protection_declined_acknowledged_at = at;
  }

  const { error } = await client.from('rentals').update(patch).eq('id', ctx.rentalId);
  if (error) return { ok: false, error: error.message };

  await updateWizardProgress(ctx.rentalId, ctx.viewerUserId, {
    liability_disclosure_acknowledged_at: at,
    late_fee_policy_acknowledged_at: at,
    liability_risk_initials: riskInitials,
    ...(input.protectionDeclinedAcknowledged
      ? { protection_declined_acknowledged_at: at }
      : {}),
  });
  return { ok: true };
}

export async function persistSecurityHoldAuthorization(
  client: SupabaseClient,
  ctx: RentalWizardContext,
  replacementValue: number,
  at = new Date().toISOString()
): Promise<AuthorizationActionResult> {
  const preauthAmount = calculatePreauthAmount(replacementValue);
  const { error } = await client
    .from('rentals')
    .update({
      preauth_status: 'authorized',
      preauth_authorized_at: at,
      preauth_amount: preauthAmount,
    })
    .eq('id', ctx.rentalId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export type DigitalSignatureInput = {
  legalName: string;
  agreementText: string;
  rentalSummaryJson: Record<string, unknown>;
  replacementValue: number;
  dailyLateFee: number;
  maxLateFeeCap: number;
  verificationPhotoRefs: Array<{ id: string; path: string | null; phase: string | null }>;
};

export async function persistDigitalSignature(
  client: SupabaseClient,
  ctx: RentalWizardContext,
  input: DigitalSignatureInput,
  at = new Date().toISOString()
): Promise<AuthorizationActionResult> {
  const typedTrimmed = input.legalName.trim();
  if (!typedTrimmed) return { ok: false, error: 'Enter your full legal name.' };

  const typedNorm = normalizeLegalName(input.legalName);
  const preauthAmount = calculatePreauthAmount(input.replacementValue);

  const snapshot = await insertRentalAgreementSnapshot(client, {
    rentalId: ctx.rentalId,
    signedByUserId: ctx.viewerUserId,
    agreementVersion: RENTAL_AGREEMENT_VERSION,
    agreementText: input.agreementText,
    rentalSummaryJson: {
      ...input.rentalSummaryJson,
      ...deviceMetadata(),
      liability_disclosure_version: LIABILITY_DISCLOSURE_VERSION,
    },
    signedNameNormalized: typedNorm,
    signedNameAsEntered: typedTrimmed,
    signedAt: at,
    replacementValue: input.replacementValue,
    dailyLateFee: input.dailyLateFee,
    maxLateFeeCap: input.maxLateFeeCap,
    preauthAmount,
    verificationPhotoRefs: input.verificationPhotoRefs,
  });

  if (!snapshot.ok) {
    return {
      ok: false,
      error:
        snapshot.kind === 'schema_unavailable'
          ? 'Agreement storage is temporarily unavailable. Try again shortly.'
          : 'Could not save agreement snapshot.',
    };
  }

  const { error } = await client
    .from('rentals')
    .update({
      handoff_approved_by_renter: true,
      signed_name: typedNorm,
      signed_at: at,
      signed_agreement_user_id: ctx.viewerUserId,
      signed_agreement_version: RENTAL_AGREEMENT_VERSION,
      signed_liability_disclosure_version: LIABILITY_DISCLOSURE_VERSION,
      agreement_version: RENTAL_AGREEMENT_VERSION,
    })
    .eq('id', ctx.rentalId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function persistRentalActivation(
  client: SupabaseClient,
  rentalId: string,
  at = new Date().toISOString()
): Promise<AuthorizationActionResult> {
  const result = await finalizeRentalActivation(client, rentalId, at);
  if (!result.ok) return { ok: false, error: result.error ?? 'Activation failed.' };
  return { ok: true };
}
