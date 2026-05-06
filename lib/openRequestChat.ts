import { ensureChatForMatchedRequest } from '@/store/chatStore';
import { getRequestByTimestamp } from '@/store/requestsStore';

type ChatRoutePush = {
  push: (args: { pathname: '/chat/[id]'; params: { id: string } }) => void;
};

/** Ensures the per-request chat exists and opens it using Supabase thread id (`offer_id`). */
export function openChatForRequest(router: ChatRoutePush, requestTimestamp: number): void {
  ensureChatForMatchedRequest(requestTimestamp);
  const req = getRequestByTimestamp(requestTimestamp);
  const offerId =
    req != null &&
    typeof (req as { acceptedOfferId?: string }).acceptedOfferId === 'string' &&
    String((req as { acceptedOfferId: string }).acceptedOfferId).trim() !== ''
      ? String((req as { acceptedOfferId: string }).acceptedOfferId).trim()
      : '';
  if (!offerId) return;
  router.push({
    pathname: '/chat/[id]',
    params: { id: offerId },
  });
}
