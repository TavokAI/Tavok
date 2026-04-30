import { describe, expect, it } from "vitest";
import type { ArtifactContent } from "@tavok/shared/typed-messages";
import { getArtifactSandboxPolicy } from "../artifact-renderer";

function artifact(
  artifactType: ArtifactContent["artifactType"],
): ArtifactContent {
  return {
    artifactType,
    title: "Preview",
    content: "<script>window.evil = true</script>",
  };
}

describe("ArtifactRenderer sandbox policy", () => {
  it("disables scripts for HTML and SVG artifacts by default", () => {
    expect(getArtifactSandboxPolicy(artifact("html"))).toBe("");
    expect(getArtifactSandboxPolicy(artifact("svg"))).toBe("");
  });

  it("allows scripts only when the caller explicitly trusts the artifact", () => {
    expect(getArtifactSandboxPolicy(artifact("html"), { trusted: true })).toBe(
      "allow-scripts",
    );
  });

  it("does not define an iframe sandbox for file artifacts", () => {
    expect(getArtifactSandboxPolicy(artifact("file"))).toBeUndefined();
  });
});
