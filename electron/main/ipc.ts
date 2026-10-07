import { normalizeCardImages } from "../../src/shared/card-presentation";
import { ipcMain, shell } from "electron";
import type {
  AcceptSourceCandidatesInput,
  CardLayoutInput,
  CardType,
  CreateCardInput,
  CreateProjectInput,
  CreateSourceInput,
  PackCardsInput,
  ProjectDraft,
  SaveAiSettingsInput,
  SourceStatus,
  SourcePlatform,
  SourceType,
  UpdateCardInput,
  UpdateProjectInput,
  UpdateSourceInput,
  AppLanguage,
} from "../../src/shared/contracts";
import { IPC_CHANNELS } from "../../src/shared/contracts";
import { AiApiClient } from "./ai-client";
import { ApiSettingsService } from "./api-settings";
import { ResearchDatabase } from "./database";
import { FeedService } from "./feed-service";
import { generateProjectDraft } from "./project-generator";
import { SourceDiscoveryAgent } from "./source-discovery";
import { normalizeSourcePlatform } from "../../src/shared/source-platform";

import { normalizeInformationDepth } from "../../src/shared/information-depth";

function requiredString(value: unknown, label: string, maxLength = 2_000): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label}不能为空`);
  return value.trim().slice(0, maxLength);
}

function optionalString(value: unknown, maxLength = 2_000): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new Error("文本格式无效");
  return value.trim().slice(0, maxLength);
}

function safeNumber(value: unknown, fallback: number, min = -10_000, max = 50_000): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function safeHttpUrl(value: unknown): string {
  const raw = requiredString(value, "URL", 2_048);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("请输入有效的网址");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("仅支持 HTTP 或 HTTPS 地址");
  return url.toString();
}

function normalizeProjectInput(value: unknown): CreateProjectInput {
  if (!value || typeof value !== "object") throw new Error("项目参数无效");
  const input = value as Record<string, unknown>;
  const draftValue = input.draft && typeof input.draft === "object" ? input.draft as Record<string, unknown> : null;
  const focus = draftValue && Array.isArray(draftValue.focus)
    ? draftValue.focus.map((item) => requiredString(item, "关注项", 80)).slice(0, 20)
    : [];
  const draft: ProjectDraft | undefined = draftValue ? {
    informationDepth: normalizeInformationDepth(draftValue.informationDepth),
    name: requiredString(draftValue.name, "项目名称", 80),
    description: requiredString(draftValue.description, "项目描述", 500),
    goal: requiredString(draftValue.goal, "项目目标", 2_000),
    focus: focus.length ? focus : ["官方公告", "关键变化"],
    updateFrequency: draftValue.updateFrequency === "hourly" || draftValue.updateFrequency === "weekly" ? draftValue.updateFrequency : "daily",
  } : undefined;
  return {
    prompt: requiredString(input.prompt, "项目描述", 4_000),
    name: optionalString(input.name, 48),
    draft,
  };
}

function normalizeCardInput(value: unknown): CreateCardInput {
  if (!value || typeof value !== "object") throw new Error("卡片参数无效");
  const input = value as Record<string, unknown>;
  const allowedTypes = new Set<CardType>(["news", "source", "event", "timeline", "analysis", "note"]);
  if (!allowedTypes.has(input.type as CardType)) throw new Error("不支持的卡片类型");
  const position = input.position as Record<string, unknown> | undefined;
  const size = input.size as Record<string, unknown> | undefined;
  return {
    projectId: requiredString(input.projectId, "项目 ID", 80),
    type: input.type as CardType,
    title: requiredString(input.title, "卡片标题", 160),
    content: requiredString(input.content, "卡片内容", 8_000),
    images: normalizeCardImages(input.images),
    imageUrl: input.imageUrl ? safeHttpUrl(input.imageUrl) : null,
    sourceUrl: input.sourceUrl ? safeHttpUrl(input.sourceUrl) : null,
    sourceName: optionalString(input.sourceName, 120) ?? null,
    occurredAt: optionalString(input.occurredAt, 80) ?? null,
    importance: safeNumber(input.importance, 2, 1, 3),
    position: position
      ? { x: safeNumber(position.x, 80), y: safeNumber(position.y, 80) }
      : undefined,
    size: size ? {
      width: safeNumber(size.width, 320, 240, 640),
      height: safeNumber(size.height, 220, 170, 620),
    } : undefined,
  };
}

function normalizeProjectUpdate(value: unknown): UpdateProjectInput {
  if (!value || typeof value !== "object") throw new Error("项目设置参数无效");
  const input = value as Record<string, unknown>;
  const focus = Array.isArray(input.focus)
    ? input.focus.map((item) => requiredString(item, "关注项", 80)).slice(0, 20)
    : [];
  if (!focus.length) throw new Error("请至少保留一个关注项");
  return {
    informationDepth: input.informationDepth === undefined ? undefined : normalizeInformationDepth(input.informationDepth),
    id: requiredString(input.id, "项目 ID", 80),
    name: requiredString(input.name, "项目名称", 80),
    description: requiredString(input.description, "项目描述", 500),
    goal: requiredString(input.goal, "项目目标", 2_000),
    focus,
    updateFrequency: input.updateFrequency === "hourly" || input.updateFrequency === "weekly" ? input.updateFrequency : "daily",
    status: input.status === "paused" ? "paused" : "active",
  };
}

function normalizeCardUpdate(value: unknown): UpdateCardInput {
  if (!value || typeof value !== "object") throw new Error("卡片参数无效");
  const input = value as Record<string, unknown>;
  const allowedTypes = new Set<CardType>(["news", "source", "event", "timeline", "analysis", "note"]);
  if (!allowedTypes.has(input.type as CardType)) throw new Error("不支持的卡片类型");
  return {
    id: requiredString(input.id, "卡片 ID", 80),
    type: input.type as CardType,
    title: requiredString(input.title, "卡片标题", 160),
    content: requiredString(input.content, "卡片内容", 8_000),
    occurredAt: optionalString(input.occurredAt, 80) ?? null,
    importance: safeNumber(input.importance, 2, 1, 3),
  };
}

function normalizePackInput(value: unknown): PackCardsInput {
  if (!value || typeof value !== "object") throw new Error("卡片打包参数无效");
  const input = value as Record<string, unknown>;
  return {
    sourceCardId: requiredString(input.sourceCardId, "上层卡片 ID", 80),
    targetCardId: requiredString(input.targetCardId, "下层卡片 ID", 80),
  };
}

function normalizeLayoutInput(value: unknown): CardLayoutInput {
  if (!value || typeof value !== "object") throw new Error("布局参数无效");
  const input = value as Record<string, unknown>;
  const position = input.position as Record<string, unknown> | undefined;
  const size = input.size as Record<string, unknown> | undefined;
  if (!position) throw new Error("缺少卡片坐标");
  return {
    id: requiredString(input.id, "卡片 ID", 80),
    position: { x: safeNumber(position.x, 0), y: safeNumber(position.y, 0) },
    size: size ? {
      width: safeNumber(size.width, 320, 240, 640),
      height: safeNumber(size.height, 220, 170, 620),
    } : undefined,
  };
}

function normalizeSourceInput(value: unknown): CreateSourceInput {
  if (!value || typeof value !== "object") throw new Error("信息源参数无效");
  const input = value as Record<string, unknown>;
  const type = input.type as SourceType;
  if (type !== "rss" && type !== "web" && type !== "search") throw new Error("不支持的信息源类型");
  const url = safeHttpUrl(input.url);
  return {
    projectId: requiredString(input.projectId, "项目 ID", 80),
    type,
    platform: normalizeSourcePlatform(input.platform as SourcePlatform, url, type),
    name: requiredString(input.name, "信息源名称", 120),
    url,
    checkFrequency: input.checkFrequency === "hourly" || input.checkFrequency === "weekly"
      ? input.checkFrequency
      : "daily",
  };
}

function normalizeSourceUpdate(value: unknown): UpdateSourceInput {
  if (!value || typeof value !== "object") throw new Error("信息源参数无效");
  const input = value as Record<string, unknown>;
  const statuses = new Set<SourceStatus>(["active", "error", "paused"]);
  const frequency = input.checkFrequency === "hourly" || input.checkFrequency === "daily" || input.checkFrequency === "weekly"
    ? input.checkFrequency
    : undefined;
  return {
    id: requiredString(input.id, "信息源 ID", 80),
    name: optionalString(input.name, 120),
    checkFrequency: frequency,
    status: statuses.has(input.status as SourceStatus) ? input.status as SourceStatus : undefined,
  };
}

function normalizeSettingsInput(value: unknown): SaveAiSettingsInput {
  if (!value || typeof value !== "object") throw new Error("API 设置参数无效");
  const input = value as Record<string, unknown>;
  const provider = input.provider === "openai-compatible" ? "openai-compatible" : "openai";
  const protocol = input.protocol === "chat-completions" ? "chat-completions" : "responses";
  const languages = new Set<AppLanguage>(["system", "zh-CN", "en", "ru", "fr", "de", "ja", "ko"]);
  return {
    provider,
    protocol,
    baseUrl: requiredString(input.baseUrl, "API 地址", 500),
    model: requiredString(input.model, "模型名称", 120),
    apiKey: optionalString(input.apiKey, 1_000),
    clearApiKey: input.clearApiKey === true,
    autoDiscoverSources: input.autoDiscoverSources !== false,
    autoAddVerifiedSources: input.autoAddVerifiedSources === true,
    aiOrganizeContent: input.aiOrganizeContent !== false,
    language: languages.has(input.language as AppLanguage) ? input.language as AppLanguage : "system",
    maxUpdateBatches: safeNumber(input.maxUpdateBatches, 20, 1, 200),
  };
}

function normalizeAcceptInput(value: unknown): AcceptSourceCandidatesInput {
  if (!value || typeof value !== "object") throw new Error("来源候选参数无效");
  const input = value as Record<string, unknown>;
  if (!Array.isArray(input.candidateIds)) throw new Error("请选择要添加的来源");
  return {
    projectId: requiredString(input.projectId, "项目 ID", 80),
    candidateIds: input.candidateIds.map((id) => requiredString(id, "候选 ID", 80)).slice(0, 20),
  };
}

export function registerIpcHandlers(
  database: ResearchDatabase,
  feeds: FeedService,
  settings: ApiSettingsService,
  ai: AiApiClient,
  discovery: SourceDiscoveryAgent,
): void {
  const resolveProjectDraft = async (input: CreateProjectInput): Promise<ProjectDraft> => {
    const fallback = generateProjectDraft(input);
    if (input.draft) return { ...input.draft, name: input.name?.trim() || input.draft.name };
    if (!ai.isConfigured()) return fallback;
    try {
      return await ai.generateProjectDraft(input, fallback);
    } catch (error) {
      console.warn("AI project generation failed; using local rules", error);
      return fallback;
    }
  };
  ipcMain.handle(IPC_CHANNELS.projectsList, () => database.listProjects());
  ipcMain.handle(IPC_CHANNELS.projectsPreview, (_event, value: unknown) => resolveProjectDraft(normalizeProjectInput(value)));
  ipcMain.handle(IPC_CHANNELS.projectsCreate, async (_event, value: unknown) => {
    const input = normalizeProjectInput(value);
    return database.createProject(await resolveProjectDraft(input));
  });
  ipcMain.handle(IPC_CHANNELS.projectsUpdate, (_event, value: unknown) => database.updateProject(normalizeProjectUpdate(value)));
  ipcMain.handle(IPC_CHANNELS.projectsRemove, (_event, value: unknown) => database.deleteProject(requiredString(value, "项目 ID", 80)));

  ipcMain.handle(IPC_CHANNELS.cardsList, (_event, value: unknown) => database.listCards(requiredString(value, "项目 ID", 80)));
  ipcMain.handle(IPC_CHANNELS.cardsCreate, (_event, value: unknown) => database.createCard(normalizeCardInput(value)));
  ipcMain.handle(IPC_CHANNELS.cardsUpdateLayout, (_event, value: unknown) => database.updateCardLayout(normalizeLayoutInput(value)));
  ipcMain.handle(IPC_CHANNELS.cardsUpdate, (_event, value: unknown) => database.updateCard(normalizeCardUpdate(value)));
  ipcMain.handle(IPC_CHANNELS.cardsSetLocked, (_event, value: unknown) => {
    if (!value || typeof value !== "object") throw new Error("卡片锁定参数无效");
    const input = value as Record<string, unknown>;
    return database.setCardLocked(requiredString(input.id, "卡片 ID", 80), input.locked === true);
  });
  ipcMain.handle(IPC_CHANNELS.cardsPack, (_event, value: unknown) => database.packCards(normalizePackInput(value)));
  ipcMain.handle(IPC_CHANNELS.cardsUnpack, (_event, value: unknown) => database.unpackCard(requiredString(value, "卡片 ID", 80)));
  ipcMain.handle(IPC_CHANNELS.cardsUnpackAll, (_event, value: unknown) => database.unpackAllCards(requiredString(value, "卡包 ID", 80)));
  ipcMain.handle(IPC_CHANNELS.cardsRemove, (_event, value: unknown) => database.deleteCard(requiredString(value, "卡片 ID", 80)));

  ipcMain.handle(IPC_CHANNELS.sourcesList, (_event, value: unknown) => database.listSources(requiredString(value, "项目 ID", 80)));
  ipcMain.handle(IPC_CHANNELS.sourcesCreate, (_event, value: unknown) => {
    const source = database.createSource(normalizeSourceInput(value));
    database.createCardIfNew({
      projectId: source.projectId,
      type: "source",
      title: source.name,
      content: `${source.type === "rss" ? "RSS 订阅" : source.type === "search" ? "新媒体搜索监控" : "网页监控"}\n检查频率：${source.checkFrequency}`,
      sourceUrl: source.url,
      sourceName: source.name,
      importance: 1,
      position: { x: 820, y: 360 + database.listSources(source.projectId).length * 48 },
    });
    return source;
  });
  ipcMain.handle(IPC_CHANNELS.sourcesUpdate, (_event, value: unknown) => database.updateSource(normalizeSourceUpdate(value)));
  ipcMain.handle(IPC_CHANNELS.sourcesRemove, (_event, value: unknown) => database.deleteSource(requiredString(value, "信息源 ID", 80)));

  ipcMain.handle(IPC_CHANNELS.discoveryList, (_event, value: unknown) => discovery.list(requiredString(value, "项目 ID", 80)));
  ipcMain.handle(IPC_CHANNELS.discoveryRun, (_event, value: unknown) => discovery.run(requiredString(value, "项目 ID", 80)));
  ipcMain.handle(IPC_CHANNELS.discoveryAccept, (_event, value: unknown) => {
    const input = normalizeAcceptInput(value);
    return discovery.accept(input.projectId, input.candidateIds);
  });
  ipcMain.handle(IPC_CHANNELS.discoveryDismiss, (_event, value: unknown) => discovery.dismiss(requiredString(value, "候选 ID", 80)));

  ipcMain.handle(IPC_CHANNELS.settingsGet, () => settings.get());
  ipcMain.handle(IPC_CHANNELS.settingsSave, (_event, value: unknown) => settings.save(normalizeSettingsInput(value)));
  ipcMain.handle(IPC_CHANNELS.settingsTest, (_event, value: unknown) => ai.test(normalizeSettingsInput(value)));

  ipcMain.handle(IPC_CHANNELS.updatesSelect, (_event, value: unknown) => {
    if (!Array.isArray(value) || value.length > 1000) throw new Error("请选择有效的更新项目");
    return database.selectUpdateProjects(value.map((id) => requiredString(id, "项目 ID", 80)));
  });
  ipcMain.handle(IPC_CHANNELS.updatesRun, (_event, value: unknown) => {
    const projectId = requiredString(value, "项目 ID", 80);
    const project = database.getProject(projectId);
    if (!project) throw new Error("项目不存在");
    if (project.updateSelected !== true) throw new Error("请先勾选需要更新的项目");
    return feeds.runProject(projectId);
  });
  ipcMain.handle(IPC_CHANNELS.updatesHistory, (_event, value: unknown) => database.listTaskRuns(requiredString(value, "项目 ID", 80)));
  ipcMain.handle(IPC_CHANNELS.changesList, (_event, value: unknown) => database.listInformationChanges(requiredString(value, "项目 ID", 80)));
  ipcMain.handle(IPC_CHANNELS.changesResolve, (_event, value: unknown) => database.resolveInformationChange(requiredString(value, "变化记录 ID", 80)));
  ipcMain.handle(IPC_CHANNELS.linksOpen, async (_event, value: unknown) => {
    const url = safeHttpUrl(value);
    await shell.openExternal(url);
  });
  ipcMain.handle(IPC_CHANNELS.maintenanceBackup, () => database.createBackup());
  ipcMain.handle(IPC_CHANNELS.maintenanceOpenData, async () => {
    const result = await shell.openPath(database.getDataDirectory());
    if (result) throw new Error(`无法打开数据目录：${result}`);
  });
}
