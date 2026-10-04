import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Project } from "../../src/shared/contracts";
import { buildResearchWorkflow } from "./research-workflow";

export interface ResearchSkill {
  name: string;
  description: string;
  instructions: string;
  digest: string;
}

const RESEARCH_SKILL_RELATIVE_PATH = path.join("research-skills", "general-information-research", "SKILL.md");

export function parseResearchSkill(raw: string): ResearchSkill {
  const normalized = raw.replace(/^\uFEFF/, "");
  const frontmatter = normalized.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]+)$/);
  if (!frontmatter) throw new Error("内置研究技能缺少有效的 YAML frontmatter");
  const name = frontmatter[1].match(/^name:\s*(.+)$/m)?.[1]?.trim() ?? "";
  const description = frontmatter[1].match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? "";
  const instructions = frontmatter[2].trim();
  if (name !== "general-information-research") throw new Error(`内置研究技能名称无效：${name || "空"}`);
  if (description.length < 20) throw new Error("内置研究技能描述不完整");
  if (!instructions.includes("## Workflow") || !instructions.includes("## Quality gates")) {
    throw new Error("内置研究技能缺少工作流或质量门禁");
  }
  return {
    name,
    description,
    instructions,
    digest: createHash("sha256").update(normalized).digest("hex").slice(0, 12),
  };
}

export function loadResearchSkill(appRoot: string): ResearchSkill {
  const skillPath = path.join(appRoot, RESEARCH_SKILL_RELATIVE_PATH);
  return parseResearchSkill(readFileSync(skillPath, "utf8"));
}

export function compileResearchSkillContext(
  skill: ResearchSkill,
  project: Pick<Project, "id" | "name" | "description" | "goal" | "focus" | "informationDepth">,
  outputLanguage: string,
  evidenceCutoff: string,
): string {
  const workflow = buildResearchWorkflow(project);
  return [
    `<trusted_research_skill name="${skill.name}" digest="${skill.digest}">`,
    skill.instructions,
    "</trusted_research_skill>",
    "<project_skill_instance>",
    JSON.stringify({
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        goal: project.goal,
      },
      information_depth: workflow.informationDepth,
      information_depth_policy: workflow.depthPolicy,
      monitored_entities: workflow.entities,
      focus_tasks: workflow.tasks,
      research_matrix: workflow.queryMatrix,
      evidence_policy: workflow.sourcePolicy,
      evidence_rules: workflow.evidenceRules,
      output_language: outputLanguage,
      evidence_cutoff: evidenceCutoff,
      required_card_count: workflow.tasks.length,
      required_coverage_rows_per_card: workflow.entities.length,
    }),
    "</project_skill_instance>",
  ].join("\n");
}
