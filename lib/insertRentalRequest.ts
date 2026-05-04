import { Alert } from 'react-native';

import { getSupabase } from '@/lib/supabase';

declare const __DEV__: boolean;

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
  const listingId = row.listingId;
  const renterUserId = row.renterUserId;
  const durationType = row.durationType;
  const price = row.price;

  const supabase = getSupabase();

  let ownerUserId: string | null = null;
  const { data: listingRow } = await supabase
    .from('listings')
    .select('user_id')
    .eq('id', listingId)
    .maybeSingle();
  const lr = listingRow as Record<string, unknown> | null | undefined;
  if (lr && typeof lr.user_id === 'string' && lr.user_id.trim() !== '') {
    ownerUserId = lr.user_id.trim();
  }

  if (!ownerUserId) {
    console.error('❌ owner_user_id missing');
    throw new Error('owner_user_id missing');
  }

  if (__DEV__) {
    console.log('[INSERT INPUT]', {
      listingId,
      renterUserId,
      ownerUserId,
      durationType,
      price,
    });
  }

  /** DB constraint uses half | full | week (not weekly). */
  const duration_type = durationTypeForDb(durationType);

  const { data, error } = await supabase
    .from('rental_requests')
    .insert({
      listing_id: listingId,
      renter_user_id: renterUserId,
      owner_user_id: ownerUserId,
      duration_type,
      price,
      status: 'pending',
    })
    .select();

  if (__DEV__) {
    console.log('[INSERT RESULT]', { data, error });
  }

  if (error) {
    console.error('❌ INSERT FAILED', error);
    throw error;
  }

  Alert.alert('Inserted successfully');
}
