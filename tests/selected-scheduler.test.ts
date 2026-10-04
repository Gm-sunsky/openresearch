import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectScheduler } from "../electron/main/scheduler";
import type { ResearchDatabase } from "../electron/main/database";
import type { FeedService } from "../electron/main/feed-service";
import type { SourceDiscoveryAgent } from "../electron/main/source-discovery";
import type { ApiSettingsService } from "../electron/main/api-settings";
import type { Project } from "../src/shared/contracts";

function fixture() {
  const projects = [
    { id: "a", status: "active", updateSelected: true },
    { id: "b", status: "active", updateSelected: false },
    { id: "c", status: "paused", updateSelected: true },
    { id: "legacy", status: "active" },
  ] as Project[];
  const database = {
    listProjects: vi.fn(() => projects),
    getProject: vi.fn((id: string) => projects.find((p) => p.id === id) ?? null),
    listSources: vi.fn(() => [{ status: "active", lastCheckedAt: null }]),
    listTaskRuns: vi.fn(() => []),
  };
  const runProject = vi.fn<(id: string) => Promise<void>>(async () => undefined);
  const scheduler = new ProjectScheduler(database as unknown as ResearchDatabase, { runProject } as unknown as FeedService);
  return { projects, database, runProject, scheduler };
}

afterEach(() => { vi.useRealTimers(); });

describe("selected project scheduling", () => {
  it("updates only explicitly selected active projects", async () => {
    const { runProject, scheduler } = fixture();
    await scheduler.checkDueProjects();
    expect(runProject.mock.calls).toEqual([["a"]]);
  });
  it("does not launch a second tick during an existing update", async () => {
    const { runProject, scheduler } = fixture();
    let finish!: () => void;
    runProject.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    const first = scheduler.checkDueProjects();
    await scheduler.checkDueProjects();
    expect(runProject).toHaveBeenCalledTimes(1);
    finish();
    await first;
  });
  it("cancels the startup callback when stopped and avoids duplicate timers", async () => {
    vi.useFakeTimers();
    const { runProject, scheduler } = fixture();
    scheduler.start();
    scheduler.start();
    expect(vi.getTimerCount()).toBe(2);
    scheduler.stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(runProject).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("rechecks selection after source discovery completes", async () => {
    const { projects, database, runProject } = fixture();
    database.listSources.mockReturnValue([]);
    const discovery = { run: vi.fn(async () => {
      projects[0].updateSelected = false;
      database.listSources.mockReturnValue([{ status: "active", lastCheckedAt: null }]);
    }) };
    const scheduler = new ProjectScheduler(database as unknown as ResearchDatabase, { runProject } as unknown as FeedService,
      discovery as unknown as SourceDiscoveryAgent, { get: () => ({ autoDiscoverSources: true }) } as ApiSettingsService);
    await scheduler.checkDueProjects();
    expect(discovery.run).toHaveBeenCalledExactlyOnceWith("a");
    expect(runProject).not.toHaveBeenCalled();
  });
});

