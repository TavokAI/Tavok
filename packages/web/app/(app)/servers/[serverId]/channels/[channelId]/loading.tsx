import { ChatPanelSkeleton } from "@/components/ui/message-skeleton";

/**
 * F1: Next.js loading boundary for channel pages.
 * Shown while the channel page JS is loading.
 */
export default function ChannelLoading() {
  return <ChatPanelSkeleton />;
}
