"use client";

import { useSession } from "next-auth/react";
import { ServerSidebar } from "@/components/layout/server-sidebar";
import { ChannelSidebar } from "@/components/layout/channel-sidebar";
import { MemberList } from "@/components/layout/member-list";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();

  return (
    <div className="flex h-screen overflow-hidden bg-background-primary">
      <ServerSidebar />
      <ChannelSidebar
        username={session?.user?.username ?? ""}
        displayName={session?.user?.displayName ?? ""}
      />
      <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
      <MemberList />
    </div>
  );
}
