"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useChatContext } from "@/components/providers/chat-provider";
import { SdkQuickstartCard } from "./sdk-quickstart-card";

/**
 * Provider defaults — same as byok-form.tsx.
 * Duplicated here to keep onboarding self-contained (no modal dependency).
 */
const PROVIDER_DEFAULTS: Record<string, { endpoint: string; model: string }> = {
  openai: { endpoint: "https://api.openai.com", model: "gpt-4o" },
  anthropic: {
    endpoint: "https://api.anthropic.com",
    model: "claude-sonnet-4-20250514",
  },
  google: {
    endpoint: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-2.0-flash",
  },
  xai: { endpoint: "https://api.x.ai", model: "grok-3" },
  groq: {
    endpoint: "https://api.groq.com/openai",
    model: "llama-3.3-70b-versatile",
  },
  mistral: {
    endpoint: "https://api.mistral.ai",
    model: "mistral-large-latest",
  },
  ollama: { endpoint: "http://localhost:11434", model: "llama3" },
  openrouter: {
    endpoint: "https://openrouter.ai/api",
    model: "openai/gpt-4o",
  },
};

type Step = "welcome" | "fork" | "byok" | "sdk" | "done";

interface ServerResult {
  id: string;
  defaultChannelId: string;
}

interface SdkAgentResult {
  agentId: string;
  apiKey: string;
  websocketUrl: string;
  pollUrl: string;
}

/**
 * Full-screen onboarding flow for first-run users (zero servers).
 *
 * Steps:
 *   1. Welcome — enter server name, create server
 *   2. Fork — "I have an API key" or "I'm building my own agent"
 *   3a. BYOK — provider + API key → create agent → redirect to channel
 *   3b. SDK — create SDK agent → show credentials + snippet
 *   4. Done — redirect to channel
 */
export function OnboardingFlow() {
  const router = useRouter();
  const { refreshServers } = useChatContext();

  // Flow state
  const [step, setStep] = useState<Step>("welcome");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Server creation
  const [serverName, setServerName] = useState("");
  const [server, setServer] = useState<ServerResult | null>(null);

  // BYOK agent creation
  const [provider, setProvider] = useState("openai");
  const [apiKey, setApiKey] = useState("");
  const [agentName, setAgentName] = useState("");

  // SDK agent
  const [sdkAgent, setSdkAgent] = useState<SdkAgentResult | null>(null);

  // ── Step 1: Create Server ──
  async function handleCreateServer(e: React.FormEvent) {
    e.preventDefault();
    if (!serverName.trim()) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: serverName.trim(),
          defaultChannelName: "general",
          defaultChannelTopic: null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create server");
        return;
      }

      const data = await res.json();
      setServer({ id: data.id, defaultChannelId: data.defaultChannelId });
      await refreshServers();
      setStep("fork");
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  // ── Step 3a: Create BYOK Agent ──
  async function handleCreateBYOKAgent(e: React.FormEvent) {
    e.preventDefault();
    if (!server || !apiKey.trim()) return;

    setLoading(true);
    setError("");

    const defaults = PROVIDER_DEFAULTS[provider] || PROVIDER_DEFAULTS.openai;

    try {
      const res = await fetch(`/api/servers/${server.id}/agents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: agentName.trim() || `${provider} Agent`,
          llmProvider: provider,
          llmModel: defaults.model,
          apiEndpoint: defaults.endpoint,
          apiKey: apiKey.trim(),
          systemPrompt: "You are a helpful assistant.",
          temperature: 0.7,
          maxTokens: 4096,
          triggerMode: "ALWAYS",
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create agent");
        return;
      }

      // Agent created — redirect to channel
      router.push(`/servers/${server.id}/channels/${server.defaultChannelId}`);
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  // ── Step 3b: Create SDK Agent ──
  async function handleCreateSdkAgent() {
    if (!server) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/servers/${server.id}/agents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "My Agent",
          connectionMethod: "WEBSOCKET",
          triggerMode: "ALWAYS",
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create agent");
        return;
      }

      const data = await res.json();
      const gatewayUrl =
        process.env.NEXT_PUBLIC_GATEWAY_URL || "ws://localhost:4001/socket";

      setSdkAgent({
        agentId: data.agent.id,
        apiKey: data.apiKey,
        websocketUrl: `${gatewayUrl}/websocket`,
        pollUrl: `${window.location.origin}/api/v1/agents/${data.agent.id}/messages`,
      });
      setStep("sdk");
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function handleGoToChannel() {
    if (!server) return;
    router.push(`/servers/${server.id}/channels/${server.defaultChannelId}`);
  }

  function handleProviderChange(newProvider: string) {
    setProvider(newProvider);
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-background-primary px-6">
      <div className="w-full max-w-lg">
        {/* ── Step 1: Welcome ── */}
        {step === "welcome" && (
          <form onSubmit={handleCreateServer} className="space-y-6">
            <div className="text-center">
              <div className="mx-auto mb-5 flex h-[72px] w-[72px] items-center justify-center rounded-lg border border-brand/20 bg-brand/10 text-brand">
                <svg
                  width="34"
                  height="34"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
              </div>
              <h1 className="font-display text-3xl font-semibold text-white">
                Welcome to Tavok
              </h1>
              <p className="mt-2 text-sm text-text-muted">
                Create your first server to get started.
              </p>
            </div>

            <Input
              label="Server Name"
              value={serverName}
              onChange={(e) => setServerName(e.target.value)}
              placeholder="My AI Workspace"
              autoFocus
              error={error}
            />

            <div className="flex justify-center">
              <Button
                type="submit"
                loading={loading}
                disabled={!serverName.trim()}
              >
                Create Server
              </Button>
            </div>
          </form>
        )}

        {/* ── Step 2: Fork ── */}
        {step === "fork" && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="font-display text-2xl font-semibold text-white">
                Add your first agent
              </h2>
              <p className="mt-2 text-sm text-text-muted">
                Choose how you want to connect an AI agent.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* BYOK Path */}
              <button
                onClick={() => setStep("byok")}
                className="group flex flex-col items-start gap-3 rounded-lg border border-background-tertiary bg-background-floating p-5 text-left transition hover:border-accent-cyan hover:bg-background-floating/80"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-600/20 text-emerald-400">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                  >
                    <path d="M11 1a3 3 0 00-2.83 4H1v3h1v2h2V8h1v2h2V8h1.17A3 3 0 1011 1zm0 4a1 1 0 110-2 1 1 0 010 2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    I have an API key
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-text-muted">
                    Connect to OpenAI, Anthropic, Gemini, or any provider.
                    Fastest path — streaming in 30 seconds.
                  </p>
                </div>
              </button>

              {/* SDK Path */}
              <button
                onClick={handleCreateSdkAgent}
                disabled={loading}
                className="group flex flex-col items-start gap-3 rounded-lg border border-background-tertiary bg-background-floating p-5 text-left transition hover:border-accent-cyan hover:bg-background-floating/80 disabled:opacity-50"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-cyan/20 text-accent-cyan">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                  >
                    <path d="M4.708 5.578L2.061 8.224l2.647 2.646-.708.708-3-3a.5.5 0 010-.708l3-3 .708.708zm6.584 0l2.647 2.646-2.647 2.646.708.708 3-3a.5.5 0 000-.708l-3-3-.708.708zM6.56 13.245l2.5-10 .938.234-2.5 10-.938-.234z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    {loading ? "Creating agent..." : "I'm building my own"}
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-text-muted">
                    Get SDK credentials and a Python snippet. Bring LangGraph,
                    CrewAI, or any framework.
                  </p>
                </div>
              </button>
            </div>

            {error && (
              <p className="text-center text-sm text-status-danger">{error}</p>
            )}
          </div>
        )}

        {/* ── Step 3a: BYOK Form ── */}
        {step === "byok" && (
          <form onSubmit={handleCreateBYOKAgent} className="space-y-4">
            <div className="text-center">
              <h2 className="font-display text-2xl font-semibold text-white">
                Connect your API key
              </h2>
              <p className="mt-1 text-sm text-text-muted">
                Your key is encrypted at rest and never leaves your server.
              </p>
            </div>

            <Input
              label="Agent Name (optional)"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder="Claude Assistant"
            />

            <div>
              <label className="mb-2 block text-xs font-bold uppercase text-text-secondary">
                Provider
              </label>
              <select
                value={provider}
                onChange={(e) => handleProviderChange(e.target.value)}
                className="w-full rounded bg-background-tertiary px-3 py-2 text-sm text-text-primary ring-1 ring-transparent transition focus:ring-brand"
              >
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="google">Google Gemini</option>
                <option value="xai">xAI (Grok)</option>
                <option value="groq">Groq</option>
                <option value="mistral">Mistral</option>
                <option value="ollama">Ollama (Local)</option>
                <option value="openrouter">OpenRouter (400+ models)</option>
              </select>
            </div>

            <Input
              label="API Key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              type="password"
              autoFocus
            />

            {error && <p className="text-sm text-status-danger">{error}</p>}

            <div className="flex justify-between pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setError("");
                  setStep("fork");
                }}
              >
                Back
              </Button>
              <Button type="submit" loading={loading} disabled={!apiKey.trim()}>
                Create Agent
              </Button>
            </div>
          </form>
        )}

        {/* ── Step 3b: SDK Credentials ── */}
        {step === "sdk" && sdkAgent && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="font-display text-2xl font-semibold text-white">
                Your agent is ready
              </h2>
              <p className="mt-1 text-sm text-text-muted">
                Copy the credentials below — the API key is shown once.
              </p>
            </div>

            <SdkQuickstartCard
              apiKey={sdkAgent.apiKey}
              agentId={sdkAgent.agentId}
              websocketUrl={sdkAgent.websocketUrl}
              pollUrl={sdkAgent.pollUrl}
            />

            <div className="flex justify-center">
              <Button onClick={handleGoToChannel}>Go to Channel</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
