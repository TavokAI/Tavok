import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock phoenix Socket
const mockConnect = vi.fn();
const mockDisconnect = vi.fn();
const mockIsConnected = vi.fn();
const mockOnOpen = vi.fn();
const mockOnError = vi.fn();

vi.mock("phoenix", () => ({
  Socket: vi.fn().mockImplementation(() => ({
    connect: mockConnect,
    disconnect: mockDisconnect,
    isConnected: mockIsConnected,
    onOpen: mockOnOpen,
    onError: mockOnError,
  })),
}));

// Mock fetch for token endpoint
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("socket", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockIsConnected.mockReturnValue(false);
  });

  it("getSocket returns null in non-browser environment", async () => {
    // window is undefined in Node — getSocket should return null
    const originalWindow = globalThis.window;
    // @ts-expect-error: deliberately removing window for test
    delete globalThis.window;

    const { getSocket } = await import("../socket");
    const result = await getSocket();

    expect(result).toBeNull();

    // Restore
    globalThis.window = originalWindow;
  });

  it("getSocket returns null when token fetch fails", async () => {
    // Simulate browser environment
    const originalWindow = globalThis.window;
    globalThis.window = {} as Window & typeof globalThis;

    mockFetch.mockResolvedValue({ ok: false });

    const { getSocket } = await import("../socket");
    const result = await getSocket();

    expect(result).toBeNull();

    globalThis.window = originalWindow;
  });

  it("disconnectSocket cleans up", async () => {
    const { disconnectSocket } = await import("../socket");
    // Should not throw even when no socket exists
    disconnectSocket();
  });
});
