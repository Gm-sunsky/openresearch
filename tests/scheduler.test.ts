import { describe, expect, it } from "vitest";
import { isDiscoveryDue, isSourceDue } from "../electron/main/scheduler";
import type { Project, Source, TaskRun } from "../src/shared/contracts";

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
