import type { PostgrestError } from '@supabase/supabase-js';

/** User-visible copy when DB/API schema lags the app (missing columns, stale PostgREST cache). */
export const SUPABASE_SCHEMA_DRIFT_USER_MESSAGE =
  'App update in progress. Please refresh and try again.';

export type SupabaseMutationFailureFormat = {
  /** Use as Alert `message` body (never expose raw PostgREST internals to users when schema mismatch). */
  userBody: string;
  /** Log in dev / structured logs — includes path, table/column hints, code, raw message. */
  devLog: string;
  /** True when likely missing column, PGRST204, or stale schema cache. */
  isSchemaMismatch: boolean;
};

/**
 * Centralized handling for PostgREST write failures (especially schema drift / stale cache).
 * Callers choose Alert titles; use `userBody` for the message field.
 */
export function formatSupabaseMutationFailure(
  error: PostgrestError | { message?: string; code?: string; details?: string; hint?: string } | null | undefined,
  ctx: { path: string; table?: string }
): SupabaseMutationFailureFormat {
  const raw = error?.message?.trim() ?? '';
  const code = error && 'code' in error && error.code != null ? String(error.code) : '';

  const columnOfTable = raw.match(/Could not find the '([^']+)' column of '([^']+)'/i);
  const isSchemaMismatch =
    code === 'PGRST204' ||
    /schema cache/i.test(raw) ||
    /could not find the .* column of/i.test(raw) ||
    Boolean(columnOfTable);

  const devParts = [
    `[supabase:${ctx.path}]`,
    ctx.table ? `table=${ctx.table}` : null,
    columnOfTable ? `missing_column=${columnOfTable[1]} referenced_table=${columnOfTable[2]}` : null,
    code ? `code=${code}` : null,
    raw.length > 0 ? raw : '(empty message)',
  ].filter(Boolean);

  const devLog = devParts.join(' | ');

  return {
    userBody: isSchemaMismatch ? SUPABASE_SCHEMA_DRIFT_USER_MESSAGE : raw || 'Check your connection and try again.',
    devLog,
    isSchemaMismatch,
  };
}
