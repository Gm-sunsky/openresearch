import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { ResearchDatabase } from "../electron/main/database";
import { FeedService } from "../electron/main/feed-service";
import { ProjectScheduler } from "../electron/main/scheduler";
const directories: string[] = [];
afterEach(() => { vi.useRealTimers(); for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });

it.each(["hourly", "daily", "weekly"] as const)("automatically persists %s updates through the real feed service and database", async frequency => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "openresearch-schedule-")); directories.push(directory);
  const db = await ResearchDatabase.open(path.join(directory, "test.sqlite"), path.resolve("node_modules/sql.js/dist/sql-wasm.wasm"));
  vi.useFakeTimers(); vi.setSystemTime("2026-10-08T00:00:00Z");
  const project = db.createProject({ name: "展会", description: "官方展会公告", goal: "展会开放时间", focus: ["开放时间"], updateFrequency: frequency });
  db.createSource({ projectId: project.id, type: "rss", name: "官方展会", url: "https://example.com/feed", checkFrequency: frequency === "hourly" ? "weekly" : "hourly" });
  db.selectUpdateProjects([project.id]);
  const fetcher = vi.fn(async () => new Response('<rss><channel><item><title>展会开放时间</title><link>https://example.com/open</link><description>官方公告：展会10月9日上午9点开放。</description></item></channel></rss>'));
  const changed = vi.fn(); const scheduler = new ProjectScheduler(db, new FeedService(db, fetcher), undefined, undefined, changed);
  try {
    scheduler.start(); await vi.advanceTimersByTimeAsync(5000);
    const first = db.getLatestTaskRun(project.id, "update")!;
    expect(first.status).toBe("completed"); expect(db.listCards(project.id).some(card => card.updateBatchId === first.id)).toBe(true);
    expect(changed).toHaveBeenCalledOnce();
    const interval = { hourly: 3600000, daily: 86400000, weekly: 604800000 }[frequency];
    vi.setSystemTime(Date.parse(first.startedAt) + interval - 60001); await vi.advanceTimersByTimeAsync(60000);
    expect(db.getLatestTaskRun(project.id, "update")!.id).toBe(first.id);
    vi.setSystemTime(Date.parse(first.startedAt) + interval); await vi.advanceTimersByTimeAsync(60000);
    expect(db.getLatestTaskRun(project.id, "update")!.id).not.toBe(first.id);
    expect(changed).toHaveBeenCalledTimes(2); expect(fetcher).toHaveBeenCalledTimes(2);
    db.selectUpdateProjects([]); vi.setSystemTime(Date.now() + interval); await vi.advanceTimersByTimeAsync(60000);
    expect(fetcher).toHaveBeenCalledTimes(2);
  } finally { scheduler.stop(); db.close(); }
});

it("finds the latest update even beyond the displayed history limit", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "openresearch-history-")); directories.push(directory);
  const db = await ResearchDatabase.open(path.join(directory, "test.sqlite"), path.resolve("node_modules/sql.js/dist/sql-wasm.wasm"));
  try {
    vi.useFakeTimers(); vi.setSystemTime("2026-10-08T00:00:00Z");
    const project = db.createProject({ name: "History", description: "History", goal: "History", focus: ["History"], updateFrequency: "daily" });
    const update = db.startTaskRun(project.id, "update"); db.finishTaskRun(update, {});
    for (let i = 0; i < 101; i++) { vi.setSystemTime(Date.now() + 1000); const id = db.startTaskRun(project.id, "discovery"); db.finishTaskRun(id, {}); }
    expect(db.listTaskRuns(project.id, 100).some(run => run.kind === "update")).toBe(false);
    expect(db.getLatestTaskRun(project.id, "update")?.id).toBe(update);
  } finally { db.close(); }
});
