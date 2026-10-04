import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AiApiClient } from "../electron/main/ai-client";
import { ResearchDatabase } from "../electron/main/database";
import { FeedService } from "../electron/main/feed-service";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

async function setup(ai: AiApiClient) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "research-board-feed-agent-"));
  temporaryDirectories.push(directory);
  const database = await ResearchDatabase.open(
    path.join(directory, "test.sqlite"),
    path.resolve("node_modules/sql.js/dist/sql-wasm.wasm"),
  );
  const project = database.createProject({
    name: "独库公路", description: "Road", goal: "追踪独库公路开放情况", focus: ["开放", "封闭"], updateFrequency: "daily",
  });
  database.createSource({ projectId: project.id, type: "rss", name: "交通公告", url: "https://example.com/feed.xml" });
  const xml = `<rss><channel>
    <item><title>Road status</title><link>https://example.com/road</link><description>Open today</description><media:content url="/road.jpg" type="image/jpeg"/></item>
    <item><title>Music</title><link>https://example.com/music</link><description>Concert</description></item>
  </channel></rss>`;
  const service = new FeedService(database, async () => new Response(xml, { status: 200 }), ai);
  return { database, project, service };
}

describe("FeedService project agent", () => {
  it("uses AI relevance and classification before creating cards", async () => {
    const ai = {
      shouldOrganizeContent: () => true,
      organizeInformation: async () => [
        { index: 0, relevant: true, type: "event", title: "独库公路恢复通行", summary: "道路已经开放。", importance: 3, occurredAt: null },
        { index: 1, relevant: false, type: "news", title: "Music", summary: "Unrelated", importance: 1, occurredAt: null },
      ],
    } as unknown as AiApiClient;
    const { database, project, service } = await setup(ai);

    const result = await service.runProject(project.id);
    const collected = database.listCards(project.id).find((card) => card.title === "独库公路恢复通行");

    expect(result).toMatchObject({ newCards: 2, errors: [], warnings: [] });
    expect(collected).toMatchObject({ type: "event", title: "独库公路恢复通行", imageUrl: "https://example.com/road.jpg", importance: 3 });
    expect(collected?.content).toContain("道路已经开放。");
    expect(collected?.content).toContain("Evidence cutoff");
    const batchCards = database.listCards(project.id).filter((card) => card.updateBatchId === result.runId);
    expect(batchCards.map((card) => card.focusCategory).sort()).toEqual(["封闭", "开放"]);
    expect(batchCards.every((card) => card.packId === batchCards[0].packId)).toBe(true);
    database.close();
  });

  it("creates one focus-based card with a combined link list from multiple sources", async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "research-board-multi-source-"));
    temporaryDirectories.push(directory);
    const database = await ResearchDatabase.open(path.join(directory, "test.sqlite"), path.resolve("node_modules/sql.js/dist/sql-wasm.wasm"));
    const project = database.createProject({
      name: "独库公路", description: "道路状态", goal: "追踪独库公路开放情况", focus: ["开放状态", "交通管制"], updateFrequency: "daily",
    });
    database.createSource({ projectId: project.id, type: "rss", name: "交通部门", url: "https://a.example/feed" });
    database.createSource({ projectId: project.id, type: "rss", name: "景区公告", url: "https://b.example/feed" });
    const ai = {
      shouldOrganizeContent: () => true,
      synthesizeInformation: async (_project: unknown, items: Array<{ index: number }>) => [{
        focusCategory: "开放状态", sourceIndexes: items.map((item) => item.index), type: "analysis", title: "独库公路开放信息综合",
        summary: "• 两个来源均确认道路开放。", importance: 3, occurredAt: null,
        changeKind: "none", previousCardId: null, changeSummary: null,
      }, {
        focusCategory: "交通管制", sourceIndexes: items.map((item) => item.index), type: "news", title: "通行时段综合",
        summary: "• 通行时段已经交叉核验。", importance: 2, occurredAt: null,
        changeKind: "none", previousCardId: null, changeSummary: null,
      }],
    } as unknown as AiApiClient;
    const service = new FeedService(database, async (url) => new Response(
      String(url).includes("a.example")
        ? `<rss><channel><item><title>独库公路开放公告</title><link>https://a.example/status</link><description>6月15日恢复开放</description></item></channel></rss>`
        : `<rss><channel><item><title>独库公路通行提示</title><link>https://b.example/status</link><description>每日8时至20时通行</description></item></channel></rss>`,
      { status: 200 },
    ), ai);

    const result = await service.runProject(project.id);
    const batchCards = database.listCards(project.id).filter((card) => card.updateBatchId === result.runId);
    const synthesized = batchCards.find((card) => card.focusCategory === "开放状态");
    expect(result.newCards).toBe(2);
    expect(synthesized).toMatchObject({ title: "独库公路开放信息综合", sourceName: "2 个来源" });
    expect(synthesized?.sourceLinks.map((source) => source.name).sort()).toEqual(["交通部门", "景区公告"]);
    expect(batchCards.every((card) => card.packId && card.packId === batchCards[0].packId)).toBe(true);
    expect(new Set(batchCards.map((card) => `${card.position.x}:${card.position.y}`)).size).toBe(1);
    database.close();
  });

  it("creates a complete snapshot on every run even when the latest source content is unchanged", async () => {
    const ai = {
      getPreferences: () => ({ language: "en", maxUpdateBatches: 20 }),
      shouldOrganizeContent: () => false,
    } as unknown as AiApiClient;
    const { database, project, service } = await setup(ai);

    const first = await service.runProject(project.id);
    const second = await service.runProject(project.id);
    const snapshots = database.listCards(project.id).filter((card) => card.updateBatchId === first.runId || card.updateBatchId === second.runId);

    expect(first.newCards).toBe(2);
    expect(second.newCards).toBe(2);
    expect(new Set(snapshots.map((card) => card.updateBatchId))).toEqual(new Set([first.runId, second.runId]));
    expect(snapshots.every((card) => /latest snapshot/i.test(card.title))).toBe(true);
    database.close();
  });

  it("includes an unchanged web page in every current-state snapshot", async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "research-board-web-snapshot-"));
    temporaryDirectories.push(directory);
    const database = await ResearchDatabase.open(path.join(directory, "test.sqlite"), path.resolve("node_modules/sql.js/dist/sql-wasm.wasm"));
    const project = database.createProject({ name: "Road", description: "Road", goal: "Track road status", focus: ["Status"], updateFrequency: "daily" });
    database.createSource({ projectId: project.id, type: "web", name: "Authority", url: "https://example.com/status" });
    const ai = {
      shouldOrganizeContent: () => true,
      synthesizeInformation: async (_project: unknown, items: Array<{ index: number }>) => [{
        focusCategory: "Status", sourceIndexes: items.map((item) => item.index), type: "news", title: "Current road status",
        summary: "• The road is open.", importance: 2, occurredAt: null, changeKind: "none", previousCardId: null, changeSummary: null,
      }],
    } as unknown as AiApiClient;
    const page = `<html><head><title>Road status</title><meta name="description" content="The road is open"></head><body>Road status: open today.</body></html>`;
    const service = new FeedService(database, async () => new Response(page, { status: 200 }), ai);

    const first = await service.runProject(project.id);
    const second = await service.runProject(project.id);
    expect(first.newCards).toBe(1);
    expect(second.newCards).toBe(1);
    expect(database.listCards(project.id).filter((card) => [first.runId, second.runId].includes(card.updateBatchId ?? ""))).toHaveLength(2);
    database.close();
  });

  it("collects multiple social accounts through one search batch and feeds their posts into synthesis", async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "research-board-social-search-"));
    temporaryDirectories.push(directory);
    const database = await ResearchDatabase.open(path.join(directory, "test.sqlite"), path.resolve("node_modules/sql.js/dist/sql-wasm.wasm"));
    const project = database.createProject({ name: "Launch", description: "Launch", goal: "Track launch announcements", focus: ["Announcements", "Video"], updateFrequency: "daily" });
    database.createSource({ projectId: project.id, type: "search", platform: "x", name: "Launch account", url: "https://x.com/launch" });
    database.createSource({ projectId: project.id, type: "search", platform: "youtube", name: "Launch channel", url: "https://youtube.com/@launch" });
    let searchedSourceCount = 0;
    const ai = {
      getPreferences: () => ({ language: "en", maxUpdateBatches: 20 }),
      canSearchWeb: () => true,
      searchLatestFromSources: async (_project: unknown, sources: Array<{ name: string }>) => {
        searchedSourceCount = sources.length;
        return [
          { index: 0, sourceIndex: 0, sourceName: sources[0].name, title: "Launch announced", content: "The launch date was announced.", url: "https://x.com/launch/status/1", imageUrl: null, publishedAt: "2026-08-18" },
          { index: 1, sourceIndex: 1, sourceName: sources[1].name, title: "Mission video", content: "A mission briefing video was published.", url: "https://youtube.com/watch?v=1", imageUrl: null, publishedAt: "2026-08-18" },
        ];
      },
      shouldOrganizeContent: () => true,
      synthesizeInformation: async (_project: unknown, items: Array<{ index: number }>) => [{
        focusCategory: "Announcements", sourceIndexes: items.map((item) => item.index), type: "news", title: "Current launch update",
        summary: "• Launch date and mission briefing are now available.", importance: 3, occurredAt: "2026-08-18", changeKind: "none", previousCardId: null, changeSummary: null,
      }],
    } as unknown as AiApiClient;
    const service = new FeedService(database, async () => { throw new Error("search sources must not be fetched directly"); }, ai);

    const result = await service.runProject(project.id);
    const announcement = database.listCards(project.id).find((card) => card.focusCategory === "Announcements" && card.updateBatchId === result.runId);
    expect(searchedSourceCount).toBe(2);
    expect(result.errors).toEqual([]);
    expect(announcement?.sourceLinks.map((source) => source.url)).toEqual(["https://x.com/launch/status/1", "https://youtube.com/watch?v=1"]);
    expect(database.listSources(project.id).every((source) => source.status === "active" && source.lastCheckedAt)).toBe(true);
    database.close();
  });

  it("falls back to local rules and records a warning when AI fails", async () => {
    const ai = {
      shouldOrganizeContent: () => true,
      organizeInformation: async () => { throw new Error("empty response"); },
    } as unknown as AiApiClient;
    const { database, project, service } = await setup(ai);

    const result = await service.runProject(project.id);

    expect(result.newCards).toBe(2);
    expect(result.errors).toEqual([]);
    expect(result.warnings[0]).toMatch(/AI 综合整理失败，已保留来源提取结果并使用跨语言本地分类/);
    expect(database.listTaskRuns(project.id)[0]?.warnings).toHaveLength(1);
    expect(database.listCards(project.id).filter((card) => card.sourceName === "交通公告")[0]?.content).toContain("reviewable local result");
    database.close();
  });

  it("preserves Japanese source facts and maps them to Chinese anime focus categories after AI format failure", async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "research-board-cross-language-fallback-"));
    temporaryDirectories.push(directory);
    const database = await ResearchDatabase.open(path.join(directory, "test.sqlite"), path.resolve("node_modules/sql.js/dist/sql-wasm.wasm"));
    const project = database.createProject({
      name: "日本七月新番更新监控", description: "日本动画", goal: "跟踪播出与制作人员变更",
      focus: ["停播/分期放送", "最新集监督与演出", "更新日历"], updateFrequency: "daily",
    });
    database.createSource({ projectId: project.id, type: "rss", name: "アニメ公式ニュース", url: "https://anime.example/feed.xml" });
    const xml = `<rss><channel>
      <item><title>第7話 放送休止のお知らせ</title><link>https://anime.example/7</link><description>第7話は放送休止となり、翌週へ延期されます。</description></item>
      <item><title>第8話 スタッフ公開</title><link>https://anime.example/8</link><description>第8話の監督と演出スタッフを公開しました。</description></item>
      <item><title>最新放送スケジュール</title><link>https://anime.example/schedule</link><description>8月20日より放送開始。最新の番組表を公開しました。</description></item>
    </channel></rss>`;
    const ai = {
      getPreferences: () => ({ language: "zh-CN", maxUpdateBatches: 20 }),
      shouldOrganizeContent: () => true,
      synthesizeInformation: async () => { throw new Error("AI 返回内容不是可读取的 JSON 对象"); },
    } as unknown as AiApiClient;
    const service = new FeedService(database, async () => new Response(xml, { status: 200 }), ai);

    const result = await service.runProject(project.id);
    const cards = database.listCards(project.id).filter((card) => card.updateBatchId === result.runId);
    expect(result.newCards).toBe(3);
    expect(cards.find((card) => card.focusCategory === "停播/分期放送")?.content).toContain("放送休止");
    expect(cards.find((card) => card.focusCategory === "最新集监督与演出")?.content).toMatch(/監督|演出/);
    expect(cards.find((card) => card.focusCategory === "更新日历")?.content).toMatch(/放送開始|番組表/);
    expect(cards.every((card) => !card.content.includes("当前来源未提供可确认的信息"))).toBe(true);
    expect(cards.every((card) => card.sourceLinks.length > 0)).toBe(true);
    database.close();
  });

  it("replaces empty AI placeholder cards with matrix-search evidence", async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "research-board-placeholder-rescue-"));
    temporaryDirectories.push(directory);
    const database = await ResearchDatabase.open(path.join(directory, "test.sqlite"), path.resolve("node_modules/sql.js/dist/sql-wasm.wasm"));
    const project = database.createProject({
      name: "日本七月新番更新监控", description: "持续关注无职转生第三季的播出与制作信息。", goal: "跟踪播出与制作人员变更",
      focus: ["播出时间变更", "最新集监督与演出"], updateFrequency: "daily",
    });
    database.createSource({ projectId: project.id, type: "web", name: "动画首页", url: "https://anime.example/" });
    const ai = {
      getPreferences: () => ({ language: "zh-CN", maxUpdateBatches: 20 }),
      canSearchWeb: () => true,
      searchResearchWorkflow: async () => [{
        index: 0, researchEntity: "无职转生第三季", researchTask: "播出时间变更", title: "第九话时间确认",
        content: "官方节目表确认第九话于8月24日播出。", sourceName: "动画公式", url: "https://anime.example/episode/9",
        imageUrl: null, evidenceTier: "primary", publishedAt: "2026-08-19",
      }, {
        index: 1, researchEntity: "无职转生第三季", researchTask: "最新集监督与演出", title: "第九话制作人员",
        content: "第九话监督与演出人员名单已经公开。", sourceName: "动画公式", url: "https://anime.example/episode/9/staff",
        imageUrl: null, evidenceTier: "primary", publishedAt: "2026-08-19",
      }],
      shouldOrganizeContent: () => true,
      synthesizeInformation: async () => project.focus.map((focusCategory) => ({
        focusCategory, sourceIndexes: [], type: "analysis", title: `${focusCategory}：最新状态`,
        summary: "• 当前来源未提供可确认的信息。", importance: 1, occurredAt: null,
        changeKind: "none", previousCardId: null, changeSummary: null,
      })),
    } as unknown as AiApiClient;
    const page = "<html><head><title>动画首页</title></head><body>欢迎访问动画官方网站。</body></html>";
    const service = new FeedService(database, async () => new Response(page, { status: 200 }), ai);

    const result = await service.runProject(project.id);
    const cards = database.listCards(project.id).filter((card) => card.updateBatchId === result.runId);
    expect(cards).toHaveLength(2);
    expect(cards.find((card) => card.focusCategory === "播出时间变更")?.content).toContain("8月24日");
    expect(cards.find((card) => card.focusCategory === "最新集监督与演出")?.content).toContain("监督与演出人员");
    expect(cards.every((card) => !card.content.includes("当前来源未提供可确认的信息"))).toBe(true);
    expect(cards.every((card) => card.sourceLinks.length === 1)).toBe(true);
    database.close();
  });

  it("distinguishes a source fetch failure from a successful collection with no focus match", async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "research-board-no-readable-content-"));
    temporaryDirectories.push(directory);
    const database = await ResearchDatabase.open(path.join(directory, "test.sqlite"), path.resolve("node_modules/sql.js/dist/sql-wasm.wasm"));
    const project = database.createProject({ name: "Status", description: "Status", goal: "Track status", focus: ["当前状态"], updateFrequency: "daily" });
    database.createSource({ projectId: project.id, type: "web", name: "Broken source", url: "https://example.com/status" });
    const ai = { getPreferences: () => ({ language: "zh-CN", maxUpdateBatches: 20 }), shouldOrganizeContent: () => false } as unknown as AiApiClient;
    const service = new FeedService(database, async () => new Response("error", { status: 500 }), ai);

    const result = await service.runProject(project.id);
    const card = database.listCards(project.id).find((item) => item.updateBatchId === result.runId);
    expect(result.errors[0]).toContain("HTTP 500");
    expect(card?.content).toContain("本次没有采集到可读取的正文");
    expect(card?.content).not.toContain("当前来源未提供可确认的信息");
    database.close();
  });
});
