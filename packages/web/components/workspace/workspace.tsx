"use client";

import { useWorkspaceContext } from "@/components/providers/workspace-provider";
import { ChatPanel } from "./chat-panel";
import { PanelDock } from "./panel-dock";

export function Workspace() {
  const { panels, isLoaded } = useWorkspaceContext();
  const activePanels = panels.filter((panel) => !panel.isClosed);
  const visiblePanels = activePanels.filter((panel) => !panel.isMinimized);

  if (!isLoaded) return null;

  return (
    <div
      id="workspace-root"
      className="relative h-full w-full overflow-hidden bg-[linear-gradient(180deg,rgba(13,23,42,0.64),rgba(9,17,31,0.92))]"
    >
      {activePanels.map((panel) => (
        <ChatPanel key={panel.id} panel={panel} />
      ))}
      <PanelDock />

      {visiblePanels.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6">
          <div className="chrome-card flex max-w-md flex-col items-center rounded-[28px] px-10 py-12 text-center shadow-[0_20px_60px_rgba(3,9,20,0.34)]">
            <div className="mb-5 flex h-[72px] w-[72px] items-center justify-center rounded-[24px] border border-brand/20 bg-brand/10 text-brand shadow-[0_18px_34px_rgba(255,155,69,0.14)]">
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
