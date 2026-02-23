"use client";

import { useChannel } from "@/lib/hooks/use-channel";
import { ChannelHeader } from "./channel-header";
import { MessageList } from "./message-list";
import { MessageInput } from "./message-input";
import { TypingIndicator } from "./typing-indicator";

interface ChatAreaProps {
  channelId: string;
  channelName: string;
  channelTopic?: string | null;
  /** Callback to expose presenceMap to parent for MemberList */
  onPresenceChange?: (presenceMap: Map<string, { userId: string; username: string; displayName: string; status: string }>) => void;
}

export function ChatArea({
  channelId,
  channelName,
  channelTopic,
  onPresenceChange,
}: ChatAreaProps) {
  const {
    messages,
    sendMessage,
    loadHistory,
    hasMoreHistory,
    isConnected,
    typingUsers,
    sendTyping,
    presenceMap,
  } = useChannel(channelId);

  // Expose presence to parent when it changes
  // Using a ref to avoid render loops
  if (onPresenceChange) {
    // We call this synchronously — ChatArea re-renders when presenceMap changes
    // and the parent picks up the new value
    onPresenceChange(presenceMap);
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <ChannelHeader channelName={channelName} topic={channelTopic} />
      <MessageList
        messages={messages}
        hasMoreHistory={hasMoreHistory}
        onLoadHistory={loadHistory}
      />
      <TypingIndicator typingUsers={typingUsers} />
      <MessageInput
        onSend={sendMessage}
        onTyping={sendTyping}
        disabled={!isConnected}
        channelName={channelName}
      />
    </div>
  );
}
