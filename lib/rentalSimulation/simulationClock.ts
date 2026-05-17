import { DEV_TOOLS_ENABLED } from '@/lib/devTools/gates';
import { useRentalSimulationStore } from '@/store/rentalSimulationStore';

/** Wall-clock ms in production; controllable offset/custom time in dev. */
export function getEffectiveNowMs(): number {
  if (!DEV_TOOLS_ENABLED) return Date.now();
  return useRentalSimulationStore.getState().getNowMs();
}

export function getEffectiveNow(): Date {
  return new Date(getEffectiveNowMs());
}

export function getEffectiveNowIso(): string {
  return getEffectiveNow().toISOString();
}
