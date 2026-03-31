"use client";

import React from "react";

interface SidebarLoadErrorStateProps {
  onRetry: () => void;
  narrow?: boolean;
}

export function SidebarLoadErrorState({
  onRetry,
  narrow = false,
}: SidebarLoadErrorStateProps) {
  return (
    <div
      className={`flex items-center justify-center ${
        narrow ? "h-full p-2" : "h-full p-4"
      }`}
    >
      <div
        className={`flex flex-col items-center rounded-lg border border-status-error/20 bg-status-error/5 text-center ${
          narrow ? "w-full gap-2 p-3" : "w-full gap-3 p-4"
        }`}
      >
        <span className="text-status-error" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 14a1.25 1.25 0 110 2.5A1.25 1.25 0 0112 16zm1-8v6h-2V8h2z" />
          </svg>
        </span>
        <p
          className={
            narrow ? "text-xs text-text-primary" : "text-sm text-text-primary"
          }
        >
          Failed to load
        </p>
        <button
          onClick={onRetry}
          className="rounded-md border border-background-tertiary px-2.5 py-1 text-xs font-medium text-text-secondary transition hover:bg-background-primary hover:text-text-primary"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
