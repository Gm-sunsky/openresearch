// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResearchCard } from "../src/components/ResearchCard";
import { I18nProvider } from "../src/i18n";
import type { Card } from "../src/shared/contracts";
vi.mock("../src/api", () => ({ api: { links: { open: vi.fn() } } }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let host: HTMLDivElement;
const noop = () => undefined;
function card(imageUrl: string): Card {
  return { id: "one", projectId: "test", type: "news", title: "活动时间", content: "19:00", imageUrl,
    sourceUrl: null, sourceName: null, sourceLinks: [], focusCategory: null, occurredAt: null, importance: 1,
    locked: false, updateBatchId: null, updateBatchAt: null, changeKind: "none", packId: null, packOrder: 0,
    position: { x: 24, y: 24 }, size: { width: 360, height: 390 }, createdAt: "2026-09-01", updatedAt: "2026-09-01" };
}
async function render(value: Card) {
  if (!host) { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); }
  await act(async () => root.render(createElement(I18nProvider, { children: createElement(ResearchCard, {
    card: value, cardsInPack: [value], activeIndex: 0, selected: false, highlighted: false, dropTarget: false,
    onDragMove: noop, onDragEnd: noop, onResize: noop, onSelect: noop, onNavigate: noop,
    onUnpack: noop, onUnpackAll: noop, onDelete: noop, onSetLocked: noop,
  }) })));
}
afterEach(async () => { await act(async () => root?.unmount()); host?.remove(); host = undefined as unknown as HTMLDivElement; });
describe("card image lifecycle", () => {
  it("uses loaded natural dimensions and returns to an unknown ratio on URL change", async () => {
    await render(card("https://example.com/wide.png"));
    const image = host.querySelector("img")!;
    Object.defineProperties(image, { naturalWidth: { value: 2400 }, naturalHeight: { value: 300 } });
    await act(async () => image.dispatchEvent(new Event("load")));
    const height = (host.querySelector(".card-image-frame") as HTMLElement).style.height;
    expect(parseFloat(height)).toBe(40);
    await render(card("https://example.com/portrait.png"));
    expect((host.querySelector(".card-image-frame") as HTMLElement).style.height).not.toBe(height);
    const next = host.querySelector("img")!;
    Object.defineProperties(next, { naturalWidth: { value: 300 }, naturalHeight: { value: 2400 } });
    await act(async () => next.dispatchEvent(new Event("load")));
    expect(parseFloat((host.querySelector(".card-image-frame") as HTMLElement).style.height)).toBeGreaterThan(40);
  });
  it("removes a failed image and recovers when the URL changes", async () => {
    await render(card("https://example.com/broken.png"));
    const previous = host.querySelector("img")!;
    await act(async () => previous.dispatchEvent(new Event("error")));
    expect(host.querySelector("img")).toBeNull();
    await render(card("https://example.com/recovered.png"));
    expect(host.querySelector("img")?.src).toContain("recovered.png");
    await act(async () => previous.dispatchEvent(new Event("error")));
    expect(host.querySelector("img")?.src).toContain("recovered.png");
  });
});
