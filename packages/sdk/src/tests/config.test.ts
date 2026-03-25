import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { TavokConfig } from "../config";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tavok-config-test-"));
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe("TavokConfig", () => {
  const savedEnv: Record<string, string | undefined> = {};
  const envKeys = [
    "TAVOK_URL",
    "TAVOK_GATEWAY_URL",
    "TAVOK_SERVER_ID",
    "TAVOK_CHANNEL_ID",
  ];

  beforeEach(() => {
    for (const key of envKeys) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of envKeys) {
      if (savedEnv[key] !== undefined) {
        process.env[key] = savedEnv[key];
      } else {
        delete process.env[key];
      }
    }
  });

  describe("defaults when no config exists", () => {
    it("uses default url and gatewayUrl", () => {
      const tmpDir = makeTempDir();
      try {
        const config = TavokConfig.discover(tmpDir);
        expect(config.url).toBe("http://localhost:5555");
        expect(config.gatewayUrl).toBe("ws://localhost:4001/socket");
        expect(config.serverId).toBeNull();
        expect(config.channelId).toBeNull();
      } finally {
        cleanup(tmpDir);
      }
    });
  });

  describe(".tavok.json discovery", () => {
    it("reads config from .tavok.json in the start directory", () => {
      const tmpDir = makeTempDir();
      try {
        const configData = {
          url: "https://tavok.example.com",
          gatewayUrl: "wss://gw.example.com/socket",
          serverId: "srv_123",
          channelId: "ch_456",
        };
        fs.writeFileSync(
          path.join(tmpDir, ".tavok.json"),
          JSON.stringify(configData),
        );

        const config = TavokConfig.discover(tmpDir);
        expect(config.url).toBe("https://tavok.example.com");
        expect(config.gatewayUrl).toBe("wss://gw.example.com/socket");
        expect(config.serverId).toBe("srv_123");
        expect(config.channelId).toBe("ch_456");
      } finally {
        cleanup(tmpDir);
      }
    });

    it("walks up to find .tavok.json in a parent directory", () => {
      const tmpDir = makeTempDir();
      try {
        const child = path.join(tmpDir, "a", "b", "c");
        fs.mkdirSync(child, { recursive: true });

        fs.writeFileSync(
          path.join(tmpDir, ".tavok.json"),
          JSON.stringify({ url: "http://parent-found:9999" }),
        );

        const config = TavokConfig.discover(child);
        expect(config.url).toBe("http://parent-found:9999");
      } finally {
        cleanup(tmpDir);
      }
    });

    it("ignores invalid JSON gracefully", () => {
      const tmpDir = makeTempDir();
      try {
        fs.writeFileSync(path.join(tmpDir, ".tavok.json"), "not-json!!!");
        const config = TavokConfig.discover(tmpDir);
        // Falls through to defaults
        expect(config.url).toBe("http://localhost:5555");
      } finally {
        cleanup(tmpDir);
      }
    });

    it("ignores non-object JSON (e.g. an array)", () => {
      const tmpDir = makeTempDir();
      try {
        fs.writeFileSync(path.join(tmpDir, ".tavok.json"), "[1,2,3]");
        const config = TavokConfig.discover(tmpDir);
        expect(config.url).toBe("http://localhost:5555");
      } finally {
        cleanup(tmpDir);
      }
    });
  });

  describe("env var precedence", () => {
    it("env vars override .tavok.json values", () => {
      const tmpDir = makeTempDir();
      try {
        fs.writeFileSync(
          path.join(tmpDir, ".tavok.json"),
          JSON.stringify({
            url: "http://from-file:1234",
            gatewayUrl: "ws://from-file:5678/socket",
            serverId: "file_server",
            channelId: "file_channel",
          }),
        );

        process.env.TAVOK_URL = "http://from-env:9999";
        process.env.TAVOK_GATEWAY_URL = "ws://from-env:8888/socket";
        process.env.TAVOK_SERVER_ID = "env_server";
        process.env.TAVOK_CHANNEL_ID = "env_channel";

        const config = TavokConfig.discover(tmpDir);
        expect(config.url).toBe("http://from-env:9999");
        expect(config.gatewayUrl).toBe("ws://from-env:8888/socket");
        expect(config.serverId).toBe("env_server");
        expect(config.channelId).toBe("env_channel");
      } finally {
        cleanup(tmpDir);
      }
    });

    it("partial env vars merge with file config", () => {
      const tmpDir = makeTempDir();
      try {
        fs.writeFileSync(
          path.join(tmpDir, ".tavok.json"),
          JSON.stringify({
            url: "http://from-file:1234",
            serverId: "file_server",
          }),
        );

        process.env.TAVOK_URL = "http://env-only:7777";

        const config = TavokConfig.discover(tmpDir);
        expect(config.url).toBe("http://env-only:7777");
        expect(config.serverId).toBe("file_server");
        expect(config.gatewayUrl).toBe("ws://localhost:4001/socket");
      } finally {
        cleanup(tmpDir);
      }
    });
  });
});
