import { useState, useEffect, useCallback } from "react";

export interface PanelState {
  id: string;
  channelId: string;
  channelName: string;
  serverId: string;
  serverName: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isMinimized: boolean;
  isClosed: boolean;
  isMaximized: boolean;
  restoreX: number | null;
  restoreY: number | null;
  restoreWidth: number | null;
  restoreHeight: number | null;
  zIndex: number;
}

type PanelOpenData = Omit<
  PanelState,
  | "id"
  | "x"
  | "y"
  | "width"
  | "height"
  | "isMinimized"
  | "isClosed"
  | "isMaximized"
  | "restoreX"
  | "restoreY"
  | "restoreWidth"
  | "restoreHeight"
  | "zIndex"
>;

const LAYOUT_LEFT_PANEL_WIDTH = 240;
const LAYOUT_RIGHT_PANEL_WIDTH = 280;
const LAYOUT_TOP_BAR_HEIGHT = 56;
const LAYOUT_BOTTOM_BAR_HEIGHT = 44;
const LAYOUT_SHELL_HORIZONTAL_PADDING = 24;
const LAYOUT_SHELL_VERTICAL_PADDING = 24;
const LAYOUT_COLUMN_GAP = 24;
const LAYOUT_ROW_GAP = 24;
const DEFAULT_PANEL_X = 120;
const DEFAULT_PANEL_Y = 120;
const DEFAULT_PANEL_WIDTH = 400;
const DEFAULT_PANEL_HEIGHT = 500;
const MIN_PANEL_WIDTH = 300;
const MIN_PANEL_HEIGHT = 200;

function coerceFiniteNumber(
  value: unknown,
  fallback: number,
  minimum = Number.NEGATIVE_INFINITY,
): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(minimum, numeric);
}

function getWorkspaceDimensions() {
  if (typeof window === "undefined") {
    return { width: 1200, height: 800 };
  }

  const workspace = document.getElementById("workspace-root");
  if (workspace) {
    const rect = workspace.getBoundingClientRect();
    return {
      width: Math.max(MIN_PANEL_WIDTH, Math.floor(rect.width)),
      height: Math.max(MIN_PANEL_HEIGHT, Math.floor(rect.height)),
    };
  }

  return {
    width: Math.max(
      MIN_PANEL_WIDTH,
      window.innerWidth -
        LAYOUT_LEFT_PANEL_WIDTH -
        LAYOUT_RIGHT_PANEL_WIDTH -
        LAYOUT_SHELL_HORIZONTAL_PADDING -
        LAYOUT_COLUMN_GAP,
    ),
    height: Math.max(
      MIN_PANEL_HEIGHT,
      window.innerHeight -
        LAYOUT_TOP_BAR_HEIGHT -
        LAYOUT_BOTTOM_BAR_HEIGHT -
        LAYOUT_SHELL_VERTICAL_PADDING -
        LAYOUT_ROW_GAP,
    ),
  };
}

function normalizePanelGeometry(panel: PanelState): PanelState {
  const workspace = getWorkspaceDimensions();
  const width = Math.max(
    MIN_PANEL_WIDTH,
    Math.min(panel.width, workspace.width),
  );
  const height = Math.max(
    MIN_PANEL_HEIGHT,
    Math.min(panel.height, workspace.height),
  );
  const x = Math.max(0, Math.min(panel.x, workspace.width - width));
  const y = Math.max(0, Math.min(panel.y, workspace.height - height));

  return {
    ...panel,
    width,
    height,
    x,
    y,
  };
}

function restoreWindowedGeometry(panel: PanelState): PanelState {
  if (!panel.isMaximized) return panel;

  return {
    ...panel,
    isMaximized: false,
    x: coerceFiniteNumber(panel.restoreX, DEFAULT_PANEL_X, 0),
    y: coerceFiniteNumber(panel.restoreY, DEFAULT_PANEL_Y, 0),
    width: coerceFiniteNumber(
      panel.restoreWidth,
      DEFAULT_PANEL_WIDTH,
      MIN_PANEL_WIDTH,
    ),
    height: coerceFiniteNumber(
      panel.restoreHeight,
      DEFAULT_PANEL_HEIGHT,
      MIN_PANEL_HEIGHT,
    ),
    restoreX: null,
    restoreY: null,
    restoreWidth: null,
    restoreHeight: null,
  };
}

export function hydrateSavedPanel(raw: unknown): PanelState | null {
  if (!raw || typeof raw !== "object") return null;
  if (!("channelId" in raw) || !("serverId" in raw)) return null;

  const r = raw as PanelState;
  const normalized: PanelState = {
    id: String(r.id || r.channelId),
    channelId: String(r.channelId),
    channelName: String(r.channelName || "unknown"),
    serverId: String(r.serverId),
    serverName: String(r.serverName || "unknown"),
    x: coerceFiniteNumber(r.x, DEFAULT_PANEL_X, 0),
    y: coerceFiniteNumber(r.y, DEFAULT_PANEL_Y, 0),
    width: coerceFiniteNumber(r.width, DEFAULT_PANEL_WIDTH, MIN_PANEL_WIDTH),
    height: coerceFiniteNumber(r.height, DEFAULT_PANEL_HEIGHT, MIN_PANEL_HEIGHT),
    isMinimized: Boolean(r.isMinimized),
    isClosed: Boolean(r.isClosed),
    isMaximized: Boolean(r.isMaximized),
    restoreX:
      r.restoreX == null
        ? null
        : coerceFiniteNumber(r.restoreX, DEFAULT_PANEL_X, 0),
    restoreY:
      r.restoreY == null
        ? null
        : coerceFiniteNumber(r.restoreY, DEFAULT_PANEL_Y, 0),
    restoreWidth:
      r.restoreWidth == null
        ? null
        : coerceFiniteNumber(r.restoreWidth, DEFAULT_PANEL_WIDTH, MIN_PANEL_WIDTH),
    restoreHeight:
      r.restoreHeight == null
        ? null
        : coerceFiniteNumber(
            r.restoreHeight,
            DEFAULT_PANEL_HEIGHT,
            MIN_PANEL_HEIGHT,
          ),
    zIndex: coerceFiniteNumber(r.zIndex, 1, 1),
  };

  return normalizePanelGeometry(restoreWindowedGeometry(normalized));
}

export function reopenExistingPanel(
  existing: PanelState,
  panelData: PanelOpenData,
  maxZ: number,
): PanelState {
  return normalizePanelGeometry(
    restoreWindowedGeometry({
      ...existing,
      channelName: panelData.channelName,
      serverId: panelData.serverId,
      serverName: panelData.serverName,
      isClosed: false,
      isMinimized: false,
      zIndex: maxZ + 1,
    }),
  );
}

export function restoreDockedPanel(
  panel: PanelState,
  maxZ: number,
): PanelState {
  return normalizePanelGeometry(
    restoreWindowedGeometry({
      ...panel,
      isClosed: false,
      isMinimized: false,
      zIndex: maxZ + 1,
    }),
  );
}

export function usePanelState() {
  const [panels, setPanels] = useState<PanelState[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [activeStreams, setActiveStreams] = useState<Set<string>>(new Set());

  useEffect(() => {
    const activeChannelIds = new Set(
      panels.filter((p) => !p.isClosed).map((p) => p.channelId),
    );
    setActiveStreams((prev) => {
      let changed = false;
      const next = new Set<string>();
      prev.forEach((channelId) => {
        if (activeChannelIds.has(channelId)) {
          next.add(channelId);
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [panels]);

  const setStreamState = useCallback((channelId: string, isActive: boolean) => {
    setActiveStreams((prev) => {
      const next = new Set(prev);
      if (isActive) next.add(channelId);
      else next.delete(channelId);
      return next;
    });
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("tavok-panels");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const deduped = new Map<string, PanelState>();
          for (const raw of parsed) {
            const hydrated = hydrateSavedPanel(raw);
            if (!hydrated) continue;
            deduped.set(hydrated.channelId, hydrated);
          }
          setPanels(Array.from(deduped.values()));
        }
      }
    } catch (e) {
      console.error("Failed to parse saved panels", e);
      return;
    }
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem("tavok-panels", JSON.stringify(panels));
    }
  }, [panels, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    const frame = window.requestAnimationFrame(() => {
      setPanels((prev) => prev.map((panel) => normalizePanelGeometry(panel)));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isLoaded]);

  useEffect(() => {
    const handleResize = () => {
      setPanels((prev) => prev.map((panel) => normalizePanelGeometry(panel)));
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const openPanel = useCallback((panelData: PanelOpenData) => {
    setPanels((prev) => {
      const existing = prev.find((p) => p.channelId === panelData.channelId);
      if (existing) {
        const maxZ = Math.max(...prev.map((p) => p.zIndex), 0);
        return prev.map((p) =>
          p.channelId === panelData.channelId
            ? reopenExistingPanel(p, panelData, maxZ)
            : p,
        );
      }

      const openCount = prev.filter((p) => !p.isClosed).length;
      const column = openCount % 4;
      const row = Math.floor(openCount / 4) % 4;
      const newPanel: PanelState = {
        id: panelData.channelId,
        ...panelData,
        x: 48 + column * 32,
        y: 48 + row * 28,
        width: DEFAULT_PANEL_WIDTH,
        height: DEFAULT_PANEL_HEIGHT,
        isMinimized: false,
        isClosed: false,
        isMaximized: false,
        restoreX: null,
        restoreY: null,
        restoreWidth: null,
        restoreHeight: null,
        zIndex: Math.max(...prev.map((p) => p.zIndex), 0) + 1,
      };
      return [...prev, normalizePanelGeometry(newPanel)];
    });
  }, []);

  const closePanel = useCallback((id: string) => {
    setPanels((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              isClosed: true,
              isMinimized: false,
              isMaximized: false,
            }
          : p,
      ),
    );
  }, []);

  const minimizePanel = useCallback((id: string) => {
    setPanels((prev) =>
      prev.map((p) => (p.id === id ? { ...p, isMinimized: true } : p)),
    );
  }, []);

  const restorePanel = useCallback((id: string) => {
    setPanels((prev) => {
      const maxZ = Math.max(...prev.map((p) => p.zIndex), 0);
      return prev.map((p) => (p.id === id ? restoreDockedPanel(p, maxZ) : p));
    });
  }, []);

  const focusPanel = useCallback((id: string) => {
    setPanels((prev) => {
      const maxZ = Math.max(...prev.map((p) => p.zIndex), 0);
      const target = prev.find((p) => p.id === id);
      if (target && target.zIndex === maxZ) return prev;
      return prev.map((p) => (p.id === id ? { ...p, zIndex: maxZ + 1 } : p));
    });
  }, []);

  const updatePanelPosition = useCallback(
    (id: string, x: number, y: number) => {
      setPanels((prev) =>
        prev.map((p) =>
          p.id === id ? normalizePanelGeometry({ ...p, x, y }) : p,
        ),
      );
    },
    [],
  );

  const updatePanelSize = useCallback(
    (id: string, width: number, height: number) => {
      setPanels((prev) =>
        prev.map((p) =>
          p.id === id ? normalizePanelGeometry({ ...p, width, height }) : p,
        ),
      );
    },
    [],
  );

  const toggleMaximizePanel = useCallback(
    (id: string, workspaceWidth: number, workspaceHeight: number) => {
      setPanels((prev) =>
        prev.map((p) => {
          if (p.id !== id) return p;
          if (p.isMaximized) {
            return normalizePanelGeometry({
              ...p,
              isMaximized: false,
              x: p.restoreX ?? p.x,
              y: p.restoreY ?? p.y,
              width: p.restoreWidth ?? p.width,
              height: p.restoreHeight ?? p.height,
              restoreX: null,
              restoreY: null,
              restoreWidth: null,
              restoreHeight: null,
            });
          }
          return {
            ...p,
            isMaximized: true,
            restoreX: p.x,
            restoreY: p.y,
            restoreWidth: p.width,
            restoreHeight: p.height,
            x: 0,
            y: 0,
            width: Math.max(MIN_PANEL_WIDTH, workspaceWidth),
            height: Math.max(MIN_PANEL_HEIGHT, workspaceHeight),
          };
        }),
      );
    },
    [],
  );

  const removePanelsForServer = useCallback((serverId: string) => {
    setPanels((prev) => prev.filter((p) => p.serverId !== serverId));
  }, []);

  return {
    panels,
    openPanel,
    closePanel,
    minimizePanel,
    restorePanel,
    focusPanel,
    updatePanelPosition,
    updatePanelSize,
    toggleMaximizePanel,
    removePanelsForServer,
    isLoaded,
    activeStreams,
    setStreamState,
  };
}
