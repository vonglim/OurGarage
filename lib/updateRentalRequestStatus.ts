import { getSupabase } from '@/lib/supabase';
import { logRentalLifecycle } from '@/lib/rentalLifecycleDebug';
import { mergeRecentNotificationsFromServer } from '@/lib/notificationsServerSync';
import { useUnifiedRentalsActivityStore } from '@/store/unifiedRentalsActivityStore';

export async function updateRentalRequestStatus(
  rentalRequestId: string,
  status: 'approved' | 'declined'
): Promise<{ ok: boolean; error?: string }> {
  const id = rentalRequestId.trim();
  if (!id) return { ok: false, error: 'Missing rental request id' };

  logRentalLifecycle('rental_request_status_update_start', { rentalRequestId: id, status });

  const supabase = getSupabase();
  const { error } = await supabase.from('rental_requests').update({ status }).eq('id', id);

  if (error) {
    console.error('[rental_requests] update status', error);
    logRentalLifecycle('rental_request_status_update_failed', {
      rentalRequestId: id,
      status,
      message: error.message,
    });
    return { ok: false, error: error.message };
  }

  logRentalLifecycle('rental_request_status_update_ok', { rentalRequestId: id, status });
  mergeRecentNotificationsFromServer();
  void useUnifiedRentalsActivityStore.getState().refreshFromServer();
  return { ok: true };
}
