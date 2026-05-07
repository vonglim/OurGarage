import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

export type RentalNoteRole = 'owner' | 'renter';
export type RentalNotePhase = 'pre_handoff' | 'active_rental';

export type RentalNoteRow = {
  id: string;
  rental_id: string;
  author_id: string;
  author_role: RentalNoteRole;
  phase: RentalNotePhase;
  note: string;
  locked: boolean;
  edited_at: string | null;
  created_at: string;
};

export type RentalNoteInsertDebugRow = {
  auth_uid: string | null;
  rental_id: string | null;
  rental_status: string | null;
  rental_owner_user_id: string | null;
  rental_renter_user_id: string | null;
  requested_author_id: string | null;
  requested_author_role: string | null;
  requested_phase: string | null;
  auth_matches_author_id: boolean;
  auth_is_owner_participant: boolean;
  auth_is_renter_participant: boolean;
  role_matches_owner: boolean;
  role_matches_renter: boolean;
  status_phase_allows_note: boolean;
  final_insert_eligible: boolean;
};

export async function debugRentalNoteInsertEligibility(
  client: SupabaseClient,
  input: {
    rentalId: string;
    authorId: string;
    authorRole: RentalNoteRole;
    phase: RentalNotePhase;
  }
): Promise<RentalNoteInsertDebugRow | null> {
  const { data, error } = await client.rpc('debug_rental_note_insert_eligibility', {
    p_rental_id: input.rentalId,
    p_author_id: input.authorId,
    p_author_role: input.authorRole,
    p_phase: input.phase,
  });
  if (error) {
    if (__DEV__) {
      console.warn('[rentalNotes] debug eligibility RPC failed', error.message);
    }
    return null;
  }
  const rows = (data ?? []) as RentalNoteInsertDebugRow[];
  return rows[0] ?? null;
}

export async function fetchRentalNotes(
  client: SupabaseClient,
  rentalId: string
): Promise<RentalNoteRow[]> {
  const { data, error } = await client
    .from('rental_notes')
    .select('*')
    .eq('rental_id', rentalId)
    .order('created_at', { ascending: true });
  if (error) {
    const tableMissing = /could not find the table|relation .* does not exist|schema cache/i.test(error.message);
    if (tableMissing) {
      if (__DEV__) {
        console.error(
          '[rentalNotes] table missing in active Supabase project. Apply migration 031_rental_notes.sql and refresh schema cache.',
          error.message
        );
      }
      throw new Error('rental_notes table missing');
    }
    console.warn('[rentalNotes] fetchRentalNotes', error.message);
    throw new Error(error.message);
  }
  if (__DEV__) {
    console.log('[rentalNotes] connected successfully');
  }
  return (data ?? []) as RentalNoteRow[];
}

export async function insertRentalNote(
  client: SupabaseClient,
  input: {
    rentalId: string;
    authorId: string;
    authorRole: RentalNoteRole;
    phase: RentalNotePhase;
    note: string;
  }
): Promise<{ row: RentalNoteRow | null; error: string | null }> {
  const text = input.note.trim();
  if (!text) return { row: null, error: 'Note cannot be empty.' };
  const { data, error } = await client
    .from('rental_notes')
    .insert({
      rental_id: input.rentalId,
      author_id: input.authorId,
      author_role: input.authorRole,
      phase: input.phase,
      note: text,
    })
    .select('*')
    .single();
  if (error) {
    console.warn('[rentalNotes] insertRentalNote', error.message);
    return { row: null, error: error.message };
  }
  if (__DEV__) {
    console.log('[rentalNotes] insert success', {
      rentalId: input.rentalId,
      role: input.authorRole,
      phase: input.phase,
      rowId: (data as { id?: string } | null)?.id ?? null,
    });
  }
  return { row: data as RentalNoteRow, error: null };
}

export async function logRentalNotesTableHealthInDev(client: SupabaseClient): Promise<void> {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  const { error } = await client.from('rental_notes').select('id').limit(1);
  if (error) {
    console.warn('[rentalNotes] table health check failed', error.message);
    return;
  }
  console.log('[rentalNotes] table health check ok');
}

export function subscribeRentalNotes(
  client: SupabaseClient,
  rentalId: string,
  onChange: () => void
): () => void {
  const id =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  const channel: RealtimeChannel = client
    .channel(`rental_notes:${rentalId}:${id}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'rental_notes', filter: `rental_id=eq.${rentalId}` },
      () => onChange()
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'rentals', filter: `id=eq.${rentalId}` },
      () => onChange()
    )
    .subscribe();
  if (__DEV__) {
    console.log('[rentalNotes] realtime subscribed', { rentalId, channelId: id });
  }

  return () => {
    void client.removeChannel(channel);
  };
}
