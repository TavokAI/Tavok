/**
 * Configuration auto-discovery for Tavok agents.
 *
 * Resolution order (highest priority first):
 * 1. Explicit constructor arguments
 * 2. Environment variables (TAVOK_URL, TAVOK_GATEWAY_URL, TAVOK_SERVER_ID, TAVOK_CHANNEL_ID)
 * 3. .tavok.json file (walk up from cwd, max 10 directories)
 * 4. Localhost defaults
 *
 * Security notes:
 * - .tavok.json contains ONLY topology info (URLs, IDs). No secrets.
 * - API keys are read from TAVOK_API_KEY env var, never from config files.
 */

import * as fs from "fs";
import * as path from "path";

const MAX_WALK_DEPTH = 10;

const DEFAULT_URL = "http://localhost:5555";
const DEFAULT_GATEWAY_URL = "ws://localhost:4001/socket";

/** Shape of the discovered configuration data. */
export interface TavokConfigData {
  /** Web server URL (e.g. http://localhost:5555). */
  url: string;
  /** Gateway WebSocket URL (e.g. ws://localhost:4001/socket). */
  gatewayUrl: string;
  /** Default server ULID, or null if not discovered. */
  serverId: string | null;
  /** Default channel ULID, or null if not discovered. */
  channelId: string | null;
}

/**
 * Walk up from `startDir` looking for `.tavok.json` (max 10 levels).
 * Returns the parsed JSON object if found, or an empty object.
 */
function findTavokJson(startDir: string): Record<string, unknown> {
  let current = startDir;

  for (let i = 0; i < MAX_WALK_DEPTH; i++) {
    const candidate = path.join(current, ".tavok.json");
    try {
      if (fs.statSync(candidate).isFile()) {
        const raw = fs.readFileSync(candidate, "utf-8");
        const data: unknown = JSON.parse(raw);
        if (data !== null && typeof data === "object" && !Array.isArray(data)) {
          return data as Record<string, unknown>;
        }
        return {};
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

  return {};
}

/** Discovered Tavok connection configuration. */
export class TavokConfig implements TavokConfigData {
  readonly url: string;
  readonly gatewayUrl: string;
  readonly serverId: string | null;
  readonly channelId: string | null;

  constructor(data: TavokConfigData) {
    this.url = data.url;
    this.gatewayUrl = data.gatewayUrl;
    this.serverId = data.serverId;
    this.channelId = data.channelId;
  }

  /**
   * Discover configuration from env vars and .tavok.json.
   *
   * Checks environment variables first, then walks up from the current
   * directory (or the provided `cwd`) looking for .tavok.json.
   *
   * @param cwd - Override the starting directory for file discovery (defaults to process.cwd()).
   */
  static discover(cwd?: string): TavokConfig {
    const startDir = cwd ?? process.cwd();
    const fileConfig = findTavokJson(startDir);

    const strOrNull = (v: unknown): string | null =>
      typeof v === "string" ? v : null;

    return new TavokConfig({
      url:
        process.env.TAVOK_URL ||
        strOrNull(fileConfig.url) ||
        DEFAULT_URL,
      gatewayUrl:
        process.env.TAVOK_GATEWAY_URL ||
        strOrNull(fileConfig.gatewayUrl) ||
        DEFAULT_GATEWAY_URL,
      serverId:
        process.env.TAVOK_SERVER_ID ||
        strOrNull(fileConfig.serverId) ||
        null,
      channelId:
        process.env.TAVOK_CHANNEL_ID ||
        strOrNull(fileConfig.channelId) ||
        null,
    });
  }
}
