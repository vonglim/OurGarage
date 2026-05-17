import type { RentalDevRegisteredContext } from '@/lib/rentalSimulation/types';
import { useRentalSimulationStore } from '@/store/rentalSimulationStore';

export function registerRentalDevContext(input: RentalDevRegisteredContext): void {
  useRentalSimulationStore.getState().registerContext(input);
}

export function unregisterRentalDevContext(rentalId: string): void {
  const cur = useRentalSimulationStore.getState().registered;
  if (cur?.rentalId === rentalId) {
    useRentalSimulationStore.getState().registerContext(null);
  }
}
