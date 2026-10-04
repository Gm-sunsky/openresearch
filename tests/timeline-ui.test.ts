// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { Board } from "../src/components/Board";
import type { Card } from "../src/shared/contracts";

vi.mock("../src/i18n", () => ({ useI18n: () => ({ locale: "en", t: (key: string) => key }) }));
vi.mock("../src/components/ResearchCard", () => ({ ResearchCard: ({ card }: { card: Card }) => createElement("article", { "data-card-id": card.id }, card.title) }));

it("switches views, sorts dates and opens a card inside its original pack", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { callback(0); return 1; });
  const scrollTo = vi.fn();
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: scrollTo });
  const base: Card = { id: "first", projectId: "p", type: "event", title: "First card", content: "Content", occurredAt: "2026-01-02T08:00:00Z", createdAt: "2026-10-03T08:00:00Z", updatedAt: "2026-10-03T08:00:00Z", imageUrl: null, sourceUrl: null, sourceName: null, sourceLinks: [], focusCategory: null, importance: 2, locked: false, updateBatchId: null, updateBatchAt: null, changeKind: "none", packId: "pack", packOrder: 0, position: { x: 100, y: 200 }, size: { width: 320, height: 200 } };
  const second = { ...base, id: "second", title: "Second card", packOrder: 1, occurredAt: "2026-02-03T08:00:00Z" };
  const container = document.createElement("div");
  const root = createRoot(container);
  const onSelect = vi.fn();
  const noop = vi.fn();
  try {
    await act(async () => { root.render(createElement(Board, { cards: [base, second], loading: false, onMove: noop, onResize: noop, onAddNote: noop, selectedCardId: null, onSelect, onPack: noop, onUnpack: noop, onUnpackAll: noop, onDelete: noop, onSetLocked: noop, focusRequest: null })); });
    const timelineButton = [...container.querySelectorAll("button")].find((button) => button.textContent === "timelineView")!;
    await act(async () => { timelineButton.click(); });
    expect([...container.querySelectorAll(".timeline-entry strong")].map((element) => element.textContent)).toEqual(["Second card", "First card"]);
    const select = container.querySelector("select")!;
    await act(async () => { select.value = "oldest"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(container.querySelector(".timeline-entry strong")?.textContent).toBe("First card");
    await act(async () => { [...container.querySelectorAll<HTMLButtonElement>(".timeline-entry")].find((button) => button.textContent?.includes("Second card"))!.click(); });
    expect(container.querySelector(".timeline-view")).toBeNull();
    expect(container.querySelector("article")?.getAttribute("data-card-id")).toBe("second");
    expect(onSelect).toHaveBeenLastCalledWith("second");
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: "smooth" }));
  } finally {
    await act(async () => { root.unmount(); });
    vi.restoreAllMocks();
  }
});

it("keeps the timeline scroll position when background updates create a new batch", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { callback(0); return 1; });
  const scrollTo = vi.fn();
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: scrollTo });
  const first: Card = { id: "old", projectId: "p", type: "news", title: "Previous evidence", content: "Content", occurredAt: null, createdAt: "2026-10-03T08:00:00Z", updatedAt: "2026-10-03T08:00:00Z", imageUrl: null, sourceUrl: null, sourceName: null, sourceLinks: [], focusCategory: null, importance: 1, locked: false, updateBatchId: "old-batch", updateBatchAt: "2026-10-03T08:00:00Z", changeKind: "none", packId: null, packOrder: 0, position: { x: 100, y: 200 }, size: { width: 320, height: 200 } };
  const latest: Card = { ...first, id: "new", title: "New evidence", updateBatchId: "new-batch", updateBatchAt: "2026-10-04T08:00:00Z", createdAt: "2026-10-04T08:00:00Z", position: { x: 100, y: 1600 } };
  const container = document.createElement("div");
  const root = createRoot(container);
  const noop = vi.fn();
  const render = async (cards: Card[]) => act(async () => { root.render(createElement(Board, { cards, loading: false, onMove: noop, onResize: noop, onAddNote: noop, selectedCardId: null, onSelect: noop, onPack: noop, onUnpack: noop, onUnpackAll: noop, onDelete: noop, onSetLocked: noop, focusRequest: null })); });
  try {
    await render([first]);
    await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "timelineView")!.click());
    scrollTo.mockClear();
    await render([first, latest]);
    expect(container.querySelectorAll(".timeline-entry")).toHaveLength(2);
    expect(scrollTo).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    vi.restoreAllMocks();
  }
});
