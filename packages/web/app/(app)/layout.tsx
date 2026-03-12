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
          className="app-shell grid h-screen overflow-hidden p-3"
          style={{
            gridTemplateColumns: "240px 1fr 280px",
            gridTemplateRows: "56px 1fr 44px",
            gap: "12px",
          }}
        >
          <TopBar />
          <LeftPanel />
          <main className="relative overflow-hidden rounded-lg border border-border bg-background-primary">
            {children}
          </main>
          <RightPanel />
          <BottomBar />
        </div>
      </WorkspaceProvider>
    </ChatProvider>
  );
}
