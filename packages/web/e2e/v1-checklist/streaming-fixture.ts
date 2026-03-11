/**
 * Shared streaming test setup — provisions a mock agent that talks to
 * the mock LLM server on the host machine.
 *
 * Exported helpers:
 *   ensureMockLLM()              — starts the mock OpenAI server (singleton)
 *   ensureMockAgent(page, sid)   — creates "Echo Test Agent" on given server
 *   cleanupMockLLM()             — stops the mock server
 *   MOCK_AGENT_NAME              — the agent display name to check in the UI
 */

import type { Page } from "@playwright/test";
import { startMockLLM, stopMockLLM } from "../mock-llm-server";

export const MOCK_AGENT_NAME = "Echo Test Agent";
const MOCK_LLM_PORT = 9999;

// Docker Desktop on Windows resolves this to the host machine
const MOCK_LLM_ENDPOINT = `http://host.docker.internal:${MOCK_LLM_PORT}`;

let mockLLMStarted = false;
const mockAgentServers = new Set<string>();

/**
 * Start the mock LLM server. Idempotent — only starts once per process.
 */
export async function ensureMockLLM(): Promise<void> {
  if (mockLLMStarted) return;
  await startMockLLM(MOCK_LLM_PORT);
  mockLLMStarted = true;
}

/**
 * Create the "Echo Test Agent" on the given server via the authenticated
 * Next.js API. Uses the current page's session cookies for auth.
 *
 * The agent is created with:
 *   - llmProvider: "custom" (routes through OpenAI-compat provider in Go)
 *   - apiEndpoint: host.docker.internal:9999 (mock server on host)
 *   - triggerMode: "ALWAYS" (no @mention needed)
 *
 * Idempotent per server — only creates once per serverId per process.
 */
export async function ensureMockAgent(
  page: Page,
  serverId: string,
): Promise<void> {
  if (mockAgentServers.has(serverId)) return;

  // Check if agent already exists on this server
  const agentsRes = await page.evaluate(async (sid: string) => {
    const res = await fetch(`/api/servers/${sid}/agents`);
    return res.json();
  }, serverId);

  const agents = agentsRes.agents || agentsRes;
  const existing = Array.isArray(agents)
    ? agents.find((a: { name: string }) => a.name === "Echo Test Agent")
    : null;

  if (existing) {
    mockAgentServers.add(serverId);
    return;
  }

  // Create the BYOK agent
  const createRes = await page.evaluate(
    async (args: { serverId: string; endpoint: string }) => {
      const res = await fetch(`/api/servers/${args.serverId}/agents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Echo Test Agent",
          llmProvider: "custom",
          llmModel: "mock-echo",
          apiEndpoint: args.endpoint,
          apiKey: "mock-test-key",
          systemPrompt:
            "You are a test echo agent. Echo the user message back.",
          temperature: 0,
          maxTokens: 256,
          triggerMode: "ALWAYS",
        }),
      });
      return { status: res.status, body: await res.json() };
    },
    { serverId, endpoint: MOCK_LLM_ENDPOINT },
  );

  if (createRes.status !== 201 && createRes.status !== 200) {
    throw new Error(
      `Failed to create mock agent: ${createRes.status} — ${JSON.stringify(createRes.body)}`,
    );
  }

  mockAgentServers.add(serverId);
}

/**
 * Stop the mock LLM server.
 */
export async function cleanupMockLLM(): Promise<void> {
  await stopMockLLM();
  mockLLMStarted = false;
}
