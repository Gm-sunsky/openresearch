export type InformationDepth = "focused" | "standard" | "deep";
export type ProjectStatus = "active" | "paused";
export type UpdateFrequency = "hourly" | "daily" | "weekly";
export type CardType = "news" | "source" | "event" | "timeline" | "analysis" | "note";
export type SourceType = "rss" | "web" | "search";
export type SourcePlatform = "rss" | "website" | "x" | "instagram" | "youtube" | "bilibili" | "forum" | "personal";
export type SourceStatus = "active" | "error" | "paused";
export type ApiProvider = "openai" | "openai-compatible";
export type ApiProtocol = "responses" | "chat-completions";
export type CandidateStatus = "pending" | "accepted" | "dismissed";
export type TaskKind = "update" | "discovery";
export type TaskStatus = "running" | "completed" | "partial" | "failed";
export type AppLanguage = "system" | "zh-CN" | "en" | "ru" | "fr" | "de" | "ja" | "ko";
export type InformationChangeKind = "none" | "updated" | "conflict";

export interface Project {
  informationDepth?: InformationDepth;
  updateSelected?: boolean;
  id: string;
  name: string;
  description: string;
  goal: string;
  focus: string[];
  updateFrequency: UpdateFrequency;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  cardCount: number;
  sourceCount: number;
}

export interface ProjectDraft {
  informationDepth?: InformationDepth;
  name: string;
  description: string;
  goal: string;
  focus: string[];
  updateFrequency: UpdateFrequency;
}

export interface CreateProjectInput {
  prompt: string;
  name?: string;
  draft?: ProjectDraft;
}

export interface UpdateProjectInput {
  informationDepth?: InformationDepth;
  id: string;
  name: string;
  description: string;
  goal: string;
  focus: string[];
  updateFrequency: UpdateFrequency;
  status: ProjectStatus;
}

export interface CardSourceLink {
  name: string;
  url: string;
}

export interface Card {
  id: string;
  projectId: string;
  type: CardType;
  title: string;
  content: string;
  imageUrl: string | null;
  sourceUrl: string | null;
  sourceName: string | null;
  sourceLinks: CardSourceLink[];
  focusCategory: string | null;
  occurredAt: string | null;
  importance: number;
  locked: boolean;
  updateBatchId: string | null;
  updateBatchAt: string | null;
  changeKind: InformationChangeKind;
  packId: string | null;
  packOrder: number;
  position: { x: number; y: number };
  size: { width: number; height: number };
  createdAt: string;
  updatedAt: string;
}

export interface CreateCardInput {
  projectId: string;
  type: CardType;
  title: string;
  content: string;
  imageUrl?: string | null;
  sourceUrl?: string | null;
  sourceName?: string | null;
  sourceLinks?: CardSourceLink[];
  sourceFingerprint?: string | null;
  focusCategory?: string | null;
  occurredAt?: string | null;
  importance?: number;
  updateBatchId?: string | null;
  updateBatchAt?: string | null;
  changeKind?: InformationChangeKind;
  position?: { x: number; y: number };
  size?: { width: number; height: number };
}

export interface CardLayoutInput {
  id: string;
  position: { x: number; y: number };
  size?: { width: number; height: number };
}

export interface UpdateCardInput {
  id: string;
  type: CardType;
  title: string;
  content: string;
  occurredAt?: string | null;
  importance: number;
}

export interface PackCardsInput {
  sourceCardId: string;
  targetCardId: string;
}

export interface SetCardLockedInput {
  id: string;
  locked: boolean;
}

export interface InformationChange {
  id: string;
  projectId: string;
  cardId: string;
  previousCardId: string | null;
  updateBatchId: string | null;
  kind: Exclude<InformationChangeKind, "none">;
  title: string;
  summary: string;
  previousContent: string | null;
  currentContent: string;
  sourceUrl: string | null;
  resolved: boolean;
  createdAt: string;
}

export interface Source {
  id: string;
  projectId: string;
  type: SourceType;
  platform: SourcePlatform;
  name: string;
  url: string;
  checkFrequency: UpdateFrequency;
  lastCheckedAt: string | null;
  lastContentHash: string | null;
  lastContentExcerpt: string | null;
  status: SourceStatus;
  lastError: string | null;
  createdAt: string;
}

export interface CreateSourceInput {
  projectId: string;
  type: SourceType;
  platform?: SourcePlatform;
  name: string;
  url: string;
  checkFrequency?: UpdateFrequency;
}

export interface UpdateSourceInput {
  id: string;
  name?: string;
  checkFrequency?: UpdateFrequency;
  status?: SourceStatus;
}

export interface TaskRun {
  id: string;
  projectId: string;
  kind: TaskKind;
  status: TaskStatus;
  startedAt: string;
  finishedAt: string | null;
  checkedSources: number;
  newCards: number;
  errors: string[];
  warnings: string[];
  summary: string | null;
}

export interface UpdateRunResult {
  runId: string;
  projectId: string;
  checkedSources: number;
  newCards: number;
  errors: string[];
  warnings: string[];
  finishedAt: string;
}

export interface AiSettings {
  provider: ApiProvider;
  protocol: ApiProtocol;
  baseUrl: string;
  model: string;
  apiKeyConfigured: boolean;
  apiKeyHint: string | null;
  autoDiscoverSources: boolean;
  autoAddVerifiedSources: boolean;
  aiOrganizeContent: boolean;
  language: AppLanguage;
  maxUpdateBatches: number;
  updatedAt: string | null;
}

export interface SaveAiSettingsInput {
  provider: ApiProvider;
  protocol: ApiProtocol;
  baseUrl: string;
  model: string;
  apiKey?: string;
  clearApiKey?: boolean;
  autoDiscoverSources: boolean;
  autoAddVerifiedSources: boolean;
  aiOrganizeContent?: boolean;
  language: AppLanguage;
  maxUpdateBatches: number;
}

export interface ApiConnectionResult {
  ok: boolean;
  message: string;
  model: string;
  latencyMs: number;
}

export interface SourceCandidate {
  id: string;
  projectId: string;
  type: SourceType;
  platform: SourcePlatform;
  name: string;
  url: string;
  rationale: string;
  confidence: number;
  verified: boolean;
  discoveredBy: "ai" | "page" | "search";
  status: CandidateStatus;
  createdAt: string;
}

export interface SourceDiscoveryResult {
  runId: string;
  projectId: string;
  mode: "ai-web" | "ai" | "search" | "page" | "offline";
  candidates: SourceCandidate[];
  automaticallyAdded: number;
  warnings: string[];
}

export interface AcceptSourceCandidatesInput {
  projectId: string;
  candidateIds: string[];
}

export interface AcceptSourceCandidatesResult {
  added: Source[];
  skipped: number;
}

export interface BackupResult {
  path: string;
  createdAt: string;
  sizeBytes: number;
}

export interface ResearchBoardApi {
  projects: {
    list(): Promise<Project[]>;
    create(input: CreateProjectInput): Promise<Project>;
    remove(projectId: string): Promise<void>;
    preview(input: CreateProjectInput): Promise<ProjectDraft>;
    update(input: UpdateProjectInput): Promise<Project>;
  };
  cards: {
    list(projectId: string): Promise<Card[]>;
    create(input: CreateCardInput): Promise<Card>;
    updateLayout(input: CardLayoutInput): Promise<Card>;
    update(input: UpdateCardInput): Promise<Card>;
    setLocked(input: SetCardLockedInput): Promise<Card>;
    pack(input: PackCardsInput): Promise<Card[]>;
    unpack(cardId: string): Promise<Card[]>;
    unpackAll(packId: string): Promise<Card[]>;
    remove(cardId: string): Promise<void>;
  };
  sources: {
    list(projectId: string): Promise<Source[]>;
    create(input: CreateSourceInput): Promise<Source>;
    update(input: UpdateSourceInput): Promise<Source>;
    remove(sourceId: string): Promise<void>;
  };
  discovery: {
    list(projectId: string): Promise<SourceCandidate[]>;
    run(projectId: string): Promise<SourceDiscoveryResult>;
    accept(input: AcceptSourceCandidatesInput): Promise<AcceptSourceCandidatesResult>;
    dismiss(candidateId: string): Promise<void>;
  };
  settings: {
    get(): Promise<AiSettings>;
    save(input: SaveAiSettingsInput): Promise<AiSettings>;
    test(input: SaveAiSettingsInput): Promise<ApiConnectionResult>;
  };
  updates: {
    select(projectIds: string[]): Promise<Project[]>;
    run(projectId: string): Promise<UpdateRunResult>;
    history(projectId: string): Promise<TaskRun[]>;
  };
  changes: {
    list(projectId: string): Promise<InformationChange[]>;
    resolve(changeId: string): Promise<void>;
  };
  links: {
    open(url: string): Promise<void>;
  };
  maintenance: {
    createBackup(): Promise<BackupResult>;
    openDataFolder(): Promise<void>;
  };
}

export const IPC_CHANNELS = {
  projectsList: "projects:list",
  projectsCreate: "projects:create",
  projectsRemove: "projects:remove",
  projectsPreview: "projects:preview",
  projectsUpdate: "projects:update",
  cardsList: "cards:list",
  cardsCreate: "cards:create",
  cardsUpdateLayout: "cards:update-layout",
  cardsUpdate: "cards:update",
  cardsSetLocked: "cards:set-locked",
  cardsPack: "cards:pack",
  cardsUnpack: "cards:unpack",
  cardsUnpackAll: "cards:unpack-all",
  cardsRemove: "cards:remove",
  sourcesList: "sources:list",
  sourcesCreate: "sources:create",
  sourcesUpdate: "sources:update",
  sourcesRemove: "sources:remove",
  discoveryList: "discovery:list",
  discoveryRun: "discovery:run",
  discoveryAccept: "discovery:accept",
  discoveryDismiss: "discovery:dismiss",
  settingsGet: "settings:get",
  settingsSave: "settings:save",
  settingsTest: "settings:test",
  updatesSelect: "updates:select",
  updatesRun: "updates:run",
  updatesHistory: "updates:history",
  changesList: "changes:list",
  changesResolve: "changes:resolve",
  linksOpen: "links:open",
  maintenanceBackup: "maintenance:backup",
  maintenanceOpenData: "maintenance:open-data",
} as const;
