import { synthesisOverview } from "./shared/synthesis-preview";
import { normalizeCardImages, summarizeCard } from "./shared/card-presentation";
import type {
  AiSettings,
  Card,
  CreateProjectInput,
  Project,
  ResearchBoardApi,
  Source,
  SourceCandidate,
  TaskRun,
  InformationChange,
} from "./shared/contracts";
import { normalizeInformationDepth } from "./shared/information-depth";
import { inferSourcePlatform } from "./shared/source-platform";

const now = new Date().toISOString();
const previousUpdate = new Date(Date.now() - 24 * 60 * 60 * 1_000).toISOString();
const demoImage = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 520"><defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#342f39"/><stop offset="1" stop-color="#d8694d"/></linearGradient></defs><rect width="900" height="520" fill="url(#g)"/><circle cx="450" cy="150" r="72" fill="#fff" opacity=".82"/><path d="M80 440 Q260 240 440 420 T820 360 V520 H80Z" fill="#17181a" opacity=".82"/><g fill="#f6e8d8" opacity=".7"><circle cx="260" cy="390" r="12"/><circle cx="320" cy="408" r="10"/><circle cx="560" cy="390" r="12"/><circle cx="630" cy="420" r="10"/></g></svg>')}`;
let projects: Project[] = [{
  id: "browser-demo",
  name: "Yorushika 演出追踪",
  description: "持续整理 Yorushika 演出与售票相关的可信信息。",
  goal: "持续关注 Yorushika 的日本国内演唱会、海外巡演、官方公告与售票信息",
  focus: ["日本国内演唱会", "海外巡演", "官方公告", "售票信息"],
  updateFrequency: "daily",
  informationDepth: "standard",
  updateSelected: false,
  status: "active",
  createdAt: now,
  updatedAt: now,
  cardCount: 5,
  sourceCount: 3,
}];

let cards: Card[] = [
  {
    id: "demo-1", projectId: "browser-demo", type: "news", title: "大阪追加公演正式公布",
    content: "• 大阪城 Hall 追加公演已经官方确认。\n• 会员先行抽选本周开放。\n• 公开售票日期仍待公布。",
    imageUrl: demoImage,
    sourceUrl: "https://yorushika.com/", sourceName: "2 个来源", sourceLinks: [{ name: "Yorushika Official", url: "https://yorushika.com/" }, { name: "Lawson Ticket", url: "https://l-tike.com/" }], focusCategory: "日本国内演唱会", occurredAt: now, importance: 3, packId: "demo-update-pack", packOrder: 0,
    locked: false, updateBatchId: "demo-batch", updateBatchAt: now, changeKind: "none",
    position: { x: 96, y: 78 }, size: { width: 340, height: 310 }, createdAt: now, updatedAt: now,
  },
  {
    id: "demo-5", projectId: "browser-demo", type: "news", title: "会员先行抽选与售票状态",
    content: "• 会员先行抽选已经开放。\n• 一般售票日期仍待官方公布。",
    imageUrl: null,
    sourceUrl: "https://l-tike.com/", sourceName: "2 个来源", sourceLinks: [{ name: "Yorushika Official", url: "https://yorushika.com/" }, { name: "Lawson Ticket", url: "https://l-tike.com/" }], focusCategory: "售票信息", occurredAt: now, importance: 3, packId: "demo-update-pack", packOrder: 1,
    locked: false, updateBatchId: "demo-batch", updateBatchAt: now, changeKind: "conflict",
    position: { x: 96, y: 78 }, size: { width: 340, height: 310 }, createdAt: now, updatedAt: now,
  },
  {
    id: "demo-2", projectId: "browser-demo", type: "source", title: "Yorushika 官方网站",
    content: "网页监控\n检查频率：daily", sourceUrl: "https://yorushika.com/", sourceName: "官方网站",
    imageUrl: null, sourceLinks: [{ name: "官方网站", url: "https://yorushika.com/" }], focusCategory: null,
    occurredAt: null, importance: 1, packId: null, packOrder: 0, position: { x: 470, y: 124 }, size: { width: 300, height: 210 }, createdAt: now, updatedAt: now,
    locked: false, updateBatchId: null, updateBatchAt: null, changeKind: "none",
  },
  {
    id: "demo-3", projectId: "browser-demo", type: "analysis", title: "近 30 天观察",
    content: "官方活动发布频率上升，目前仍未发现新的海外巡演信息。\n\n可信度：中等",
    imageUrl: null,
    sourceUrl: null, sourceName: null, sourceLinks: [], focusCategory: null, occurredAt: null, importance: 2, packId: null, packOrder: 0,
    locked: false, updateBatchId: null, updateBatchAt: null, changeKind: "none",
    position: { x: 72, y: 520 }, size: { width: 340, height: 230 }, createdAt: now, updatedAt: now,
  },
  {
    id: "demo-4", projectId: "browser-demo", type: "timeline", title: "演出时间线",
    content: "2026.03  巡演首次公布\n2026.08  大阪追加场确认\n2026.10  大阪城 Hall",
    imageUrl: null,
    sourceUrl: null, sourceName: null, sourceLinks: [], focusCategory: null, occurredAt: null, importance: 2, packId: null, packOrder: 0,
    locked: false, updateBatchId: "demo-batch-previous", updateBatchAt: previousUpdate, changeKind: "none",
    position: { x: 470, y: 520 }, size: { width: 300, height: 220 }, createdAt: now, updatedAt: now,
  },
];

let sources: Source[] = [{
  id: "source-demo", projectId: "browser-demo", type: "web", name: "Yorushika 官方网站",
  platform: "website",
  url: "https://yorushika.com/", checkFrequency: "daily", lastCheckedAt: now, lastContentHash: "demo", lastContentExcerpt: null,
  status: "active", lastError: null, createdAt: now,
}, {
  id: "source-x", projectId: "browser-demo", type: "search", platform: "x", name: "Yorushika X",
  url: "https://x.com/nbuna_staff", checkFrequency: "daily", lastCheckedAt: now, lastContentHash: "demo-x", lastContentExcerpt: "Latest public posts",
  status: "active", lastError: null, createdAt: now,
}, {
  id: "source-youtube", projectId: "browser-demo", type: "search", platform: "youtube", name: "Yorushika YouTube",
  url: "https://youtube.com/@nbuna", checkFrequency: "daily", lastCheckedAt: now, lastContentHash: "demo-youtube", lastContentExcerpt: "Latest indexed videos",
  status: "active", lastError: null, createdAt: now,
}];

let candidates: SourceCandidate[] = [];
let taskRuns: TaskRun[] = [];
let changes: InformationChange[] = [{
  id: "demo-conflict",
  projectId: "browser-demo",
  cardId: "demo-5",
  previousCardId: "demo-1",
  updateBatchId: "demo-batch",
  kind: "conflict",
  title: "一般售票日期存在冲突",
  summary: "官方页面尚未公布日期，另一来源给出了未经确认的开票时间。",
  previousContent: "一般售票日期仍待官方公布。",
  currentContent: "另一来源称一般售票将于本周开放。",
  sourceUrl: "https://l-tike.com/",
  resolved: false,
  createdAt: now,
}];
let settings: AiSettings = {
  provider: "openai",
  protocol: "responses",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-5.6-luna",
  apiKeyConfigured: false,
  apiKeyHint: null,
  autoDiscoverSources: true,
  autoAddVerifiedSources: false,
  aiOrganizeContent: true,
  language: "system",
  maxUpdateBatches: 20,
  updatedAt: null,
};

function draftFromInput(input: CreateProjectInput) {
  const firstLine = input.prompt.split(/\r?\n/).find(Boolean)?.trim() || "新的信息项目";
  const focus = input.prompt.split(/\r?\n/)
    .map((line) => line.match(/^\s*[-*•]\s*(.+)$/)?.[1])
    .filter((item): item is string => Boolean(item));
  return {
    informationDepth: "standard" as const,
    name: input.name?.trim() || `${firstLine.replace(/[。！!]/g, "").slice(0, 28)}追踪`,
    description: "持续整理相关的可信信息。",
    goal: firstLine,
    focus: focus.length ? focus : ["官方公告", "相关新闻", "关键事件"],
    updateFrequency: /每周/.test(input.prompt) ? "weekly" as const : /每小时/.test(input.prompt) ? "hourly" as const : "daily" as const,
  };
}

function refreshProjectCounts(projectId: string): void {
  projects = projects.map((project) => project.id === projectId ? {
    ...project,
    cardCount: cards.filter((card) => card.projectId === projectId).length,
    sourceCount: sources.filter((source) => source.projectId === projectId).length,
    updatedAt: new Date().toISOString(),
  } : project);
}

const browserApi: ResearchBoardApi = {
  projects: {
    list: async () => [...projects],
    preview: async (input) => draftFromInput(input),
    create: async (input) => {
      const draft = input.draft ?? draftFromInput(input);
      const project: Project = {
        ...draft, name: input.name?.trim() || draft.name, informationDepth: normalizeInformationDepth(draft.informationDepth), updateSelected: false, id: crypto.randomUUID(), status: "active", createdAt: now, updatedAt: now,
        cardCount: 0, sourceCount: 0,
      };
      projects = [project, ...projects];
      return project;
    },
    remove: async (projectId) => {
      projects = projects.filter((project) => project.id !== projectId);
      cards = cards.filter((card) => card.projectId !== projectId);
      sources = sources.filter((source) => source.projectId !== projectId);
      candidates = candidates.filter((candidate) => candidate.projectId !== projectId);
      taskRuns = taskRuns.filter((run) => run.projectId !== projectId);
      changes = changes.filter((change) => change.projectId !== projectId);
    },
    update: async (input) => {
      const index = projects.findIndex((project) => project.id === input.id);
      if (index < 0) throw new Error("项目不存在");
      projects[index] = { ...projects[index], ...input, updatedAt: new Date().toISOString() };
      return projects[index];
    },
  },
  cards: {
    list: async (projectId) => cards.filter((card) => card.projectId === projectId),
    create: async (input) => {
      const card: Card = {
        id: crypto.randomUUID(), projectId: input.projectId, type: input.type, title: input.title,
        content: input.content, summary: input.summary ? summarizeCard(input.summary) : synthesisOverview({ summary: input.content }, /[\u4e00-\u9fff]/.test(input.content) ? "zh-CN" : "en"), images: normalizeCardImages(input.images), imageUrl: normalizeCardImages(input.images).find(image => image.relevance === "relevant")?.url ?? null, sourceUrl: input.sourceUrl ?? null, sourceName: input.sourceName ?? null,
        sourceLinks: input.sourceLinks ?? (input.sourceUrl ? [{ name: input.sourceName ?? input.sourceUrl, url: input.sourceUrl }] : []), focusCategory: input.focusCategory ?? null,
        occurredAt: input.occurredAt ?? null, importance: input.importance ?? 2, packId: null, packOrder: 0,
        locked: false, updateBatchId: input.updateBatchId ?? null, updateBatchAt: input.updateBatchAt ?? null,
        changeKind: input.changeKind ?? "none",
        position: input.position ?? { x: 80, y: 80 }, size: input.size ?? { width: 320, height: 220 },
        createdAt: now, updatedAt: now,
      };
      cards = [card, ...cards];
      refreshProjectCounts(input.projectId);
      return card;
    },
    updateLayout: async (input) => {
      const index = cards.findIndex((card) => card.id === input.id);
      if (index < 0) throw new Error("卡片不存在");
      const packId = cards[index].packId;
      cards = cards.map((card) => card.id === input.id || (packId && card.packId === packId)
        ? { ...card, position: input.position, size: input.size ?? card.size }
        : card);
      return cards.find((card) => card.id === input.id) as Card;
    },
    update: async (input) => {
      const index = cards.findIndex((card) => card.id === input.id);
      if (index < 0) throw new Error("卡片不存在");
      const textChanged = cards[index].content !== input.content || cards[index].title !== input.title;
      const images = (cards[index].images ?? []).map(image => textChanged ? { ...image, relevance: "unverified" as const } : image);
      cards[index] = { ...cards[index], ...input, images, imageUrl: textChanged ? null : cards[index].imageUrl, summary: synthesisOverview({ summary: input.content }, /[\u4e00-\u9fff]/.test(input.content) ? "zh-CN" : "en"), occurredAt: input.occurredAt ?? null, updatedAt: new Date().toISOString() };
      return cards[index];
    },
    setLocked: async (input) => {
      const index = cards.findIndex((card) => card.id === input.id);
      if (index < 0) throw new Error("卡片不存在");
      cards[index] = { ...cards[index], locked: input.locked, updatedAt: new Date().toISOString() };
      return cards[index];
    },
    pack: async ({ sourceCardId, targetCardId }) => {
      const source = cards.find((card) => card.id === sourceCardId);
      const target = cards.find((card) => card.id === targetCardId);
      if (!source || !target || source.projectId !== target.projectId) throw new Error("要打包的卡片不存在或不属于同一项目");
      if (source.updateBatchId !== target.updateBatchId) throw new Error("不同更新批次的卡片不能打包");
      if (source.id === target.id || (source.packId && source.packId === target.packId)) return cards.filter((card) => card.projectId === source.projectId);
      const packId = target.packId ?? crypto.randomUUID();
      const targetCards = cards.filter((card) => target.packId ? card.packId === target.packId : card.id === target.id).sort((a, b) => a.packOrder - b.packOrder);
      const sourceCards = cards.filter((card) => source.packId ? card.packId === source.packId : card.id === source.id).sort((a, b) => a.packOrder - b.packOrder);
      cards = cards.map((card) => {
        const targetIndex = targetCards.findIndex((item) => item.id === card.id);
        const sourceIndex = sourceCards.findIndex((item) => item.id === card.id);
        if (targetIndex >= 0) return { ...card, packId, packOrder: targetIndex, position: target.position, size: target.size };
        if (sourceIndex >= 0) return { ...card, packId, packOrder: targetCards.length + sourceIndex, position: target.position, size: target.size };
        return card;
      });
      return cards.filter((card) => card.projectId === source.projectId);
    },
    unpack: async (cardId) => {
      const current = cards.find((card) => card.id === cardId);
      if (!current?.packId) return current ? cards.filter((card) => card.projectId === current.projectId) : [];
      const packId = current.packId;
      cards = cards.map((card) => card.id === cardId ? { ...card, packId: null, packOrder: 0, position: { x: card.position.x + 52, y: card.position.y + 52 } } : card);
      const remaining = cards.filter((card) => card.packId === packId).sort((a, b) => a.packOrder - b.packOrder);
      cards = cards.map((card) => {
        const index = remaining.findIndex((item) => item.id === card.id);
        if (index < 0) return card;
        return remaining.length === 1 ? { ...card, packId: null, packOrder: 0 } : { ...card, packOrder: index };
      });
      return cards.filter((card) => card.projectId === current.projectId);
    },
    unpackAll: async (packId) => {
      const packed = cards.filter((card) => card.packId === packId).sort((a, b) => a.packOrder - b.packOrder);
      if (!packed.length) throw new Error("卡包不存在");
      const origin = packed[0].position;
      cards = cards.map((card) => {
        const index = packed.findIndex((item) => item.id === card.id);
        return index < 0 ? card : { ...card, packId: null, packOrder: 0, position: { x: origin.x + (index % 3) * 44, y: origin.y + Math.floor(index / 3) * 44 } };
      });
      return cards.filter((card) => card.projectId === packed[0].projectId);
    },
    remove: async (cardId) => {
      const removed = cards.find((card) => card.id === cardId);
      const projectId = removed?.projectId;
      cards = cards.filter((card) => card.id !== cardId);
      if (removed?.packId) {
        const remaining = cards.filter((card) => card.packId === removed.packId).sort((a, b) => a.packOrder - b.packOrder);
        cards = cards.map((card) => {
          const index = remaining.findIndex((item) => item.id === card.id);
          if (index < 0) return card;
          return remaining.length === 1 ? { ...card, packId: null, packOrder: 0 } : { ...card, packOrder: index };
        });
      }
      if (projectId) refreshProjectCounts(projectId);
    },
  },
  sources: {
    list: async (projectId) => sources.filter((source) => source.projectId === projectId),
    create: async (input) => {
      const source: Source = {
        id: crypto.randomUUID(), projectId: input.projectId, type: input.type, name: input.name, url: input.url,
        platform: input.platform ?? inferSourcePlatform(input.url, input.type),
        checkFrequency: input.checkFrequency ?? "daily", lastCheckedAt: null, lastContentHash: null, lastContentExcerpt: null,
        status: "active", lastError: null, createdAt: now,
      };
      sources = [source, ...sources];
      refreshProjectCounts(input.projectId);
      return source;
    },
    update: async (input) => {
      const index = sources.findIndex((source) => source.id === input.id);
      if (index < 0) throw new Error("信息源不存在");
      sources[index] = { ...sources[index], ...input, lastError: input.status === "active" ? null : sources[index].lastError };
      return sources[index];
    },
    remove: async (sourceId) => {
      const projectId = sources.find((source) => source.id === sourceId)?.projectId;
      sources = sources.filter((source) => source.id !== sourceId);
      if (projectId) refreshProjectCounts(projectId);
    },
  },
  discovery: {
    list: async (projectId) => candidates.filter((candidate) => candidate.projectId === projectId && candidate.status === "pending"),
    run: async (projectId) => {
      const project = projects.find((item) => item.id === projectId);
      if (!project) throw new Error("项目不存在");
      candidates = candidates.filter((candidate) => candidate.projectId !== projectId);
      return {
        runId: crypto.randomUUID(),
        projectId,
        mode: "offline",
        candidates: [],
        automaticallyAdded: 0,
        warnings: [`“${project.name}”尚未执行网络搜索：网页预览模式不连接来源发现服务，请使用桌面客户端。`],
      };
    },
    accept: async ({ projectId, candidateIds }) => {
      const selected = candidates.filter((candidate) => candidate.projectId === projectId && candidateIds.includes(candidate.id));
      const added: Source[] = selected.map((candidate) => ({
        id: crypto.randomUUID(), projectId, type: candidate.type, platform: candidate.platform, name: candidate.name, url: candidate.url,
        checkFrequency: projects.find((project) => project.id === projectId)?.updateFrequency ?? "daily",
        lastCheckedAt: null, lastContentHash: null, lastContentExcerpt: null, status: "active", lastError: null, createdAt: now,
      }));
      sources = [...added, ...sources];
      candidates = candidates.filter((candidate) => !candidateIds.includes(candidate.id));
      refreshProjectCounts(projectId);
      return { added, skipped: selected.length - added.length };
    },
    dismiss: async (candidateId) => { candidates = candidates.filter((candidate) => candidate.id !== candidateId); },
  },
  settings: {
    get: async () => ({ ...settings }),
    save: async (input) => {
      settings = {
        provider: input.provider,
        protocol: input.provider === "openai" ? "responses" : input.protocol,
        baseUrl: input.provider === "openai" ? "https://api.openai.com/v1" : input.baseUrl,
        model: input.model,
        apiKeyConfigured: input.clearApiKey ? false : Boolean(input.apiKey?.trim()) || settings.apiKeyConfigured,
        apiKeyHint: input.clearApiKey ? null : input.apiKey?.trim() ? input.apiKey.trim().slice(-4) : settings.apiKeyHint,
        autoDiscoverSources: input.autoDiscoverSources,
        autoAddVerifiedSources: input.autoAddVerifiedSources,
        aiOrganizeContent: input.aiOrganizeContent !== false,
        language: input.language,
        maxUpdateBatches: input.maxUpdateBatches,
        updatedAt: new Date().toISOString(),
      };
      return { ...settings };
    },
    test: async () => { throw new Error("网页预览模式不连接 API，请在桌面客户端中测试连接"); },
  },
  updates: {
    onChanged: () => () => {},
    select: async (projectIds) => {
      if (!Array.isArray(projectIds) || projectIds.some((id) => typeof id !== "string" || !projects.some((project) => project.id === id))) throw new Error("选中的项目不存在");
      const selected = new Set(projectIds);
      projects = projects.map((project) => ({ ...project, updateSelected: selected.has(project.id) }));
      return [...projects];
    },
    run: async (projectId) => {
      const project = projects.find((item) => item.id === projectId);
      if (!project) throw new Error("项目不存在");
      if (!project.updateSelected) throw new Error("请先勾选项目，再执行更新");
      const runId = crypto.randomUUID();
      const checkedSources = sources.filter((source) => source.projectId === projectId && source.status !== "paused").length;
      const finishedAt = new Date().toISOString();
      taskRuns = [{ id: runId, projectId, kind: "update", status: "completed", startedAt: finishedAt, finishedAt, checkedSources, newCards: 0, errors: [], warnings: [], summary: "网页预览完成模拟检查" }, ...taskRuns];
      return { runId, projectId, checkedSources, newCards: 0, errors: [], warnings: [], finishedAt };
    },
    history: async (projectId) => taskRuns.filter((run) => run.projectId === projectId),
  },
  changes: {
    list: async (projectId) => changes.filter((change) => change.projectId === projectId),
    resolve: async (changeId) => {
      changes = changes.map((change) => change.id === changeId ? { ...change, resolved: true } : change);
    },
  },
  links: {
    open: async (url) => { window.open(url, "_blank", "noopener,noreferrer"); },
  },
  maintenance: {
    createBackup: async () => ({ path: "浏览器预览/backup.sqlite", createdAt: new Date().toISOString(), sizeBytes: 0 }),
    openDataFolder: async () => { throw new Error("请在桌面客户端中打开数据目录"); },
  },
  startup: {
    get: async () => ({ enabled: false, supported: false, requiresApproval: false, unavailableReason: "browser" }),
    set: async () => { throw new Error("请在正式桌面客户端中设置自启动 / Use the packaged desktop app"); },
  },
};

function disconnectedDesktopApi(): ResearchBoardApi {
  const unavailable = () => Promise.reject(new Error("桌面后台未连接，请重新下载完整免安装版并解压全部文件"));
  const group = new Proxy({}, { get: () => unavailable });
  return new Proxy({}, { get: () => group }) as ResearchBoardApi;
}

export const api: ResearchBoardApi = window.researchBoard
  ?? (window.location.protocol === "file:" ? disconnectedDesktopApi() : browserApi);
