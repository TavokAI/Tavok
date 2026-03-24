"use client";

import { ChatProvider } from "@/components/providers/chat-provider";
import { WorkspaceProvider } from "@/components/providers/workspace-provider";
import { TopBar } from "@/components/layout/top-bar";
import { LeftPanel } from "@/components/layout/left-panel";
import { RightPanel } from "@/components/layout/right-panel";
import { BottomBar } from "@/components/layout/bottom-bar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ChatProvider>
      <WorkspaceProvider>
        <div
          className="app-shell grid h-screen overflow-hidden"
          style={{
            gridTemplateColumns: "240px 1fr 280px",
            gridTemplateRows: "48px 1fr 24px",
            gap: "2px",
          }}
        >
          {/* F2: Skip navigation link for keyboard/screen reader users */}
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:rounded focus:bg-brand focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-background-primary"
          >
            Skip to content
          </a>
          <TopBar />
          <LeftPanel />
          <main
            id="main-content"
            className="workspace-floor relative overflow-hidden"
          >
            {children}
          </main>
          <RightPanel />
          <BottomBar />
        </div>
      </WorkspaceProvider>
    </ChatProvider>
  );
}
