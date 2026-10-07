import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AiApiClient, InformationItemInput } from "../electron/main/ai-client";
import { ResearchDatabase } from "../electron/main/database";
import { FeedService } from "../electron/main/feed-service";
import type { InformationDepth } from "../src/shared/contracts";
import { informationDepthPolicy } from "../src/shared/information-depth";
import { CARD_SIZE_LIMITS } from "../src/lib/card-resize";

const databases: ResearchDatabase[] = [];
const directories: string[] = [];
afterEach(() => {
  for (const database of databases.splice(0)) database.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function evidence(content: string, overrides: Partial<InformationItemInput> = {}) {
  return {
    index: 0, title: "星海播出时间公告", content, url: "https://official.example/schedule", sourceName: "官方节目表",
    publishedAt: "2026-10-03", imageUrl: null, evidenceTier: "primary" as const, researchEntity: "星海", researchTask: "播出时间",
    suggestedType: "news" as const, suggestedImportance: 3, ...overrides,
  };
}

async function setup(depth: InformationDepth, items = [evidence("本周播出时间为10月8日20时。")], failAi = false, entities = ["星海"], focus = ["播出时间"]) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "research-local-depth-"));
  directories.push(directory);
  const database = await ResearchDatabase.open(path.join(directory, "test.sqlite"), path.resolve("node_modules/sql.js/dist/sql-wasm.wasm"));
  databases.push(database);
  const project = database.createProject({
    name: "动画监控", description: entities.map((entity) => `《${entity}》`).join("、"), goal: "跟踪播出信息", focus,
    updateFrequency: "daily", informationDepth: depth,
  });
  const ai = {
    getPreferences: () => ({ language: "zh-CN", maxUpdateBatches: 20 }), canSearchWeb: () => true,
    searchResearchWorkflow: async () => items,
    shouldOrganizeContent: () => failAi,
    synthesizeInformation: async () => { throw new Error("AI 暂时不可用"); },
  } as unknown as AiApiClient;
  const service = new FeedService(database, async () => { throw new Error("unexpected fetch"); }, ai);
  return { database, project, service, items };
}

async function snapshot(depth: InformationDepth, content: string) {
  const state = await setup(depth, [evidence(content)]);
  const run = await state.service.runProject(state.project.id);
  const card = state.database.listCards(state.project.id).find((item) => item.updateBatchId === run.runId)!;
  return { ...state, card, summary: card.content.split("\n• 证据截止")[0] };
}

describe("local information depth", () => {
  it("preserves distinguishable long entity names and their direct answers instead of truncating all labels alike", async () => {
    const entities = Array.from({ length: 16 }, (_, i) => '很长且前缀相同的作品名称特别纪念企划第' + (i + 1) + '部');
    const items = entities.map((entity, i) => evidence(entity + '播出时间为10月' + (i + 1) + '日。', {
      index: i, title: entity + '播出时间', researchEntity: entity, url: 'https://official.example/long/' + i,
    }));
    const { project, service } = await setup("focused", items, false, entities);
    const [decision] = await service["synthesize"](project, items, [], [], "zh-CN");
    for (let i = 0; i < entities.length; i++) {
      expect(decision.summary).toContain(entities[i]);
      expect(decision.coverage[i].statement).toContain('10月' + (i + 1) + '日');
    }
  });

  it("keeps the exact time, then adds a sourced reason and related event, then its introduction", async () => {
    const content = "欢迎访问节目网站。".repeat(40) + "本周播出时间为10月8日20时。原因：电视台为同期举办的全国运动会调整节目表。同期事项：全国运动会10月8日晚开幕，和本次播出改期共用电视台时段。关联事项介绍：全国运动会是面向全国运动员的综合赛事，开幕式由同一电视台直播。毫无关联的菜谱介绍。";
    const focused = await snapshot("focused", content);
    const standard = await snapshot("standard", content);
    const deep = await snapshot("deep", content);
    for (const { card } of [focused, standard, deep]) {
      expect(card.content).toContain("10月8日20时");
      expect(card.content).not.toContain("欢迎访问");
      expect(card.content).not.toContain("菜谱");
    }
    expect(focused.card.content).not.toContain("全国运动会");
    expect(standard.card.content).toContain("原因：电视台");
    expect(standard.card.content).toContain("同期事项");
    expect(standard.card.content).not.toContain("综合赛事");
    expect(deep.card.content).toContain("综合赛事");
    expect(deep.summary.length).toBeGreaterThan(standard.summary.length);
    expect(standard.summary.length).toBeGreaterThan(focused.summary.length);
    expect([focused.card.size, standard.card.size, deep.card.size]).toEqual([
      { width: 330, height: 250 }, { width: 360, height: 380 }, { width: 420, height: 560 },
    ]);
  });

  it.each(["focused", "standard", "deep"] as const)("caps %s summary text while preserving the leading answer", async (depth) => {
    const content = "本周播出时间为10月8日20时。" + Array.from({ length: 20 }, (_, index) => `播出说明${index}：${"这是官方节目表所列的播出细节".repeat(16)}。`).join("");
    const { card, summary } = await snapshot(depth, content);
    expect(summary).toContain("10月8日20时");
    expect(summary.length).toBeLessThanOrEqual(informationDepthPolicy(depth).maxCharacters);
    expect(card.size.width).toBeLessThanOrEqual(CARD_SIZE_LIMITS.maximumWidth);
    expect(card.size.height).toBeLessThanOrEqual(CARD_SIZE_LIMITS.maximumHeight);
  });

  it("gives image cards the chosen depth size and preserves a later user resize", async () => {
    const { database, project, service } = await setup("focused", [{ ...evidence("本周播出时间为10月8日20时。"), imageUrl: "https://official.example/poster.png", images: [{ url: "https://official.example/poster.png", caption: "星海本周播出时间为10月8日20时的官方节目表", relevance: "relevant" as const }] }]);
    await service.runProject(project.id);
    const card = database.listCards(project.id)[0];
    expect(card.size).toEqual({ width: 330, height: 310 });
    database.updateCardLayout({ id: card.id, position: card.position, size: { width: 500, height: 580 } });
    await service.runProject(project.id);
    expect(database.listCards(project.id).find((item) => item.id === card.id)?.size).toEqual({ width: 500, height: 580 });
  });

  it("keeps images without captions in detail without increasing preview height", async () => {
    const { database, project, service } = await setup("focused", [evidence("本周播出时间为10月8日20时。", { imageUrl: "https://official.example/poster.png" })]);
    await service.runProject(project.id);
    const card = database.listCards(project.id)[0];
    expect(card.size).toEqual({ width: 330, height: 250 });
    expect(card.imageUrl).toBeNull();
    expect(card.images).toContainEqual(expect.objectContaining({ url: "https://official.example/poster.png", relevance: "unverified" }));
  });

  it.each([false, true])("does not confirm unrelated results even with task and source labels (AI failure: %s)", async (failAi) => {
    const { database, project, service, items } = await setup("deep", [evidence("这是一份蛋糕配方，介绍奶油和面粉的用量。", { title: "烘焙食谱", sourceName: "播出时间新闻" })], failAi);
    const decisions = await service["synthesize"](project, items, [], [], "zh-CN");
    expect(decisions[0].coverage).toEqual([expect.objectContaining({ entity: "星海", status: "no_evidence", sourceIndexes: [] })]);
    expect(decisions[0].sourceIndexes).toEqual([]);
    const result = await service.runProject(project.id);
    const card = database.listCards(project.id).find((item) => item.updateBatchId === result.runId)!;
    expect(card.sourceLinks).toEqual([]);
    expect(card.content).not.toContain("蛋糕");
    expect(card.content).toContain("覆盖不足");
    expect(card.content).toContain("可信度：低");
  });

  it("covers every entity beyond eight high-ranked results within the focused budget", async () => {
    const entities = Array.from({ length: 12 }, (_, index) => `动画${String(index + 1).padStart(2, "0")}`);
    const items = entities.flatMap((entity, index) => Array.from({ length: index === 0 ? 10 : 1 }, (_, copy) => evidence(`${entity}播出时间为10月${index + 4}日。`, {
      index: index * 10 + copy, title: `${entity}播出时间`, researchEntity: entity, url: `https://official.example/${index}/${copy}`,
    })));
    const { project, service } = await setup("focused", items, false, entities);
    const [decision] = await service["synthesize"](project, items, [], [], "zh-CN");
    expect(decision.coverage).toHaveLength(12);
    expect(decision.coverage.every((row) => row.status === "confirmed" && row.sourceIndexes.length > 0)).toBe(true);
    for (const entity of entities) expect(decision.summary).toContain(entity);
    expect(decision.summary.length).toBeLessThanOrEqual(480);
  });

  it("keeps the same URL and text in separate entity/task cells and excludes other task evidence", async () => {
    const entities = ["星海", "月光"];
    const focus = ["播出时间", "监督与演出"];
    const items = entities.flatMap((entity) => focus.map((task) => evidence("本周播出时间为10月8日，监督与演出为田中。", {
      title: "联合公告", researchEntity: entity, researchTask: task,
    })));
    const { database, project, service } = await setup("deep", items, false, entities, focus);
    const synthesize = service["synthesize"].bind(service);
    const observed: InformationItemInput[][] = [];
    service["synthesize"] = async (...args) => { observed.push(args[1]); return synthesize(...args); };
    const run = await service.runProject(project.id);
    expect(observed[0]).toHaveLength(4);
    const decisions = await synthesize(project, observed[0] as typeof items, [], [], "zh-CN");
    expect(decisions).toHaveLength(2);
    for (const decision of decisions) {
      expect(decision.coverage.every((row) => row.status === "confirmed")).toBe(true);
      expect(decision.sourceIndexes).toHaveLength(2);
      expect(decision.sourceIndexes.every((index) => observed[0][index].researchTask === decision.focusCategory)).toBe(true);
    }
    const generated = database.listCards(project.id).filter((card) => card.updateBatchId === run.runId);
    expect(generated).toHaveLength(2);
    expect(generated.every((card) => card.sourceLinks.length === 1)).toBe(true);
  });

  it.each(["collection", "synthesis"] as const)("stops cleanly when a project is deleted during %s", async (phase) => {
    const { database, project, items } = await setup("standard");
    let resume!: () => void;
    let started!: () => void;
    const waiting = new Promise<void>((resolve) => { resume = resolve; });
    const inFlight = new Promise<void>((resolve) => { started = resolve; });
    const ai = {
      canSearchWeb: () => true,
      searchResearchWorkflow: async () => {
        if (phase === "collection") { started(); await waiting; }
        return items;
      },
      shouldOrganizeContent: () => true,
      synthesizeInformation: async () => { if (phase === "synthesis") { started(); await waiting; } return []; },
    } as unknown as AiApiClient;
    const service = new FeedService(database, async () => new Response(""), ai);
    const run = service.runProject(project.id);
    await inFlight;
    database.deleteProject(project.id);
    resume();
    await expect(run).rejects.toThrow("项目已删除");
    expect(database.listCards(project.id)).toEqual([]);
    expect(database.listTaskRuns(project.id)).toEqual([]);
    await expect(service.runProject(project.id)).rejects.toThrow("项目不存在");
    const next = database.createProject({ name: "新项目", description: "星海", goal: "播出时间", focus: ["播出时间"], updateFrequency: "daily" });
    await expect(service.runProject(next.id)).resolves.toMatchObject({ newCards: 1 });
  });
});
