"use client";

import { useState } from "react";
import type { ArtifactContent } from "@tavok/shared/typed-messages";

interface ArtifactRendererProps {
  content: ArtifactContent;
  trusted?: boolean;
}

export function getArtifactSandboxPolicy(
  content: ArtifactContent,
  opts: { trusted?: boolean } = {},
): string | undefined {
  if (content.artifactType !== "html" && content.artifactType !== "svg") {
    return undefined;
  }

  return opts.trusted ? "allow-scripts" : "";
}

export function ArtifactRenderer({ content, trusted }: ArtifactRendererProps) {
  const [expanded, setExpanded] = useState(false);

  // For HTML/SVG artifacts, render in a sandboxed iframe. Scripts stay off
  // unless the caller has explicitly marked the artifact as trusted.
  const iframeSrcDoc =
    content.artifactType === "html" || content.artifactType === "svg"
      ? content.content
      : undefined;
  const sandboxPolicy = getArtifactSandboxPolicy(content, { trusted });

  return (
    <div className="rounded border border-border bg-background-primary my-1 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-3 py-2 text-left bg-background-secondary/50 border-b border-border"
      >
        <span className="text-xs font-mono text-accent-cyan">
          {content.artifactType === "html"
            ? "\u{1F310}"
            : content.artifactType === "svg"
              ? "\u{1F3A8}"
              : "\u{1F4C4}"}
        </span>
        <span className="text-xs font-bold font-mono text-text-secondary">
          {content.title}
        </span>
        <span className="text-[9px] font-mono text-text-muted uppercase tracking-wider ml-auto">
          {content.artifactType}
        </span>
        {iframeSrcDoc && !trusted && (
          <span className="text-[9px] font-mono text-text-muted uppercase tracking-wider">
            Scripts off
          </span>
        )}
        <span className="text-[10px] text-text-muted font-mono">
          {expanded ? "\u25B2" : "\u25BC"}
        </span>
      </button>

      {/* Content */}
      {expanded && iframeSrcDoc && (
        <div className="p-2">
          <iframe
            srcDoc={iframeSrcDoc}
            sandbox={sandboxPolicy}
            className="w-full h-64 rounded border border-border bg-white"
            title={content.title}
          />
        </div>
      )}

      {expanded && content.artifactType === "file" && (
        <div className="px-3 py-2">
          <pre className="text-[11px] font-mono text-text-muted overflow-x-auto whitespace-pre-wrap max-h-64 overflow-y-auto">
            {content.content}
          </pre>
        </div>
      )}
    </div>
  );
}
