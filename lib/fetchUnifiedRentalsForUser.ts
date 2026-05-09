import { getSupabase } from '@/lib/supabase';

export type UnifiedRentalRow = {
  id: string;
  renter_user_id: string;
  owner_user_id: string;
  price: number;
  status: string;
  created_at: string;
  request_id: string | null;
  offer_id: string | null;
  listing_id: string | null;
  rental_request_id: string | null;
  agreed_pickup_datetime?: string | null;
  agreed_return_datetime?: string | null;
  pickup_datetime?: string | null;
  return_datetime?: string | null;
  meetup_location?: string | null;
  owner_confirmed?: boolean;
  renter_confirmed?: boolean;
  agreement_status?: 'pending' | 'confirmed' | string | null;
  confirmed_at?: string | null;
  last_proposed_by?: string | null;
  proposal_version?: number | null;
  proposal_updated_at?: string | null;
  latest_proposal_message_id?: string | null;
  /** Resolved in fetch — never a bare UUID. */
  displayTitle: string;
};

const TITLE_LOOKUP_CHUNK = 40;

function uniqueTrimmedIds(ids: (string | null | undefined)[]): string[] {
  const set = new Set<string>();
  for (const raw of ids) {
    if (typeof raw !== 'string') continue;
    const s = raw.trim();
    if (s.length > 0) set.add(s);
  }
  return [...set];
}

function chunkStrings(ids: string[]): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += TITLE_LOOKUP_CHUNK) {
    chunks.push(ids.slice(i, i + TITLE_LOOKUP_CHUNK));
  }
  return chunks;
}

async function fetchRequestTitlesById(
  ids: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const supabase = getSupabase();
  for (const chunk of chunkStrings(ids)) {
    if (chunk.length === 0) continue;
    const { data, error } = await supabase.from('requests').select('id, title').in('id', chunk);
    if (error) {
      console.warn('[rentals] fetch request titles', error.message);
      continue;
    }
    for (const row of data ?? []) {
      const id = typeof row.id === 'string' ? row.id.trim() : '';
      const title = typeof row.title === 'string' ? row.title.trim() : '';
      if (id && title) map.set(id, title);
    }
  }
  return map;
}

async function fetchListingTitlesById(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const supabase = getSupabase();
  for (const chunk of chunkStrings(ids)) {
    if (chunk.length === 0) continue;
    const { data, error } = await supabase.from('listings').select('id, title').in('id', chunk);
    if (error) {
      console.warn('[rentals] fetch listing titles', error.message);
      continue;
    }
    for (const row of data ?? []) {
      const id = typeof row.id === 'string' ? row.id.trim() : '';
      const title = typeof row.title === 'string' ? row.title.trim() : '';
      if (id && title) map.set(id, title);
    }
  }
  return map;
}

function resolveDisplayTitle(
  row: {
    request_id: string | null;
    listing_id: string | null;
  },
  requestTitles: Map<string, string>,
  listingTitles: Map<string, string>
): string {
  const reqId = typeof row.request_id === 'string' ? row.request_id.trim() : '';
  if (reqId) {
    const t = requestTitles.get(reqId);
    if (t && t.trim()) return t.trim();
  }
  const listId = typeof row.listing_id === 'string' ? row.listing_id.trim() : '';
  if (listId) {
    const t = listingTitles.get(listId);
    if (t && t.trim()) return t.trim();
  }
  return 'Rental';
}

export function unifiedRentalTitle(row: UnifiedRentalRow): string {
  const d = typeof row.displayTitle === 'string' ? row.displayTitle.trim() : '';
  return d.length > 0 ? d : 'Rental';
}

export async function fetchUnifiedRentalsForUser(userId: string): Promise<UnifiedRentalRow[]> {
  const uid = userId.trim();
  if (!uid) return [];

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('rentals')
    .select('*')
    .or(`renter_user_id.eq.${uid},owner_user_id.eq.${uid}`)
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('[rentals] fetch for user', error.message);
    return [];
  }

  const rawRows = (data ?? []) as unknown as Omit<UnifiedRentalRow, 'displayTitle'>[];

  const requestIds = uniqueTrimmedIds(rawRows.map((r) => r.request_id));
  const listingIds = uniqueTrimmedIds(rawRows.map((r) => r.listing_id));

  const [requestTitles, listingTitles] = await Promise.all([
    requestIds.length > 0 ? fetchRequestTitlesById(requestIds) : Promise.resolve(new Map<string, string>()),
    listingIds.length > 0 ? fetchListingTitlesById(listingIds) : Promise.resolve(new Map<string, string>()),
  ]);

  return rawRows.map((r) => ({
    ...r,
    displayTitle: resolveDisplayTitle(r, requestTitles, listingTitles),
  }));
}
