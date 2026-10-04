import { describe, expect, it } from "vitest";
import type { Project, Source } from "../src/shared/contracts";
import {
  buildDiscoveryQueries,
  buildResearchWorkflow,
  classifyEvidenceTier,
  extractResearchEntities,
  workflowPromptContext,
  limitResearchText,
  researchDepthPrompt,
} from "../electron/main/research-workflow";

const animeProject = {
  id: "anime-2026-07",
  name: "日本七月新番更新监控",
  description: "持续关注无职转生第三季、再见菈菈、穹庐下的魔女、尼古喵喵等七月新番的播出时间、停播分期及制作人员信息。",
  goal: "及时获取上述新番的播出变化和更新日历。",
  focus: ["播出时间变更", "停播/分期放送", "最新集监督与演出", "更新日历"],
  updateFrequency: "daily",
  status: "active",
  createdAt: "2026-08-19T00:00:00.000Z",
  updatedAt: "2026-08-19T00:00:00.000Z",
  cardCount: 0,
  sourceCount: 0,
} satisfies Project;

function source(input: Pick<Source, "name" | "url" | "platform">): Pick<Source, "name" | "url" | "platform"> {
  return input;
}

describe("generic research workflow", () => {
  it("extracts every concrete monitored object instead of treating the umbrella topic as one query", () => {
    expect(extractResearchEntities(animeProject)).toEqual([
      "无职转生第三季",
      "再见菈菈",
      "穹庐下的魔女",
      "尼古喵喵",
    ]);
  });

  it("builds the complete entity-by-task coverage matrix", () => {
    const workflow = buildResearchWorkflow(animeProject);
    expect(workflow.queryMatrix).toHaveLength(16);
    for (const entity of workflow.entities) {
      for (const task of workflow.tasks) {
        expect(workflow.queryMatrix).toContainEqual(expect.objectContaining({ entity, task }));
      }
    }
    expect(workflow.evidenceRules.join(" ")).toContain("Search every entity against every research task");
  });

  it("orders discovery queries breadth-first so every entity is searched before variants", () => {
    const queries = buildDiscoveryQueries(animeProject);
    expect(queries.slice(0, 4)).toEqual([
      expect.stringContaining("无职转生第三季"),
      expect.stringContaining("再见菈菈"),
      expect.stringContaining("穹庐下的魔女"),
      expect.stringContaining("尼古喵喵"),
    ]);
    for (const entity of extractResearchEntities(animeProject)) {
      expect(queries.some((query) => query.includes(entity))).toBe(true);
    }
  });

  it("falls back to a project-specific entity for projects without an enumerated list", () => {
    const road = { name: "独库公路开放情况监控", description: "道路状态项目", goal: "获取开放、封闭和交通管制变化" };
    expect(extractResearchEntities(road)).toEqual(["独库公路开放情况"]);
  });

  it("keeps first-party, operator, specialist, and community evidence distinct", () => {
    expect(classifyEvidenceTier(source({ name: "作品公式 X", url: "https://x.com/work", platform: "x" }))).toBe("primary");
    expect(classifyEvidenceTier(source({ name: "TOKYO MX 放送页", url: "https://s.mxtv.jp/anime/work", platform: "website" }))).toBe("operator");
    expect(classifyEvidenceTier(source({ name: "专业动画资料库", url: "https://database.example/work", platform: "website" }))).toBe("specialist");
    expect(classifyEvidenceTier(source({ name: "观众讨论", url: "https://forum.example/topic", platform: "forum" }))).toBe("community");
    expect(classifyEvidenceTier(source({ name: "普通视频评论频道", url: "https://youtube.com/@review", platform: "youtube" }))).toBe("specialist");
  });

  it("serializes the coverage matrix and evidence rules for every AI stage", () => {
    const promptContext = workflowPromptContext(animeProject);
    expect(promptContext).toContain("无职转生第三季");
    expect(promptContext).toContain("latest集监督与演出".replace("latest", "最新"));
    expect(promptContext).toContain("primary");
    expect(promptContext).toContain("community");
  });

  it.each([
    { informationDepth: "focused", relationHops: 0, maxCharacters: 480, maxFacts: 3 },
    { informationDepth: "standard", relationHops: 1, maxCharacters: 1100, maxFacts: 6 },
    { informationDepth: "deep", relationHops: 2, maxCharacters: 2200, maxFacts: 12 },
  ] as const)("expands only related queries at $informationDepth depth", (policy) => {
    const project = { ...animeProject, informationDepth: policy.informationDepth };
    const workflow = buildResearchWorkflow(project);
    expect(workflow.depthPolicy).toMatchObject({ relationHops: policy.relationHops, maxCharacters: policy.maxCharacters, maxFacts: policy.maxFacts });
    expect(workflow.queryMatrix).toHaveLength(16);
    for (const cell of workflow.queryMatrix) {
      expect(cell.queries).toHaveLength(3);
      expect(cell.relatedQueries).toHaveLength(policy.relationHops);
      expect(cell.queries[0]).toContain(`${cell.entity} ${cell.task}`);
      for (const query of cell.relatedQueries) expect(query).toContain(`${cell.entity} ${cell.task}`);
    }
    const queries = buildDiscoveryQueries(project);
    expect(queries.slice(0, 12)).toEqual(buildDiscoveryQueries({ ...animeProject, informationDepth: "focused" }).slice(0, 12));
    expect(researchDepthPrompt(project)).toContain(`maximum ${policy.maxCharacters} summary characters and ${policy.maxFacts} facts`);
    expect(researchDepthPrompt(project)).toContain("Never infer a reason just because two events share a date");
  });

  it("keeps the direct time at focused depth and adds evidence-backed context progressively", () => {
    const statement = "8月24日22时播出，因为官方公布的特别节目调整时段。同期举办作品见面会。关联事项介绍：见面会由制作委员会主办。";
    expect(limitResearchText(statement, "focused", undefined, undefined, "播出时间变更")).toBe("8月24日22时播出。");
    expect(limitResearchText(statement, "standard", undefined, undefined, "播出时间变更")).toBe("8月24日22时播出，因为官方公布的特别节目调整时段。 同期举办作品见面会。");
    expect(limitResearchText(statement, "deep", undefined, undefined, "播出时间变更")).toContain("关联事项介绍：见面会由制作委员会主办");
    expect(limitResearchText("原因是官方公布的特别节目调整时段。", "focused", undefined, undefined, "延期原因")).toContain("特别节目");
  });

  it("enforces fact and character limits without splitting off later complete facts", () => {
    const facts = Array.from({ length: 20 }, (_, index) => `第${index + 1}条确认事实。`).join("\n");
    expect(limitResearchText(facts, "focused").match(/确认事实/g)).toHaveLength(3);
    expect(limitResearchText(facts, "standard").match(/确认事实/g)).toHaveLength(6);
    expect(limitResearchText(facts, "deep").match(/确认事实/g)).toHaveLength(12);
    expect(limitResearchText("时间已确认。随后公布活动。", "focused", 8)).toBe("时间已确认。");
    for (const [depth, limit] of [["focused", 480], ["standard", 1100], ["deep", 2200]] as const) {
      const result = limitResearchText("确".repeat(3000), depth);
      expect(result).toHaveLength(limit);
      expect(result.endsWith("…")).toBe(true);
    }
  });});
