import { describe, expect, it } from "vitest";
import {
  type PanelState,
  hydrateSavedPanel,
  reopenExistingPanel,
  restoreDockedPanel,
} from "../hooks/use-panel-state";

const basePanel: PanelState = {
  id: "general",
  channelId: "general",
  channelName: "general",
  serverId: "server-1",
  serverName: "Main",
  x: 0,
  y: 0,
  width: 1200,
  height: 800,
  isMinimized: false,
  isClosed: false,
  isMaximized: true,
  restoreX: 96,
  restoreY: 88,
  restoreWidth: 420,
  restoreHeight: 520,
  zIndex: 4,
};

describe("panel state regression guards", () => {
  it("hydrates a persisted maximized panel back into a windowed panel", () => {
    const hydrated = hydrateSavedPanel(basePanel);

    expect(hydrated).not.toBeNull();
    expect(hydrated?.isMaximized).toBe(false);
    expect(hydrated?.x).toBe(96);
    expect(hydrated?.y).toBe(88);
    expect(hydrated?.width).toBe(420);
    expect(hydrated?.height).toBe(520);
  });

  it("reopens an existing maximized panel as a windowed panel", () => {
    const reopened = reopenExistingPanel(
      basePanel,
      {
        channelId: "general",
        channelName: "general",
        serverId: "server-1",
        serverName: "Main",
      },
      7,
    );

    expect(reopened.isClosed).toBe(false);
    expect(reopened.isMinimized).toBe(false);
    expect(reopened.isMaximized).toBe(false);
    expect(reopened.x).toBe(96);
    expect(reopened.y).toBe(88);
    expect(reopened.width).toBe(420);
    expect(reopened.height).toBe(520);
    expect(reopened.zIndex).toBe(8);
  });

  it("restores a minimized maximized panel as a windowed panel", () => {
    const restored = restoreDockedPanel(
      {
        ...basePanel,
        isMinimized: true,
      },
      7,
    );

    expect(restored.isClosed).toBe(false);
    expect(restored.isMinimized).toBe(false);
    expect(restored.isMaximized).toBe(false);
    expect(restored.x).toBe(96);
    expect(restored.y).toBe(88);
    expect(restored.width).toBe(420);
    expect(restored.height).toBe(520);
    expect(restored.zIndex).toBe(8);
  });
});
