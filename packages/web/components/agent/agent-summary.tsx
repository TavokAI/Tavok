"use client";

import React, { useState } from "react";
import Image from "next/image";
import {
  Activity,
  Bot,
  Clock,
  KeyRound,
  Network,
  Shield,
  X,
} from "lucide-react";
import {
  getCapabilityLabel,
  getMethodLabel,
} from "@/components/modals/agent/types";
import { passthroughImageLoader } from "@/lib/image-loader";

export interface AgentSummaryData {
  id: string;
  name: string;
  avatarUrl?: string | null;
  isActive?: boolean;
  llmProvider?: string | null;
  llmModel?: string | null;
  apiEndpoint?: string | null;
  temperature?: number | null;
  maxTokens?: number | null;
  connectionMethod?: string | null;
  triggerMode?: string | null;
  capabilities?: string[] | null;
  channels?: { id: string; name: string }[] | null;
  isGuest?: boolean;
  expiresAt?: string | Date | null;
  revokedAt?: string | Date | null;
  createdAt?: string | Date | null;
  thinkingSteps?: string | string[] | null;
  systemPrompt?: string | null;
}

export interface BuiltAgentSummary {
  statusLabel: string;
  connectionLabel: string;
  triggerLabel: string;
  scopeLabel: string;
  modelLabel: string;
  capabilityLabels: string[];
  thinkingStepLabels: string[];
  expiresLabel: string | null;
  createdLabel: string | null;
}

interface AgentMessageSummarySource {
  authorId: string;
  authorName: string;
  authorAvatarUrl?: string | null;
  metadata?: Record<string, unknown> | null;
  streamingStatus?: string | null;
}

interface AgentSummaryTriggerProps {
  agent: AgentSummaryData;
  isStreaming?: boolean;
  isInactive?: boolean;
  size?: "sm" | "md";
  shape?: "round" | "rounded";
  hoverPlacement?: "left" | "right" | "panel";
  className?: string;
}

export function AgentSummaryTrigger({
  agent,
  isStreaming = false,
  isInactive = false,
  size = "md",
  shape = "rounded",
  hoverPlacement = "right",
  className = "",
}: AgentSummaryTriggerProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className={`group relative inline-flex ${className}`}>
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        className="relative flex-shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background-secondary"
        aria-label={`View ${agent.name} agent summary`}
      >
        <AgentAvatar
          agent={agent}
          isStreaming={isStreaming}
          isInactive={isInactive}
          size={size}
          shape={shape}
        />
      </button>
      <AgentHoverSummary
        agent={agent}
        isStreaming={isStreaming}
        placement={hoverPlacement}
      />
      {dialogOpen && (
        <AgentSummaryDialog
          agent={agent}
          isStreaming={isStreaming}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </div>
  );
}

export function AgentHoverSummary({
  agent,
  isStreaming = false,
  placement = "right",
}: {
  agent: AgentSummaryData;
  isStreaming?: boolean;
  placement?: "left" | "right" | "panel";
}) {
  const summary = buildAgentSummary(agent);
  const topCapabilities = summary.capabilityLabels.slice(0, 3);
  const placementClass =
    placement === "panel"
      ? "left-0 top-full mt-1 w-56"
      : placement === "left"
        ? "right-full top-0 mr-2 w-64"
        : "left-full top-0 ml-2 w-64";

  return (
    <div
      className={`pointer-events-none absolute z-50 hidden rounded-md border border-border bg-background-floating p-3 shadow-xl group-hover:block group-focus-within:block ${placementClass}`}
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-text-primary">
            {agent.name}
          </p>
          <p className="truncate text-[11px] text-text-muted">
            {summary.modelLabel}
          </p>
        </div>
        <span className={statusBadgeClass(summary.statusLabel)}>
          {summary.statusLabel}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <SummaryMetric label="Transport" value={summary.connectionLabel} />
        <SummaryMetric label="Trigger" value={summary.triggerLabel} />
        <SummaryMetric label="Scope" value={summary.scopeLabel} />
        <SummaryMetric
          label="State"
          value={isStreaming ? "Streaming now" : summary.statusLabel}
        />
      </div>
      {topCapabilities.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {topCapabilities.map((capability) => (
            <span
              key={capability}
              className="rounded bg-background-tertiary px-1.5 py-0.5 text-[10px] text-text-muted"
            >
              {capability}
            </span>
          ))}
          {summary.capabilityLabels.length > topCapabilities.length && (
            <span className="rounded bg-background-tertiary px-1.5 py-0.5 text-[10px] text-text-dim">
              +{summary.capabilityLabels.length - topCapabilities.length}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function AgentSummaryDialog({
  agent,
  isStreaming = false,
  onClose,
}: {
  agent: AgentSummaryData;
  isStreaming?: boolean;
  onClose: () => void;
}) {
  const summary = buildAgentSummary(agent);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 px-4 py-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`${agent.name} agent summary`}
        className="max-h-[86vh] w-full max-w-[560px] overflow-y-auto rounded-md border border-border bg-background-floating shadow-2xl"
      >
        <div className="flex items-start gap-3 border-b border-border px-4 py-4">
          <AgentAvatar
            agent={agent}
            isStreaming={isStreaming}
            isInactive={summary.statusLabel === "Inactive"}
            size="md"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-semibold text-text-primary">
                {agent.name}
              </h2>
              <span className={statusBadgeClass(summary.statusLabel)}>
                {summary.statusLabel}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-text-muted">
              {summary.modelLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded text-text-muted transition hover:bg-background-secondary hover:text-text-primary"
            aria-label="Close agent summary"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-4 py-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <SummaryTile
              icon={<Network className="h-3.5 w-3.5" />}
              label="Transport"
              value={summary.connectionLabel}
            />
            <SummaryTile
              icon={<Activity className="h-3.5 w-3.5" />}
              label="Trigger"
              value={summary.triggerLabel}
            />
            <SummaryTile
              icon={<Shield className="h-3.5 w-3.5" />}
              label="Scope"
              value={summary.scopeLabel}
            />
            <SummaryTile
              icon={<Clock className="h-3.5 w-3.5" />}
              label="State"
              value={isStreaming ? "Streaming now" : summary.statusLabel}
            />
          </div>

          <SummarySection title="Access">
            <div className="grid gap-2 sm:grid-cols-2">
              <SummaryRow label="Agent ID" value={agent.id} mono />
              <SummaryRow label="Connection" value={summary.connectionLabel} />
              <SummaryRow label="Trigger mode" value={summary.triggerLabel} />
              <SummaryRow label="Lifecycle" value={summary.statusLabel} />
              {summary.expiresLabel && (
                <SummaryRow label="Expires" value={summary.expiresLabel} />
              )}
              {summary.createdLabel && (
                <SummaryRow label="Created" value={summary.createdLabel} />
              )}
            </div>
          </SummarySection>

          <SummarySection title="Runtime">
            <div className="grid gap-2 sm:grid-cols-2">
              <SummaryRow label="Provider" value={agent.llmProvider || "N/A"} />
              <SummaryRow label="Model" value={agent.llmModel || "N/A"} />
              {agent.apiEndpoint && (
                <SummaryRow label="Endpoint" value={agent.apiEndpoint} mono />
              )}
              {typeof agent.temperature === "number" && (
                <SummaryRow
                  label="Temperature"
                  value={agent.temperature.toString()}
                />
              )}
              {typeof agent.maxTokens === "number" && (
                <SummaryRow
                  label="Max tokens"
                  value={agent.maxTokens.toString()}
                />
              )}
            </div>
          </SummarySection>

          <SummarySection title="Permissions">
            {summary.capabilityLabels.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {summary.capabilityLabels.map((capability) => (
                  <span
                    key={capability}
                    className="rounded bg-background-secondary px-2 py-1 text-[11px] text-text-secondary"
                  >
                    {capability}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-text-muted">
                No explicit capabilities registered.
              </p>
            )}
          </SummarySection>

          <SummarySection title="Channels">
            {agent.channels && agent.channels.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {agent.channels.map((channel) => (
                  <span
                    key={channel.id}
                    className="rounded bg-background-secondary px-2 py-1 text-[11px] text-text-secondary"
                  >
                    #{channel.name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-text-muted">
                No channel assignments visible.
              </p>
            )}
          </SummarySection>

          {summary.thinkingStepLabels.length > 0 && (
            <SummarySection title="Thinking Timeline">
              <div className="flex flex-wrap gap-1.5">
                {summary.thinkingStepLabels.map((step) => (
                  <span
                    key={step}
                    className="rounded bg-accent-cyan/10 px-2 py-1 text-[11px] text-accent-cyan"
                  >
                    {step}
                  </span>
                ))}
              </div>
            </SummarySection>
          )}

          {agent.systemPrompt && (
            <SummarySection title="Instructions">
              <pre className="max-h-36 overflow-y-auto whitespace-pre-wrap rounded bg-background-primary p-3 text-[11px] leading-relaxed text-text-secondary">
                {agent.systemPrompt}
              </pre>
            </SummarySection>
          )}
        </div>
      </section>
    </div>
  );
}

export function buildAgentSummary(
  agent: AgentSummaryData,
  now = new Date(),
): BuiltAgentSummary {
  const statusLabel = getStatusLabel(agent, now);
  const connectionLabel = getConnectionSummaryLabel(agent.connectionMethod);
  const triggerLabel = prettifyEnum(agent.triggerMode) || "Mention";
  const channelCount = agent.channels?.length;
  const scopeLabel =
    channelCount === undefined
      ? "Unknown scope"
      : channelCount === 0
        ? "No channels"
        : channelCount === 1
          ? "1 channel"
          : `${channelCount} channels`;
  const modelLabel = getModelLabel(agent);

  return {
    statusLabel,
    connectionLabel,
    triggerLabel,
    scopeLabel,
    modelLabel,
    capabilityLabels: (agent.capabilities ?? []).map(getCapabilityLabel),
    thinkingStepLabels: parseThinkingSteps(agent.thinkingSteps),
    expiresLabel: formatDateTime(agent.expiresAt),
    createdLabel: formatDateTime(agent.createdAt),
  };
}

export function buildAgentSummaryFromMessage(
  knownAgent: AgentSummaryData | undefined,
  message: AgentMessageSummarySource,
): AgentSummaryData {
  if (knownAgent) {
    return knownAgent;
  }

  const metadata = message.metadata ?? {};
  const provider =
    typeof metadata.provider === "string" ? metadata.provider : null;
  const model = typeof metadata.model === "string" ? metadata.model : null;

  return {
    id: message.authorId,
    name: message.authorName,
    avatarUrl: message.authorAvatarUrl ?? null,
    isActive: message.streamingStatus !== "ERROR",
    llmProvider: provider,
    llmModel: model,
    connectionMethod: undefined,
    triggerMode: null,
    capabilities: null,
    channels: null,
    createdAt: null,
  };
}

function AgentAvatar({
  agent,
  isStreaming,
  isInactive,
  size,
  shape = "rounded",
}: {
  agent: AgentSummaryData;
  isStreaming?: boolean;
  isInactive?: boolean;
  size: "sm" | "md";
  shape?: "round" | "rounded";
}) {
  const sizeClass = size === "sm" ? "h-[34px] w-[34px]" : "h-8 w-8";
  const textClass = size === "sm" ? "text-[12px]" : "text-sm";
  const shapeClass = shape === "round" ? "rounded-full" : "rounded-lg";

  return (
    <div className="relative">
      {agent.avatarUrl ? (
        <Image
          src={agent.avatarUrl}
          alt={agent.name}
          loader={passthroughImageLoader}
          unoptimized
          width={size === "sm" ? 34 : 32}
          height={size === "sm" ? 34 : 32}
          className={`${sizeClass} ${shapeClass} object-cover ${
            isInactive ? "opacity-60" : ""
          }`}
        />
      ) : (
        <div
          className={`flex ${sizeClass} ${shapeClass} items-center justify-center bg-accent-cyan/15 ${textClass} font-bold text-accent-cyan ${
            isInactive ? "opacity-60" : ""
          }`}
        >
          {agent.name.charAt(0).toUpperCase() || <Bot className="h-4 w-4" />}
        </div>
      )}
      {isStreaming && !isInactive ? (
        <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background-secondary">
          <span className="absolute inset-0 animate-pulse rounded-full bg-accent-cyan" />
        </div>
      ) : (
        <div
          className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background-secondary ${
            isInactive ? "bg-status-offline" : "bg-status-online"
          }`}
        />
      )}
    </div>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded bg-background-primary px-2 py-1">
      <p className="text-[9px] uppercase text-text-dim">{label}</p>
      <p className="truncate text-[11px] font-medium text-text-secondary">
        {value}
      </p>
    </div>
  );
}

function SummaryTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded bg-background-primary p-2">
      <div className="mb-1 flex items-center gap-1.5 text-text-dim">
        {icon}
        <span className="text-[9px] uppercase">{label}</span>
      </div>
      <p className="truncate text-xs font-medium text-text-primary">{value}</p>
    </div>
  );
}

function SummarySection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-2 text-[11px] font-bold uppercase text-text-muted">
        {title}
      </h3>
      {children}
    </section>
  );
}

function SummaryRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0 rounded bg-background-primary px-3 py-2">
      <p className="text-[10px] uppercase text-text-dim">{label}</p>
      <p
        className={`truncate text-xs text-text-secondary ${
          mono ? "font-mono" : ""
        }`}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}

function getStatusLabel(agent: AgentSummaryData, now: Date): string {
  if (agent.revokedAt) return "Revoked";
  const expiresAt = parseDate(agent.expiresAt);
  if (expiresAt && expiresAt.getTime() <= now.getTime()) return "Expired";
  if (agent.isActive === false) return "Inactive";
  if (agent.isGuest) return "Guest";
  return "Active";
}

function getConnectionSummaryLabel(method: string | null | undefined): string {
  if (method === undefined) return "Unknown";
  return getMethodLabel(method as Parameters<typeof getMethodLabel>[0]);
}

function getModelLabel(agent: AgentSummaryData): string {
  if (agent.llmProvider && agent.llmModel) {
    return `${agent.llmProvider} / ${agent.llmModel}`;
  }
  return agent.llmModel || agent.llmProvider || "Model unavailable";
}

function parseThinkingSteps(
  value: AgentSummaryData["thinkingSteps"],
): string[] {
  if (Array.isArray(value)) {
    return value.filter((step): step is string => typeof step === "string");
  }
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((step): step is string => typeof step === "string");
  } catch {
    return [];
  }
}

function formatDateTime(
  value: string | Date | null | undefined,
): string | null {
  const date = parseDate(value);
  if (!date) return null;
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function parseDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function prettifyEnum(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function statusBadgeClass(status: string): string {
  const base =
    "inline-flex flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase";
  switch (status) {
    case "Active":
    case "Guest":
      return `${base} bg-status-online/15 text-status-online`;
    case "Inactive":
    case "Expired":
      return `${base} bg-status-offline/20 text-text-muted`;
    case "Revoked":
      return `${base} bg-status-danger/15 text-status-danger`;
    default:
      return `${base} bg-background-tertiary text-text-muted`;
  }
}
