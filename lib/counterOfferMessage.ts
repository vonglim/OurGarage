import {
  formatNegotiationDeliveryFeeTermLine,
  formatNegotiationDeliveryMethodLine,
  parseNegotiationDeliveryFeeFromMessage,
  parseNegotiationDeliveryMethodFromMessage,
  type NegotiationDeliveryMethod,
} from '@/lib/negotiationDelivery';

/** Stored under `Terms (optional):`; replaces legacy `Daily late fee (auto):` lines during merges. */
export const NEGOTIATION_LATE_FEE_TERMS_LINE =
  'Late fees: Automatically calculated using platform policy.';

function replaceLateFeeTermsLine(body: string, newLine: string): string {
  if (/^Daily late fee \(auto\):.*$/m.test(body)) {
    return body.replace(/^Daily late fee \(auto\):.*$/m, newLine);
  }
  if (/^Late fees:.*$/m.test(body)) {
    return body.replace(/^Late fees:.*$/m, newLine);
  }
  return replaceLineOrInsertAfterTermsIntro(body, /^Late fees:.*$/m, newLine);
}

function replaceLineOrInsertAfterTermsIntro(body: string, linePattern: RegExp, newLine: string): string {
  if (linePattern.test(body)) {
    return body.replace(linePattern, newLine);
  }
  const termsMatch = body.match(/(Terms \(optional\):\s*\n)/i);
  if (termsMatch && termsMatch.index !== undefined) {
    const idx = termsMatch.index + termsMatch[1].length;
    return body.slice(0, idx) + `${newLine}\n` + body.slice(idx);
  }
  const block = `Terms (optional):\n${newLine}`;
  const trimmed = body.trim();
  return trimmed ? `${trimmed}\n\n${block}` : block;
}

function replaceOrInsertAfterLine(
  body: string,
  /** Matched line after which we insert when `linePattern` is absent. */
  afterLinePattern: RegExp,
  linePattern: RegExp,
  newLine: string
): string {
  if (linePattern.test(body)) {
    return body.replace(linePattern, newLine);
  }
  const m = body.match(afterLinePattern);
  if (m && m.index !== undefined) {
    const end = m.index + m[0].length;
    return `${body.slice(0, end)}\n${newLine}${body.slice(end)}`;
  }
  return replaceLineOrInsertAfterTermsIntro(body, linePattern, newLine);
}

function stripDeliveryFeeLines(body: string): string {
  return body
    .replace(/^[ \t]*Delivery fee:.*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Updates delivery method/fee and standardized late-fee policy line inside the offer message; preserves item/terms copy.
 * Prepends optional user note when present.
 */
export function mergeNegotiationMessageForCounter(args: {
  existing: string | null | undefined;
  /** Retained for API compatibility with callers (totals); late-fee wording in the message is platform-standard. */
  dailyRateBasisAmount: number;
  dayCount: number;
  negotiationDeliveryMethod: NegotiationDeliveryMethod;
  /** Ignored when `negotiationDeliveryMethod` is pickup. */
  negotiationDeliveryFee: number;
  optionalNote: string;
}): string {
  let body = String(args.existing ?? '').trim();

  const methodLine = formatNegotiationDeliveryMethodLine(args.negotiationDeliveryMethod);
  body = replaceLineOrInsertAfterTermsIntro(body, /^[ \t]*Delivery method:.*$/m, methodLine);

  if (args.negotiationDeliveryMethod === 'owner_delivery') {
    const feeLine = formatNegotiationDeliveryFeeTermLine(Math.max(0, args.negotiationDeliveryFee));
    body = replaceOrInsertAfterLine(
      body,
      /^[ \t]*Delivery method:.*$/m,
      /^[ \t]*Delivery fee:.*$/m,
      feeLine
    );
  } else {
    body = stripDeliveryFeeLines(body);
  }

  body = replaceLateFeeTermsLine(body, NEGOTIATION_LATE_FEE_TERMS_LINE);

  const note = args.optionalNote.trim();
  if (note) {
    body = note + (body ? '\n\n' : '') + body;
  }
  return body;
}

/** Numeric delivery fee from the offer message when fulfillment is owner delivery; otherwise null. */
export function parseDeliveryFeeFromOfferMessage(message: string | null | undefined): number | null {
  const method = parseNegotiationDeliveryMethodFromMessage(message, undefined);
  if (method !== 'owner_delivery') return null;
  return parseNegotiationDeliveryFeeFromMessage(message, method);
}
