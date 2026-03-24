"use client";

import {
  useRef,
  useEffect,
  useCallback,
  useMemo,
  useState,
  type ReactElement,
} from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import type { MessagePayload, ReactionData } from "@/lib/hooks/use-channel";
import { MessageItem } from "./message-item";
import { StreamingMessage } from "./streaming-message";
import { TypedMessageItem } from "./typed-message-item";
import { UnreadDivider } from "./unread-divider";

const TYPED_MESSAGE_TYPES = [
  "TOOL_CALL",
  "TOOL_RESULT",
  "CODE_BLOCK",
  "ARTIFACT",
  "STATUS",
];

function MessageRow({
  message,
  prevMessage,
  showDivider,
  currentUserId,
  latestOwnUserMessageId,
  onReactionsChange,
  canManageMessages,
  onEditMessage,
  onDeleteMessage,
  onResumeStream,
  isHighlighted,
}: {
  message: MessagePayload;
  prevMessage?: MessagePayload;
  showDivider: boolean;
  currentUserId?: string;
  latestOwnUserMessageId: string | null;
  onReactionsChange: (messageId: string, reactions: ReactionData[]) => void;
  canManageMessages?: boolean;
  onEditMessage?: (messageId: string, content: string) => Promise<boolean>;
  onDeleteMessage?: (messageId: string) => void;
  onResumeStream?: (
    messageId: string,
    checkpointIndex: number,
    agentId: string,
  ) => void;
  isHighlighted?: boolean;
}) {
  let isGrouped =
    prevMessage?.authorId === message.authorId &&
    prevMessage?.authorType === message.authorType &&
    !prevMessage?.isDeleted &&
    !message.isDeleted &&
    new Date(message.createdAt).getTime() -
      new Date(prevMessage!.createdAt).getTime() <
      5 * 60 * 1000;

  if (
    currentUserId &&
    message.authorType === "USER" &&
    message.id === latestOwnUserMessageId
  ) {
    isGrouped = false;
  }

  const wrapper = (children: React.ReactNode) => (
    <div
      data-message-id={message.id}
      data-message-author-type={message.authorType}
      data-message-type={message.type}
      className={
        isHighlighted
          ? "rounded transition-colors duration-1000 bg-accent-cyan/15"
          : undefined
      }
    >
      {showDivider && <UnreadDivider />}
      {children}
    </div>
  );

  if (message.type === "STREAMING") {
    return wrapper(
      <StreamingMessage
        message={message}
        isGrouped={isGrouped}
        onReactionsChange={onReactionsChange}
        onResumeStream={onResumeStream}
        currentUserId={currentUserId}
        canManageMessages={canManageMessages}
        onDelete={onDeleteMessage}
      />,
    );
  }

  if (TYPED_MESSAGE_TYPES.includes(message.type)) {
    return wrapper(
      <TypedMessageItem message={message} isGrouped={isGrouped} />,
    );
  }

  return wrapper(
    <MessageItem
      message={message}
      isGrouped={isGrouped}
      onReactionsChange={onReactionsChange}
      currentUserId={currentUserId}
      canManageMessages={canManageMessages}
      onEdit={onEditMessage}
      onDelete={onDeleteMessage}
    />,
  );
}

interface MessageListProps {
  messages: MessagePayload[];
  hasMoreHistory: boolean;
  onLoadHistory: () => void;
  onReactionsChange: (messageId: string, reactions: ReactionData[]) => void;
  currentUserId?: string;
  canManageMessages?: boolean;
  onEditMessage?: (messageId: string, content: string) => Promise<boolean>;
  onDeleteMessage?: (messageId: string) => void;
  /** TASK-0016: sequence of last message the user has read (for divider placement) */
  lastReadSeq?: string | null;
  /** TASK-0012: number of concurrently active streams */
  activeStreamCount?: number;
  /** Whether the channel has agents assigned (for empty state messaging) */
  hasAgents?: boolean;
  /** TASK-0021: resume stream from checkpoint */
  onResumeStream?: (
    messageId: string,
    checkpointIndex: number,
    agentId: string,
  ) => void;
  /** TASK-0022: scroll to and highlight this message */
  scrollToMessageId?: string | null;
  /** TASK-0022: callback when scroll-to animation completes */
  onScrollToMessageComplete?: () => void;
}

/**
 * F4: Virtualized message list using react-virtuoso.
 *
 * Only renders messages visible in the viewport (plus overscan buffer),
 * so channels with thousands of messages stay performant.
 * Preserves all existing behavior: auto-follow, history loading,
 * search jump, unread divider, active stream indicator.
 */
export function MessageList({
  messages,
  hasMoreHistory,
  onLoadHistory,
  onReactionsChange,
  currentUserId,
  canManageMessages,
  onEditMessage,
  onDeleteMessage,
  onResumeStream,
  lastReadSeq,
  activeStreamCount = 0,
  hasAgents = false,
  scrollToMessageId,
  onScrollToMessageComplete,
}: MessageListProps) {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const isAtBottomRef = useRef(true);
  const seenMessageIdsRef = useRef<Set<string>>(new Set());
  const hasSeededSeenMessageIdsRef = useRef(false);
  const prevMessageCountRef = useRef(0);
  const prioritizedIncomingUserMessageIdRef = useRef<string | null>(null);

  // TASK-0022: Highlighted message for search jump
  const [highlightedMessageId, setHighlightedMessageId] = useState<
    string | null
  >(null);

  // F2: sr-only announcement for new messages (screen readers)
  const [newMessageAnnouncement, setNewMessageAnnouncement] = useState("");

  const latestOwnUserMessageId = useMemo(() => {
    if (!currentUserId) return null;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const msg = messages[i];
      if (msg.authorType === "USER" && msg.authorId === currentUserId) {
        return msg.id;
      }
    }
    return null;
  }, [messages, currentUserId]);

  const dividerIndex = useMemo(() => {
    if (!lastReadSeq || lastReadSeq === "0" || messages.length === 0) return -1;
    const lrs = BigInt(lastReadSeq);
    for (let i = 0; i < messages.length; i++) {
      try {
        if (BigInt(messages[i].sequence) > lrs) {
          return i > 0 ? i : -1;
        }
      } catch {
        // skip if sequence isn't a valid bigint
      }
    }
    return -1;
  }, [messages, lastReadSeq]);

  // Determine whether Virtuoso should auto-follow new output
  const followOutput = useCallback(
    (isAtBottom: boolean): boolean | "smooth" | "auto" => {
      // If user pinned an incoming message, don't auto-follow to bottom
      if (prioritizedIncomingUserMessageIdRef.current) {
        return false;
      }
      // Follow when at bottom or when there's an active stream
      const hasActiveStream = messages.some(
        (m) => m.streamingStatus === "ACTIVE",
      );
      if (isAtBottom || hasActiveStream) {
        return "smooth";
      }
      return false;
    },
    [messages],
  );

  // Track new messages and manage pinned incoming user message
  useEffect(() => {
    const newlyAddedMessages: MessagePayload[] = [];
    if (!hasSeededSeenMessageIdsRef.current) {
      if (messages.length > 0) {
        messages.forEach((m) => seenMessageIdsRef.current.add(m.id));
        hasSeededSeenMessageIdsRef.current = true;
      }
    } else {
      for (const m of messages) {
        if (!seenMessageIdsRef.current.has(m.id)) {
          seenMessageIdsRef.current.add(m.id);
          newlyAddedMessages.push(m);
        }
      }
    }

    const isNewMessage = messages.length > prevMessageCountRef.current;
    prevMessageCountRef.current = messages.length;

    const latestMessage = messages[messages.length - 1];
    const isLatestOwnUserMessage = Boolean(
      latestMessage &&
      latestMessage.authorType === "USER" &&
      currentUserId &&
      latestMessage.authorId === currentUserId,
    );

    // Track incoming user messages for pinning
    const incomingUserCandidate = newlyAddedMessages.findLast(
      (m) =>
        Boolean(currentUserId) &&
        m.authorType === "USER" &&
        m.authorId !== currentUserId,
    );
    const incomingUserCandidateAgeMs = incomingUserCandidate
      ? Date.now() - new Date(incomingUserCandidate.createdAt).getTime()
      : null;
    const newIncomingUserMessage =
      incomingUserCandidate &&
      incomingUserCandidateAgeMs !== null &&
      incomingUserCandidateAgeMs >= 0 &&
      incomingUserCandidateAgeMs < 30_000
        ? incomingUserCandidate
        : null;

    if (newIncomingUserMessage) {
      prioritizedIncomingUserMessageIdRef.current = newIncomingUserMessage.id;
    }

    // F2: Announce new messages for screen readers (only when not at bottom)
    if (newlyAddedMessages.length > 0 && !isAtBottomRef.current) {
      const latest = newlyAddedMessages[newlyAddedMessages.length - 1];
      setNewMessageAnnouncement(`New message from ${latest.authorName}`);
    }

    // Clear pinned message if it no longer exists
    const pinnedId = prioritizedIncomingUserMessageIdRef.current;
    if (pinnedId && !messages.some((m) => m.id === pinnedId)) {
      prioritizedIncomingUserMessageIdRef.current = null;
    }

    // Own message clears the pin
    if (isNewMessage && isLatestOwnUserMessage) {
      prioritizedIncomingUserMessageIdRef.current = null;
    }

    // For pinned incoming messages, scroll to that message instead of bottom
    if (prioritizedIncomingUserMessageIdRef.current && virtuosoRef.current) {
      const pinnedIndex = messages.findIndex(
        (m) => m.id === prioritizedIncomingUserMessageIdRef.current,
      );
      if (pinnedIndex >= 0) {
        virtuosoRef.current.scrollToIndex({
          index: pinnedIndex,
          align: "end",
        });
      }
    }

    // Force scroll to bottom for new agent streams and own messages
    if (isNewMessage && virtuosoRef.current) {
      const typedAgentTypes = [
        "TOOL_CALL",
        "TOOL_RESULT",
        "CODE_BLOCK",
        "ARTIFACT",
        "STATUS",
      ];
      const isLatestAgentStream = Boolean(
        latestMessage &&
        latestMessage.authorType === "AGENT" &&
        latestMessage.type === "STREAMING",
      );
      const isLatestAgentTyped = Boolean(
        latestMessage &&
        latestMessage.authorType === "AGENT" &&
        typedAgentTypes.includes(latestMessage.type),
      );
      const isLatestIncomingUserMessage = Boolean(
        latestMessage &&
        latestMessage.authorType === "USER" &&
        currentUserId &&
        latestMessage.authorId !== currentUserId,
      );

      const shouldScroll =
        isLatestOwnUserMessage ||
        isLatestAgentStream ||
        isLatestAgentTyped ||
        isLatestIncomingUserMessage ||
        isAtBottomRef.current;

      if (shouldScroll && !prioritizedIncomingUserMessageIdRef.current) {
        virtuosoRef.current.scrollToIndex({
          index: messages.length - 1,
          align: "end",
          behavior: "smooth",
        });
      }
    }
  }, [messages, currentUserId]);

  // TASK-0022: Scroll to and highlight a specific message (search jump)
  useEffect(() => {
    if (!scrollToMessageId) return;

    const targetIndex = messages.findIndex((m) => m.id === scrollToMessageId);
    if (targetIndex >= 0 && virtuosoRef.current) {
      virtuosoRef.current.scrollToIndex({
        index: targetIndex,
        align: "center",
        behavior: "smooth",
      });
      setHighlightedMessageId(scrollToMessageId);
      const timeout = setTimeout(() => {
        setHighlightedMessageId(null);
      }, 2000);
      onScrollToMessageComplete?.();
      return () => clearTimeout(timeout);
    }
    onScrollToMessageComplete?.();
  }, [scrollToMessageId, messages, onScrollToMessageComplete]);

  // Track at-bottom state
  const handleAtBottomChange = useCallback((atBottom: boolean) => {
    isAtBottomRef.current = atBottom;
  }, []);

  // Load history when scrolling to the top
  const handleStartReached = useCallback(() => {
    if (hasMoreHistory) {
      onLoadHistory();
    }
  }, [hasMoreHistory, onLoadHistory]);

  // Render each message item
  const itemContent = useCallback(
    (index: number): ReactElement => {
      const message = messages[index];
      return (
        <MessageRow
          key={message.id}
          message={message}
          prevMessage={messages[index - 1]}
          showDivider={index === dividerIndex}
          currentUserId={currentUserId}
          latestOwnUserMessageId={latestOwnUserMessageId}
          onReactionsChange={onReactionsChange}
          canManageMessages={canManageMessages}
          onEditMessage={onEditMessage}
          onDeleteMessage={onDeleteMessage}
          onResumeStream={onResumeStream}
          isHighlighted={message.id === highlightedMessageId}
        />
      );
    },
    [
      messages,
      dividerIndex,
      currentUserId,
      latestOwnUserMessageId,
      onReactionsChange,
      canManageMessages,
      onEditMessage,
      onDeleteMessage,
      onResumeStream,
      highlightedMessageId,
    ],
  );

  // Empty state
  if (messages.length === 0) {
    return (
      <div className="flex h-full flex-1 items-center justify-center px-4 py-10">
        <div className="chrome-card rounded-lg px-8 py-10 text-center">
          {hasAgents ? (
            <>
              <p className="font-display text-xl font-semibold text-white">
                Agents are ready
              </p>
              <p className="mt-2 text-sm text-text-muted">
                Send a message to get started!
              </p>
            </>
          ) : (
            <>
              <p className="font-display text-xl font-semibold text-white">
                No messages yet
              </p>
              <p className="mt-2 text-sm text-text-muted">
                Be the first to send a message!
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-hidden relative">
      {/* F2: sr-only live region for new message announcements */}
      <div aria-live="polite" className="sr-only">
        {newMessageAnnouncement}
      </div>

      {/* TASK-0012: Active streams indicator for multi-agent channels */}
      {activeStreamCount > 1 && (
        <div className="absolute top-0 left-0 right-0 z-10 flex justify-center py-2 pointer-events-none">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-cyan/[0.06] px-3 py-1 text-[10px] font-medium text-accent-cyan pointer-events-auto">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-cyan animate-pulse" />
            {activeStreamCount} agents responding
          </span>
        </div>
      )}

      <Virtuoso
        ref={virtuosoRef}
        data={messages}
        totalCount={messages.length}
        initialTopMostItemIndex={messages.length - 1}
        followOutput={followOutput}
        atBottomStateChange={handleAtBottomChange}
        atBottomThreshold={50}
        startReached={handleStartReached}
        overscan={600}
        increaseViewportBy={{ top: 400, bottom: 200 }}
        itemContent={itemContent}
        className="px-1 pb-4 pt-3"
        components={{
          Header: () =>
            hasMoreHistory ? (
              <div className="space-y-3 px-4 py-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-start gap-3 animate-pulse">
                    <div className="h-8 w-8 flex-shrink-0 rounded-full bg-background-tertiary/80" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 w-24 rounded bg-background-tertiary/80" />
                      <div
                        className="h-3 rounded bg-background-tertiary/80"
                        style={{ width: `${60 + i * 10}%` }}
                      />
                    </div>
                  </div>
                ))}
                <div className="flex justify-center">
                  <span className="text-[10px] font-mono tracking-[0.16em] text-text-dim">
                    LOADING HISTORY
                  </span>
                </div>
              </div>
            ) : null,
        }}
      />
    </div>
  );
}
