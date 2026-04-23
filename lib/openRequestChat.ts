import { chatIdForRequest, ensureChatForMatchedRequest } from '@/store/chatStore';

type ChatRoutePush = {
  push: (args: { pathname: '/chat/[id]'; params: { id: string } }) => void;
};

/** Ensures the per-request chat exists and opens it (stable id: `req-${requestTimestamp}`). */
export function openChatForRequest(router: ChatRoutePush, requestTimestamp: number): void {
  ensureChatForMatchedRequest(requestTimestamp);
  router.push({
    pathname: '/chat/[id]',
    params: { id: chatIdForRequest(requestTimestamp) },
  });
}
