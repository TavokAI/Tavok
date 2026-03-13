"use client";

import { useWorkspaceContext } from "@/components/providers/workspace-provider";
import { useChatContext } from "@/components/providers/chat-provider";
import { ChatPanel } from "./chat-panel";
import { PanelDock } from "./panel-dock";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";

export function Workspace() {
  const { panels, isLoaded } = useWorkspaceContext();
  const { servers, serversLoaded } = useChatContext();
  const activePanels = panels.filter((panel) => !panel.isClosed);
  const visiblePanels = activePanels.filter((panel) => !panel.isMinimized);

  if (!isLoaded) return null;

  // First-run: show onboarding when user has zero servers
  if (serversLoaded && servers.length === 0) {
    return (
      <div
        id="workspace-root"
        className="workspace-floor relative h-full w-full overflow-hidden"
      >
        <OnboardingFlow />
      </div>
    );
  }

  return (
    <div
      id="workspace-root"
      className="workspace-floor relative h-full w-full overflow-hidden"
    >
      {activePanels.map((panel) => (
        <ChatPanel key={panel.id} panel={panel} />
      ))}
      <PanelDock />

      {visiblePanels.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6">
          <div className="chrome-card panel-shadow flex max-w-md flex-col items-center rounded-lg px-10 py-12 text-center">
            <h2 className="font-display text-xl font-semibold text-text-primary">
              Welcome to the Workspace
            </h2>
            <p className="mt-2 text-[12.5px] leading-relaxed text-text-muted">
              Select a channel from the sidebar to begin.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
