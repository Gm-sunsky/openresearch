// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { api } from "../src/api";
import { I18nProvider } from "../src/i18n";
import type { Card, InformationDepth, Project, Source, UpdateRunResult } from "../src/shared/contracts";

vi.mock("../src/api", () => ({
  api: {
    projects: { list: vi.fn(), preview: vi.fn(), create: vi.fn(), update: vi.fn() },
    cards: { list: vi.fn() },
    sources: { list: vi.fn() },
    discovery: { list: vi.fn() },
    updates: { select: vi.fn(), run: vi.fn(), history: vi.fn() },
    changes: { list: vi.fn() },
    settings: { get: vi.fn() },
  },
}));

const now = "2026-10-03T08:00:00.000Z";
const depths: InformationDepth[] = ["focused", "standard", "deep"];
let root: Root;
let container: HTMLDivElement;
let projects: Project[];

function project(id: string, updateSelected = false): Project {
  return {
    id, name: `项目 ${id}`, description: `${id} 的描述`, goal: `${id} 的目标`, focus: [`${id} 的关注项`],
    informationDepth: "standard", updateSelected, updateFrequency: "daily", status: "active",
    cardCount: 1, sourceCount: 1, createdAt: now, updatedAt: now,
  };
}

function card(projectId: string): Card {
  return {
    id: `${projectId}-card`, projectId, type: "note", title: `${projectId} 的卡片`, content: `${projectId} 的独立内容`,
    imageUrl: null, sourceUrl: null, sourceName: null, sourceLinks: [], focusCategory: null, occurredAt: null,
    importance: 2, locked: false, updateBatchId: null, updateBatchAt: null, changeKind: "none", packId: null, packOrder: 0,
    position: { x: 80, y: 80 }, size: { width: 320, height: 220 }, createdAt: now, updatedAt: now,
  };
}

function source(projectId: string): Source {
  return {
    id: `${projectId}-source`, projectId, type: "web", platform: "website", name: `${projectId} 的来源`,
    url: `https://example.com/${projectId}`, checkFrequency: "daily", lastCheckedAt: null,
    lastContentHash: null, lastContentExcerpt: null, status: "active", lastError: null, createdAt: now,
  };
}

function result(projectId: string): UpdateRunResult {
  return { runId: `${projectId}-run`, projectId, checkedSources: 1, newCards: 1, errors: [], warnings: [], finishedAt: now };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

function element<T extends HTMLElement>(selector: string): T {
  const found = container.querySelector<T>(selector);
  if (!found) throw new Error(`Element not found: ${selector}`);
  return found;
}

function button(text: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find((item) => item.textContent === text);
  if (!found) throw new Error(`Button not found: ${text}`);
  return found;
}

async function click(target: HTMLElement) {
  await act(async () => { target.click(); });
}

async function choose(selector: string, value: string) {
  await act(async () => {
    const select = element<HTMLSelectElement>(selector);
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function renderApp() {
  await act(async () => { root.render(createElement(I18nProvider, null, createElement(App))); });
}

function expectProjectB() {
  expect(element("h1").textContent).toBe("项目 B");
  expect(element('[aria-label="查看项目：项目 B"]').getAttribute("aria-current")).toBe("page");
  const board = element('[aria-label="项目信息白板"]').textContent;
  const inspector = element(".inspector").textContent;
  expect(board).toContain("B 的卡片");
  expect(board).not.toContain("A 的卡片");
  expect(inspector).toContain("B 的来源");
  expect(inspector).toContain("B 的任务");
  expect(inspector).toContain("B 的变化");
  expect(inspector).not.toContain("A 的来源");
  expect(inspector).not.toContain("A 的任务");
  expect(inspector).not.toContain("A 的变化");
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.localStorage.setItem("ai-research-board-language", "zh-CN");
  projects = [project("A", true), project("B"), project("C")];
  vi.mocked(api.projects.list).mockImplementation(async () => [...projects]);
  vi.mocked(api.projects.preview).mockResolvedValue({
    name: "新项目", description: "新项目描述", goal: "新项目目标", focus: ["公告"], updateFrequency: "daily",
  });
  vi.mocked(api.projects.create).mockImplementation(async (input) => {
    const created = { ...project("new"), ...input.draft, name: input.name ?? input.draft?.name ?? "新项目" };
    projects = [created, ...projects];
    return created;
  });
  vi.mocked(api.projects.update).mockImplementation(async (input) => {
    const updated = { ...projects.find((item) => item.id === input.id)!, ...input };
    projects = projects.map((item) => item.id === input.id ? updated : item);
    return updated;
  });
  vi.mocked(api.cards.list).mockImplementation(async (id) => [card(id)]);
  vi.mocked(api.sources.list).mockImplementation(async (id) => [source(id)]);
  vi.mocked(api.discovery.list).mockResolvedValue([]);
  vi.mocked(api.updates.history).mockImplementation(async (projectId) => [{
    id: `${projectId}-history`, projectId, kind: "update", status: "completed", startedAt: now, finishedAt: now,
    checkedSources: 1, newCards: 1, errors: [], warnings: [], summary: `${projectId} 的任务`,
  }]);
  vi.mocked(api.changes.list).mockImplementation(async (projectId) => [{
    id: `${projectId}-change`, projectId, cardId: `${projectId}-card`, previousCardId: null, updateBatchId: null,
    kind: "updated", title: `${projectId} 的变化`, summary: `${projectId} 的变化摘要`, previousContent: null,
    currentContent: `${projectId} 的当前内容`, sourceUrl: null, resolved: false, createdAt: now,
  }]);
  vi.mocked(api.updates.select).mockImplementation(async (ids) => {
    projects = projects.map((item) => ({ ...item, updateSelected: ids.includes(item.id) }));
    return [...projects];
  });
  vi.mocked(api.updates.run).mockImplementation(async (id) => result(id));
  vi.mocked(api.settings.get).mockResolvedValue({
    provider: "openai", protocol: "responses", baseUrl: "https://api.openai.com/v1", model: "test-model",
    apiKeyConfigured: false, apiKeyHint: null, autoDiscoverSources: false, autoAddVerifiedSources: false,
    aiOrganizeContent: true, language: "zh-CN", maxUpdateBatches: 20, updatedAt: null,
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe("project update selection", () => {
  it("persists checkboxes independently of the viewed project and runs exactly the checked set", async () => {
    await renderApp();
    await click(element('[aria-label="更新项目：项目 C"]'));
    expect(api.updates.select).toHaveBeenCalledExactlyOnceWith(["A", "C"]);
    expect(element("h1").textContent).toBe("项目 A");
    await click(element('[aria-label="查看项目：项目 B"]'));
    expectProjectB();
    expect(api.updates.select).toHaveBeenCalledTimes(1);
    expect(element<HTMLInputElement>('[aria-label="更新项目：项目 B"]').checked).toBe(false);
    await click(button("更新选中项目（2）"));
    expect(vi.mocked(api.updates.run).mock.calls.map(([id]) => id)).toEqual(["A", "C"]);
    expectProjectB();
  });

  it("disables updates when no project is checked even while a project is being viewed", async () => {
    projects = [project("A"), project("B")];
    await renderApp();
    await click(element('[aria-label="查看项目：项目 B"]'));
    const update = button("请勾选更新项目");
    expect(update.disabled).toBe(true);
    await click(update);
    expect(api.updates.run).not.toHaveBeenCalled();
    expect(api.updates.select).not.toHaveBeenCalled();
  });

  it("blocks update clicks until a pending checkbox save completes and preserves the previous selection on failure", async () => {
    const save = deferred<Project[]>();
    vi.mocked(api.updates.select).mockReturnValueOnce(save.promise);
    await renderApp();
    await click(element('[aria-label="更新项目：项目 A"]'));
    expect(button("更新选中项目（1）").disabled).toBe(true);
    expect(element<HTMLInputElement>('[aria-label="更新项目：项目 B"]').disabled).toBe(true);
    await click(button("更新选中项目（1）"));
    expect(api.updates.run).not.toHaveBeenCalled();
    await act(async () => { save.reject(new Error("选择保存失败")); });
    expect(element<HTMLInputElement>('[aria-label="更新项目：项目 A"]').checked).toBe(true);
    expect(button("更新选中项目（1）").disabled).toBe(false);
    expect(element(".toast").textContent).toBe("选择保存失败");
  });
});

describe("project async isolation", () => {
  it("keeps B selected and its details intact when A finishes updating in the background", async () => {
    const update = deferred<UpdateRunResult>();
    vi.mocked(api.updates.run).mockReturnValueOnce(update.promise);
    await renderApp();
    await click(button("更新选中项目（1）"));
    expect(element('[aria-label="项目 A更新中"]')).toBeTruthy();
    await click(element('[aria-label="查看项目：项目 B"]'));
    expectProjectB();
    const cardReads = vi.mocked(api.cards.list).mock.calls.length;
    await act(async () => { update.resolve(result("A")); });
    expectProjectB();
    expect(api.cards.list).toHaveBeenCalledTimes(cardReads);
    expect(api.projects.list).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[aria-label="项目 A更新中"]')).toBeNull();
  });

  it("ignores A details that arrive after switching to B", async () => {
    const readA = deferred<Card[]>();
    vi.mocked(api.cards.list).mockImplementation(async (id) => id === "A" ? readA.promise : [card(id)]);
    await renderApp();
    await click(element('[aria-label="查看项目：项目 B"]'));
    expectProjectB();
    await act(async () => { readA.resolve([card("A")]); });
    expectProjectB();
  });
});

describe("information depth forms", () => {
  it.each(depths)("passes the chosen %s depth when creating a project", async (depth) => {
    await renderApp();
    await click(element('[aria-label="新建项目"]'));
    await click(button("使用示例"));
    await click(button("分析需求"));
    const select = element<HTMLSelectElement>("#project-depth");
    expect([...select.options].map((option) => option.value)).toEqual(depths);
    expect(select.value).toBe("standard");
    await choose("#project-depth", depth);
    await click(button("创建"));
    expect(api.projects.create).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      draft: expect.objectContaining({ informationDepth: depth }),
    }));
    expect(element("h1").textContent).toBe("新项目");
    expect(element<HTMLInputElement>('[aria-label="更新项目：新项目"]').checked).toBe(false);
    expect(api.updates.run).not.toHaveBeenCalled();
    await click(element('[aria-label="项目设置"]'));
    expect(element<HTMLSelectElement>("#edit-project-depth").value).toBe(depth);
  });

  it.each(depths)("saves and reloads the chosen %s depth in project settings", async (depth) => {
    await renderApp();
    await click(element('[aria-label="项目设置"]'));
    expect([...element<HTMLSelectElement>("#edit-project-depth").options].map((option) => option.value)).toEqual(depths);
    await choose("#edit-project-depth", depth);
    await click(button("保存设置"));
    expect(api.projects.update).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: "A", informationDepth: depth }));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    await click(element('[aria-label="项目设置"]'));
    expect(element<HTMLSelectElement>("#edit-project-depth").value).toBe(depth);
    expect(element<HTMLInputElement>('[aria-label="更新项目：项目 A"]').checked).toBe(true);
  });
});
