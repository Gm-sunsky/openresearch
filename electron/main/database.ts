import { synthesisOverview } from "../../src/shared/synthesis-preview";
import { normalizeCardImages, summarizeCard } from "../../src/shared/card-presentation";
import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import type {
  Card,
  CardSourceLink,
  BackupResult,
  CardLayoutInput,
  PackCardsInput,
  CreateCardInput,
  CreateSourceInput,
  Project,
  ProjectDraft,
  Source,
  SourceCandidate,
  SourceStatus,
  TaskKind,
  TaskRun,
  TaskStatus,
  UpdateCardInput,
  UpdateFrequency,
  UpdateProjectInput,
  UpdateSourceInput,
  InformationChange,
} from "../../src/shared/contracts";
import { inferSourcePlatform, normalizeSourcePlatform } from "../../src/shared/source-platform";

import { normalizeInformationDepth } from "../../src/shared/information-depth";

type SqlValue = string | number | Uint8Array | null;
type SqlParams = Record<string, SqlValue>;
type Row = Record<string, SqlValue>;

const SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  goal TEXT NOT NULL DEFAULT '',
  focus_json TEXT NOT NULL DEFAULT '[]',
  update_frequency TEXT NOT NULL DEFAULT 'daily',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'website',
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  check_frequency TEXT NOT NULL DEFAULT 'daily',
  last_checked_at TEXT,
  last_content_hash TEXT,
  last_content_excerpt TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  last_error TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(project_id, url)
);

CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  source_url TEXT,
  source_name TEXT,
  source_links_json TEXT NOT NULL DEFAULT '[]',
  source_fingerprint TEXT,
  focus_category TEXT,
  occurred_at TEXT,
  importance INTEGER NOT NULL DEFAULT 2,
  locked INTEGER NOT NULL DEFAULT 0,
  update_batch_id TEXT,
  update_batch_at TEXT,
  change_kind TEXT NOT NULL DEFAULT 'none',
  pack_id TEXT,
  pack_order INTEGER NOT NULL DEFAULT 0,
  position_x REAL NOT NULL DEFAULT 80,
  position_y REAL NOT NULL DEFAULT 80,
  width REAL NOT NULL DEFAULT 320,
  height REAL NOT NULL DEFAULT 220,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cards_project_source
  ON cards(project_id, source_url) WHERE source_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cards_project ON cards(project_id);
CREATE INDEX IF NOT EXISTS idx_sources_project ON sources(project_id);

CREATE TABLE IF NOT EXISTS update_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  checked_sources INTEGER NOT NULL DEFAULT 0,
  new_cards INTEGER NOT NULL DEFAULT 0,
  error_json TEXT NOT NULL DEFAULT '[]',
  kind TEXT NOT NULL DEFAULT 'update',
  status TEXT NOT NULL DEFAULT 'running',
  summary TEXT,
  warning_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS source_candidates (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'website',
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  rationale TEXT NOT NULL DEFAULT '',
  confidence REAL NOT NULL DEFAULT 0.5,
  verified INTEGER NOT NULL DEFAULT 0,
  discovered_by TEXT NOT NULL DEFAULT 'ai',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  UNIQUE(project_id, url)
);

CREATE INDEX IF NOT EXISTS idx_candidates_project_status
  ON source_candidates(project_id, status);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS information_changes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  card_id TEXT NOT NULL,
  previous_card_id TEXT,
  update_batch_id TEXT,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  previous_content TEXT,
  current_content TEXT NOT NULL,
  source_url TEXT,
  resolved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_information_changes_project
  ON information_changes(project_id, resolved, created_at DESC);
`;

function asString(value: SqlValue): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function asNullableString(value: SqlValue): string | null {
  return value === null || value === undefined ? null : asString(value);
}

function asNumber(value: SqlValue): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function parseStringArray(value: SqlValue): string[] {
  try {
    const parsed: unknown = JSON.parse(asString(value));
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function parseSourceLinks(value: SqlValue, fallbackUrl: string | null, fallbackName: string | null): CardSourceLink[] {
  const links: CardSourceLink[] = [];
  try {
    const parsed: unknown = JSON.parse(asString(value || "[]"));
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (!item || typeof item !== "object") continue;
        const record = item as Record<string, unknown>;
        if (typeof record.url !== "string" || !/^https?:\/\//i.test(record.url)) continue;
        const name = typeof record.name === "string" && record.name.trim() ? record.name.trim() : record.url;
        if (!links.some((link) => link.url === record.url)) links.push({ name, url: record.url });
      }
    }
  } catch {
    // Legacy rows fall back to the original scalar source fields below.
  }
  if (!links.length && fallbackUrl) links.push({ name: fallbackName || fallbackUrl, url: fallbackUrl });
  return links;
}

export function hashContent(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export class ResearchDatabase {
  private constructor(
    private readonly db: Database,
    private readonly filePath: string,
  ) {}

  static async open(filePath: string, wasmPath: string): Promise<ResearchDatabase> {
    const SQL: SqlJsStatic = await initSqlJs({ locateFile: () => wasmPath });
    mkdirSync(path.dirname(filePath), { recursive: true });
    let database: Database;
    try {
      database = existsSync(filePath) ? new SQL.Database(readFileSync(filePath)) : new SQL.Database();
      database.exec("PRAGMA schema_version");
    } catch (error) {
      const recoveryPath = `${filePath}.previous`;
      if (!existsSync(recoveryPath)) throw error;
      database = new SQL.Database(readFileSync(recoveryPath));
      database.exec("PRAGMA schema_version");
      copyFileSync(recoveryPath, filePath);
    }
    const store = new ResearchDatabase(database, filePath);
    database.run(SCHEMA);
    store.applyMigrations();
    store.persist();
    store.createBackupIfDue();
    return store;
  }

  close(): void {
    this.persist();
    this.db.close();
  }

  getDataDirectory(): string {
    return path.dirname(this.filePath);
  }

  createBackup(): BackupResult {
    this.persist();
    const createdAt = new Date().toISOString();
    const directory = path.join(path.dirname(this.filePath), "backups");
    mkdirSync(directory, { recursive: true });
    const filename = `research-board-${createdAt.replace(/[:.]/g, "-")}.sqlite`;
    const backupPath = path.join(directory, filename);
    copyFileSync(this.filePath, backupPath);
    this.pruneBackups(directory, 10);
    return { path: backupPath, createdAt, sizeBytes: statSync(backupPath).size };
  }

  private query(sql: string, params: SqlParams = {}): Row[] {
    const statement = this.db.prepare(sql);
    try {
      statement.bind(params);
      const rows: Row[] = [];
      while (statement.step()) rows.push(statement.getAsObject() as Row);
      return rows;
    } finally {
      statement.free();
    }
  }

  private persist(): void {
    const nextPath = `${this.filePath}.next`;
    const previousPath = `${this.filePath}.previous`;
    // sql.js reopens its connection during export and resets connection pragmas.
    let snapshot: Uint8Array;
    try { snapshot = this.db.export(); } finally { this.db.run("PRAGMA foreign_keys = ON"); }
    writeFileSync(nextPath, Buffer.from(snapshot));
    if (!existsSync(this.filePath)) {
      renameSync(nextPath, this.filePath);
      return;
    }
    rmSync(previousPath, { force: true });
    renameSync(this.filePath, previousPath);
    try {
      renameSync(nextPath, this.filePath);
    } catch (error) {
      if (existsSync(previousPath)) renameSync(previousPath, this.filePath);
      throw error;
    }
  }

  private applyMigrations(): void {
    this.ensureColumn("projects", "information_depth", "TEXT NOT NULL DEFAULT 'standard'");
    this.ensureColumn("projects", "update_selected", "INTEGER NOT NULL DEFAULT 0");
    this.ensureColumn("update_runs", "kind", "TEXT NOT NULL DEFAULT 'update'");
    this.ensureColumn("update_runs", "status", "TEXT NOT NULL DEFAULT 'completed'");
    this.ensureColumn("update_runs", "summary", "TEXT");
    this.ensureColumn("update_runs", "warning_json", "TEXT NOT NULL DEFAULT '[]'");
    this.ensureColumn("sources", "last_content_excerpt", "TEXT");
    this.ensureColumn("sources", "platform", "TEXT NOT NULL DEFAULT 'website'");
    this.ensureColumn("source_candidates", "platform", "TEXT NOT NULL DEFAULT 'website'");
    this.ensureColumn("cards", "pack_id", "TEXT");
    this.ensureColumn("cards", "pack_order", "INTEGER NOT NULL DEFAULT 0");
    this.ensureColumn("cards", "image_url", "TEXT");
    this.ensureColumn("cards", "summary", "TEXT");
    this.ensureColumn("cards", "images_json", "TEXT NOT NULL DEFAULT '[]'");
    this.ensureColumn("cards", "locked", "INTEGER NOT NULL DEFAULT 0");
    this.ensureColumn("cards", "update_batch_id", "TEXT");
    this.ensureColumn("cards", "update_batch_at", "TEXT");
    this.ensureColumn("cards", "change_kind", "TEXT NOT NULL DEFAULT 'none'");
    this.ensureColumn("cards", "source_links_json", "TEXT NOT NULL DEFAULT '[]'");
    this.ensureColumn("cards", "source_fingerprint", "TEXT");
    this.ensureColumn("cards", "focus_category", "TEXT");
    this.db.run("DROP INDEX IF EXISTS idx_cards_project_source");
    this.db.run("CREATE INDEX IF NOT EXISTS idx_cards_project_source ON cards(project_id, source_url) WHERE source_url IS NOT NULL");
    this.db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_cards_project_fingerprint ON cards(project_id, source_fingerprint) WHERE source_fingerprint IS NOT NULL");
    this.db.run("CREATE INDEX IF NOT EXISTS idx_cards_pack ON cards(project_id, pack_id, pack_order)");
    this.db.run("CREATE INDEX IF NOT EXISTS idx_cards_update_batch ON cards(project_id, update_batch_at, update_batch_id)");
    this.db.run("UPDATE update_runs SET status = CASE WHEN finished_at IS NULL THEN 'running' WHEN json_array_length(error_json) > 0 THEN 'partial' ELSE 'completed' END WHERE status IS NULL OR status = ''");
    this.db.run("PRAGMA user_version = 11");
  }

  private ensureColumn(table: string, column: string, definition: string): void {
    const exists = this.query(`PRAGMA table_info(${table})`).some((row) => asString(row.name) === column);
    if (!exists) this.db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }

  private createBackupIfDue(): void {
    const directory = path.join(path.dirname(this.filePath), "backups");
    const newest = existsSync(directory)
      ? readdirSync(directory)
        .filter((name) => /^research-board-.*\.sqlite$/.test(name))
        .map((name) => path.join(directory, name))
        .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs)[0]
      : undefined;
    if (!newest || Date.now() - statSync(newest).mtimeMs >= 24 * 60 * 60 * 1_000) this.createBackup();
  }

  private pruneBackups(directory: string, keep: number): void {
    const backups = readdirSync(directory)
      .filter((name) => /^research-board-.*\.sqlite$/.test(name))
      .map((name) => path.join(directory, name))
      .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);
    for (const backup of backups.slice(keep)) rmSync(backup, { force: true });
  }

  private transaction(action: () => void): void {
    this.db.run("BEGIN IMMEDIATE");
    try {
      action();
      this.db.run("COMMIT");
    } catch (error) {
      this.db.run("ROLLBACK");
      throw error;
    }
    this.persist();
  }

  listProjects(): Project[] {
    return this.query(`
      SELECT p.*,
        (SELECT COUNT(*) FROM cards c WHERE c.project_id = p.id) AS card_count,
        (SELECT COUNT(*) FROM sources s WHERE s.project_id = p.id) AS source_count
      FROM projects p
      ORDER BY p.updated_at DESC
    `).map((row) => ({
      id: asString(row.id),
      name: asString(row.name),
      description: asString(row.description),
      goal: asString(row.goal),
      focus: parseStringArray(row.focus_json),
      informationDepth: normalizeInformationDepth(row.information_depth),
      updateSelected: asNumber(row.update_selected) === 1,
      updateFrequency: asString(row.update_frequency) as UpdateFrequency,
      status: asString(row.status) as Project["status"],
      createdAt: asString(row.created_at),
      updatedAt: asString(row.updated_at),
      cardCount: asNumber(row.card_count),
      sourceCount: asNumber(row.source_count),
    }));
  }

  getProject(projectId: string): Project | null {
    return this.listProjects().find((project) => project.id === projectId) ?? null;
  }

  createProject(draft: ProjectDraft): Project {
    const now = new Date().toISOString();
    const id = randomUUID();
    this.transaction(() => {
      this.db.run(`
        INSERT INTO projects (
          id, name, description, goal, focus_json, information_depth, update_frequency, status, created_at, updated_at
        ) VALUES ($id, $name, $description, $goal, $focus, $depth, $frequency, 'active', $now, $now)
      `, {
        $id: id,
        $name: draft.name,
        $description: draft.description,
        $goal: draft.goal,
        $focus: JSON.stringify(draft.focus),
        $frequency: draft.updateFrequency,
        $depth: normalizeInformationDepth(draft.informationDepth),
        $now: now,
      });
      this.insertWelcomeCards(id, draft, now);
    });
    const project = this.listProjects().find((item) => item.id === id);
    if (!project) throw new Error("项目创建失败");
    return project;
  }

  updateProject(input: UpdateProjectInput): Project {
    const existing = this.getProject(input.id);
    if (!existing) throw new Error("项目不存在");
    const now = new Date().toISOString();
    this.transaction(() => {
      this.db.run(`
        UPDATE projects SET
          name = $name,
          description = $description,
          goal = $goal,
          focus_json = $focus,
          information_depth = $depth,
          update_frequency = $frequency,
          status = $status,
          updated_at = $now
        WHERE id = $id
      `, {
        $id: input.id,
        $name: input.name,
        $description: input.description,
        $goal: input.goal,
        $focus: JSON.stringify(input.focus),
        $depth: normalizeInformationDepth(input.informationDepth ?? existing.informationDepth),
        $frequency: input.updateFrequency,
        $status: input.status,
        $now: now,
      });
      this.db.run("UPDATE sources SET check_frequency = $frequency WHERE project_id = $id", {
        $id: input.id,
        $frequency: input.updateFrequency,
      });
    });
    const project = this.getProject(input.id);
    if (!project) throw new Error("项目不存在");
    return project;
  }

  selectUpdateProjects(projectIds: string[]): Project[] {
    const ids = new Set(projectIds);
    const projects = this.listProjects();
    if ([...ids].some((id) => !projects.some((project) => project.id === id))) throw new Error("项目不存在，更新选择未保存");
    this.transaction(() => {
      for (const project of projects) {
        const selected = ids.has(project.id) ? 1 : 0;
        if (Number(project.updateSelected) === selected) continue;
        this.db.run("UPDATE projects SET update_selected = $selected WHERE id = $id", { $selected: selected, $id: project.id });
      }
    });
    return this.listProjects();
  }

  deleteProject(projectId: string): void {
    this.transaction(() => {
      this.db.run("DELETE FROM information_changes WHERE project_id = $id", { $id: projectId });
      this.db.run("DELETE FROM update_runs WHERE project_id = $id", { $id: projectId });
      this.db.run("DELETE FROM source_candidates WHERE project_id = $id", { $id: projectId });
      this.db.run("DELETE FROM cards WHERE project_id = $id", { $id: projectId });
      this.db.run("DELETE FROM sources WHERE project_id = $id", { $id: projectId });
      this.db.run("DELETE FROM projects WHERE id = $id", { $id: projectId });
    });
  }

  listCards(projectId: string): Card[] {
    return this.query(
      "SELECT * FROM cards WHERE project_id = $projectId ORDER BY created_at DESC",
      { $projectId: projectId },
    ).map((row) => this.mapCard(row));
  }

  createCard(input: CreateCardInput): Card {
    const now = new Date().toISOString();
    const id = randomUUID();
    this.transaction(() => {
      this.db.run(`
        INSERT INTO cards (
          id, project_id, type, title, content, summary, images_json, image_url, source_url, source_name, source_links_json,
          source_fingerprint, focus_category, occurred_at,
          importance, update_batch_id, update_batch_at, change_kind,
          position_x, position_y, width, height, created_at, updated_at
        ) VALUES (
          $id, $projectId, $type, $title, $content, $summary, $images, $imageUrl, $sourceUrl, $sourceName, $sourceLinks,
          $sourceFingerprint, $focusCategory, $occurredAt,
          $importance, $updateBatchId, $updateBatchAt, $changeKind,
          $x, $y, $width, $height, $now, $now
        )
      `, {
        $id: id,
        $projectId: input.projectId,
        $type: input.type,
        $title: input.title,
        $content: input.content,
        $summary: input.summary ? summarizeCard(input.summary) : synthesisOverview({ summary: input.content }, /[\u4e00-\u9fff]/.test(input.content) ? "zh-CN" : "en"),
        $images: JSON.stringify(normalizeCardImages(input.images ?? (input.imageUrl ? [{ url: input.imageUrl, caption: null, relevance: "unverified" }] : []))),
        $imageUrl: input.imageUrl ?? null,
        $sourceUrl: input.sourceUrl ?? null,
        $sourceName: input.sourceName ?? null,
        $sourceLinks: JSON.stringify(input.sourceLinks ?? []),
        $sourceFingerprint: input.sourceFingerprint ?? null,
        $focusCategory: input.focusCategory ?? null,
        $occurredAt: input.occurredAt ?? null,
        $importance: Math.max(1, Math.min(3, input.importance ?? 2)),
        $updateBatchId: input.updateBatchId ?? null,
        $updateBatchAt: input.updateBatchAt ?? null,
        $changeKind: input.changeKind ?? "none",
        $x: input.position?.x ?? 80,
        $y: input.position?.y ?? 80,
        $width: input.size?.width ?? 320,
        $height: input.size?.height ?? 220,
        $now: now,
      });
      this.touchProject(input.projectId, now);
    });
    const card = this.findCard(id);
    if (!card) throw new Error("卡片创建失败");
    return card;
  }

  createCardIfNew(input: CreateCardInput): Card | null {
    if (input.sourceFingerprint) {
      const existing = this.query(
        "SELECT id FROM cards WHERE project_id = $projectId AND source_fingerprint = $fingerprint LIMIT 1",
        { $projectId: input.projectId, $fingerprint: input.sourceFingerprint },
      );
      if (existing.length > 0) return null;
    } else if (input.sourceUrl) {
      const existing = this.query(
        "SELECT id FROM cards WHERE project_id = $projectId AND source_url = $sourceUrl LIMIT 1",
        { $projectId: input.projectId, $sourceUrl: input.sourceUrl },
      );
      if (existing.length > 0) return null;
    }
    return this.createCard(input);
  }

  updateCardLayout(input: CardLayoutInput): Card {
    const now = new Date().toISOString();
    const current = this.findCard(input.id);
    if (!current) throw new Error("卡片不存在");
    this.transaction(() => {
      this.db.run(`
        UPDATE cards SET
          position_x = $x,
          position_y = $y,
          width = COALESCE($width, width),
          height = COALESCE($height, height),
          updated_at = $now
        WHERE id = $id OR ($packId IS NOT NULL AND pack_id = $packId)
      `, {
        $id: input.id,
        $packId: current.packId,
        $x: input.position.x,
        $y: input.position.y,
        $width: input.size?.width ?? null,
        $height: input.size?.height ?? null,
        $now: now,
      });
    });
    const card = this.findCard(input.id);
    if (!card) throw new Error("卡片不存在");
    return card;
  }

  updateCard(input: UpdateCardInput): Card {
    const previous = this.findCard(input.id);
    const textChanged = previous?.content !== input.content || previous?.title !== input.title;
    const images = (previous?.images ?? []).map(image => textChanged ? { ...image, relevance: "unverified" as const } : image);
    const now = new Date().toISOString();
    this.transaction(() => {
      this.db.run(`
        UPDATE cards SET type = $type, title = $title, content = $content, summary = $summary, images_json = $images, image_url = $imageUrl,
          occurred_at = $occurredAt, importance = $importance, updated_at = $now
        WHERE id = $id
      `, {
        $id: input.id,
        $type: input.type,
        $title: input.title,
        $content: input.content,
        $summary: synthesisOverview({ summary: input.content }, /[\u4e00-\u9fff]/.test(input.content) ? "zh-CN" : "en"),
        $images: JSON.stringify(images),
        $imageUrl: textChanged ? null : previous?.imageUrl ?? null,
        $occurredAt: input.occurredAt ?? null,
        $importance: Math.max(1, Math.min(3, input.importance)),
        $now: now,
      });
    });
    const card = this.findCard(input.id);
    if (!card) throw new Error("卡片不存在");
    return card;
  }

  setCardLocked(cardId: string, locked: boolean): Card {
    const card = this.findCard(cardId);
    if (!card) throw new Error("卡片不存在");
    const now = new Date().toISOString();
    this.transaction(() => {
      this.db.run("UPDATE cards SET locked = $locked, updated_at = $now WHERE id = $id", {
        $id: cardId,
        $locked: locked ? 1 : 0,
        $now: now,
      });
      this.touchProject(card.projectId, now);
    });
    const updated = this.findCard(cardId);
    if (!updated) throw new Error("卡片不存在");
    return updated;
  }

  packCards(input: PackCardsInput): Card[] {
    const source = this.findCard(input.sourceCardId);
    const target = this.findCard(input.targetCardId);
    if (!source || !target) throw new Error("要打包的卡片不存在");
    if (source.id === target.id) return this.listCards(source.projectId);
    if (source.projectId !== target.projectId) throw new Error("只能打包同一项目中的卡片");
    if (source.updateBatchId !== target.updateBatchId) throw new Error("不同更新批次的卡片不能打包");
    if (source.packId && source.packId === target.packId) return this.listCards(source.projectId);

    const targetPackId = target.packId ?? randomUUID();
    const targetCards = target.packId ? this.listCardsInPack(target.packId) : [target];
    const sourceCards = source.packId ? this.listCardsInPack(source.packId) : [source];
    const now = new Date().toISOString();
    this.transaction(() => {
      for (const [index, card] of targetCards.entries()) {
        this.db.run(`UPDATE cards SET pack_id = $packId, pack_order = $order, position_x = $x, position_y = $y, width = $width, height = $height, updated_at = $now WHERE id = $id`, {
          $id: card.id, $packId: targetPackId, $order: index, $x: target.position.x, $y: target.position.y, $width: target.size.width, $height: target.size.height, $now: now,
        });
      }
      for (const [index, card] of sourceCards.entries()) {
        this.db.run(`UPDATE cards SET pack_id = $packId, pack_order = $order, position_x = $x, position_y = $y, width = $width, height = $height, updated_at = $now WHERE id = $id`, {
          $id: card.id, $packId: targetPackId, $order: targetCards.length + index, $x: target.position.x, $y: target.position.y, $width: target.size.width, $height: target.size.height, $now: now,
        });
      }
      this.touchProject(source.projectId, now);
    });
    return this.listCards(source.projectId);
  }

  unpackCard(cardId: string): Card[] {
    const card = this.findCard(cardId);
    if (!card) throw new Error("卡片不存在");
    if (!card.packId) return this.listCards(card.projectId);
    const packId = card.packId;
    const now = new Date().toISOString();
    this.transaction(() => {
      this.db.run(`UPDATE cards SET pack_id = NULL, pack_order = 0, position_x = $x, position_y = $y, updated_at = $now WHERE id = $id`, {
        $id: card.id,
        $x: card.position.x + 52,
        $y: card.position.y + 52,
        $now: now,
      });
      this.normalizePack(packId, now);
      this.touchProject(card.projectId, now);
    });
    return this.listCards(card.projectId);
  }

  unpackAllCards(packId: string): Card[] {
    const cards = this.listCardsInPack(packId);
    if (!cards.length) throw new Error("卡包不存在");
    const now = new Date().toISOString();
    const origin = cards[0].position;
    this.transaction(() => {
      for (const [index, card] of cards.entries()) {
        const column = index % 3;
        const row = Math.floor(index / 3);
        this.db.run(`UPDATE cards SET pack_id = NULL, pack_order = 0, position_x = $x, position_y = $y, updated_at = $now WHERE id = $id`, {
          $id: card.id,
          $x: origin.x + column * 44,
          $y: origin.y + row * 44,
          $now: now,
        });
      }
      this.touchProject(cards[0].projectId, now);
    });
    return this.listCards(cards[0].projectId);
  }

  deleteCard(cardId: string): void {
    const card = this.findCard(cardId);
    if (!card) return;
    const now = new Date().toISOString();
    this.transaction(() => {
      this.db.run("DELETE FROM cards WHERE id = $id", { $id: cardId });
      if (card.packId) this.normalizePack(card.packId, now);
      this.touchProject(card.projectId, now);
    });
  }

  getNextUpdateBatchY(projectId: string): number {
    const row = this.query(
      "SELECT MAX(position_y + height) AS bottom FROM cards WHERE project_id = $projectId",
      { $projectId: projectId },
    )[0];
    return Math.max(80, asNumber(row?.bottom) + 72);
  }

  pruneUpdateBatches(projectId: string, keep: number): { removedBatches: number; removedCards: number; preservedLocked: number } {
    const batches = this.query(`
      SELECT update_batch_id AS id, MIN(update_batch_at) AS batch_at
      FROM cards
      WHERE project_id = $projectId AND update_batch_id IS NOT NULL
      GROUP BY update_batch_id
      ORDER BY batch_at DESC
    `, { $projectId: projectId });
    const expired = batches.slice(Math.max(1, Math.min(200, Math.round(keep))));
    let removedCards = 0;
    let preservedLocked = 0;
    const now = new Date().toISOString();
    this.transaction(() => {
      for (const batch of expired) {
        const batchId = asString(batch.id);
        const counts = this.query(`
          SELECT COUNT(*) AS total, SUM(CASE WHEN locked = 1 THEN 1 ELSE 0 END) AS locked_count
          FROM cards WHERE project_id = $projectId AND update_batch_id = $batchId
        `, { $projectId: projectId, $batchId: batchId })[0];
        const total = asNumber(counts?.total);
        const lockedCount = asNumber(counts?.locked_count);
        removedCards += total - lockedCount;
        preservedLocked += lockedCount;
        this.db.run(`
          UPDATE cards SET update_batch_id = NULL, pack_id = NULL, pack_order = 0, updated_at = $now
          WHERE project_id = $projectId AND update_batch_id = $batchId AND locked = 1
        `, { $projectId: projectId, $batchId: batchId, $now: now });
        this.db.run(`
          DELETE FROM cards
          WHERE project_id = $projectId AND update_batch_id = $batchId AND locked = 0
        `, { $projectId: projectId, $batchId: batchId });
      }
      if (expired.length) this.touchProject(projectId, now);
    });
    return { removedBatches: expired.length, removedCards, preservedLocked };
  }

  addInformationChange(input: Omit<InformationChange, "id" | "resolved" | "createdAt">): InformationChange {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    this.transaction(() => {
      this.db.run(`
        INSERT INTO information_changes (
          id, project_id, card_id, previous_card_id, update_batch_id, kind, title, summary,
          previous_content, current_content, source_url, resolved, created_at
        ) VALUES (
          $id, $projectId, $cardId, $previousCardId, $updateBatchId, $kind, $title, $summary,
          $previousContent, $currentContent, $sourceUrl, 0, $createdAt
        )
      `, {
        $id: id,
        $projectId: input.projectId,
        $cardId: input.cardId,
        $previousCardId: input.previousCardId,
        $updateBatchId: input.updateBatchId,
        $kind: input.kind,
        $title: input.title,
        $summary: input.summary,
        $previousContent: input.previousContent,
        $currentContent: input.currentContent,
        $sourceUrl: input.sourceUrl,
        $createdAt: createdAt,
      });
    });
    return { ...input, id, resolved: false, createdAt };
  }

  listInformationChanges(projectId: string): InformationChange[] {
    return this.query(`
      SELECT * FROM information_changes WHERE project_id = $projectId
      ORDER BY resolved ASC, created_at DESC LIMIT 200
    `, { $projectId: projectId }).map((row) => this.mapInformationChange(row));
  }

  resolveInformationChange(changeId: string): void {
    this.transaction(() => {
      this.db.run("UPDATE information_changes SET resolved = 1 WHERE id = $id", { $id: changeId });
    });
  }

  listSources(projectId: string): Source[] {
    return this.query(
      "SELECT * FROM sources WHERE project_id = $projectId ORDER BY created_at DESC",
      { $projectId: projectId },
    ).map((row) => this.mapSource(row));
  }

  createSource(input: CreateSourceInput): Source {
    const now = new Date().toISOString();
    const id = randomUUID();
    this.transaction(() => {
      this.db.run(`
        INSERT INTO sources (
          id, project_id, type, platform, name, url, check_frequency, status, created_at
        ) VALUES ($id, $projectId, $type, $platform, $name, $url, $frequency, 'active', $now)
      `, {
        $id: id,
        $projectId: input.projectId,
        $type: input.type,
        $platform: input.platform ?? inferSourcePlatform(input.url, input.type),
        $name: input.name,
        $url: input.url,
        $frequency: input.checkFrequency ?? "daily",
        $now: now,
      });
      this.touchProject(input.projectId, now);
    });
    const source = this.findSource(id);
    if (!source) throw new Error("信息源创建失败");
    return source;
  }

  deleteSource(sourceId: string): void {
    this.transaction(() => this.db.run("DELETE FROM sources WHERE id = $id", { $id: sourceId }));
  }

  updateSource(input: UpdateSourceInput): Source {
    const current = this.findSource(input.id);
    if (!current) throw new Error("信息源不存在");
    this.transaction(() => {
      this.db.run(`
        UPDATE sources SET
          name = $name,
          check_frequency = $frequency,
          status = $status,
          last_error = CASE WHEN $status = 'active' THEN NULL ELSE last_error END
        WHERE id = $id
      `, {
        $id: input.id,
        $name: input.name ?? current.name,
        $frequency: input.checkFrequency ?? current.checkFrequency,
        $status: input.status ?? current.status,
      });
    });
    const source = this.findSource(input.id);
    if (!source) throw new Error("信息源不存在");
    return source;
  }

  listSourceCandidates(projectId: string, status: SourceCandidate["status"] = "pending"): SourceCandidate[] {
    return this.query(
      "SELECT * FROM source_candidates WHERE project_id = $projectId AND status = $status ORDER BY confidence DESC, created_at DESC",
      { $projectId: projectId, $status: status },
    ).map((row) => this.mapSourceCandidate(row));
  }

  upsertSourceCandidates(
    projectId: string,
    candidates: Array<Omit<SourceCandidate, "id" | "projectId" | "status" | "createdAt">>,
  ): SourceCandidate[] {
    if (candidates.length === 0) return this.listSourceCandidates(projectId);
    const now = new Date().toISOString();
    this.transaction(() => {
      for (const candidate of candidates) {
        this.db.run(`
          INSERT INTO source_candidates (
            id, project_id, type, platform, name, url, rationale, confidence, verified, discovered_by, status, created_at
          ) VALUES (
            $id, $projectId, $type, $platform, $name, $url, $rationale, $confidence, $verified, $discoveredBy, 'pending', $createdAt
          )
          ON CONFLICT(project_id, url) DO UPDATE SET
            type = excluded.type,
            platform = excluded.platform,
            name = excluded.name,
            rationale = excluded.rationale,
            confidence = MAX(source_candidates.confidence, excluded.confidence),
            verified = MAX(source_candidates.verified, excluded.verified),
            discovered_by = excluded.discovered_by,
            status = CASE WHEN source_candidates.status = 'accepted' THEN 'accepted' ELSE 'pending' END
        `, {
          $id: randomUUID(),
          $projectId: projectId,
          $type: candidate.type,
          $platform: candidate.platform ?? inferSourcePlatform(candidate.url, candidate.type),
          $name: candidate.name,
          $url: candidate.url,
          $rationale: candidate.rationale,
          $confidence: Math.max(0, Math.min(1, candidate.confidence)),
          $verified: candidate.verified ? 1 : 0,
          $discoveredBy: candidate.discoveredBy,
          $createdAt: now,
        });
      }
    });
    return this.listSourceCandidates(projectId);
  }

  dismissPendingSourceCandidates(projectId: string): void {
    this.transaction(() => {
      this.db.run(
        "UPDATE source_candidates SET status = 'dismissed' WHERE project_id = $projectId AND status = 'pending'",
        { $projectId: projectId },
      );
    });
  }

  getSourceCandidates(projectId: string, candidateIds: string[]): SourceCandidate[] {
    const wanted = new Set(candidateIds);
    return this.listSourceCandidates(projectId).filter((candidate) => wanted.has(candidate.id));
  }

  setSourceCandidateStatus(candidateId: string, status: SourceCandidate["status"]): void {
    this.transaction(() => {
      this.db.run("UPDATE source_candidates SET status = $status WHERE id = $id", {
        $id: candidateId,
        $status: status,
      });
    });
  }

  getSetting<T>(key: string): T | null {
    const row = this.query("SELECT value_json FROM settings WHERE key = $key LIMIT 1", { $key: key })[0];
    if (!row) return null;
    try {
      return JSON.parse(asString(row.value_json)) as T;
    } catch {
      return null;
    }
  }

  setSetting(key: string, value: unknown): void {
    const now = new Date().toISOString();
    this.transaction(() => {
      this.db.run(`
        INSERT INTO settings (key, value_json, updated_at)
        VALUES ($key, $value, $updatedAt)
        ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
      `, {
        $key: key,
        $value: JSON.stringify(value),
        $updatedAt: now,
      });
    });
  }

  updateSourceCheck(
    sourceId: string,
    values: { contentHash?: string | null; contentExcerpt?: string | null; status: SourceStatus; error?: string | null },
  ): void {
    this.transaction(() => {
      this.db.run(`
        UPDATE sources SET
          last_checked_at = $checkedAt,
          last_content_hash = COALESCE($contentHash, last_content_hash),
          last_content_excerpt = COALESCE($contentExcerpt, last_content_excerpt),
          status = $status,
          last_error = $error
        WHERE id = $id
      `, {
        $id: sourceId,
        $checkedAt: new Date().toISOString(),
        $contentHash: values.contentHash ?? null,
        $contentExcerpt: values.contentExcerpt ?? null,
        $status: values.status,
        $error: values.error ?? null,
      });
    });
  }

  startTaskRun(projectId: string, kind: TaskKind): string {
    const id = randomUUID();
    this.transaction(() => {
      this.db.run(`
        INSERT INTO update_runs (id, project_id, started_at, kind, status)
        VALUES ($id, $projectId, $startedAt, $kind, 'running')
      `, {
        $id: id,
        $projectId: projectId,
        $startedAt: new Date().toISOString(),
        $kind: kind,
      });
    });
    return id;
  }

  finishTaskRun(
    runId: string,
    result: { checkedSources?: number; newCards?: number; errors?: string[]; warnings?: string[]; status?: TaskStatus; summary?: string | null },
  ): void {
    const errors = result.errors ?? [];
    const status = result.status ?? (errors.length ? "partial" : "completed");
    this.transaction(() => {
      this.db.run(`
        UPDATE update_runs SET
          finished_at = $finishedAt,
          checked_sources = $checkedSources,
          new_cards = $newCards,
          error_json = $errors,
          status = $status,
          summary = $summary,
          warning_json = $warnings
        WHERE id = $id
      `, {
        $id: runId,
        $finishedAt: new Date().toISOString(),
        $checkedSources: result.checkedSources ?? 0,
        $newCards: result.newCards ?? 0,
        $errors: JSON.stringify(errors),
        $warnings: JSON.stringify(result.warnings ?? []),
        $status: status,
        $summary: result.summary ?? null,
      });
    });
  }

  listTaskRuns(projectId: string, limit = 20): TaskRun[] {
    return this.query(`
      SELECT * FROM update_runs
      WHERE project_id = $projectId
      ORDER BY started_at DESC
      LIMIT $limit
    `, { $projectId: projectId, $limit: Math.max(1, Math.min(100, limit)) })
      .map((row) => ({
        id: asString(row.id),
        projectId: asString(row.project_id),
        kind: asString(row.kind) as TaskKind,
        status: asString(row.status) as TaskStatus,
        startedAt: asString(row.started_at),
        finishedAt: asNullableString(row.finished_at),
        checkedSources: asNumber(row.checked_sources),
        newCards: asNumber(row.new_cards),
        errors: parseStringArray(row.error_json),
        warnings: parseStringArray(row.warning_json),
        summary: asNullableString(row.summary),
      }));
  }

  private findCard(id: string): Card | null {
    const row = this.query("SELECT * FROM cards WHERE id = $id LIMIT 1", { $id: id })[0];
    return row ? this.mapCard(row) : null;
  }

  private findSource(id: string): Source | null {
    const row = this.query("SELECT * FROM sources WHERE id = $id LIMIT 1", { $id: id })[0];
    return row ? this.mapSource(row) : null;
  }

  private mapCard(row: Row): Card {
    let storedImages: unknown = [];
    try { storedImages = JSON.parse(asString(row.images_json) || "[]"); } catch { /* Legacy or corrupt metadata has no trusted captions. */ }
    const legacyImage = asNullableString(row.image_url);
    const images = normalizeCardImages([...(Array.isArray(storedImages) ? storedImages : []), ...(legacyImage ? [{ url: legacyImage, caption: null, relevance: "unverified" }] : [])]);
    return {
      id: asString(row.id),
      projectId: asString(row.project_id),
      type: asString(row.type) as Card["type"],
      title: asString(row.title),
      content: asString(row.content),
      summary: asString(row.summary) ? summarizeCard(asString(row.summary)) : synthesisOverview({ summary: asString(row.content) }, /[\u4e00-\u9fff]/.test(asString(row.content)) ? "zh-CN" : "en"),
      images,
      imageUrl: images.find(image => image.relevance === "relevant")?.url ?? null,
      sourceUrl: asNullableString(row.source_url),
      sourceName: asNullableString(row.source_name),
      sourceLinks: parseSourceLinks(row.source_links_json, asNullableString(row.source_url), asNullableString(row.source_name)),
      focusCategory: asNullableString(row.focus_category),
      occurredAt: asNullableString(row.occurred_at),
      importance: asNumber(row.importance),
      locked: asNumber(row.locked) === 1,
      updateBatchId: asNullableString(row.update_batch_id),
      updateBatchAt: asNullableString(row.update_batch_at),
      changeKind: asString(row.change_kind || "none") as Card["changeKind"],
      packId: asNullableString(row.pack_id),
      packOrder: asNumber(row.pack_order),
      position: { x: asNumber(row.position_x), y: asNumber(row.position_y) },
      size: { width: asNumber(row.width), height: asNumber(row.height) },
      createdAt: asString(row.created_at),
      updatedAt: asString(row.updated_at),
    };
  }

  private mapSource(row: Row): Source {
    return {
      id: asString(row.id),
      projectId: asString(row.project_id),
      type: asString(row.type) as Source["type"],
      platform: normalizeSourcePlatform(row.platform, asString(row.url), asString(row.type) as Source["type"]),
      name: asString(row.name),
      url: asString(row.url),
      checkFrequency: asString(row.check_frequency) as UpdateFrequency,
      lastCheckedAt: asNullableString(row.last_checked_at),
      lastContentHash: asNullableString(row.last_content_hash),
      lastContentExcerpt: asNullableString(row.last_content_excerpt),
      status: asString(row.status) as SourceStatus,
      lastError: asNullableString(row.last_error),
      createdAt: asString(row.created_at),
    };
  }

  private mapInformationChange(row: Row): InformationChange {
    return {
      id: asString(row.id),
      projectId: asString(row.project_id),
      cardId: asString(row.card_id),
      previousCardId: asNullableString(row.previous_card_id),
      updateBatchId: asNullableString(row.update_batch_id),
      kind: asString(row.kind) as InformationChange["kind"],
      title: asString(row.title),
      summary: asString(row.summary),
      previousContent: asNullableString(row.previous_content),
      currentContent: asString(row.current_content),
      sourceUrl: asNullableString(row.source_url),
      resolved: asNumber(row.resolved) === 1,
      createdAt: asString(row.created_at),
    };
  }

  private mapSourceCandidate(row: Row): SourceCandidate {
    return {
      id: asString(row.id),
      projectId: asString(row.project_id),
      type: asString(row.type) as SourceCandidate["type"],
      platform: normalizeSourcePlatform(row.platform, asString(row.url), asString(row.type) as SourceCandidate["type"]),
      name: asString(row.name),
      url: asString(row.url),
      rationale: asString(row.rationale),
      confidence: asNumber(row.confidence),
      verified: asNumber(row.verified) === 1,
      discoveredBy: asString(row.discovered_by) as SourceCandidate["discoveredBy"],
      status: asString(row.status) as SourceCandidate["status"],
      createdAt: asString(row.created_at),
    };
  }

  private touchProject(projectId: string, now: string): void {
    this.db.run("UPDATE projects SET updated_at = $now WHERE id = $id", { $id: projectId, $now: now });
  }

  private listCardsInPack(packId: string): Card[] {
    return this.query("SELECT * FROM cards WHERE pack_id = $packId ORDER BY pack_order ASC, created_at ASC", { $packId: packId })
      .map((row) => this.mapCard(row));
  }

  private normalizePack(packId: string, now: string): void {
    const cards = this.query("SELECT id FROM cards WHERE pack_id = $packId ORDER BY pack_order ASC, created_at ASC", { $packId: packId });
    if (cards.length === 1) {
      this.db.run("UPDATE cards SET pack_id = NULL, pack_order = 0, updated_at = $now WHERE id = $id", { $id: asString(cards[0].id), $now: now });
      return;
    }
    for (const [index, row] of cards.entries()) {
      this.db.run("UPDATE cards SET pack_order = $order, updated_at = $now WHERE id = $id", { $id: asString(row.id), $order: index, $now: now });
    }
  }

  private insertWelcomeCards(projectId: string, draft: ProjectDraft, now: string): void {
    const cards: Array<Omit<CreateCardInput, "projectId">> = [
      {
        type: "analysis",
        title: "监控目标已建立",
        content: `目标：${draft.goal}\n\n首轮将关注：${draft.focus.join("、")}。添加信息源后即可开始检查。`,
        importance: 3,
        position: { x: 72, y: 76 },
        size: { width: 340, height: 236 },
      },
      {
        type: "timeline",
        title: "项目时间线",
        content: "项目创建\n等待第一次信息检查",
        position: { x: 460, y: 390 },
        size: { width: 300, height: 210 },
      },
      {
        type: "source",
        title: "添加第一个信息源",
        content: "从右侧信息源面板添加 RSS 或网页地址。系统会记录变化并生成新卡片。",
        position: { x: 72, y: 390 },
        size: { width: 320, height: 220 },
      },
    ];

    for (const card of cards) {
      this.db.run(`
        INSERT INTO cards (
          id, project_id, type, title, content, source_url, source_name, occurred_at,
          importance, position_x, position_y, width, height, created_at, updated_at
        ) VALUES (
          $id, $projectId, $type, $title, $content, NULL, NULL, NULL,
          $importance, $x, $y, $width, $height, $now, $now
        )
      `, {
        $id: randomUUID(),
        $projectId: projectId,
        $type: card.type,
        $title: card.title,
        $content: card.content,
        $importance: card.importance ?? 2,
        $x: card.position?.x ?? 80,
        $y: card.position?.y ?? 80,
        $width: card.size?.width ?? 320,
        $height: card.size?.height ?? 220,
        $now: now,
      });
    }
  }

}
