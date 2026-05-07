import { getAuthUserIdSync } from '@/lib/authUser';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { useNotificationsStore } from '@/store/notificationsStore';

function unreadFromNotificationsFallback(me: string): Record<string, number> {
  const notifications = useNotificationsStore.getState().notifications;
  const out: Record<string, number> = {};
  for (const n of notifications) {
    if (n.type !== 'message') continue;
    if (n.read) continue;
    if (n.forUserId && n.forUserId !== me) continue;
    const offerId = String(n.offerId ?? '').trim();
    if (!offerId) continue;
    out[offerId] = (out[offerId] ?? 0) + 1;
  }
  if (__DEV__) {
    console.log('[messageUnread] fallback totals from notifications store', out);
  }
  return out;
}

async function unreadFromServerNotifications(me: string): Promise<Record<string, number>> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('notifications')
    .select('offer_id')
    .eq('user_id', me)
    .eq('type', 'message')
    .eq('read', false);
  if (error) {
    if (__DEV__) {
      console.warn('[messageUnread] server notifications unread fallback failed', error.message);
    }
    return unreadFromNotificationsFallback(me);
  }
  const out: Record<string, number> = {};
  for (const row of (data ?? []) as { offer_id?: string | null }[]) {
    const offerId = String(row.offer_id ?? '').trim();
    if (!offerId) continue;
    out[offerId] = (out[offerId] ?? 0) + 1;
  }
  if (__DEV__) {
    console.log('[messageUnread] fallback totals from server notifications', out);
  }
  return out;
}

export async function fetchUnreadMessageCountsByOffer(): Promise<Record<string, number>> {
  if (!isSupabaseConfigured()) return {};
  const me = getAuthUserIdSync().trim();
  if (!me) return {};
  if (__DEV__) console.log('[messageUnread] rpc start unread_message_counts_for_user', { me });
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('unread_message_counts_for_user');
  if (error) {
    if (__DEV__) console.warn('[messageUnread] unread_message_counts_for_user failed', error.message);
    if (/Could not find the function/i.test(error.message)) {
      return unreadFromServerNotifications(me);
    }
    return {};
  }
  const out: Record<string, number> = {};
  for (const row of (data ?? []) as { offer_id?: string; unread_count?: number | string }[]) {
    const offerId = String(row.offer_id ?? '').trim();
    const nRaw = row.unread_count;
    const n = typeof nRaw === 'number' ? nRaw : Number(nRaw ?? 0);
    if (offerId && Number.isFinite(n) && n > 0) out[offerId] = Math.floor(n);
  }
  if (__DEV__) console.log('[messageUnread] rpc result unread totals', out);
  return out;
}

export async function markOfferThreadRead(offerId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const id = offerId.trim();
  if (!id) return;
  const supabase = getSupabase();
  if (__DEV__) {
    console.log('[UNREAD CLEAR] reason=thread_open scope=offer_thread offerId=', id, 'screen=chat');
    console.log('[messageUnread] mark_offer_thread_read start', { offerId: id });
  }
  const { error } = await supabase.rpc('mark_offer_thread_read', { p_offer_id: id });
  if (error && __DEV__) {
    console.warn('[messageUnread] mark_offer_thread_read failed', error.message);
  }
  if (!error && __DEV__) console.log('[messageUnread] mark_offer_thread_read ok', { offerId: id });
}

export async function markMessageNotificationsForOfferAsRead(offerId: string): Promise<void> {
  const me = getAuthUserIdSync().trim();
  const id = offerId.trim();
  if (__DEV__) {
    console.log('[messageUnread] markMessageNotificationsForOfferAsRead enter', {
      rawOfferId: offerId,
      offerId: id,
      me,
      supabaseConfigured: isSupabaseConfigured(),
    });
  }
  if (!isSupabaseConfigured()) {
    if (__DEV__) {
      console.warn('[messageUnread] mark-read early exit: supabase not configured', {
        offerId: id,
        me,
      });
    }
    return;
  }
  if (!me || !id) return;
  if (!me) {
    if (__DEV__) {
      console.warn('[messageUnread] mark-read early exit: missing user id', { offerId: id });
    }
    return;
  }
  if (!id) {
    if (__DEV__) {
      console.warn('[messageUnread] mark-read early exit: missing offer id', {
        rawOfferId: offerId,
        me,
      });
    }
    return;
  }
  if (__DEV__) {
    console.log('[UNREAD CLEAR] reason=thread_open scope=message_notifications offerId=', id, 'screen=chat');
  }
  const supabase = getSupabase();
  const candidateTypes = ['message', 'new_message'];
  const beforeQuery = supabase
    .from('notifications')
    .select('id, user_id, type, offer_id, data, read, created_at')
    .eq('user_id', me)
    .eq('read', false)
    .in('type', candidateTypes)
    .order('created_at', { ascending: false })
    .limit(300);

  const { data: beforeRows, error: beforeError } = await beforeQuery;
  if (__DEV__) {
    console.log('[messageUnread] mark-read preselect filters', {
      user_id: me,
      offerId: id,
      read: false,
      candidateTypes,
      matchRule: 'offer_id == offerId OR data.offerId == offerId',
    });
  }
  if (beforeError) {
    if (__DEV__) {
      console.warn('[messageUnread] mark-read preselect failed', {
        offerId: id,
        me,
        message: beforeError.message,
      });
    }
    if (__DEV__) {
      console.warn('[messageUnread] mark-read early exit: preselect query failed', {
        offerId: id,
        me,
      });
    }
    return;
  }

  const unreadRows = (beforeRows ?? []) as {
    id?: string;
    user_id?: string;
    type?: string;
    offer_id?: string | null;
    data?: unknown;
    read?: boolean;
  }[];
  const matchingBefore = unreadRows.filter((row) => {
    const rowOfferId = String(row.offer_id ?? '').trim();
    const dataOfferId =
      row.data && typeof row.data === 'object' && !Array.isArray(row.data)
        ? String((row.data as { offerId?: unknown }).offerId ?? '').trim()
        : '';
    return rowOfferId === id || dataOfferId === id;
  });
  if (__DEV__) {
    console.log('[messageUnread] mark-read preselect rows (all unread message-like)', unreadRows);
    console.log('[messageUnread] mark-read matching rows before update', {
      offerId: id,
      matchingCount: matchingBefore.length,
      matchingIds: matchingBefore.map((r) => String(r.id ?? '')).filter(Boolean),
    });
  }

  const targetIds = matchingBefore
    .map((row) => String(row.id ?? '').trim())
    .filter((rowId) => rowId.length > 0);
  if (targetIds.length === 0) {
    if (__DEV__) {
      console.warn('[messageUnread] mark-read no matching unread rows', {
        offerId: id,
        me,
      });
      console.warn('[messageUnread] mark-read early exit: no target ids', {
        offerId: id,
        me,
      });
    }
    return;
  }

  if (__DEV__) {
    console.log('[messageUnread] mark-read update filters', {
      id_in: targetIds,
      user_id: me,
      read: false,
    });
  }
  const { data, error } = await supabase
    .from('notifications')
    .update({ read: true })
    .select('id')
    .eq('user_id', me)
    .in('id', targetIds)
    .eq('read', false);
  if (error) {
    if (__DEV__) {
      console.warn('[messageUnread] mark message notifications read failed', {
        offerId: id,
        me,
        message: error.message,
      });
      console.warn('[messageUnread] mark-read early exit: update failed', {
        offerId: id,
        me,
      });
    }
    return;
  }
  const updatedIds = new Set(
    ((data ?? []) as { id?: string }[])
      .map((row) => String(row.id ?? '').trim())
      .filter((rowId) => rowId.length > 0)
  );
  if (__DEV__) {
    console.log('[messageUnread] mark message notifications read ok', {
      offerId: id,
      updatedCount: updatedIds.size,
      updatedIds: [...updatedIds],
    });
  }

  const { data: afterRows, error: afterError } = await supabase
    .from('notifications')
    .select('id, user_id, type, offer_id, data, read, created_at')
    .eq('user_id', me)
    .eq('read', false)
    .in('type', candidateTypes)
    .order('created_at', { ascending: false })
    .limit(300);
  if (__DEV__) {
    if (afterError) {
      console.warn('[messageUnread] mark-read postselect failed', {
        offerId: id,
        me,
        message: afterError.message,
      });
    } else {
      const remaining = ((afterRows ?? []) as { offer_id?: string | null; data?: unknown; id?: string }[]).filter(
        (row) => {
          const rowOfferId = String(row.offer_id ?? '').trim();
          const dataOfferId =
            row.data && typeof row.data === 'object' && !Array.isArray(row.data)
              ? String((row.data as { offerId?: unknown }).offerId ?? '').trim()
              : '';
          return rowOfferId === id || dataOfferId === id;
        }
      );
      console.log('[messageUnread] mark-read remaining unread rows after update', {
        offerId: id,
        remainingCount: remaining.length,
        remainingIds: remaining.map((r) => String(r.id ?? '')).filter(Boolean),
      });
    }
  }

  if (updatedIds.size > 0) {
    useNotificationsStore.setState((state) => ({
      notifications: state.notifications.map((n) =>
        updatedIds.has(n.id) ? { ...n, read: true } : n
      ),
    }));
  }
}
