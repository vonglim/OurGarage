import { create } from 'zustand';

import { DEV_TOOLS_ENABLED } from '@/lib/devTools/gates';
import { getSimulationJumpConfig } from '@/lib/rentalSimulation/simulationJumps';
import type { RentalDevRegisteredContext, RentalSimulationJump } from '@/lib/rentalSimulation/types';
import type { RentalLifecyclePhase } from '@/lib/rentalLifecyclePhase';
import type { RentalWizardProgress, RentalWizardStep } from '@/lib/rentalWizard/types';
import { useDevToolsStore } from '@/store/devToolsStore';

type RentalSimulationState = {
  clockOffsetMs: number;
  customNowMs: number | null;
  simulationJump: RentalSimulationJump | null;
  wizardStepOverride: RentalWizardStep | null;
  localWizardProgress: RentalWizardProgress;
  writeToDatabase: boolean;
  registered: RentalDevRegisteredContext | null;
  getNowMs: () => number;
  advanceClock: (deltaMs: number) => void;
  rewindClock: (deltaMs: number) => void;
  setCustomNow: (iso: string | null) => void;
  resetClock: () => void;
  applySimulationJump: (jump: RentalSimulationJump) => void;
  setWizardStepOverride: (step: RentalWizardStep | null) => void;
  patchLocalWizardProgress: (patch: Partial<RentalWizardProgress>) => void;
  setWriteToDatabase: (v: boolean) => void;
  registerContext: (ctx: RentalDevRegisteredContext | null) => void;
  clearSimulation: () => void;
};

function devOnly<T>(fn: () => T, fallback: T): T {
  if (!DEV_TOOLS_ENABLED) return fallback;
  return fn();
}

export const useRentalSimulationStore = create<RentalSimulationState>((set, get) => ({
  clockOffsetMs: 0,
  customNowMs: null,
  simulationJump: null,
  wizardStepOverride: null,
  localWizardProgress: {},
  writeToDatabase: false,
  registered: null,

  getNowMs: () => {
    if (!DEV_TOOLS_ENABLED) return Date.now();
    const { customNowMs, clockOffsetMs } = get();
    if (customNowMs != null && Number.isFinite(customNowMs)) return customNowMs;
    return Date.now() + clockOffsetMs;
  },

  advanceClock: (deltaMs) =>
    devOnly(() => {
      const { customNowMs, clockOffsetMs } = get();
      if (customNowMs != null) {
        set({ customNowMs: customNowMs + deltaMs });
      } else {
        set({ clockOffsetMs: clockOffsetMs + deltaMs });
      }
    }, undefined),

  rewindClock: (deltaMs) => get().advanceClock(-deltaMs),

  setCustomNow: (iso) =>
    devOnly(() => {
      if (iso == null || iso.trim() === '') {
        set({ customNowMs: null });
        return;
      }
      const t = Date.parse(iso);
      set({ customNowMs: Number.isFinite(t) ? t : null });
    }, undefined),

  resetClock: () =>
    devOnly(() => set({ clockOffsetMs: 0, customNowMs: null }), undefined),

  applySimulationJump: (jump) =>
    devOnly(() => {
      const cfg = getSimulationJumpConfig(jump);
      useDevToolsStore.getState().setRentalLifecycleOverride(cfg.lifecycle);
      set({
        simulationJump: jump,
        wizardStepOverride: cfg.wizardStep,
        localWizardProgress: cfg.wizardProgress ?? {},
      });
    }, undefined),

  setWizardStepOverride: (step) => devOnly(() => set({ wizardStepOverride: step }), undefined),

  patchLocalWizardProgress: (patch) =>
    devOnly(
      () =>
        set((s) => ({
          localWizardProgress: { ...s.localWizardProgress, ...patch },
        })),
      undefined
    ),

  setWriteToDatabase: (v) => devOnly(() => set({ writeToDatabase: v }), undefined),

  registerContext: (ctx) => devOnly(() => set({ registered: ctx }), undefined),

  clearSimulation: () =>
    devOnly(() => {
      useDevToolsStore.getState().clearRentalLifecycleOverride();
      set({
        simulationJump: null,
        wizardStepOverride: null,
        localWizardProgress: {},
        clockOffsetMs: 0,
        customNowMs: null,
      });
    }, undefined),
}));

/** Lifecycle override for rental workspace (dev only). */
export function getDevLifecycleOverride(): RentalLifecyclePhase | null {
  if (!DEV_TOOLS_ENABLED) return null;
  return useDevToolsStore.getState().rentalLifecycleOverride;
}

/** Wizard step override (dev only). */
export function getDevWizardStepOverride(): RentalWizardStep | null {
  if (!DEV_TOOLS_ENABLED) return null;
  return useRentalSimulationStore.getState().wizardStepOverride;
}

export function getDevLocalWizardProgress(): RentalWizardProgress {
  if (!DEV_TOOLS_ENABLED) return {};
  return useRentalSimulationStore.getState().localWizardProgress;
}
