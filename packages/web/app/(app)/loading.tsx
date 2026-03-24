import { ChatPanelSkeleton } from "@/components/ui/message-skeleton";

/**
 * F1: Next.js loading boundary for the main app layout.
 * Shown during route transitions within the (app) group.
 */
export default function AppLoading() {
  return <ChatPanelSkeleton />;
}
