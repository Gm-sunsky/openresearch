import type { InformationDepth, Project, Source, SourcePlatform } from "../../src/shared/contracts";

import { informationDepthPolicy, normalizeInformationDepth } from "../../src/shared/information-depth";

export type EvidenceTier = "primary" | "operator" | "specialist" | "community";

export interface ResearchQueryCell {
  entity: string;
  task: string;
  queries: string[];
  relatedQueries: string[];
}

export interface ResearchWorkflow {
  version: 1;
  informationDepth: InformationDepth;
  depthPolicy: ReturnType<typeof informationDepthPolicy>;
  entities: string[];
  tasks: string[];
  queryMatrix: ResearchQueryCell[];
  sourcePolicy: Array<{
    tier: EvidenceTier;
    purpose: string;
    confidence: "high" | "medium" | "low";
  }>;
  evidenceRules: string[];
}

const GENERIC_ENTITY_WORDS = /^(信息|动态|情况|项目|主题|内容|新闻|公告|更新|最新消息|相关信息|上述新番|七月新番)$/i;

function cleanEntity(value: string): string {
  return value
    .replace(/^[：:，,、\s]+|[：:，,、\s]+$/g, "")
    .replace(/^(?:持续|长期|帮我|请|需要|希望)\s*/, "")
    .replace(/(?:相关|的最新|最新|更新监控|监控|追踪|跟踪)$/g, "")
    .trim();
}

function splitEntities(value: string): string[] {
  return value.split(/\s*(?:、|，|,|；|;|以及|和)\s*/)
    .map(cleanEntity)
    .filter((entity) => entity.length >= 2 && entity.length <= 80 && !GENERIC_ENTITY_WORDS.test(entity));
}

export function extractResearchEntities(project: Pick<Project, "name" | "description" | "goal">): string[] {
  const text = `${project.description}。${project.goal}`;
  const quoted = [...text.matchAll(/[《「『“"]([^》」』”"]{2,80})[》」』”"]/g)].map((match) => cleanEntity(match[1]));
  const watched = text.match(/(?:关注|追踪|监控|跟踪|搜集|收集)\s*([^。；]+?)(?:等[^。；]{0,24}?的|的(?:播出|演出|开放|封闭|发射|回收|更新|状态|动态|公告|新闻|售票|时间))/i)?.[1];
  const candidates = [...quoted, ...(watched ? splitEntities(watched) : [])];
  const unique = [...new Set(candidates.filter((entity) => !GENERIC_ENTITY_WORDS.test(entity)))];
  if (unique.length) return unique.slice(0, 16);
  const fallback = cleanEntity(project.name.replace(/(?:信息)?(?:更新)?(?:监控|追踪|跟踪|看板|项目)$/i, ""));
  return [fallback || project.name];
}

function queryVariants(entity: string, task: string): string[] {
  return [
    `${entity} ${task} 官方 最新`,
    `${entity} ${task} official latest`,
    `${entity} ${task} site:x.com OR site:youtube.com OR site:bilibili.com`,
  ];
}

export function buildResearchWorkflow(project: Pick<Project, "name" | "description" | "goal" | "focus" | "informationDepth">): ResearchWorkflow {
  const informationDepth = normalizeInformationDepth(project.informationDepth);
  const depthPolicy = informationDepthPolicy(informationDepth);
  const entities = extractResearchEntities(project);
  const tasks = project.focus.length ? project.focus : [project.goal];
  return {
    version: 1,
    informationDepth,
    depthPolicy,
    entities,
    tasks,
    queryMatrix: entities.flatMap((entity) => tasks.map((task) => ({
      entity,
      task,
      queries: queryVariants(entity, task),
      relatedQueries: depthPolicy.relationHops === 0 ? [] : [
        `${entity} ${task} 原因 同期事项 官方 explanation related schedule`,
        ...(depthPolicy.relationHops > 1 ? [`${entity} ${task} 关联事项 介绍 背景 official related event background`] : []),
      ],
    }))),
    sourcePolicy: [
      { tier: "primary", purpose: "Official sites, responsible authorities, first-party accounts, official announcements, and original episode/event pages.", confidence: "high" },
      { tier: "operator", purpose: "Broadcasters, ticketing or transport operators, schedules, platforms, and other organizations that execute the event or distribution.", confidence: "high" },
      { tier: "specialist", purpose: "Established specialist databases and reporting used to cross-check details or fill structured fields.", confidence: "medium" },
      { tier: "community", purpose: "Forums, personal pages, and credit transcriptions used only for gaps and always labeled as unverified unless independently corroborated.", confidence: "low" },
    ],
    evidenceRules: [
      "Prefer a primary or operator source for dates, status, prices, closures, schedules, and official changes.",
      "Use specialist or community sources only to fill gaps; lower confidence and disclose the limitation.",
      "Distinguish confirmed facts from inference and unverified community transcription.",
      "Record an as-of timestamp and preserve every source URL used by a conclusion.",
      "Search every entity against every research task instead of assuming one broad source covers the whole project.",
      "Finish every core entity-task cell before related queries. Related evidence stays in its original cell and never increases the required card count.",
      "Only add reasons and related events when explicitly supported by sources; timing alone does not prove causation. Say unknown when the reason is not documented.",
      depthPolicy.guidance,
    ],
  };
}

export function buildDiscoveryQueries(project: Pick<Project, "name" | "description" | "goal" | "focus" | "informationDepth">): string[] {
  const workflow = buildResearchWorkflow(project);
  const taskSummary = workflow.tasks.slice(0, 3).join(" ");
  const queryBuilders = [
    (entity: string) => `${entity} ${taskSummary} 官方 最新`,
    (entity: string) => `${entity} ${taskSummary} official latest`,
    (entity: string) => `${entity} ${taskSummary} site:x.com OR site:youtube.com OR site:bilibili.com`,
  ];
  // Breadth-first ordering guarantees that the public-search fallback checks every
  // entity once before spending additional queries on language/channel variants.
  const queries = queryBuilders.flatMap((buildQuery) => workflow.entities.map(buildQuery));
  queries.push(...workflow.queryMatrix.flatMap((cell) => cell.relatedQueries));
  queries.push(`${project.name} ${taskSummary} 论坛 社区 博客 个人主页`);
  return [...new Set(queries)].slice(0, 24);
}

export function classifyEvidenceTier(source: Pick<Source, "name" | "url" | "platform">): EvidenceTier {
  const searchable = `${source.name} ${source.url}`.toLocaleLowerCase();
  if (source.platform === "forum" || source.platform === "personal" || /reddit|forum|bbs|community|bgm\.tv/.test(searchable)) return "community";
  if (/official|公式|官网|政府|gov\.|\.gov|authority|official account/.test(searchable)) return "primary";
  if (/tokyo.?mx|bs11|at-x|abema|netflix|broadcaster|operator|ticket|交通|运输|电视台|放送局/.test(searchable)) return "operator";
  return "specialist";
}

export function workflowPromptContext(project: Pick<Project, "name" | "description" | "goal" | "focus" | "informationDepth">): string {
  return JSON.stringify(buildResearchWorkflow(project));
}

export function platformSearchHint(platform: SourcePlatform): string {
  return ({ rss: "feed", website: "website", x: "X/Twitter account", instagram: "Instagram profile", youtube: "YouTube channel", bilibili: "Bilibili account", forum: "forum/community", personal: "personal site/blog" })[platform];
}

// One shared constraint for AI output and deterministic reconstruction. Required
// entity coverage is budgeted by the caller before individual text is shortened.
export function limitResearchText(value: string, depth: unknown, maxCharacters?: number, maxFacts?: number, focus = ""): string {
  const policy = informationDepthPolicy(depth);
  const limit = Math.max(1, maxCharacters ?? policy.maxCharacters);
  const factLimit = Math.max(1, maxFacts ?? policy.maxFacts);
  let text = value.trim();
  if (policy.relationHops === 0 && !/原因|背景|同期|关联|why|reason|background/i.test(focus)) {
    text = text.replace(/(?:[，,；;]\s*)?(?:原因(?:是|为|：|:)|因为|由于|同期(?:还有|举行|举办|事项)|相关(?:活动|事项)|背景(?:是|为|介绍|：|:)|because|due to)[^。.!?！？\n]*/gi, "");
  }
  const sentences = text.split(/(?<=[。！？!?])\s*|\n+|(?<=\.)\s+(?=[A-Z])/u)
    .map((part) => part.replace(/^\s*[•*−-]\s*/, "").trim()).filter((part) => /[\p{L}\p{N}]/u.test(part));
  const selected = sentences.filter((part) => {
    if (policy.relationHops === 0 && !/原因|背景|同期|关联|why|reason|background/i.test(focus)) {
      return !/^(?:原因|因为|由于|同期|相关事项|关联事项|背景|介绍|reason|background|related event)/i.test(part);
    }
    if (policy.relationHops === 1) return !/^(?:关联事项介绍|相关事项介绍|这些事项的介绍|二层背景|related event background)/i.test(part);
    return true;
  }).slice(0, factLimit);
  let result = "";
  for (const sentence of selected) {
    const next = result ? result + " " + sentence : sentence;
    if (next.length <= limit) { result = next; continue; }
    if (!result) result = limit === 1 ? "…" : sentence.slice(0, limit - 1).trimEnd() + "…";
    break;
  }
  return result;
}

export function researchDepthPrompt(project: Pick<Project, "informationDepth">): string {
  const depth = normalizeInformationDepth(project.informationDepth);
  const policy = informationDepthPolicy(depth);
  return [
    `INFORMATION DEPTH: ${depth}; maximum ${policy.maxCharacters} summary characters and ${policy.maxFacts} facts per card; relation hops ${policy.relationHops}.`,
    policy.guidance,
    "Put every entity's direct answer first. Divide the character/fact budget fairly among entities; required core coverage takes priority over extra facts. Never omit later entities to fit a budget.",
    "Keep all supported detail in each coverage.statement because the displayed summary is built from these evidence-checked rows. Related details stay inside the original entity-task cell.",
    "Never infer a reason just because two events share a date. Unknown causes must stay unknown; related events and their introductions each require a source and an explicit relation to the original focus.",
  ].join("\n");
}
