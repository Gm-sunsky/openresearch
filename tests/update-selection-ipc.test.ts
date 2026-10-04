import { describe, expect, it, vi } from "vitest";
const handlers = vi.hoisted(() => new Map<string, (_event: unknown, value: unknown) => unknown>());
vi.mock("electron", () => ({ ipcMain: { handle: (name: string, handler: (_event: unknown, value: unknown) => unknown) => handlers.set(name, handler) }, shell: {} }));
import { registerIpcHandlers } from "../electron/main/ipc";
import { IPC_CHANNELS } from "../src/shared/contracts";
import type { ResearchDatabase } from "../electron/main/database";
import type { FeedService } from "../electron/main/feed-service";
import type { ApiSettingsService } from "../electron/main/api-settings";
import type { AiApiClient } from "../electron/main/ai-client";
import type { SourceDiscoveryAgent } from "../electron/main/source-discovery";

describe("update selection IPC boundary", () => {
  it("rejects unchecked or deleted projects and passes exactly the checked ID", () => {
    const getProject = vi.fn((id: string) => id === "missing" ? null : { id, updateSelected: id === "selected" });
    const runProject = vi.fn();
    registerIpcHandlers({ getProject } as unknown as ResearchDatabase, { runProject } as unknown as FeedService,
      {} as ApiSettingsService, {} as AiApiClient, {} as SourceDiscoveryAgent);
    const run = handlers.get(IPC_CHANNELS.updatesRun)!;
    expect(() => run(null, "unchecked")).toThrow(/勾选/);
    expect(() => run(null, "missing")).toThrow(/不存在/);
    expect(runProject).not.toHaveBeenCalled();
    run(null, "selected");
    expect(runProject).toHaveBeenCalledExactlyOnceWith("selected");
  });
});
