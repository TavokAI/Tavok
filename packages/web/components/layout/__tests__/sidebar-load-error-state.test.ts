import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SidebarLoadErrorState } from "../sidebar-load-error-state";

describe("SidebarLoadErrorState", () => {
  it("renders compact failure copy with a retry button", () => {
    const html = renderToStaticMarkup(
      React.createElement(SidebarLoadErrorState, {
        onRetry: vi.fn(),
      }),
    );

    expect(html).toContain("Failed to load");
    expect(html).toContain("Retry");
    expect(html).toContain("text-sm text-text-primary");
  });

  it("switches to the narrow layout when requested", () => {
    const html = renderToStaticMarkup(
      React.createElement(SidebarLoadErrorState, {
        narrow: true,
        onRetry: vi.fn(),
      }),
    );

    expect(html).toContain("h-full p-2");
    expect(html).toContain("text-xs text-text-primary");
  });
});
