import type { SupabaseClient } from '@supabase/supabase-js';

import type { RentalWizardRentalRow } from '@/lib/rentalWizard/types';

export async function saveReturnCoordinationToRental(
  supabase: SupabaseClient,
  rental: RentalWizardRentalRow,
  input: { returnTimeIso: string; returnLocation: string }
): Promise<{ ok: boolean; message?: string }> {
  const returnTimeIso = input.returnTimeIso.trim();
  const returnLocation = input.returnLocation.trim();
  if (!returnTimeIso || !returnLocation) {
    return { ok: false, message: 'Missing return time or location' };
  }

  const hasCol = (k: string) => Object.prototype.hasOwnProperty.call(rental, k);
  const patch: Record<string, unknown> = {
    return_time: returnTimeIso,
    return_location: returnLocation,
  };
  if (hasCol('return_datetime')) patch.return_datetime = returnTimeIso;
  if (hasCol('agreed_return_datetime')) patch.agreed_return_datetime = returnTimeIso;

  const { error } = await supabase.from('rentals').update(patch).eq('id', rental.id);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}
