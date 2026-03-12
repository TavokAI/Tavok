"use client";

import type { CharterState } from "@/lib/hooks/use-channel";

// TASK-0020: Human-readable swarm mode labels
const SWARM_MODE_LABELS: Record<string, string> = {
  HUMAN_IN_THE_LOOP: "Human in the Loop",
  LEAD_AGENT: "Lead Agent",
  ROUND_ROBIN: "Round Robin",
  STRUCTURED_DEBATE: "Debate",
  CODE_REVIEW_SPRINT: "Code Review",
  FREEFORM: "Freeform",
  CUSTOM: "Custom",
};

interface ChannelHeaderProps {
  channelName: string;
  topic?: string | null;
  charterState?: CharterState | null; // TASK-0020
  onCharterStart?: () => void; // TASK-0020: Start charter session
  onCharterPause?: () => void; // TASK-0020
  onCharterResume?: () => void; // TASK-0020: Resume paused charter
  onCharterEnd?: () => void; // TASK-0020
}

export function ChannelHeader({
  channelName,
  topic,
  charterState,
  onCharterStart,
  onCharterPause,
  onCharterResume,
  onCharterEnd,
}: ChannelHeaderProps) {
  const isCharterActive =
    charterState &&
    (charterState.status === "ACTIVE" || charterState.status === "PAUSED");

  // Show "Start Charter" when charter is configured (non-default mode) but not running
  const canStartCharter =
    charterState &&
    charterState.swarmMode !== "HUMAN_IN_THE_LOOP" &&
    (charterState.status === "INACTIVE" || charterState.status === "COMPLETED");

  return (
    <div className="flex h-12 items-center border-b border-background-tertiary px-4">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="text-xl text-text-muted">#</span>
        <h1 className="text-base font-bold text-text-primary">{channelName}</h1>
        {topic && !isCharterActive && !canStartCharter && (
          <>
            <div className="mx-2 h-5 w-px bg-background-tertiary" />
            <span className="truncate text-sm text-text-muted">{topic}</span>
          </>
        )}

        {/* TASK-0020: Start Charter button — shown when configured but not running */}
        {canStartCharter && onCharterStart && (
          <>
            <div className="mx-2 h-5 w-px bg-background-tertiary" />
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-muted">
                {SWARM_MODE_LABELS[charterState.swarmMode] ||
                  charterState.swarmMode}
              </span>
              <button
                onClick={onCharterStart}
                className="rounded px-2.5 py-0.5 text-[10px] font-medium text-accent-cyan bg-accent-cyan/10 border border-accent-cyan/30 hover:bg-accent-cyan/20 transition-colors"
                data-testid="charter-start-btn"
              >
                Start Charter
              </button>
            </div>
          </>
        )}

        {/* TASK-0020: Charter status display — active or paused */}
        {isCharterActive && (
          <>
            <div className="mx-2 h-5 w-px bg-background-tertiary" />
            <div className="flex items-center gap-2">
              {/* Status indicator */}
              <span
                className={`inline-flex h-2 w-2 rounded-full ${
                  charterState.status === "ACTIVE"
                    ? "bg-status-success animate-pulse"
                    : "bg-status-warning"
                }`}
                data-testid="charter-status-dot"
              />

              {/* Mode label */}
              <span className="text-xs font-medium text-accent-cyan">
                {SWARM_MODE_LABELS[charterState.swarmMode] ||
                  charterState.swarmMode}
              </span>

              {/* Turn counter */}
              {charterState.maxTurns > 0 && (
                <span
                  className="text-xs text-text-muted"
                  data-testid="charter-turn-counter"
                >
                  Turn {charterState.currentTurn + 1}/{charterState.maxTurns}
                </span>
              )}

              {/* Control buttons */}
              {charterState.status === "ACTIVE" && onCharterPause && (
                <button
                  onClick={onCharterPause}
                  className="rounded px-2 py-0.5 text-[10px] font-medium text-text-muted bg-background-tertiary hover:bg-background-secondary hover:text-text-primary transition-colors"
                  data-testid="charter-pause-btn"
                >
                  Pause
                </button>
              )}
              {charterState.status === "PAUSED" && (
                <>
                  <span className="text-[10px] font-medium text-status-warning">
                    Paused
                  </span>
                  {onCharterResume && (
                    <button
                      onClick={onCharterResume}
                      className="rounded px-2 py-0.5 text-[10px] font-medium text-accent-cyan bg-accent-cyan/10 border border-accent-cyan/30 hover:bg-accent-cyan/20 transition-colors"
                      data-testid="charter-resume-btn"
                    >
                      Resume
                    </button>
                  )}
                </>
              )}
              {onCharterEnd && (
                <button
                  onClick={onCharterEnd}
                  className="rounded px-2 py-0.5 text-[10px] font-medium text-text-muted bg-background-tertiary hover:bg-status-danger/20 hover:text-status-danger transition-colors"
                  data-testid="charter-end-btn"
                >
                  End
                </button>
              )}
            </div>
          </>
        )}

        {/* Completed charter indicator */}
        {charterState?.status === "COMPLETED" && (
          <>
            <div className="mx-2 h-5 w-px bg-background-tertiary" />
            <span
              className="text-xs text-text-muted"
              data-testid="charter-completed"
            >
              Charter completed ({charterState.currentTurn} turns)
            </span>
            {onCharterStart && (
              <button
                onClick={onCharterStart}
                className="ml-1 rounded px-2 py-0.5 text-[10px] font-medium text-accent-cyan bg-accent-cyan/10 border border-accent-cyan/30 hover:bg-accent-cyan/20 transition-colors"
                data-testid="charter-restart-btn"
              >
                Restart
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
