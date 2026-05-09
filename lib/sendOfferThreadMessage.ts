import { insertServerNotificationToRecipient } from '@/lib/insertServerNotification';
import {
  insertRequestChatMessageToSupabase,
} from '@/lib/supabaseRequestChatMessages';

export async function sendOfferThreadUserMessage(input: {
  offerId: string;
  requestRowId?: string | null;
  rentalId?: string | null;
  authorId: string;
  receiverId: string;
  body: string;
}): Promise<{ messageId: string | null; error: string | null }> {
  const offerId = input.offerId.trim();
  const authorId = input.authorId.trim();
  const receiverId = input.receiverId.trim();
  const body = input.body.trim();
  if (!offerId || !authorId || !receiverId || !body) {
    return { messageId: null, error: 'Missing required fields' };
  }

  const res = await insertRequestChatMessageToSupabase({
    requestRowId: input.requestRowId ?? undefined,
    offerId,
    rentalId: input.rentalId ?? undefined,
    authorId,
    receiverId,
    body,
  });
  if (res.error || !res.data?.id) {
    return { messageId: null, error: res.error?.message ?? 'Could not insert message' };
  }

  insertServerNotificationToRecipient({
    actorId: authorId,
    recipientUserId: receiverId,
    type: 'message',
    title: 'New message',
    body: 'You received a new message',
    requestId: input.requestRowId ?? null,
    offerId,
    rentalId: input.rentalId ?? null,
  });

  return { messageId: res.data.id, error: null };
}
