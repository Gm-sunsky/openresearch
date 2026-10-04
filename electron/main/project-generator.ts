import type { CreateProjectInput, ProjectDraft, UpdateFrequency } from "../../src/shared/contracts";

const BULLET_PATTERN = /^\s*[-*•]\s*(.+)$/;

function detectFrequency(prompt: string): UpdateFrequency {
  if (/每小时|hourly/i.test(prompt)) return "hourly";
  if (/每周|weekly/i.test(prompt)) return "weekly";
  return "daily";
}

function cleanProjectName(value: string): string {
  return value
    .replace(/^(请|帮我|我想|需要|持续|创建一个|建立一个)+/u, "")
    .replace(/^(持续)?(关注|追踪|监控|收集|整理)\s*/u, "")
    .replace(/\s*的?(演出|新闻|信息|动态|公告|资料|活动)(信息|动态|资料)?[。！!，,：:].*$/u, "")
    .replace(/\s*的?(演出|新闻|信息|动态|公告|资料|活动)(信息|动态|资料)?[。！!]?$/u, "")
    .replace(/[。！!，,：:]$/u, "")
    .trim()
    .slice(0, 42);
}

export function generateProjectDraft(input: CreateProjectInput): ProjectDraft {
  const prompt = input.prompt.trim();
  if (!prompt) throw new Error("请描述你希望持续关注的信息。 ");

  const lines = prompt.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const focus = lines
    .map((line) => line.match(BULLET_PATTERN)?.[1]?.trim())
    .filter((item): item is string => Boolean(item))
    .slice(0, 8);

  const firstSentence = lines.find((line) => !BULLET_PATTERN.test(line)) ?? "新的信息项目";
  const inferredName = cleanProjectName(firstSentence) || "新的信息项目";
  const name = input.name?.trim() || `${inferredName}追踪`;
  const normalizedFocus = focus.length > 0 ? focus : ["官方公告", "相关新闻", "关键事件"];

  return {
    name: name.slice(0, 48),
    description: `持续整理与「${inferredName}」相关的可信信息。`,
    goal: firstSentence.replace(/[。！!]$/u, "").slice(0, 180),
    focus: normalizedFocus,
    updateFrequency: detectFrequency(prompt),
  };
}
