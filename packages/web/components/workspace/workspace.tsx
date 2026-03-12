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
        className="relative h-full w-full overflow-hidden bg-background-primary"
      >
        <OnboardingFlow />
      </div>
    );
  }

  return (
    <div
      id="workspace-root"
      className="relative h-full w-full overflow-hidden bg-background-primary"
    >
      {activePanels.map((panel) => (
        <ChatPanel key={panel.id} panel={panel} />
      ))}
      <PanelDock />

      {visiblePanels.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6">
          <div className="chrome-card flex max-w-md flex-col items-center rounded-lg px-10 py-12 text-center">
            <div className="mb-5 flex h-[72px] w-[72px] items-center justify-center rounded-lg border border-brand/20 bg-brand/10 text-brand">
              <svg
                width="34"
                height="34"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M4 19V5a2 2 0 0 1 2-2h13.4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
                <path d="M4 15h18" />
                <path d="M8 15v6" />
                <path d="M12 15v6" />
                <path d="M16 15v6" />
              </svg>
            </div>
            <h2 className="font-display text-2xl font-semibold text-white">
              Welcome to the Workspace
            </h2>
            <p className="mt-2 text-sm leading-6 text-text-muted">
              Select a channel from the sidebar to begin.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
