/**
 * Mock MCP server for E2E tool execution tests.
 *
 * Uses the MCP TypeScript SDK (@modelcontextprotocol/sdk) to create a
 * standards-compliant MCP server that advertises three tools:
 *   - web_search:   Returns canned search results
 *   - calculator:   Evaluates simple math expressions
 *   - get_weather:  Returns canned weather data
 *
 * The server runs on SSE transport (HTTP) for easy start/stop in tests.
 * This fixture is ready for integration when the Go streaming proxy
 * gains MCP client support. Currently, E2E tool tests use the Go proxy's
 * built-in tool registry (current_time) via the mock LLM's TOOL_TEST trigger.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import * as http from "http";
import { z } from "zod/v3";

let httpServer: http.Server | null = null;
let transport: SSEServerTransport | null = null;

const MCP_PORT = 9998;

export async function startMockMCP(port = MCP_PORT): Promise<void> {
  if (httpServer) return;

  const mcp = new McpServer({
    name: "tavok-mock-mcp",
    version: "1.0.0",
  });

  // ── Tool 1: web_search ─────────────────────────────────────────────
  mcp.tool(
    "web_search",
    "Search the web for information. Returns relevant results.",
    { query: z.string().describe("The search query") },
    async ({ query }) => ({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              results: [
                {
                  title: `Result for: ${query}`,
                  url: "https://example.com/1",
                  snippet: `This is a mock search result for "${query}".`,
                },
                {
                  title: `Another result for: ${query}`,
                  url: "https://example.com/2",
                  snippet: `More information about "${query}" from a mock source.`,
                },
              ],
            },
            null,
            2,
          ),
        },
      ],
    }),
  );

  // ── Tool 2: calculator ─────────────────────────────────────────────
  mcp.tool(
    "calculator",
    "Evaluate a simple math expression and return the result.",
    { expression: z.string().describe("Math expression, e.g. '2 + 2'") },
    async ({ expression }) => {
      // Simple safe eval for basic math
      let result: number;
      try {
        // Only allow digits, operators, parens, dots, spaces
        if (!/^[\d+\-*/().%\s]+$/.test(expression)) {
          throw new Error("Invalid expression");
        }
        result = Function(`"use strict"; return (${expression})`)();
      } catch {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: could not evaluate "${expression}"`,
            },
          ],
          isError: true,
        };
      }
      return {
        content: [{ type: "text" as const, text: `${expression} = ${result}` }],
      };
    },
  );

  // ── Tool 3: get_weather ────────────────────────────────────────────
  mcp.tool(
    "get_weather",
    "Get the current weather for a location.",
    { location: z.string().describe("City name, e.g. 'San Francisco'") },
    async ({ location }) => ({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              location,
              temperature: "72°F",
              condition: "Partly cloudy",
              humidity: "45%",
              wind: "8 mph SW",
            },
            null,
            2,
          ),
        },
      ],
    }),
  );

  // ── HTTP server with SSE transport ─────────────────────────────────
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      // Health check
      if (req.method === "GET" && req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", tools: 3 }));
        return;
      }

      // SSE endpoint for MCP
      if (req.url === "/sse" || req.url?.startsWith("/message")) {
        if (!transport) {
          transport = new SSEServerTransport("/message", res);
          await mcp.connect(transport);
        }
      }
    });

    server.listen(port, "0.0.0.0", () => {
      httpServer = server;
      console.log(`[mock-mcp] Listening on http://0.0.0.0:${port}`);
      resolve();
    });

    server.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "EADDRINUSE") {
        console.log(
          `[mock-mcp] Port ${port} already in use, assuming another instance`,
        );
        resolve();
      } else {
        reject(err);
      }
    });
  });
}

export function stopMockMCP(): Promise<void> {
  return new Promise((resolve) => {
    transport = null;
    if (!httpServer) {
      resolve();
      return;
    }
    httpServer.close(() => {
      httpServer = null;
      resolve();
    });
  });
}

// Allow running standalone (works in both CJS and ESM)
const isMain =
  typeof require !== "undefined"
    ? require.main === module
    : process.argv[1]?.endsWith("mock-mcp-server.ts") ||
      process.argv[1]?.endsWith("mock-mcp-server.js");

if (isMain) {
  startMockMCP().then(() => console.log("[mock-mcp] Ready"));
}
