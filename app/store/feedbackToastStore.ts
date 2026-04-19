import { FEEDBACK_TOAST_HOLD_MS } from '@/constants/interactionTiming';
import { create } from 'zustand';

type State = {
  message: string | null;
  /** Visible duration after fade-in (ms) */
  holdMs: number;
};

type Actions = {
  show: (message: string, holdMs?: number) => void;
  hide: () => void;
};

export const useFeedbackToastStore = create<State & Actions>((set) => ({
  message: null,
  holdMs: FEEDBACK_TOAST_HOLD_MS,
  show: (message, holdMs = FEEDBACK_TOAST_HOLD_MS) => set({ message, holdMs }),
  hide: () => set({ message: null, holdMs: FEEDBACK_TOAST_HOLD_MS }),
}));

/** Non-hook: safe to call from async handlers and before navigation. */
export function showFeedbackToast(message: string, holdMs = FEEDBACK_TOAST_HOLD_MS) {
  useFeedbackToastStore.getState().show(message, holdMs);
}
