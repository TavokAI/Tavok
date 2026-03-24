"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional fallback UI. Defaults to a simple error message. */
  fallback?: ReactNode;
  /** Label shown in the error UI (e.g., "Chat", "Message List"). */
  label?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * React Error Boundary — catches render errors in child components
 * and displays a fallback UI instead of unmounting the entire tree.
 *
 * Usage:
 *   <ErrorBoundary label="Chat">
 *     <MessageList />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      `[ErrorBoundary${this.props.label ? `: ${this.props.label}` : ""}] Caught error:`,
      error,
      info.componentStack,
    );
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex items-center justify-center p-4">
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-center">
            <p className="text-sm text-red-400">
              {this.props.label
                ? `${this.props.label} encountered an error`
                : "Something went wrong"}
            </p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="mt-2 text-xs text-muted-foreground hover:text-foreground"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
