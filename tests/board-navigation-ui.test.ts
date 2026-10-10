// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Board } from "../src/components/Board";
import type { Card } from "../src/shared/contracts";
vi.mock("../src/i18n", () => ({ useI18n: () => ({ locale: "en", t: (key: string) => key }) }));
vi.mock("../src/api", () => ({ api: { links: { open: vi.fn() } } }));
const base: Card = { id: "card", projectId: "p", type: "note", title: "Title", content: "Material", imageUrl: null, sourceUrl: null, sourceName: null, sourceLinks: [], focusCategory: null, occurredAt: null, importance: 1, locked: false, updateBatchId: null, updateBatchAt: null, changeKind: "none", packId: null, packOrder: 0, position: { x: 100, y: 100 }, size: { width: 320, height: 250 }, createdAt: "2026-10-07T00:00:00Z", updatedAt: "2026-10-07T00:00:00Z" };
const batched = (id: string, at: string, y: number): Card => ({ ...base, id, updateBatchId: id, updateBatchAt: at, position: { x: 100, y } });
const old = batched("old", "2026-10-08T02:00:00+08:00", 500);
const latest = batched("latest", "2026-10-07T23:00:00Z", 100);
let host: HTMLDivElement, root: ReturnType<typeof createRoot>;
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); host = document.createElement("div"); document.body.append(host); root = createRoot(host); vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => { callback(0); return 1; }); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });
async function render(cards: Card[]) { const noop = vi.fn(); await act(async () => root.render(createElement(Board, { cards, loading: false, onMove: noop, onResize: noop, onAddNote: noop, selectedCardId: null, onSelect: noop, onPack: noop, onUnpack: noop, onUnpackAll: noop, onDelete: noop, onSetLocked: noop, focusRequest: null }))); }
it("places old timestamps above newer ones, marks the last latest, and keeps the unconnected navigation outside canvas scrolling", async () => {
  await render([latest, old]);
  const nodes = [...host.querySelectorAll<HTMLButtonElement>(".update-node")];
  expect(nodes.map(node => node.dataset.batchId)).toEqual(["old", "latest"]);
  expect(nodes[1].textContent).toContain("latestBatch");
  expect(host.querySelector(".board-scroll")!.contains(host.querySelector(".update-node-rail"))).toBe(false);
  expect(host.querySelector(".update-node-line")).toBeNull();
  const scroll = vi.fn(); host.querySelector<HTMLElement>(".board-scroll")!.scrollTo = scroll;
  await act(async () => nodes[0].click());
  expect(scroll).toHaveBeenCalledWith({ top: 418, behavior: "smooth" });
});
it("follows the newest new batch rather than jumping to an older inserted node", async () => {
  await render([latest, old]);
  const scroll = vi.fn(); host.querySelector<HTMLElement>(".board-scroll")!.scrollTo = scroll;
  await render([latest, old, batched("earlier", "2026-10-06T00:00:00Z", 900)]);
  expect(scroll).not.toHaveBeenCalled();
  await render([latest, old, batched("newest", "2026-10-09T00:00:00Z", 1900)]);
  expect(scroll).toHaveBeenCalledWith({ top: 1818, behavior: "smooth" });
  expect(host.querySelector(".update-node:last-child")!.getAttribute("data-batch-id")).toBe("newest");
});
