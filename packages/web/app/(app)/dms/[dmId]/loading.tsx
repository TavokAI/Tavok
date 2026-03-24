import { ChatPanelSkeleton } from "@/components/ui/message-skeleton";

/**
 * F1: Next.js loading boundary for DM pages.
 * Shown while the DM page JS is loading.
 */
export default function DmLoading() {
  return <ChatPanelSkeleton />;
}
