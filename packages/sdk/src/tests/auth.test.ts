import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { discoverCredentials } from "../auth";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tavok-auth-test-"));
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

const SAMPLE_AGENTS = {
  agents: [
    {
      id: "agent_001",
      name: "test-bot",
      apiKey: "sk-tvk-abc123",
      connectionMethod: "websocket",
    },
    {
      id: "agent_002",
      name: "helper-bot",
      apiKey: "sk-tvk-def456",
      connectionMethod: "webhook",
    },
  ],
};

describe("discoverCredentials", () => {
  describe(".tavok-agents.json parsing", () => {
    it("parses a valid agents file and finds agent by name", () => {
      const tmpDir = makeTempDir();
      try {
        fs.writeFileSync(
          path.join(tmpDir, ".tavok-agents.json"),
          JSON.stringify(SAMPLE_AGENTS),
        );

        const creds = discoverCredentials("test-bot", tmpDir);
        expect(creds).not.toBeNull();
        expect(creds!.id).toBe("agent_001");
        expect(creds!.apiKey).toBe("sk-tvk-abc123");
        expect(creds!.connectionMethod).toBe("websocket");
      } finally {
        cleanup(tmpDir);
      }
    });

    it("finds the second agent in the list", () => {
      const tmpDir = makeTempDir();
      try {
        fs.writeFileSync(
          path.join(tmpDir, ".tavok-agents.json"),
          JSON.stringify(SAMPLE_AGENTS),
        );

        const creds = discoverCredentials("helper-bot", tmpDir);
        expect(creds).not.toBeNull();
        expect(creds!.id).toBe("agent_002");
        expect(creds!.name).toBe("helper-bot");
        expect(creds!.connectionMethod).toBe("webhook");
      } finally {
        cleanup(tmpDir);
      }
    });
  });

  describe("credential lookup by name", () => {
    it("returns null when agent name is not found", () => {
      const tmpDir = makeTempDir();
      try {
        fs.writeFileSync(
          path.join(tmpDir, ".tavok-agents.json"),
          JSON.stringify(SAMPLE_AGENTS),
        );

        const creds = discoverCredentials("nonexistent-bot", tmpDir);
        expect(creds).toBeNull();
      } finally {
        cleanup(tmpDir);
      }
    });

    it("walks up directories to find the agents file", () => {
      const tmpDir = makeTempDir();
      try {
        const child = path.join(tmpDir, "deep", "nested", "dir");
        fs.mkdirSync(child, { recursive: true });

        fs.writeFileSync(
          path.join(tmpDir, ".tavok-agents.json"),
          JSON.stringify(SAMPLE_AGENTS),
        );

        const creds = discoverCredentials("test-bot", child);
        expect(creds).not.toBeNull();
        expect(creds!.id).toBe("agent_001");
      } finally {
        cleanup(tmpDir);
      }
    });
  });

  describe("missing file returns null", () => {
    it("returns null when no .tavok-agents.json exists", () => {
      const tmpDir = makeTempDir();
      try {
        const creds = discoverCredentials("test-bot", tmpDir);
        expect(creds).toBeNull();
      } finally {
        cleanup(tmpDir);
      }
    });

    it("returns null for invalid JSON", () => {
      const tmpDir = makeTempDir();
      try {
        fs.writeFileSync(
          path.join(tmpDir, ".tavok-agents.json"),
          "{{broken json",
        );
        const creds = discoverCredentials("test-bot", tmpDir);
        expect(creds).toBeNull();
      } finally {
        cleanup(tmpDir);
      }
    });

    it("returns null when agents key is missing", () => {
      const tmpDir = makeTempDir();
      try {
        fs.writeFileSync(
          path.join(tmpDir, ".tavok-agents.json"),
          JSON.stringify({ something: "else" }),
        );
        const creds = discoverCredentials("test-bot", tmpDir);
        expect(creds).toBeNull();
      } finally {
        cleanup(tmpDir);
      }
    });
  });
});
