import type { SupabaseClient } from '@supabase/supabase-js';

export type VerificationPhase = 'pickup' | 'return';
export type PartyRole = 'owner' | 'renter';

export type RentalVerificationRow = {
  id: string;
  rental_id: string;
  phase: VerificationPhase;
  user_id: string;
  role: PartyRole;
  checklist_state: Record<string, boolean>;
  notes: string;
  confirmed: boolean;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RentalVerificationPhotoRow = {
  id: string;
  rental_id: string;
  phase: VerificationPhase;
  uploaded_by: string;
  role: PartyRole;
  storage_path: string;
  public_url: string;
  created_at: string;
};

export const BUCKET = 'rental-evidence';
const SIGNED_URL_TTL = 60 * 60 * 24 * 7; // 7 days

export function evidenceObjectPath(
  rentalId: string,
  phase: VerificationPhase,
  userId: string,
  fileId: string,
  fileExtension: string = 'jpg'
): string {
  const ext = fileExtension.replace(/^\./, '').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg';
  return `${rentalId}/${phase}/${userId}/${fileId}.${ext}`;
}

export async function ensureVerificationRows(
  client: SupabaseClient,
  rentalId: string,
  ownerUserId: string,
  renterUserId: string,
  phase: VerificationPhase
): Promise<void> {
  const rows: Pick<
    RentalVerificationRow,
    'rental_id' | 'phase' | 'user_id' | 'role' | 'checklist_state' | 'notes'
  >[] = [
    {
      rental_id: rentalId,
      phase,
      user_id: ownerUserId,
      role: 'owner',
      checklist_state: {},
      notes: '',
    },
    {
      rental_id: rentalId,
      phase,
      user_id: renterUserId,
      role: 'renter',
      checklist_state: {},
      notes: '',
    },
  ];
  const { error } = await client.from('rental_verifications').upsert(rows, {
    onConflict: 'rental_id,phase,user_id',
    ignoreDuplicates: true,
  });
  if (error) {
    console.warn('[rentalVerification] ensureVerificationRows', error);
  }
}

export async function fetchVerificationRows(
  client: SupabaseClient,
  rentalId: string
): Promise<RentalVerificationRow[]> {
  const { data, error } = await client
    .from('rental_verifications')
    .select('*')
    .eq('rental_id', rentalId);
  if (error) {
    console.warn('[rentalVerification] fetchVerificationRows', error);
    return [];
  }
  return (data ?? []) as RentalVerificationRow[];
}

export async function fetchVerificationPhotos(
  client: SupabaseClient,
  rentalId: string,
  phase: VerificationPhase
): Promise<RentalVerificationPhotoRow[]> {
  const { data, error } = await client
    .from('rental_verification_photos')
    .select('*')
    .eq('rental_id', rentalId)
    .eq('phase', phase)
    .order('created_at', { ascending: true });
  if (error) {
    console.warn('[rentalVerification] fetchVerificationPhotos', error);
    return [];
  }
  return (data ?? []) as RentalVerificationPhotoRow[];
}

export async function signedUrlForEvidencePath(
  client: SupabaseClient,
  storagePath: string
): Promise<string | null> {
  const { data, error } = await client.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL);
  if (error || !data?.signedUrl) {
    console.warn('[rentalVerification] signedUrl failed', storagePath, error?.message ?? error);
    return null;
  }
  return data.signedUrl;
}

export async function deleteVerificationPhotoById(
  client: SupabaseClient,
  photoId: string
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await client.from('rental_verification_photos').delete().eq('id', photoId);
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function persistChecklistState(
  client: SupabaseClient,
  rentalId: string,
  phase: VerificationPhase,
  userId: string,
  checklistState: Record<string, boolean>
): Promise<boolean> {
  const { error } = await client
    .from('rental_verifications')
    .update({
      checklist_state: checklistState,
      updated_at: new Date().toISOString(),
    })
    .eq('rental_id', rentalId)
    .eq('phase', phase)
    .eq('user_id', userId);
  if (error) {
    console.warn('[rentalVerification] persistChecklistState', error);
    return false;
  }
  return true;
}

export async function syncSharedNotes(
  client: SupabaseClient,
  rentalId: string,
  phase: VerificationPhase,
  notes: string
): Promise<boolean> {
  const { error } = await client.rpc('sync_rental_verification_notes', {
    p_rental_id: rentalId,
    p_phase: phase,
    p_notes: notes,
  });
  if (error) {
    console.warn('[rentalVerification] syncSharedNotes', error);
    return false;
  }
  return true;
}

export async function persistConfirmation(
  client: SupabaseClient,
  rentalId: string,
  phase: VerificationPhase,
  userId: string,
  confirmed: boolean
): Promise<boolean> {
  const { error } = await client
    .from('rental_verifications')
    .update({
      confirmed,
      confirmed_at: confirmed ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('rental_id', rentalId)
    .eq('phase', phase)
    .eq('user_id', userId);
  if (error) {
    console.warn('[rentalVerification] persistConfirmation', error);
    return false;
  }
  return true;
}

export async function insertVerificationPhotoRow(
  client: SupabaseClient,
  row: Omit<RentalVerificationPhotoRow, 'id' | 'created_at' | 'public_url'> & { public_url?: string }
): Promise<{
  row: RentalVerificationPhotoRow | null;
  error: { message: string; code?: string; details?: string } | null;
}> {
  const { data, error } = await client
    .from('rental_verification_photos')
    .insert({
      rental_id: row.rental_id,
      phase: row.phase,
      uploaded_by: row.uploaded_by,
      role: row.role,
      storage_path: row.storage_path,
      public_url: row.public_url ?? '',
    })
    .select('*')
    .single();
  if (error) {
    console.warn('[rentalVerification] insertVerificationPhotoRow', error.message, error.code, error.details);
    return {
      row: null,
      error: { message: error.message, code: error.code, details: error.details },
    };
  }
  return { row: data as RentalVerificationPhotoRow, error: null };
}

export function deriveDualConfirmation(rows: RentalVerificationRow[], phase: VerificationPhase) {
  const owner = rows.find((r) => r.phase === phase && r.role === 'owner');
  const renter = rows.find((r) => r.phase === phase && r.role === 'renter');
  return {
    owner: Boolean(owner?.confirmed),
    renter: Boolean(renter?.confirmed),
  };
}

export function mergeChecklistMapsFromRows(
  rows: RentalVerificationRow[],
  phase: VerificationPhase
): { owner: Record<string, boolean>; renter: Record<string, boolean> } {
  const ownerRow = rows.find((r) => r.phase === phase && r.role === 'owner');
  const renterRow = rows.find((r) => r.phase === phase && r.role === 'renter');
  return {
    owner: (ownerRow?.checklist_state as Record<string, boolean>) ?? {},
    renter: (renterRow?.checklist_state as Record<string, boolean>) ?? {},
  };
}

export function sharedNotesFromRows(rows: RentalVerificationRow[], phase: VerificationPhase): string {
  const phaseRows = rows.filter((r) => r.phase === phase);
  const withNotes = phaseRows.map((r) => r.notes?.trim() ?? '').filter(Boolean);
  if (withNotes.length === 0) return '';
  return withNotes[0];
}

export { BUCKET as RENTAL_EVIDENCE_BUCKET };
