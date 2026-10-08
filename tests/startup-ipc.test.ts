import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ handlers: new Map<string, (_event: unknown, value?: unknown) => unknown>() }));
vi.mock("electron", () => ({ ipcMain: { handle: (name: string, handler: (_event: unknown, value?: unknown) => unknown) => mock.handlers.set(name, handler) }, shell: {} }));
import { registerIpcHandlers } from "../electron/main/ipc";
import { IPC_CHANNELS } from "../src/shared/contracts";
import type { ResearchDatabase } from "../electron/main/database";
import type { FeedService } from "../electron/main/feed-service";
import type { ApiSettingsService } from "../electron/main/api-settings";
import type { AiApiClient } from "../electron/main/ai-client";
import type { SourceDiscoveryAgent } from "../electron/main/source-discovery";
import type { StartupService } from "../electron/main/startup";
const state = { enabled: true, supported: true, requiresApproval: false };
const startup = { get: vi.fn(() => state), set: vi.fn(() => state) };
beforeEach(() => {
  vi.clearAllMocks();
  registerIpcHandlers({} as ResearchDatabase, {} as FeedService, {} as ApiSettingsService, {} as AiApiClient, {} as SourceDiscoveryAgent, startup as unknown as StartupService);
});
it("routes the whitelisted startup read and boolean write to the system service", () => {
  expect(mock.handlers.get(IPC_CHANNELS.startupGet)!(null)).toEqual(state);
  expect(mock.handlers.get(IPC_CHANNELS.startupSet)!(null, true)).toEqual(state);
  expect(startup.set).toHaveBeenCalledExactlyOnceWith(true);
});
it("rejects renderer-provided paths and nonboolean values", () => {
  for (const value of ["true", 1, null, { enabled: true, path: "arbitrary.exe" }]) expect(() => mock.handlers.get(IPC_CHANNELS.startupSet)!(null, value)).toThrow();
  expect(startup.set).not.toHaveBeenCalled();
});
