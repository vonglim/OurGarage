/** One hour before a renter may start a new offer thread after withdraw. */
export const NEGOTIATION_REOFFER_COOLDOWN_MS = 60 * 60 * 1000;

/** Renter may withdraw and later re-offer at most this many times (threads) per request. */
export const NEGOTIATION_MAX_WITHDRAW_CYCLES = 2;

/** After this many owner declines (any mix of initial / counter), the pair is locked. */
export const NEGOTIATION_MAX_DECLINES_BEFORE_LOCK = 3;
