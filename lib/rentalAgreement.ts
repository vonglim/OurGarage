import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

export type AgreementSnapshotInsert = {
  rentalId: string;
  signedByUserId: string;
  agreementVersion: number;
  agreementText: string;
  rentalSummaryJson: Record<string, unknown>;
  /** Canonical form from `normalizeLegalName` in `@/lib/legalName`. */
  signedNameNormalized: string;
  /** Trimmed input as entered (audit trail). */
  signedNameAsEntered: string;
  signedAt: string;
  replacementValue: number;
  dailyLateFee: number;
  maxLateFeeCap: number;
  preauthAmount: number;
  verificationPhotoRefs: Array<{ id: string; path: string | null; phase: string | null }>;
};

export type InsertRentalAgreementSnapshotResult =
  | { ok: true }
  | { ok: false; kind: 'schema_unavailable' }
  | { ok: false; kind: 'other' };

function isRentalAgreementSnapshotSchemaUnavailable(error: PostgrestError): boolean {
  const code = String(error.code ?? '');
  const msg = (error.message ?? '').toLowerCase();
  if (code === 'PGRST205') return true;
  if (code === '42P01') return true;
  if (msg.includes('schema cache')) return true;
  if (msg.includes('rental_agreement_snapshots') && msg.includes('does not exist')) return true;
  return false;
}

export async function insertRentalAgreementSnapshot(
  client: SupabaseClient,
  input: AgreementSnapshotInsert
): Promise<InsertRentalAgreementSnapshotResult> {
  const { error } = await client.from('rental_agreement_snapshots').insert({
    rental_id: input.rentalId,
    signed_by_user_id: input.signedByUserId,
    agreement_version: input.agreementVersion,
    agreement_text: input.agreementText,
    rental_summary_json: input.rentalSummaryJson,
    signed_name: input.signedNameNormalized,
    signed_name_as_entered: input.signedNameAsEntered,
    signed_at: input.signedAt,
    replacement_value: input.replacementValue,
    daily_late_fee: input.dailyLateFee,
    max_late_fee_cap: input.maxLateFeeCap,
    preauth_amount: input.preauthAmount,
    verification_photo_refs_json: input.verificationPhotoRefs,
  });
  if (error) {
    if (__DEV__) {
      console.warn('[insertRentalAgreementSnapshot]', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
    }
    if (isRentalAgreementSnapshotSchemaUnavailable(error)) {
      return { ok: false, kind: 'schema_unavailable' };
    }
    return { ok: false, kind: 'other' };
  }
  return { ok: true };
}
