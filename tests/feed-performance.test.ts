import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AiApiClient, InformationItemInput } from "../electron/main/ai-client";
import { mapConcurrent } from "../electron/main/concurrency";
import { ResearchDatabase } from "../electron/main/database";
import { FeedService } from "../electron/main/feed-service";

const directories: string[] = [];
afterEach(() => {
  vi.useRealTimers();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});
async function openDatabase() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "research-feed-performance-"));
  directories.push(directory);
  return ResearchDatabase.open(path.join(directory, "db.sqlite"), path.resolve("node_modules/sql.js/dist/sql-wasm.wasm"));
}

describe("bounded collection", () => {
  it("preserves result order, limits active work, and drains active work before reporting failures", async () => {
    vi.useFakeTimers();
    let active = 0;
    let maximum = 0;
    const result = mapConcurrent([50, 10, 40, 5, 20], 2, async (delay, index) => {
      maximum = Math.max(maximum, ++active);
      await new Promise((resolve) => setTimeout(resolve, delay));
      active--;
      return index;
    });
    await vi.runAllTimersAsync();
    expect(await result).toEqual([0, 1, 2, 3, 4]);
    expect(maximum).toBe(2);
    const failure = new Error("broken source");
    let drained = false;
    const rejected = mapConcurrent([0, 1, 2], 2, async (value) => {
      await new Promise((resolve) => setTimeout(resolve, value === 0 ? 5 : 20));
      if (value === 0) throw failure;
      drained = true;
      return value;
    }).catch((error) => error);
    await vi.runAllTimersAsync();
    expect(await rejected).toBe(failure);
    expect(drained).toBe(true);
    await expect(mapConcurrent([], 0, async () => 0)).rejects.toThrow(RangeError);
  });

  it("runs the same direct, social, and matrix evidence work substantially faster than serialized I/O", async () => {
    const database = await openDatabase();
    const project = database.createProject({ name: "Conference", description: "Conference", goal: "Track dates", focus: ["Event time"], updateFrequency: "daily" });
    for (let i = 0; i < 8; i++) database.createSource({ projectId: project.id, type: "web", name: `Website ${i}`, url: `https://event${i}.example/` });
    for (let i = 0; i < 17; i++) database.createSource({ projectId: project.id, type: "search", name: `Account ${i}`, url: `https://x.com/event${i}` });
    const snapshots: Array<{ elapsed: number; calls: string[]; evidence: string[]; maxDirect: number; synthesisCalls: number }> = [];
    vi.useFakeTimers();
    for (const serial of [true, false]) {
      let queue = Promise.resolve();
      let activeDirect = 0;
      let maxDirect = 0;
      let synthesisCalls = 0;
      const calls: string[] = [];
      let evidence: string[] = [];
      const delay = async (label: string, direct = false) => {
        const execute = async () => {
          calls.push(label);
          if (direct) maxDirect = Math.max(maxDirect, ++activeDirect);
          await new Promise((resolve) => setTimeout(resolve, 60));
          if (direct) activeDirect--;
        };
        if (serial) { queue = queue.then(execute); await queue; }
        else await execute();
      };
      const ai = {
        canSearchWeb: () => true,
        getPreferences: () => ({ language: "en", maxUpdateBatches: 20 }),
        shouldOrganizeContent: () => true,
        searchLatestFromSources: async (_project: unknown, sources: Array<{ name: string; url: string }>) => {
          await delay(`social:${sources.map((source) => source.name).join(",")}`);
          return sources.map((source, sourceIndex) => ({ index: sourceIndex, sourceIndex, title: "Conference date", content: "The conference starts on October 4.", sourceName: source.name, url: `${source.url}/status/1`, publishedAt: null }));
        },
        searchResearchWorkflow: async () => {
          await delay("matrix");
          return [{ index: 0, title: "Conference schedule", content: "The event time is 10:00 on October 4.", sourceName: "Official", url: "https://official.example/schedule", researchEntity: "Conference", researchTask: "Event time", evidenceTier: "primary", publishedAt: null }];
        },
        synthesizeInformation: async (_project: unknown, items: InformationItemInput[]) => {
          synthesisCalls++;
          expect(items.map((item) => item.index)).toEqual(items.map((_, index) => index));
          evidence = items.map((item) => `${item.url}\n${item.content}`);
          return [];
        },
      } as unknown as AiApiClient;
      const service = new FeedService(database, async (url) => {
        await delay(url, true);
        return new Response("<html><title>Conference date</title><body>The conference starts on October 4.</body></html>");
      }, ai);
      const start = Date.now();
      const task = service.runProject(project.id);
      await vi.runAllTimersAsync();
      const result = await task;
      expect(result.errors).toEqual([]);
      snapshots.push({ elapsed: Date.now() - start, calls, evidence, maxDirect, synthesisCalls });
    }
    expect(snapshots[0].evidence).toHaveLength(26);
    expect(snapshots[1].evidence).toEqual(snapshots[0].evidence);
    expect(snapshots[1].calls.sort()).toEqual(snapshots[0].calls.sort());
    expect(snapshots[1].maxDirect).toBe(4);
    expect(snapshots[1].synthesisCalls).toBe(1);
    expect(snapshots[1].elapsed).toBeLessThanOrEqual(snapshots[0].elapsed / 3);
    console.info(`Equivalent evidence benchmark: serial ${snapshots[0].elapsed} ms, concurrent ${snapshots[1].elapsed} ms; ${snapshots[1].evidence.length} evidence items in each run.`);
    database.close();
  });
});
