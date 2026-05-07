import type { SupabaseClient } from '@supabase/supabase-js';

type AgreementSnapshotInsert = {
  rentalId: string;
  agreementVersion: number;
  agreementText: string;
  rentalSummaryJson: Record<string, unknown>;
  signedName: string;
  signedAt: string;
};

export async function insertRentalAgreementSnapshot(
  client: SupabaseClient,
  input: AgreementSnapshotInsert
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await client.from('rental_agreement_snapshots').insert({
    rental_id: input.rentalId,
    agreement_version: input.agreementVersion,
    agreement_text: input.agreementText,
    rental_summary_json: input.rentalSummaryJson,
    signed_name: input.signedName,
    signed_at: input.signedAt,
  });
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
