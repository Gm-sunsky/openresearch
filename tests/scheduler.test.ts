import { afterEach, describe, expect, it, vi } from "vitest";
import { isDiscoveryDue, isProjectUpdateDue, isSourceDue, ProjectScheduler } from "../electron/main/scheduler";
import type { Project, Source, TaskRun } from "../src/shared/contracts";
import type { ResearchDatabase } from "../electron/main/database";
import type { FeedService } from "../electron/main/feed-service";
import type { SourceDiscoveryAgent } from "../electron/main/source-discovery";
import type { ApiSettingsService } from "../electron/main/api-settings";

const base: Source = {
  id: "source", projectId: "project", type: "rss", name: "Feed", url: "https://example.com/feed.xml",
  checkFrequency: "daily", lastCheckedAt: null, lastContentHash: null, status: "active", lastError: null,
  lastContentExcerpt: null,
  createdAt: "2026-08-01T00:00:00.000Z",
};

describe("isSourceDue", () => {
  it("marks a never-checked source as due", () => {
    expect(isSourceDue(base)).toBe(true);
  });

  it("respects the configured interval", () => {
    const now = new Date("2026-08-08T12:00:00.000Z").getTime();
    expect(isSourceDue({ ...base, lastCheckedAt: "2026-08-08T11:30:00.000Z", checkFrequency: "hourly" }, now)).toBe(false);
    expect(isSourceDue({ ...base, lastCheckedAt: "2026-08-08T10:30:00.000Z", checkFrequency: "hourly" }, now)).toBe(true);
  });

  it("never schedules paused sources", () => {
    expect(isSourceDue({ ...base, status: "paused" })).toBe(false);
  });

  it("retries source discovery according to the project frequency", () => {
    const project = { id: "project", updateFrequency: "daily" } as Project;
    const run = {
      id: "run", projectId: "project", kind: "discovery", status: "failed", startedAt: "2026-08-08T10:00:00.000Z",
      finishedAt: "2026-08-08T10:00:01.000Z", checkedSources: 0, newCards: 0, errors: ["offline"], warnings: [], summary: null,
    } as TaskRun;
    const noon = new Date("2026-08-08T12:00:00.000Z").getTime();
    const nextDay = new Date("2026-08-09T12:00:00.000Z").getTime();
    expect(isDiscoveryDue(project, [run], noon)).toBe(false);
    expect(isDiscoveryDue(project, [run], nextDay)).toBe(true);
  });
});

const clock = Date.parse("2026-10-08T12:00:00Z");
const project = { id: "project", status: "active", updateSelected: true, updateFrequency: "hourly" } as Project;
const task = (age: number, kind: TaskRun["kind"] = "update", status: TaskRun["status"] = "success") => ({
  id: String(age), projectId: "project", kind, status, startedAt: new Date(clock - age).toISOString(),
} as TaskRun);

function fixture(runs: TaskRun[] = [], sources: Source[] = [base]) {
  let current = { ...project };
  const database = {
    listProjects: vi.fn(() => [current]),
    getProject: vi.fn(() => current),
    listSources: vi.fn(() => sources),
    listTaskRuns: vi.fn(() => runs),
  };
  const feeds = { runProject: vi.fn(async () => { runs.push(task(0)); }) };
  const discovery = { run: vi.fn(async () => { runs.push(task(0, "discovery")); }) };
  const changed = vi.fn();
  const scheduler = new ProjectScheduler(
    database as unknown as ResearchDatabase, feeds as unknown as FeedService,
    discovery as unknown as SourceDiscoveryAgent,
    { get: () => ({ autoDiscoverSources: true }) } as unknown as ApiSettingsService, changed,
  );
  return { database, feeds, discovery, changed, scheduler, runs, setProject: (next: Partial<Project>) => { current = { ...current, ...next }; } };
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("project automatic updates", () => {
  it.each(["hourly", "daily", "weekly"] as const)("uses the %s project interval including failed attempts", (frequency) => {
    const interval = ({ hourly: 1, daily: 24, weekly: 168 }[frequency]) * 3_600_000;
    expect(isProjectUpdateDue({ ...project, updateFrequency: frequency }, [task(interval - 1, "update", "failed")], clock)).toBe(false);
    expect(isProjectUpdateDue({ ...project, updateFrequency: frequency }, [task(interval, "update", "failed")], clock)).toBe(true);
  });

  it("finds the newest update regardless of history ordering and discovery activity", () => {
    expect(isProjectUpdateDue(project, [task(7_200_000), task(0, "discovery"), task(100)], clock)).toBe(false);
    expect(isProjectUpdateDue(project, [task(0, "discovery")], clock)).toBe(true);
  });

  it("ignores source intervals and attempts, using the project update history", async () => {
    vi.useFakeTimers(); vi.setSystemTime(clock);
    const f = fixture([], [{ ...base, checkFrequency: "weekly", lastCheckedAt: new Date(clock).toISOString() }]);
    await f.scheduler.checkDueProjects();
    expect(f.feeds.runProject).toHaveBeenCalledWith("project");
    await f.scheduler.checkDueProjects();
    expect(f.feeds.runProject).toHaveBeenCalledTimes(1);
  });

  it("uses exact latest-task lookup when discovery history exceeds the history list limit", async () => {
    vi.useFakeTimers(); vi.setSystemTime(clock);
    const latestUpdate = task(100);
    const f = fixture(Array.from({ length: 120 }, () => task(0, "discovery")));
    Object.assign(f.database, { getLatestTaskRun: vi.fn((_id: string, kind: TaskRun["kind"]) => kind === "update" ? latestUpdate : task(0, "discovery")) });
    await f.scheduler.checkDueProjects();
    expect(f.feeds.runProject).not.toHaveBeenCalled();
    expect(f.database.listTaskRuns).not.toHaveBeenCalled();
  });

  it("catches up at startup and checks due time within one minute", async () => {
    vi.useFakeTimers(); vi.setSystemTime(clock);
    const f = fixture([task(3_550_000)]);
    f.scheduler.start();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(f.feeds.runProject).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(55_000);
    expect(f.feeds.runProject).toHaveBeenCalledTimes(1);
    f.scheduler.stop();
    await vi.advanceTimersByTimeAsync(7_200_000);
    expect(f.feeds.runProject).toHaveBeenCalledTimes(1);
    const overdue = fixture([task(10_000_000)]);
    overdue.scheduler.start();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(overdue.feeds.runProject).toHaveBeenCalledTimes(1);
    overdue.scheduler.stop();
  });

  it.each([{ status: "paused" }, { updateSelected: false }])("respects project scope %j", async (scope) => {
    const f = fixture(); f.setProject(scope as Partial<Project>);
    await f.scheduler.checkDueProjects();
    expect(f.feeds.runProject).not.toHaveBeenCalled();
  });

  it("updates sourceless projects and reports discovery failure without blocking the update", async () => {
    vi.useFakeTimers(); vi.setSystemTime(clock);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const f = fixture([], []);
    f.discovery.run.mockRejectedValue(new Error("offline"));
    await f.scheduler.checkDueProjects();
    expect(f.feeds.runProject).toHaveBeenCalledTimes(1);
    expect(f.changed).toHaveBeenCalledTimes(2);
  });

  it.each(["selection", "manual update", "stop"])("rechecks %s after asynchronous discovery", async (change) => {
    const f = fixture([], []);
    f.discovery.run.mockImplementation(async () => {
      if (change === "selection") f.setProject({ updateSelected: false });
      else if (change === "stop") f.scheduler.stop();
      else f.runs.push(task(0));
    });
    vi.useFakeTimers(); vi.setSystemTime(clock);
    await f.scheduler.checkDueProjects();
    expect(f.feeds.runProject).not.toHaveBeenCalled();
    expect(f.changed).toHaveBeenCalledTimes(1);
  });

  it("blocks overlapping timer checks and recovers after errors, even if notification fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const f = fixture();
    let finish!: () => void;
    f.feeds.runProject.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const running = f.scheduler.checkDueProjects();
    await f.scheduler.checkDueProjects();
    expect(f.feeds.runProject).toHaveBeenCalledTimes(1);
    finish(); await running;
    f.feeds.runProject.mockRejectedValue(new Error("already checking"));
    f.changed.mockImplementation(() => { throw new Error("renderer closed"); });
    await f.scheduler.checkDueProjects();
    await f.scheduler.checkDueProjects();
    expect(f.feeds.runProject).toHaveBeenCalledTimes(3);
    expect(f.changed).toHaveBeenCalledTimes(3);
  });
});
