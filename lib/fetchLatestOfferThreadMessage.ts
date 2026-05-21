import type { SupabaseClient } from '@supabase/supabase-js';

export type OfferThreadMessagePreview = {
  body: string;
  createdAt: string;
  authorId: string;
  kind: string;
};

/**
 * Latest user-facing thread row for a rental chat (same kinds as inbox).
 */
export async function fetchLatestOfferThreadMessagePreview(
  supabase: SupabaseClient,
  offerId: string
): Promise<OfferThreadMessagePreview | null> {
  const oid = offerId.trim();
  if (!oid) return null;
  const { data, error } = await supabase
    .from('offer_messages')
    .select('body,created_at,author_id,kind')
    .eq('offer_id', oid)
    .in('kind', ['user_chat', 'meetup_proposal', 'meetup_coordination'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data || typeof data !== 'object') return null;
  const row = data as Record<string, unknown>;
  const body = String(row.body ?? '').trim();
  const createdAt = String(row.created_at ?? '');
  const authorId = String(row.author_id ?? '').trim();
  const kind = String(row.kind ?? '');
  if (!body && kind !== 'meetup_proposal' && kind !== 'meetup_coordination') return null;
  return {
    body:
      body ||
      (kind === 'meetup_proposal'
        ? 'Meetup proposal'
        : kind === 'meetup_coordination'
          ? 'Meetup coordination update'
          : ''),
    createdAt,
    authorId,
    kind,
  };
}
