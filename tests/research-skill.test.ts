import path from "node:path";
import { describe, expect, it } from "vitest";
import { auditResearchSkillResult } from "../electron/main/ai-client";
import { compileResearchSkillContext, loadResearchSkill, parseResearchSkill } from "../electron/main/research-skill";
import type { Project } from "../src/shared/contracts";

const project = {
  id: "anime",
  name: "日本七月新番更新监控",
  description: "持续关注无职转生第三季、再见菈菈等七月新番的播出时间。",
  goal: "掌握播出变化",
  focus: ["播出时间变更"],
  updateFrequency: "daily",
  status: "active",
  createdAt: "2026-08-20",
  updatedAt: "2026-08-20",
  cardCount: 0,
  sourceCount: 0,
} satisfies Project;

describe("embedded general information research skill", () => {
  it("loads a validated UTF-8 SKILL.md and compiles a project-specific skill instance", () => {
    const skill = loadResearchSkill(path.resolve("."));
    const context = compileResearchSkillContext(skill, project, "zh-CN", "2026-08-20T00:00:00.000Z");
    expect(skill.name).toBe("general-information-research");
    expect(skill.digest).toMatch(/^[a-f0-9]{12}$/);
    expect(context).toContain("<trusted_research_skill");
    expect(context).toContain("无职转生第三季");
    expect(context).toContain("再见菈菈");
    expect(context).toContain("播出时间变更");
    expect(context).toContain('"output_language":"zh-CN"');
    expect(context).toContain('"required_coverage_rows_per_card":2');
  });

  it("rejects an incomplete or incorrectly named skill", () => {
    expect(() => parseResearchSkill("---\nname: wrong\ndescription: incomplete research skill description\n---\n## Workflow\n## Quality gates"))
      .toThrow(/名称无效/);
  });

  it("accepts a fully covered source-backed result", () => {
    const parsed = { cards: [{
      focus_category: "播出时间变更",
      source_indexes: [0, 1],
      coverage: [
        { entity: "无职转生第三季", status: "confirmed", statement: "播出时间已确认", source_indexes: [0] },
        { entity: "再见菈菈", status: "confirmed", statement: "播出时间已确认", source_indexes: [1] },
      ],
      summary: "两部作品的播出时间均已确认。",
    }] };
    const items = [
      { index: 0, title: "无职转生第三季播出时间", content: "无职转生第三季播出时间确认：8月24日。", url: "https://a.example", publishedAt: null },
      { index: 1, title: "再见菈菈播出时间", content: "再见菈菈播出时间确认：8月25日。", url: "https://b.example", publishedAt: null },
    ];
    expect(auditResearchSkillResult(parsed, project, items)).toEqual([]);
  });

  it("reports placeholders, missing entities, and unsupported confirmed claims", () => {
    const parsed = { cards: [{
      focus_category: "播出时间变更",
      source_indexes: [],
      coverage: [{ entity: "无职转生第三季", status: "confirmed", statement: "已确认", source_indexes: [] }],
      summary: "当前来源未提供可确认的信息。",
    }] };
    const issues = auditResearchSkillResult(parsed, project, []);
    expect(issues.join("\n")).toContain("empty placeholder");
    expect(issues.join("\n")).toContain("再见菈菈");
    expect(issues.join("\n")).toContain("without valid evidence");
  });

  it("rejects a real source that belongs to another monitored entity", () => {
    const parsed = { cards: [{
      focus_category: "播出时间变更", source_indexes: [0], summary: "两部作品的播出时间均已确认。",
      coverage: [
        { entity: "无职转生第三季", status: "confirmed", statement: "8月24日播出。", source_indexes: [0] },
        { entity: "再见菈菈", status: "confirmed", statement: "8月24日播出。", source_indexes: [0] },
      ],
    }] };
    const items = [{
      index: 0, title: "无职转生第三季节目表", content: "无职转生第三季8月24日播出。",
      url: "https://anime.example/schedule", researchEntity: "无职转生第三季",
      researchTask: "播出时间变更", publishedAt: null,
    }];
    expect(auditResearchSkillResult(parsed, project, items)).toEqual([
      expect.stringContaining("entity '再见菈菈' has status 'confirmed' without valid evidence"),
    ]);
  });

  it.each(["focused", "standard", "deep"] as const)("embeds %s depth without changing required coverage", (informationDepth) => {
    const skill = loadResearchSkill(path.resolve("."));
    const context = compileResearchSkillContext(skill, { ...project, informationDepth }, "zh-CN", "2026-08-20");
    expect(context).toContain(`"information_depth":"${informationDepth}"`);
    expect(context).toContain('"required_card_count":1');
    expect(context).toContain('"required_coverage_rows_per_card":2');
  });});
