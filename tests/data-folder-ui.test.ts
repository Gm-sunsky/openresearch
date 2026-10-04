// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Inspector } from "../src/components/Inspector";
import { I18nProvider } from "../src/i18n";
import { api } from "../src/api";
import type { Card, Project } from "../src/shared/contracts";

vi.mock("../src/api", () => ({ api: { maintenance: { openDataFolder: vi.fn() } } }));
const project: Project = {
  id: "test", name: "Test", description: "", goal: "Test goal", focus: [], informationDepth: "standard",
  updateSelected: false, updateFrequency: "daily", status: "active", cardCount: 0, sourceCount: 0,
  createdAt: "2026-10-04T00:00:00Z", updatedAt: "2026-10-04T00:00:00Z",
};
let root: Root;
let container: HTMLDivElement;
const props = {
  project, sources: [], candidates: [], taskRuns: [], changes: [], selectedCard: null, discovering: false, apiConfigured: false,
  onCreateSource: vi.fn(), onRemoveSource: vi.fn(), onToggleSource: vi.fn(), onRetrySource: vi.fn(), onSaveCard: vi.fn(),
  onRemoveCard: vi.fn(), onCloseCard: vi.fn(), onDiscover: vi.fn(), onAcceptCandidate: vi.fn(), onDismissCandidate: vi.fn(),
  onOpenSettings: vi.fn(), onResolveChange: vi.fn(), onJumpToChange: vi.fn(),
};
async function render(selectedCard: Card | null = null) {
  await act(async () => { root.render(createElement(I18nProvider, null, createElement(Inspector, { ...props, selectedCard }))); });
}
function folderButton() { return container.querySelector<HTMLButtonElement>('[aria-label="打开数据目录"]')!; }

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.setItem("ai-research-board-language", "zh-CN");
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

describe("inspector data location", () => {
  it("opens the real desktop directory through the existing API", async () => {
    vi.mocked(api.maintenance.openDataFolder).mockResolvedValue();
    await render(); await act(async () => folderButton().click());
    expect(api.maintenance.openDataFolder).toHaveBeenCalledExactlyOnceWith();
    expect(folderButton().disabled).toBe(false);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
  it("shows directory-opening failures and allows retry", async () => {
    vi.mocked(api.maintenance.openDataFolder).mockRejectedValueOnce(new Error("目录无法打开")).mockResolvedValue();
    await render(); await act(async () => folderButton().click());
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("目录无法打开");
    await act(async () => folderButton().click());
    expect(api.maintenance.openDataFolder).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
  it("disables the button until the desktop operation finishes", async () => {
    let resolve!: () => void;
    vi.mocked(api.maintenance.openDataFolder).mockImplementation(() => new Promise<void>(done => { resolve = done; }));
    await render(); await act(async () => folderButton().click());
    expect(folderButton().disabled).toBe(true);
    await act(async () => folderButton().click());
    expect(api.maintenance.openDataFolder).toHaveBeenCalledTimes(1);
    await act(async () => resolve());
    expect(folderButton().disabled).toBe(false);
  });
});

const selectedCard: Card = {
  id: "event", projectId: "test", type: "event", title: "Test event", content: "Event evidence",
  imageUrl: null, sourceUrl: null, sourceName: null, sourceLinks: [], focusCategory: null, occurredAt: null,
  importance: 1, locked: false, updateBatchId: null, updateBatchAt: null, changeKind: "none", packId: null, packOrder: 0,
  position: { x: 80, y: 80 }, size: { width: 320, height: 220 }, createdAt: project.createdAt, updatedAt: project.updatedAt,
};
describe("timeline date editor", () => {
  it("saves a chosen local event time as an ISO timestamp", async () => {
    await render(selectedCard);
    const input = container.querySelector<HTMLInputElement>("#card-event-date")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "2026-10-05T14:30");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const save = [...container.querySelectorAll("button")].find(button => button.textContent === "保存")!;
    await act(async () => save.click());
    expect(props.onSaveCard).toHaveBeenCalledWith(expect.objectContaining({ occurredAt: new Date("2026-10-05T14:30").toISOString() }));
  });
  it("allows clearing the event date so the timeline can use creation time", async () => {
    await render({ ...selectedCard, occurredAt: "2026-10-05T06:30:00Z" });
    const input = container.querySelector<HTMLInputElement>("#card-event-date")!;
    expect(input.value).not.toBe("");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "保存")!.click());
    expect(props.onSaveCard).toHaveBeenCalledWith(expect.objectContaining({ occurredAt: null }));
  });
});
