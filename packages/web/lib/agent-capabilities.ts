export const AGENT_CAPABILITIES = {
  READ_HISTORY: "history:read",
  SEND_MESSAGES: "messages:send",
  STREAM: "streams:write",
  SEND_ARTIFACTS: "artifacts:send",
  TRIGGER_AGENTS: "agents:trigger",
} as const;

export type AgentCapability =
  (typeof AGENT_CAPABILITIES)[keyof typeof AGENT_CAPABILITIES];

const VALID_CAPABILITIES = new Set<string>(Object.values(AGENT_CAPABILITIES));

export interface AgentCapabilityScope {
  capabilities?: unknown;
  isGuest?: boolean | null;
}

export interface AgentLifecycleScope extends AgentCapabilityScope {
  isActive?: boolean | null;
  expiresAt?: Date | string | null;
  revokedAt?: Date | string | null;
}

export function normalizeAgentCapabilities(input: unknown): AgentCapability[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const normalized: AgentCapability[] = [];
  for (const value of input) {
    if (
      typeof value === "string" &&
      VALID_CAPABILITIES.has(value) &&
      !normalized.includes(value as AgentCapability)
    ) {
      normalized.push(value as AgentCapability);
    }
  }

  return normalized;
}

export function hasAgentCapability(
  agent: AgentCapabilityScope,
  capability: AgentCapability,
): boolean {
  const capabilities = normalizeAgentCapabilities(agent.capabilities);

  if (!agent.isGuest && capabilities.length === 0) {
    return true;
  }

  return capabilities.includes(capability);
}

export function missingCapabilityError(capability: AgentCapability) {
  return `Missing capability: ${capability}`;
}

export function getAgentLifecycleError(
  agent: AgentLifecycleScope,
): string | null {
  if (agent.isActive === false) {
    return "Agent is inactive";
  }

  if (agent.revokedAt) {
    return "Agent registration is revoked";
  }

  if (agent.expiresAt && new Date(agent.expiresAt) <= new Date()) {
    return "Agent registration is expired";
  }

  return null;
}

export function getAgentCapabilityError(
  agent: AgentLifecycleScope,
  capability: AgentCapability,
): string | null {
  const lifecycleError = getAgentLifecycleError(agent);
  if (lifecycleError) {
    return lifecycleError;
  }

  if (!hasAgentCapability(agent, capability)) {
    return missingCapabilityError(capability);
  }

  return null;
}
