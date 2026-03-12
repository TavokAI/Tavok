"use client";

import { useState } from "react";

interface SdkQuickstartCardProps {
  apiKey: string;
  agentId: string;
  websocketUrl: string;
  pollUrl: string;
}

/**
 * Displays SDK credentials and a copy-paste Python snippet.
 * Used in onboarding (SDK path) and after SDK agent creation.
 */
export function SdkQuickstartCard({
  apiKey,
  agentId,
  websocketUrl,
  pollUrl,
}: SdkQuickstartCardProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  async function copyToClipboard(text: string, field: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // Fallback — select text in a temporary element
    }
  }

  const snippet = `pip install tavok-sdk

from tavok import TavokAgent

agent = TavokAgent(
    api_key="${apiKey}",
    agent_id="${agentId}",
    url="${websocketUrl}",
)

@agent.on_message
async def handle(msg):
    await agent.stream(msg.channel_id, content=f"Echo: {msg.content}")

agent.start()`;

  return (
    <div className="space-y-3">
      {/* Credentials */}
      <div className="rounded-lg border border-background-tertiary bg-background-floating p-4">
        <div className="space-y-3">
          <CredentialRow
            label="API Key"
            value={apiKey}
            masked
            copied={copiedField === "apiKey"}
            onCopy={() => copyToClipboard(apiKey, "apiKey")}
          />
          <CredentialRow
            label="Agent ID"
            value={agentId}
            copied={copiedField === "agentId"}
            onCopy={() => copyToClipboard(agentId, "agentId")}
          />
          <CredentialRow
            label="WebSocket"
            value={websocketUrl}
            copied={copiedField === "ws"}
            onCopy={() => copyToClipboard(websocketUrl, "ws")}
          />
          <CredentialRow
            label="REST Poll"
            value={pollUrl}
            copied={copiedField === "poll"}
            onCopy={() => copyToClipboard(pollUrl, "poll")}
          />
        </div>
      </div>

      {/* Code snippet */}
      <div className="rounded-lg border border-background-tertiary bg-background-floating">
        <div className="flex items-center justify-between border-b border-background-tertiary px-4 py-2">
          <span className="text-xs font-bold uppercase text-text-muted">
            Quickstart
          </span>
          <button
            onClick={() => copyToClipboard(snippet, "snippet")}
            className="rounded px-2 py-1 text-xs text-text-secondary transition hover:bg-background-primary hover:text-text-primary"
          >
            {copiedField === "snippet" ? "Copied!" : "Copy"}
          </button>
        </div>
        <pre className="overflow-x-auto p-4 text-xs leading-relaxed text-text-primary">
          <code>{snippet}</code>
        </pre>
      </div>

      <p className="text-center text-xs text-text-dim">
        Save the API key now — it won&apos;t be shown again.
      </p>
    </div>
  );
}

function CredentialRow({
  label,
  value,
  masked,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  masked?: boolean;
  copied: boolean;
  onCopy: () => void;
}) {
  const display = masked ? `${value.slice(0, 12)}...${value.slice(-4)}` : value;

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="shrink-0 text-xs font-bold uppercase text-text-muted">
        {label}
      </span>
      <div className="flex min-w-0 items-center gap-2">
        <code className="truncate text-xs text-text-secondary">{display}</code>
        <button
          onClick={onCopy}
          className="shrink-0 rounded px-2 py-0.5 text-xs text-text-secondary transition hover:bg-background-primary hover:text-text-primary"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
}
