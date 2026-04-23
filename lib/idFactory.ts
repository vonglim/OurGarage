/** Monotonic suffix so IDs stay unique without Math.random-based strings. */
let localSeq = 0;

export function nextLocalId(prefix: string): string {
  localSeq += 1;
  return `${prefix}_${Date.now()}_${localSeq}`;
}
