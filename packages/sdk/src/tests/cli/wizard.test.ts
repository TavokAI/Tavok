import { describe, it, expect } from "vitest";
import { templates } from "../../cli/templates/index";

describe("wizard / template registry", () => {
  const expectedTemplates = [
    "openai",
    "anthropic",
    "openclaw",
    "langchain",
    "crewai",
    "hermes",
    "ollama",
    "autogen",
    "semantic-kernel",
    "custom-ws",
    "custom-rest",
    "custom-webhook",
    "custom-inbound",
    "custom-sse",
    "custom-openai",
  ];

  it("all expected templates are registered", () => {
    for (const id of expectedTemplates) {
      expect(templates[id]).toBeDefined();
      expect(templates[id].id).toBe(id);
    }
  });

  it("has exactly the expected number of templates", () => {
    expect(Object.keys(templates).length).toBe(expectedTemplates.length);
  });

  it("every template has required fields", () => {
    for (const [id, tpl] of Object.entries(templates)) {
      expect(tpl.id).toBe(id);
      expect(tpl.name).toBeTruthy();
      expect(["popular", "other", "custom"]).toContain(tpl.category);
      expect(tpl.connectionMethod).toBeTruthy();
      expect(typeof tpl.dependencies).toBe("object");
      expect(typeof tpl.devDependencies).toBe("object");
      expect(typeof tpl.envVars).toBe("object");
      expect(typeof tpl.sourceCode).toBe("function");
    }
  });

  it("sourceCode generates non-empty string with agent name", () => {
    for (const tpl of Object.values(templates)) {
      const code = tpl.sourceCode("TestAgent");
      expect(code.length).toBeGreaterThan(50);
      expect(code).toContain("TestAgent");
    }
  });

  it("connection method mapping is correct for popular frameworks", () => {
    expect(templates["openai"].connectionMethod).toBe("WEBSOCKET");
    expect(templates["anthropic"].connectionMethod).toBe("WEBSOCKET");
    expect(templates["openclaw"].connectionMethod).toBe("WEBSOCKET");
    expect(templates["langchain"].connectionMethod).toBe("WEBHOOK");
    expect(templates["crewai"].connectionMethod).toBe("WEBHOOK");
    expect(templates["hermes"].connectionMethod).toBe("WEBSOCKET");
    expect(templates["ollama"].connectionMethod).toBe("WEBSOCKET");
  });

  it("connection method mapping is correct for other frameworks", () => {
    expect(templates["autogen"].connectionMethod).toBe("REST_POLL");
    expect(templates["semantic-kernel"].connectionMethod).toBe("REST_POLL");
  });

  it("connection method mapping is correct for custom templates", () => {
    expect(templates["custom-ws"].connectionMethod).toBe("WEBSOCKET");
    expect(templates["custom-rest"].connectionMethod).toBe("REST_POLL");
    expect(templates["custom-webhook"].connectionMethod).toBe("WEBHOOK");
    expect(templates["custom-inbound"].connectionMethod).toBe("INBOUND_WEBHOOK");
    expect(templates["custom-sse"].connectionMethod).toBe("SSE");
    expect(templates["custom-openai"].connectionMethod).toBe("OPENAI_COMPAT");
  });

  it("popular templates have correct categories", () => {
    const popularIds = ["openai", "anthropic", "openclaw", "langchain", "crewai", "hermes", "ollama"];
    for (const id of popularIds) {
      expect(templates[id].category).toBe("popular");
    }
  });

  it("other templates have correct categories", () => {
    expect(templates["autogen"].category).toBe("other");
    expect(templates["semantic-kernel"].category).toBe("other");
  });

  it("custom templates have correct categories", () => {
    const customIds = ["custom-ws", "custom-rest", "custom-webhook", "custom-inbound", "custom-sse", "custom-openai"];
    for (const id of customIds) {
      expect(templates[id].category).toBe("custom");
    }
  });

  it("openai template has openai dependency", () => {
    expect(templates["openai"].dependencies["openai"]).toBeDefined();
  });

  it("anthropic template has anthropic dependency", () => {
    expect(templates["anthropic"].dependencies["@anthropic-ai/sdk"]).toBeDefined();
  });

  it("langchain template has express and langchain dependencies", () => {
    expect(templates["langchain"].dependencies["langchain"]).toBeDefined();
    expect(templates["langchain"].dependencies["express"]).toBeDefined();
    expect(templates["langchain"].devDependencies["@types/express"]).toBeDefined();
  });

  it("webhook templates include express", () => {
    const webhookIds = ["langchain", "crewai", "custom-webhook"];
    for (const id of webhookIds) {
      expect(templates[id].dependencies["express"]).toBeDefined();
    }
  });
});
