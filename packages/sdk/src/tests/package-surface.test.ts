import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

const packageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../../package.json"), "utf-8"),
) as {
  license: string;
  exports: Record<string, unknown>;
};

describe("publishable package surface", () => {
  it("uses the repository license expression", () => {
    expect(packageJson.license).toBe("AGPL-3.0-or-later");
  });

  it("ships the repository license text", () => {
    const packageLicense = fs.readFileSync(
      path.join(__dirname, "../../LICENSE"),
      "utf-8",
    );
    const repoLicense = fs.readFileSync(
      path.join(__dirname, "../../../../LICENSE"),
      "utf-8",
    );

    expect(packageLicense).toBe(repoLicense);
  });

  it("exports documented adapter subpaths", () => {
    expect(Object.keys(packageJson.exports).sort()).toEqual([
      ".",
      "./inbound-webhook",
      "./openai-compat",
      "./rest",
      "./sse",
      "./webhook",
    ]);
  });
});
