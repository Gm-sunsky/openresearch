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
  return { id: "one", projectId: "test", type: "news", title: "活动时间", content: "19:00", imageUrl, images: [{ url: imageUrl, caption: "官方活动时间公告：19:00 开始", relevance: "relevant" }],
    sourceUrl: null, sourceName: null, sourceLinks: [], focusCategory: null, occurredAt: null, importance: 1,
    locked: false, updateBatchId: null, updateBatchAt: null, changeKind: "none", packId: null, packOrder: 0,
    position: { x: 24, y: 24 }, size: { width: 360, height: 390 }, createdAt: "2026-09-01", updatedAt: "2026-09-01" };
}
async function render(value: Card, callbacks: { onDragCancel?: () => void; onDragEnd?: () => void; onDragMove?: () => void } = {}) {
  if (!host) { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); }
  await act(async () => root.render(createElement(I18nProvider, { children: createElement(ResearchCard, {
    card: value, cardsInPack: [value], activeIndex: 0, selected: false, highlighted: false, dropTarget: false,
    onDragMove: callbacks.onDragMove ?? noop, onDragEnd: callbacks.onDragEnd ?? noop, onDragCancel: callbacks.onDragCancel, onResize: noop, onSelect: noop, onNavigate: noop,
    onUnpack: noop, onUnpackAll: noop, onDelete: noop, onSetLocked: noop,
  }) })));
}
afterEach(async () => { await act(async () => root?.unmount()); host?.remove(); host = undefined as unknown as HTMLDivElement; });
describe("card image lifecycle", () => {
  it("cleans up resize capture and global pointer suppression when the window loses focus", async () => {
    await render(card("https://example.com/poster.png"));
    const handle = host.querySelector("[data-resize-handle='se']") as HTMLElement;
    const release = vi.fn();
    handle.setPointerCapture = vi.fn();
    handle.hasPointerCapture = () => true;
    handle.releasePointerCapture = release;
    const pointer = (type: string, x: number) => {
      const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: x });
      Object.defineProperty(event, "pointerId", { value: 7 });
      return event;
    };
    await act(async () => handle.dispatchEvent(pointer("pointerdown", 10)));
    expect(host.querySelector(".resizing")).not.toBeNull();
    const activeMove = pointer("pointermove", 20);
    await act(async () => window.dispatchEvent(activeMove));
    expect(activeMove.defaultPrevented).toBe(true);
    await act(async () => window.dispatchEvent(new Event("blur")));
    expect(release).toHaveBeenCalledWith(7);
    expect(host.querySelector(".resizing")).toBeNull();
    const nextMove = pointer("pointermove", 30);
    await act(async () => window.dispatchEvent(nextMove));
    expect(nextMove.defaultPrevented).toBe(false);
  });
  it.each([null, "", "   "])("hides preview images without an informative caption (%s)", async (caption) => {
    const value = card("https://example.com/poster.png");
    value.images = [{ url: value.imageUrl!, caption, relevance: "relevant" }];
    await render(value);
    expect(host.querySelector("img")).toBeNull();
  });
  it("hides unverified and legacy images without changing their stored detail data", async () => {
    const value = card("https://example.com/poster.png");
    value.images![0].relevance = "unverified";
    await render(value);
    expect(host.querySelector("img")).toBeNull();
    await render({ ...value, images: undefined });
    expect(host.querySelector("img")).toBeNull();
    expect(value.imageUrl).toBe("https://example.com/poster.png");
  });
  it("hides a selected preview URL that has no matching verified image", async () => {
    const value = card("https://example.com/poster.png");
    value.images![0].url = "https://example.com/other.png";
    await render(value);
    expect(host.querySelector("img")).toBeNull();
  });
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


it("cancels a blurred drag without committing a drop or pack", async () => {
  const onDragCancel = vi.fn(), onDragEnd = vi.fn(), onDragMove = vi.fn();
  await render(card("https://example.com/related.png"), { onDragCancel, onDragEnd, onDragMove });
  const article = host.querySelector("article")!;
  Object.defineProperties(article, { setPointerCapture: { value: vi.fn() }, hasPointerCapture: { value: () => true }, releasePointerCapture: { value: vi.fn() } });
  const pointer = (type: string, clientX: number) => {
    const event = new MouseEvent(type, { bubbles: true, button: 0, clientX, clientY: 50 });
    Object.defineProperties(event, { pointerId: { value: 12 }, pointerType: { value: "mouse" } });
    return event;
  };
  await act(async () => article.dispatchEvent(pointer("pointerdown", 50)));
  await act(async () => article.dispatchEvent(pointer("pointermove", 90)));
  expect(onDragMove).toHaveBeenCalled();
  await act(async () => window.dispatchEvent(new Event("blur")));
  expect(onDragCancel).toHaveBeenCalledOnce();
  expect(onDragEnd).not.toHaveBeenCalled();
});
