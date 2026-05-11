/**
 * Splits a request `toolName` that may combine item + context with em/en dash or spaced hyphen
 * into a primary heading and a muted context line (bullet-joined).
 */
export function splitRequestDisplayTitle(raw: string): { primary: string; context: string | null } {
  const t = raw.trim();
  if (!t) return { primary: 'Equipment request', context: null };

  const parts = t
    .split(/\s+[—–]\s+|\s+-\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (parts.length <= 1) return { primary: t, context: null };
  return { primary: parts[0]!, context: parts.slice(1).join(' • ') };
}
