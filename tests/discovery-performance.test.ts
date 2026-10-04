import { afterEach, describe, expect, it, vi } from "vitest";
import { SourceDiscoveryAgent } from "../electron/main/source-discovery";
import { buildDiscoveryQueries } from "../electron/main/research-workflow";
import type { ResearchDatabase } from "../electron/main/database";
import type { AiApiClient } from "../electron/main/ai-client";
import type { ApiSettingsService } from "../electron/main/api-settings";
import type { Project, SourceCandidate } from "../src/shared/contracts";

vi.mock("node:dns/promises", () => ({ default: { lookup: async () => [{ address: "93.184.216.34", family: 4 }] } }));
afterEach(() => vi.useRealTimers());

function fixture(failingQuery = -1) {
  const project = { id: "a", name: "Event", description: "关注《Event A》、《Event B》、《Event C》、《Event D》", goal: "Track event time", focus: ["Time"], updateFrequency: "daily" } as Project;
  const expectedQueries = buildDiscoveryQueries(project).slice(0, 12);
  const stored: SourceCandidate[] = [];
  const database = {
    getProject: vi.fn((id: string) => id === "a" ? project : null),
    listSources: vi.fn(() => []),
    startTaskRun: vi.fn(() => "run-a"),
    finishTaskRun: vi.fn(),
    upsertSourceCandidates: vi.fn((_id: string, candidates: SourceCandidate[]) => { stored.push(...candidates); return candidates; }),
  };
  let active = 0, peak = 0, queryCount = 0, probeCount = 0;
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    active += 1;
    peak = Math.max(peak, active);
    const queryIndex = url.includes("bing.com") ? queryCount++ : -1;
    if (init?.method === "HEAD") probeCount++;
    await new Promise((resolve) => setTimeout(resolve, 25));
    active -= 1;
    if (queryIndex === failingQuery && queryIndex >= 0) throw new Error("one search unavailable");
    return queryIndex >= 0
      ? new Response('<rss><channel><item><title>Event time '+queryIndex+'</title><link>https://e.example/item/'+queryIndex+'</link><description>Event A Time is confirmed</description></item></channel></rss>')
      : new Response(null, { status: 200 });
  });
  const agent = new SourceDiscoveryAgent(database as unknown as ResearchDatabase, { isConfigured: () => false } as AiApiClient,
    { get: () => ({ autoAddVerifiedSources: false }) } as ApiSettingsService, fetchImpl as typeof fetch);
  return { agent, database, stored, expectedQueries, stats: () => ({ peak, queryCount, probeCount }), fetchImpl };
}

describe("parallel discovery", () => {
  it("searches the same query set and verifies all results in bounded parallel waves", async () => {
    vi.useFakeTimers();
    const f = fixture();
    const start = Date.now();
    const first = f.agent.run("a");
    const duplicate = f.agent.run("a");
    await vi.runAllTimersAsync();
    const [result, repeated] = await Promise.all([first, duplicate]);
    const elapsed = Date.now() - start;
    const stats = f.stats();
    expect(stats.peak).toBe(4);
    expect(stats.queryCount).toBe(f.expectedQueries.length);
    expect(stats.probeCount).toBe(f.expectedQueries.length);
    expect(result.candidates.map((c) => c.url)).toEqual(f.expectedQueries.map((_, i) => 'https://e.example/item/'+i));
    expect(result.candidates.every((c) => c.verified)).toBe(true);
    expect(repeated).toEqual(result);
    expect(f.database.startTaskRun).toHaveBeenCalledTimes(1);
    expect(f.database.finishTaskRun).toHaveBeenCalledTimes(1);
    const serialEquivalentMs = (stats.queryCount + stats.probeCount) * 25;
    expect(elapsed).toBeLessThanOrEqual(serialEquivalentMs / 3);
    console.info(JSON.stringify({ benchmark: "source-discovery", queryCount: stats.queryCount, probeCount: stats.probeCount, serialEquivalentMs, parallelMs: elapsed, speedup: serialEquivalentMs / elapsed }));
  });
  it("keeps other search results when one query fails and does not touch another project", async () => {
    vi.useFakeTimers();
    const f = fixture(1);
    const task = f.agent.run("a");
    await vi.runAllTimersAsync();
    const result = await task;
    expect(result.candidates).toHaveLength(f.expectedQueries.length - 1);
    expect(result.warnings.some((w) => w.includes("one search unavailable"))).toBe(true);
    expect(f.database.upsertSourceCandidates.mock.calls.every(([id]) => id === "a")).toBe(true);
    expect(f.stats().peak).toBeLessThanOrEqual(4);
  });
});
