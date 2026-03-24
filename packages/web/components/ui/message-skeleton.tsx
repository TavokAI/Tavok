"use client";

/**
 * F1: Reusable skeleton loader for message lists.
 * Shows animated placeholders that mimic the shape of real messages.
 */
export function MessageSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="space-y-4 px-6 py-4">
      {Array.from({ length: count }).map((_, i) => {
        // Alternate between grouped (no avatar) and ungrouped (with avatar)
        const isGrouped = i > 0 && i % 3 !== 0;
        const widths = ["60%", "80%", "45%", "70%", "55%", "90%"];
        const width = widths[i % widths.length];

        if (isGrouped) {
          return (
            <div key={i} className="flex gap-3 animate-pulse ml-[46px]">
              <div className="flex-1 space-y-1.5">
                <div
                  className="h-3 rounded bg-background-tertiary/60"
                  style={{ width }}
                />
              </div>
            </div>
          );
        }

        return (
          <div key={i} className="flex items-start gap-3 animate-pulse">
            <div className="h-[34px] w-[34px] flex-shrink-0 rounded-full bg-background-tertiary/60" />
            <div className="flex-1 space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="h-3 w-20 rounded bg-background-tertiary/60" />
                <div className="h-2.5 w-10 rounded bg-background-tertiary/40" />
              </div>
              <div
                className="h-3 rounded bg-background-tertiary/60"
                style={{ width }}
              />
              {i % 2 === 0 && (
                <div
                  className="h-3 rounded bg-background-tertiary/40"
                  style={{ width: `${parseInt(width) * 0.6}%` }}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Skeleton for the channel/workspace chrome (header + messages + input).
 */
export function ChatPanelSkeleton() {
  return (
    <div className="flex h-full flex-col bg-background-primary">
      {/* Header skeleton */}
      <div className="flex h-12 items-center gap-3 border-b border-background-primary/50 px-4 animate-pulse">
        <div className="h-4 w-4 rounded bg-background-tertiary/60" />
        <div className="h-3.5 w-32 rounded bg-background-tertiary/60" />
      </div>

      {/* Messages skeleton */}
      <div className="flex-1 overflow-hidden">
        <MessageSkeleton count={8} />
      </div>

      {/* Input skeleton */}
      <div className="px-4 pb-4 animate-pulse">
        <div className="h-11 rounded-lg bg-background-tertiary/40" />
      </div>
    </div>
  );
}
