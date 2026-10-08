// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ResearchCard } from "../src/components/ResearchCard";
import { Board } from "../src/components/Board";
import type { Card } from "../src/shared/contracts";
vi.mock("../src/i18n", () => ({ useI18n: () => ({ locale: "en", t: (key: string) => key }) }));
vi.mock("../src/api", () => ({ api: { links: { open: vi.fn() } } }));
const card: Card = { id: "one", projectId: "p", type: "note", title: "Title", content: "Full content", summary: "Overview", imageUrl: null, sourceUrl: null, sourceName: null, sourceLinks: [], focusCategory: null, occurredAt: null, importance: 1, locked: false, updateBatchId: null, updateBatchAt: null, changeKind: "none", packId: "pack", packOrder: 0, position: { x: 100, y: 100 }, size: { width: 320, height: 300 }, createdAt: "2026-10-07", updatedAt: "2026-10-07" };
let host: HTMLDivElement; let root: ReturnType<typeof createRoot>; const navigate = vi.fn(); const parentWheel = vi.fn();
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); vi.clearAllMocks(); host = document.createElement("div"); document.body.append(host); host.addEventListener("wheel", parentWheel); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
async function render(packed = true) {
  const value = { ...card, packId: packed ? "pack" : null }; const noop = vi.fn();
  await act(async () => root.render(createElement(ResearchCard, { card: value, cardsInPack: packed ? [value, { ...value, id: "two" }] : [value], activeIndex: 0, selected: false, highlighted: false, dropTarget: false, onDragMove: noop, onDragEnd: noop, onResize: noop, onSelect: noop, onNavigate: navigate, onUnpack: noop, onUnpackAll: noop, onDelete: noop, onSetLocked: noop })));
}
async function wheel(deltaY: number, deltaMode = 0) {
  const event = new WheelEvent("wheel", { deltaY, deltaMode, bubbles: true, cancelable: true });
  await act(async () => host.querySelector("article")!.dispatchEvent(event)); return event;
}
it("cancels default scrolling and bubbling while paging a pack", async () => {
  await render(); expect((await wheel(100)).defaultPrevented).toBe(true); expect(navigate).toHaveBeenCalledWith(1); expect(parentWheel).not.toHaveBeenCalled();
});
it("also absorbs throttled and small wheel packets", async () => {
  await render(); await wheel(100); expect((await wheel(100)).defaultPrevented).toBe(true); expect((await wheel(1)).defaultPrevented).toBe(true); expect(navigate).toHaveBeenCalledTimes(1); expect(parentWheel).not.toHaveBeenCalled();
});
it("lets single cards use normal board scrolling", async () => {
  await render(false); expect((await wheel(100)).defaultPrevented).toBe(false); expect(parentWheel).toHaveBeenCalledOnce(); expect(navigate).not.toHaveBeenCalled();
});
it("supports line-based wheel input and removes the native listener on unmount", async () => {
  await render(); const element = host.querySelector("article")!; expect((await wheel(1, 1)).defaultPrevented).toBe(true); expect(navigate).toHaveBeenCalledWith(1);
  await act(async () => root.render(null)); const event = new WheelEvent("wheel", { deltaY: 100, bubbles: true, cancelable: true }); element.dispatchEvent(event); expect(event.defaultPrevented).toBe(false);
});
it("keeps the board's capture guard stable across pack pages and leaves outside scrolling alone", async () => {
  const noop = vi.fn();
  await act(async () => root.render(createElement(Board, { cards: [card, { ...card, id: "two", packOrder: 1 }], loading: false, onMove: noop, onResize: noop, onAddNote: noop, selectedCardId: null, onSelect: noop, onPack: noop, onUnpack: noop, onUnpackAll: noop, onDelete: noop, onSetLocked: noop, focusRequest: null })));
  const observed: boolean[] = [];
  host.querySelector(".board-scroll")!.addEventListener("wheel", event => observed.push(event.defaultPrevented), true);
  await wheel(100);
  expect(observed).toEqual([true]);
  expect(host.querySelector("[data-card-id=two]")).not.toBeNull();
  const outside = new WheelEvent("wheel", { deltaY: 100, bubbles: true, cancelable: true });
  host.querySelector(".board-scroll")!.dispatchEvent(outside);
  expect(outside.defaultPrevented).toBe(false);
  await act(async () => root.render(null));
  const detached = new WheelEvent("wheel", { bubbles: true, cancelable: true });
  document.dispatchEvent(detached);
  expect(detached.defaultPrevented).toBe(false);
});
