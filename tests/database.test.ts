import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import initSqlJs from "sql.js";
import { ResearchDatabase } from "../electron/main/database";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

async function createDatabase() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "research-board-test-"));
  temporaryDirectories.push(directory);
  const filePath = path.join(directory, "test.sqlite");
  const wasmPath = path.resolve("node_modules/sql.js/dist/sql-wasm.wasm");
  return { database: await ResearchDatabase.open(filePath, wasmPath), filePath, wasmPath };
}

describe("ResearchDatabase", () => {
  it("keeps foreign keys enforced after persistence and clears deleted project changes", async () => {
    const { database } = await createDatabase();
    const project = database.createProject({ name: "A", description: "A", goal: "Time", focus: ["Time"], updateFrequency: "daily" });
    const card = database.createCard({ projectId: project.id, type: "note", title: "Time", content: "18:00" });
    database.addInformationChange({ projectId: project.id, cardId: card.id, previousCardId: null, updateBatchId: null,
      kind: "updated", title: "Time", summary: "18:00", previousContent: null, currentContent: "18:00", sourceUrl: null });
    database.deleteProject(project.id);
    expect(database.listInformationChanges(project.id)).toEqual([]);
    expect(() => database.createCard({ projectId: project.id, type: "note", title: "Late network result", content: "19:00" })).toThrow(/FOREIGN KEY/);
    expect(() => database.startTaskRun(project.id, "update")).toThrow(/FOREIGN KEY/);
    expect(database.listCards(project.id)).toEqual([]);
    database.close();
  });

  it("persists independent depth and update selection without changing other project data", async () => {
    const { database, filePath, wasmPath } = await createDatabase();
    const first = database.createProject({ name: "A", description: "A", goal: "Time", focus: ["Time"], updateFrequency: "daily", informationDepth: "deep" });
    const second = database.createProject({ name: "B", description: "B", goal: "Time", focus: ["Time"], updateFrequency: "daily" });
    expect(first).toMatchObject({ informationDepth: "deep", updateSelected: false });
    expect(second).toMatchObject({ informationDepth: "standard", updateSelected: false });
    const untouchedCards = database.listCards(second.id);
    database.selectUpdateProjects([first.id, first.id]);
    expect(database.getProject(first.id)?.updateSelected).toBe(true);
    expect(database.getProject(second.id)).toEqual(second);
    expect(database.listCards(second.id)).toEqual(untouchedCards);
    expect(() => database.selectUpdateProjects([second.id, "missing"])).toThrow();
    expect(database.getProject(first.id)?.updateSelected).toBe(true);
    expect(database.getProject(second.id)?.updateSelected).toBe(false);
    database.updateProject({ ...first, informationDepth: "focused" });
    expect(database.getProject(first.id)).toMatchObject({ informationDepth: "focused", updateSelected: true });
    database.close();
    const reopened = await ResearchDatabase.open(filePath, wasmPath);
    expect(reopened.getProject(first.id)).toMatchObject({ informationDepth: "focused", updateSelected: true });
    expect(reopened.getProject(second.id)).toEqual(second);
    reopened.selectUpdateProjects([]);
    expect(reopened.listProjects().every((project) => !project.updateSelected)).toBe(true);
    reopened.close();
  });

  it("persists a card layout across database reopen", async () => {
    const { database, filePath, wasmPath } = await createDatabase();
    const project = database.createProject({
      name: "SpaceX", description: "Launch tracking", goal: "Track launches", focus: ["Launch"], updateFrequency: "daily",
    });
    const card = database.createCard({ projectId: project.id, type: "note", title: "Launch window", content: "TBC", imageUrl: "https://example.com/launch.jpg" });
    database.updateCardLayout({ id: card.id, position: { x: 420, y: 260 }, size: { width: 440, height: 360 } });
    database.close();

    const reopened = await ResearchDatabase.open(filePath, wasmPath);
    expect(reopened.listCards(project.id).find((item) => item.id === card.id)?.position).toEqual({ x: 420, y: 260 });
    expect(reopened.listCards(project.id).find((item) => item.id === card.id)).toMatchObject({ imageUrl: "https://example.com/launch.jpg", size: { width: 440, height: 360 } });
    reopened.close();
  });

  it("persists a synthesized card focus and all supporting source links", async () => {
    const { database } = await createDatabase();
    const project = database.createProject({ name: "Road", description: "Road", goal: "Track status", focus: ["开放状态"], updateFrequency: "daily" });
    const card = database.createCard({
      projectId: project.id,
      type: "analysis",
      title: "开放状态综合",
      content: "两个来源均确认道路开放。",
      focusCategory: "开放状态",
      sourceUrl: "https://a.example/status",
      sourceName: "2 个来源",
      sourceLinks: [
        { name: "交通部门", url: "https://a.example/status" },
        { name: "景区公告", url: "https://b.example/news" },
      ],
      sourceFingerprint: "same-evidence",
    });
    expect(card).toMatchObject({ focusCategory: "开放状态", sourceLinks: [{ name: "交通部门" }, { name: "景区公告" }] });
    expect(database.createCardIfNew({ projectId: project.id, type: "analysis", title: "重复", content: "重复", sourceFingerprint: "same-evidence" })).toBeNull();
    database.close();
  });

  it("stores explicit and inferred platforms for new-media sources and candidates", async () => {
    const { database } = await createDatabase();
    const project = database.createProject({ name: "Media", description: "Media", goal: "Track accounts", focus: ["Posts"], updateFrequency: "daily" });
    const youtube = database.createSource({ projectId: project.id, type: "search", name: "Channel", url: "https://youtube.com/@example" });
    const [candidate] = database.upsertSourceCandidates(project.id, [{
      type: "search", platform: "x", name: "Account", url: "https://x.com/example", rationale: "Posts", confidence: 0.8, verified: true, discoveredBy: "ai",
    }]);
    expect(youtube.platform).toBe("youtube");
    expect(candidate).toMatchObject({ platform: "x", type: "search" });
    database.close();
  });

  it("cascades project deletion to cards and sources", async () => {
    const { database } = await createDatabase();
    const project = database.createProject({
      name: "Test", description: "Test", goal: "Test", focus: ["Test"], updateFrequency: "daily",
    });
    database.createSource({ projectId: project.id, type: "rss", name: "Feed", url: "https://example.com/feed.xml" });
    expect(database.listCards(project.id).length).toBeGreaterThan(0);
    database.deleteProject(project.id);
    expect(database.listCards(project.id)).toEqual([]);
    expect(database.listSources(project.id)).toEqual([]);
    database.close();
  });

  it("refreshes pending source candidates only for the selected project", async () => {
    const { database } = await createDatabase();
    const road = database.createProject({
      name: "独库公路开放情况", description: "Road status", goal: "Track road openings", focus: ["Closures"], updateFrequency: "daily",
    });
    const music = database.createProject({
      name: "Music", description: "Music", goal: "Track music", focus: ["Official news"], updateFrequency: "daily",
    });
    const candidate = {
      type: "web" as const,
      name: "Official",
      url: "https://example.com/status",
      rationale: "Official status",
      confidence: 0.9,
      verified: true,
      discoveredBy: "ai" as const,
    };
    database.upsertSourceCandidates(road.id, [candidate]);
    database.upsertSourceCandidates(music.id, [{ ...candidate, url: "https://example.org/news" }]);

    database.dismissPendingSourceCandidates(road.id);

    expect(database.listSourceCandidates(road.id)).toEqual([]);
    expect(database.listSourceCandidates(music.id)).toHaveLength(1);
    database.close();
  });

  it("updates project, source and card settings and records task history", async () => {
    const { database } = await createDatabase();
    const project = database.createProject({
      name: "Road", description: "Road status", goal: "Track openings", focus: ["Open"], updateFrequency: "daily",
    });
    const source = database.createSource({ projectId: project.id, type: "web", name: "Authority", url: "https://example.com/status" });
    const card = database.createCard({ projectId: project.id, type: "note", title: "Old", content: "Old content" });

    const updatedProject = database.updateProject({ ...project, name: "独库公路", focus: ["开放", "封闭"], updateFrequency: "hourly", status: "paused" });
    const updatedSource = database.updateSource({ id: source.id, status: "paused" });
    const updatedCard = database.updateCard({ id: card.id, type: "analysis", title: "New", content: "New content", importance: 3 });
    const runId = database.startTaskRun(project.id, "discovery");
    database.finishTaskRun(runId, { status: "partial", errors: ["API unavailable"], summary: "Recovered with public search" });

    expect(updatedProject).toMatchObject({ name: "独库公路", updateFrequency: "hourly", status: "paused" });
    expect(updatedSource).toMatchObject({ status: "paused", checkFrequency: "hourly" });
    expect(updatedCard).toMatchObject({ type: "analysis", title: "New", importance: 3 });
    expect(database.listTaskRuns(project.id)[0]).toMatchObject({ id: runId, kind: "discovery", status: "partial", errors: ["API unavailable"] });
    database.close();
  });

  it("recovers a corrupted main database from the previous safe copy", async () => {
    const { database, filePath, wasmPath } = await createDatabase();
    const project = database.createProject({
      name: "Recovery", description: "Recovery", goal: "Keep data", focus: ["Data"], updateFrequency: "daily",
    });
    database.close();
    expect(existsSync(`${filePath}.previous`)).toBe(true);
    writeFileSync(filePath, "not a database");

    const recovered = await ResearchDatabase.open(filePath, wasmPath);
    expect(recovered.getProject(project.id)?.name).toBe("Recovery");
    recovered.close();
  });

  it("creates a restorable timestamped backup", async () => {
    const { database } = await createDatabase();
    database.createProject({ name: "Backup", description: "Backup", goal: "Backup data", focus: ["Data"], updateFrequency: "daily" });

    const backup = database.createBackup();

    expect(existsSync(backup.path)).toBe(true);
    expect(backup.sizeBytes).toBeGreaterThan(0);
    expect(backup.path).toMatch(/backups[\\/]research-board-.*\.sqlite$/);
    database.close();
  });

  it("packs cards, removes the current card, and dissolves a card pack", async () => {
    const { database } = await createDatabase();
    const project = database.createProject({ name: "Pack", description: "Pack", goal: "Pack cards", focus: ["Cards"], updateFrequency: "daily" });
    const first = database.createCard({ projectId: project.id, type: "news", title: "First", content: "First", position: { x: 80, y: 80 }, size: { width: 400, height: 380 } });
    const second = database.createCard({ projectId: project.id, type: "event", title: "Second", content: "Second", position: { x: 420, y: 220 }, size: { width: 300, height: 210 } });
    const third = database.createCard({ projectId: project.id, type: "note", title: "Third", content: "Third", position: { x: 760, y: 360 } });

    let result = database.packCards({ sourceCardId: first.id, targetCardId: second.id });
    const packId = result.find((card) => card.id === second.id)?.packId;
    expect(packId).toBeTruthy();
    expect(result.filter((card) => card.packId === packId).sort((a, b) => a.packOrder - b.packOrder).map((card) => card.id)).toEqual([second.id, first.id]);
    expect(result.filter((card) => card.packId === packId).every((card) => card.size.width === 300 && card.size.height === 210)).toBe(true);

    result = database.packCards({ sourceCardId: third.id, targetCardId: first.id });
    expect(result.filter((card) => card.packId === packId)).toHaveLength(3);

    result = database.unpackCard(first.id);
    expect(result.find((card) => card.id === first.id)?.packId).toBeNull();
    expect(result.filter((card) => card.packId === packId)).toHaveLength(2);

    result = database.unpackAllCards(packId as string);
    expect(result.filter((card) => [second.id, third.id].includes(card.id)).every((card) => card.packId === null)).toBe(true);

    database.packCards({ sourceCardId: first.id, targetCardId: second.id });
    database.deleteCard(first.id);
    expect(database.listCards(project.id).find((card) => card.id === second.id)?.packId).toBeNull();
    database.close();
  });

  it("migrates legacy cards without pack fields", async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "research-board-legacy-pack-"));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, "legacy.sqlite");
    const wasmPath = path.resolve("node_modules/sql.js/dist/sql-wasm.wasm");
    const SQL = await initSqlJs({ locateFile: () => wasmPath });
    const legacy = new SQL.Database();
    legacy.run(`
      CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', goal TEXT NOT NULL DEFAULT '', focus_json TEXT NOT NULL DEFAULT '[]', update_frequency TEXT NOT NULL DEFAULT 'daily', status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE cards (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, type TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL DEFAULT '', source_url TEXT, source_name TEXT, occurred_at TEXT, importance INTEGER NOT NULL DEFAULT 2, position_x REAL NOT NULL DEFAULT 80, position_y REAL NOT NULL DEFAULT 80, width REAL NOT NULL DEFAULT 320, height REAL NOT NULL DEFAULT 220, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      INSERT INTO projects VALUES ('project', 'Legacy', 'Legacy', 'Keep cards', '["Cards"]', 'daily', 'active', '2026-08-01', '2026-08-01');
      INSERT INTO cards VALUES ('card', 'project', 'note', 'Legacy card', 'Content', NULL, NULL, NULL, 2, 80, 80, 320, 220, '2026-08-01', '2026-08-01');
    `);
    writeFileSync(filePath, Buffer.from(legacy.export()));
    legacy.close();

    const migrated = await ResearchDatabase.open(filePath, wasmPath);
    expect(migrated.getProject("project")).toMatchObject({ informationDepth: "standard", updateSelected: false });
    expect(migrated.listCards("project")[0]).toMatchObject({ id: "card", packId: null, packOrder: 0, imageUrl: null });
    migrated.close();
  });

  it("keeps update batches separate and preserves locked cards while pruning", async () => {
    const { database } = await createDatabase();
    const project = database.createProject({ name: "Road", description: "Road", goal: "Track status", focus: ["Status"], updateFrequency: "daily" });
    const old = database.createCard({ projectId: project.id, type: "news", title: "Old", content: "Open", sourceUrl: "https://example.com/old", updateBatchId: "batch-old", updateBatchAt: "2026-08-01T00:00:00.000Z" });
    const oldUnlocked = database.createCard({ projectId: project.id, type: "news", title: "Old 2", content: "Open", sourceUrl: "https://example.com/old-2", updateBatchId: "batch-old", updateBatchAt: "2026-08-01T00:00:00.000Z" });
    const latest = database.createCard({ projectId: project.id, type: "news", title: "Latest", content: "Closed", sourceUrl: "https://example.com/latest", updateBatchId: "batch-new", updateBatchAt: "2026-08-02T00:00:00.000Z" });
    database.setCardLocked(old.id, true);

    expect(() => database.packCards({ sourceCardId: old.id, targetCardId: latest.id })).toThrow("不同更新批次");
    expect(database.pruneUpdateBatches(project.id, 1)).toEqual({ removedBatches: 1, removedCards: 1, preservedLocked: 1 });
    expect(database.listCards(project.id).find((item) => item.id === old.id)).toMatchObject({ locked: true, updateBatchId: null });
    expect(database.listCards(project.id).some((item) => item.id === oldUnlocked.id)).toBe(false);
    database.close();
  });

  it("records and resolves a project information conflict", async () => {
    const { database } = await createDatabase();
    const project = database.createProject({ name: "Road", description: "Road", goal: "Track status", focus: ["Status"], updateFrequency: "daily" });
    const previous = database.createCard({ projectId: project.id, type: "news", title: "Open", content: "Open", sourceUrl: "https://example.com/open" });
    const current = database.createCard({ projectId: project.id, type: "news", title: "Closed", content: "Closed", sourceUrl: "https://example.com/closed", changeKind: "conflict" });
    const change = database.addInformationChange({ projectId: project.id, cardId: current.id, previousCardId: previous.id, updateBatchId: null, kind: "conflict", title: current.title, summary: "Status conflict", previousContent: previous.content, currentContent: current.content, sourceUrl: current.sourceUrl });
    expect(database.listInformationChanges(project.id)[0]).toMatchObject({ id: change.id, kind: "conflict", resolved: false });
    database.resolveInformationChange(change.id);
    expect(database.listInformationChanges(project.id)[0].resolved).toBe(true);
    database.close();
  });
});
