import { describe, expect, it } from "vitest";
import {
  hydrateSavedPanel,
  reopenExistingPanel,
  restoreDockedPanel,
} from "../use-panel-state";
import type { PanelState } from "../use-panel-state";

const basePanel = (overrides: Partial<PanelState> = {}): PanelState => ({
  id: "channel-1",
  channelId: "channel-1",
  channelName: "General",
  serverId: "server-1",
  serverName: "Workspace",
  x: 40,
  y: 50,
  width: 420,
  height: 360,
  isMinimized: false,
  isClosed: false,
  isMaximized: false,
  restoreX: null,
  restoreY: null,
  restoreWidth: null,
  restoreHeight: null,
  zIndex: 2,
  ...overrides,
});

describe("hydrateSavedPanel", () => {
  it("rejects malformed saved panel data", () => {
    expect(hydrateSavedPanel(null)).toBeNull();
    expect(hydrateSavedPanel({ channelId: "channel-1" })).toBeNull();
  });

  it("coerces defaults and clamps geometry into the workspace", () => {
    const panel = hydrateSavedPanel({
      channelId: "channel-1",
      serverId: "server-1",
      x: 5_000,
      y: -20,
      width: 20,
      height: 20,
      zIndex: -1,
    });

    expect(panel).toMatchObject({
      id: "channel-1",
      channelName: "unknown",
      serverName: "unknown",
      x: 900,
      y: 0,
      width: 300,
      height: 200,
      zIndex: 1,
    });
  });

  it("restores saved maximized panels to their previous windowed geometry", () => {
    const panel = hydrateSavedPanel({
      channelId: "channel-1",
      serverId: "server-1",
      isMaximized: true,
      restoreX: 80,
      restoreY: 90,
      restoreWidth: 500,
      restoreHeight: 420,
    });

    expect(panel).toMatchObject({
      isMaximized: false,
      x: 80,
      y: 90,
      width: 500,
      height: 420,
      restoreX: null,
      restoreY: null,
      restoreWidth: null,
      restoreHeight: null,
    });
  });
});

describe("panel restore helpers", () => {
  it("reopens an existing closed panel with fresh labels and top z-index", () => {
    const reopened = reopenExistingPanel(
      basePanel({
        isClosed: true,
        isMinimized: true,
        isMaximized: true,
        restoreX: 30,
        restoreY: 40,
        restoreWidth: 450,
        restoreHeight: 300,
      }),
      {
        channelId: "channel-1",
        channelName: "Planning",
        serverId: "server-2",
        serverName: "Ops",
      },
      7,
    );

    expect(reopened).toMatchObject({
      channelName: "Planning",
      serverId: "server-2",
      serverName: "Ops",
      isClosed: false,
      isMinimized: false,
      isMaximized: false,
      x: 30,
      y: 40,
      width: 450,
      height: 300,
      zIndex: 8,
    });
  });

  it("restores a docked panel without preserving minimized or closed state", () => {
    const restored = restoreDockedPanel(
      basePanel({ isClosed: true, isMinimized: true, zIndex: 1 }),
      4,
    );

    expect(restored).toMatchObject({
      isClosed: false,
      isMinimized: false,
      zIndex: 5,
    });
  });
});
