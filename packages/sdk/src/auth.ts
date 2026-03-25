/**
 * Tavok SDK authentication and credential discovery.
 *
 * Handles API key discovery from .tavok-agents.json and agent management
 * via the REST API.
 */

import * as fs from "fs";
import * as path from "path";

const MAX_WALK_DEPTH = 10;

/** Credentials for a single agent discovered from .tavok-agents.json. */
export interface AgentCredentials {
  id: string;
  name: string;
  apiKey: string;
  connectionMethod: string;
}

/**
 * Discover agent credentials from .tavok-agents.json.
 *
 * Walks up from the current directory (or provided `cwd`) looking for a
 * `.tavok-agents.json` file containing credentials for an agent with
 * the given name.
 *
 * @param name - The agent name to look up.
 * @param cwd  - Override the starting directory (defaults to process.cwd()).
 * @returns The agent credentials if found, or null.
 */
export function discoverCredentials(
  name: string,
  cwd?: string,
): AgentCredentials | null {
  const startDir = cwd ?? process.cwd();
  let current = startDir;

  for (let i = 0; i < MAX_WALK_DEPTH; i++) {
    const candidate = path.join(current, ".tavok-agents.json");
    try {
      if (fs.statSync(candidate).isFile()) {
        const raw = fs.readFileSync(candidate, "utf-8");
        const data: unknown = JSON.parse(raw);
        if (data === null || typeof data !== "object" || Array.isArray(data)) {
          return null;
        }

        const record = data as Record<string, unknown>;
        const agents = record.agents;
        if (!Array.isArray(agents)) {
          return null;
        }

        for (const agent of agents) {
          if (
            agent !== null &&
            typeof agent === "object" &&
            !Array.isArray(agent)
          ) {
            const a = agent as Record<string, unknown>;
            if (a.name === name) {
              return {
                id: String(a.id ?? ""),
                name: String(a.name ?? ""),
                apiKey: String(a.apiKey ?? ""),
                connectionMethod: String(a.connectionMethod ?? ""),
              };
            }
          }
        }

        // File found but no matching agent
        return null;
      }
    } catch {
      // File doesn't exist or is unreadable — keep walking
    }

    const parent = path.dirname(current);
    if (parent === current) {
      break; // filesystem root
    }
    current = parent;
  }

  return null;
}

/** Options for {@link updateAgent}. */
export interface UpdateAgentOptions {
  baseUrl: string;
  agentId: string;
  apiKey: string;
  displayName?: string;
  avatarUrl?: string;
  capabilities?: string[];
  healthUrl?: string;
  webhookUrl?: string;
  maxTokensSec?: number;
}

/**
 * Update an existing agent's configuration via PATCH /api/v1/agents/:agentId.
 *
 * @throws If the HTTP request fails.
 */
export async function updateAgent(opts: UpdateAgentOptions): Promise<void> {
  const url = `${opts.baseUrl.replace(/\/+$/, "")}/api/v1/agents/${opts.agentId}`;

  const body: Record<string, unknown> = {};
  if (opts.displayName !== undefined) body.displayName = opts.displayName;
  if (opts.avatarUrl !== undefined) body.avatarUrl = opts.avatarUrl;
  if (opts.capabilities !== undefined) body.capabilities = opts.capabilities;
  if (opts.healthUrl !== undefined) body.healthUrl = opts.healthUrl;
  if (opts.webhookUrl !== undefined) body.webhookUrl = opts.webhookUrl;
  if (opts.maxTokensSec !== undefined) body.maxTokensSec = opts.maxTokensSec;

  const resp = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    throw new Error(
      `Failed to update agent ${opts.agentId}: ${resp.status} ${resp.statusText}`,
    );
  }
}

/** Options for {@link deregisterAgent}. */
export interface DeregisterAgentOptions {
  baseUrl: string;
  agentId: string;
  apiKey: string;
}

/**
 * Deregister an agent via DELETE /api/v1/agents/:agentId.
 *
 * @throws If the HTTP request fails.
 */
export async function deregisterAgent(
  opts: DeregisterAgentOptions,
): Promise<void> {
  const url = `${opts.baseUrl.replace(/\/+$/, "")}/api/v1/agents/${opts.agentId}`;

  const resp = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
    },
  });

  if (!resp.ok) {
    throw new Error(
      `Failed to deregister agent ${opts.agentId}: ${resp.status} ${resp.statusText}`,
    );
  }
}
