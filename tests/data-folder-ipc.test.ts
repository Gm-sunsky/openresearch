import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ handlers: new Map<string, (_event: unknown) => unknown>(), openPath: vi.fn() }));
vi.mock("electron", () => ({ ipcMain: { handle: (name: string, handler: (_event: unknown) => unknown) => mock.handlers.set(name, handler) }, shell: { openPath: mock.openPath } }));
import { registerIpcHandlers } from "../electron/main/ipc";
import { IPC_CHANNELS } from "../src/shared/contracts";
import type { ResearchDatabase } from "../electron/main/database";
import type { FeedService } from "../electron/main/feed-service";
import type { ApiSettingsService } from "../electron/main/api-settings";
import type { AiApiClient } from "../electron/main/ai-client";
import type { SourceDiscoveryAgent } from "../electron/main/source-discovery";
beforeEach(() => {
  mock.openPath.mockReset();
  registerIpcHandlers({ getDataDirectory: () => "D:/research-profile" } as ResearchDatabase, {} as FeedService,
    {} as ApiSettingsService, {} as AiApiClient, {} as SourceDiscoveryAgent);
});
describe("data folder IPC", () => {
  it("opens only the directory supplied by the database", async () => {
    mock.openPath.mockResolvedValue("");
    await expect(mock.handlers.get(IPC_CHANNELS.maintenanceOpenData)!(null)).resolves.toBeUndefined();
    expect(mock.openPath).toHaveBeenCalledExactlyOnceWith("D:/research-profile");
  });
  it("propagates OS errors to the renderer", async () => {
    mock.openPath.mockResolvedValue("Access denied");
    await expect(mock.handlers.get(IPC_CHANNELS.maintenanceOpenData)!(null)).rejects.toThrow(/Access denied/);
  });
});
