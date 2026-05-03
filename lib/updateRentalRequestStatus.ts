import { getSupabase } from '@/lib/supabase';

export async function updateRentalRequestStatus(
  rentalRequestId: string,
  status: 'approved' | 'declined'
): Promise<{ ok: boolean; error?: string }> {
  const id = rentalRequestId.trim();
  if (!id) return { ok: false, error: 'Missing rental request id' };

  const supabase = getSupabase();
  const { error } = await supabase.from('rental_requests').update({ status }).eq('id', id);

  if (error) {
    console.error('[rental_requests] update status', error);
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
