import { usePathname } from 'expo-router';
import { useEffect } from 'react';

import { DEV_TOOLS_ENABLED } from '@/lib/devTools/gates';
import { registerRentalDevContext, unregisterRentalDevContext } from '@/lib/rentalSimulation';

/** Registers active rental id for the dev toolkit when on rental workspace. */
export function useRegisterRentalDevContext(
  rentalId: string | null | undefined,
  refresh?: () => void | Promise<void>
): void {
  const pathname = usePathname();

  useEffect(() => {
    if (!DEV_TOOLS_ENABLED) return;
    const id = rentalId?.trim() ?? '';
    if (!id) return;

    registerRentalDevContext({
      rentalId: id,
      pathname,
      source: 'rental_workspace',
      refresh: refresh ? async () => void refresh() : undefined,
    });
    return () => unregisterRentalDevContext(id);
  }, [pathname, refresh, rentalId]);
}
