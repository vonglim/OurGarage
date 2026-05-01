import { getSupabase } from '@/lib/supabase';

/** UI / store may still use `weekly`; DB column expects `week`. */
export type RentalRequestDurationInput = 'half' | 'full' | 'weekly';

function durationTypeForDb(d: RentalRequestDurationInput): 'half' | 'full' | 'week' {
  return d === 'weekly' ? 'week' : d;
}

export async function insertRentalRequest(row: {
  listingId: string;
  renterUserId: string;
  durationType: RentalRequestDurationInput;
  price: number;
}): Promise<void> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('rental_requests')
    .insert({
      listing_id: row.listingId,
      renter_user_id: row.renterUserId,
      duration_type: durationTypeForDb(row.durationType),
      price: row.price,
      status: 'pending',
    })
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('[rental_requests] insert error', error);
    return;
  }

  console.log('[rental_requests] insert success', data);
}
