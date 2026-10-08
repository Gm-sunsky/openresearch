// @vitest-environment jsdom
import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { CardReader } from "../src/components/CardReader";
import { ResearchCard } from "../src/components/ResearchCard";
import type { Card } from "../src/shared/contracts";

vi.mock("../src/i18n", () => ({ useI18n: () => ({ locale: "en", t: (key: string) => key }) }));
vi.mock("../src/api", () => ({ api: { links: { open: vi.fn() } } }));
const card: Card = { id: "first", projectId: "p", type: "news", title: "Full evidence", content: "Complete facts. ".repeat(100), summary: "Short overview.", images: [{ url: "https://example.com/core.png", caption: "Core fact", relevance: "relevant" }, { url: "https://example.com/extra.png", caption: null, relevance: "unverified" }], occurredAt: null, createdAt: "2026-10-03T08:00:00Z", updatedAt: "2026-10-03T08:00:00Z", imageUrl: "https://example.com/core.png", sourceUrl: null, sourceName: null, sourceLinks: [], focusCategory: null, importance: 2, locked: false, updateBatchId: null, updateBatchAt: null, changeKind: "none", packId: "pack", packOrder: 0, position: { x: 100, y: 200 }, size: { width: 320, height: 420 } };

it("shows complete material and all images, traps focus, scrolls and turns pack pages", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const scrollBy = vi.fn();
  Object.defineProperty(HTMLElement.prototype, "scrollBy", { configurable: true, value: scrollBy });
  const container = document.createElement("div");
  const opener = document.createElement("button");
  container.append(opener); document.body.append(container); opener.focus();
  const host = document.createElement("div"); container.append(host);
  const root = createRoot(host);
  const navigate = vi.fn(); const close = vi.fn();
  try {
    await act(async () => root.render(createElement(CardReader, { card, cards: [card, { ...card, id: "second", packOrder: 1 }], onNavigate: navigate, onClose: close })));
    const dialog = document.querySelector<HTMLDivElement>("[role='dialog']")!;
    expect(dialog.querySelector(".card-reader-text")?.textContent).toBe(card.content);
    expect(dialog.querySelectorAll("img")).toHaveLength(2);
    expect(dialog.querySelectorAll(".card-reader-unverified")).toHaveLength(1);
    expect(container.inert).toBe(true);
    const dispatch = (key: string, shiftKey = false) => act(async () => { document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true })); });
    await dispatch("ArrowDown"); expect(scrollBy).toHaveBeenCalledWith({ top: 100, behavior: "smooth" });
    await dispatch("ArrowRight"); expect(navigate).toHaveBeenCalledWith("second");
    const last = [...dialog.querySelectorAll<HTMLElement>("button:not(:disabled), [tabindex='0']")].at(-1)!;
    last.focus(); await dispatch("Tab");
    expect(document.activeElement).toBe(dialog.querySelector("button:not(:disabled)"));
    await dispatch("Escape"); expect(close).toHaveBeenCalledOnce();
  } finally { await act(async () => root.unmount()); expect(container.inert).not.toBe(true); expect(document.activeElement).toBe(opener); container.remove(); }
});

it("keeps full content intact while showing a bounded summary and opens on double click", async () => {
  const container = document.createElement("div"); const root = createRoot(container); const noop = vi.fn(); const open = vi.fn();
  try {
    await act(async () => root.render(createElement(ResearchCard, { card, cardsInPack: [card], activeIndex: 0, selected: false, highlighted: false, dropTarget: false, onDragMove: noop, onDragEnd: noop, onResize: noop, onSelect: noop, onNavigate: noop, onUnpack: noop, onUnpackAll: noop, onDelete: noop, onSetLocked: noop, onOpen: open })));
    expect(container.querySelector(".card-content")?.textContent).toContain("Short overview");
    expect(container.querySelector(".card-content")?.textContent).not.toContain("Complete facts");
    await act(async () => container.querySelector("article")!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
    expect(open).toHaveBeenCalledWith("first");
    expect(card.content.length).toBeGreaterThan(1000);
    await act(async () => container.querySelector<HTMLButtonElement>("[aria-label='Read full card']")!.click());
    expect(open).toHaveBeenCalledTimes(2);
  } finally { await act(async () => root.unmount()); }
});



it("keeps keyboard navigation working after clicking the last page button", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
  const second = { ...card, id: "second", title: "Second material", packOrder: 1 };
  function Fixture() {
    const [current, setCurrent] = useState(card.id);
    return createElement(CardReader, { card: current === card.id ? card : second, cards: [card, second], onNavigate: setCurrent, onClose: vi.fn() });
  }
  try {
    await act(async () => root.render(createElement(Fixture)));
    const next = document.querySelector<HTMLButtonElement>("[aria-label='Next page']")!;
    next.focus(); await act(async () => next.click());
    expect(document.querySelector(".card-reader h1")!.textContent).toBe("Second material");
    expect(document.activeElement).toBe(document.querySelector(".card-reader-scroll"));
    await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true })));
    expect(document.querySelector(".card-reader h1")!.textContent).toBe(card.title);
  } finally { await act(async () => root.unmount()); container.remove(); }
});

it("provides a contents rail and retains source provenance when only a primary link exists", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const scrollIntoView = vi.fn();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scrollIntoView });
  const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
  const material = { ...card, sourceUrl: "https://example.com/report", sourceName: "Original report" };
  try {
    await act(async () => root.render(createElement(CardReader, { card: material, cards: [material], onNavigate: vi.fn(), onClose: vi.fn() })));
    const rail = document.querySelector(".card-reader-contents")!;
    expect(rail.querySelectorAll("button")).toHaveLength(4);
    await act(async () => [...rail.querySelectorAll("button")].find(button => button.textContent?.startsWith("Sources"))!.click());
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(document.querySelector(".card-reader-sources")?.textContent).toContain("https://example.com/report");
    expect(document.querySelector(".card-reader-summary")?.textContent).toBe(card.summary);
    expect(document.querySelector(".card-reader-core-image img")?.getAttribute("src")).toBe(card.imageUrl);
    expect(document.querySelector(".card-reader-images img")?.getAttribute("src")).toBe("https://example.com/extra.png");
    await act(async () => document.querySelector<HTMLButtonElement>(".card-reader-core-link")!.click());
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(document.querySelector(".card-reader-core-image"));
    expect(document.activeElement).toBe(document.querySelector(".card-reader-scroll"));
  } finally { await act(async () => root.unmount()); container.remove(); }
});

it("routes image arrow scrolling to the gallery and resets the current contents item on page changes", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(HTMLElement.prototype, "scrollBy", { configurable: true, value: vi.fn() });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
  const second = { ...card, id: "second", title: "Second material" };
  function Fixture() {
    const [current, setCurrent] = useState(card.id);
    return createElement(CardReader, { card: current === card.id ? { ...card, sourceName: "0 sources" } : second, cards: [card, second], onNavigate: setCurrent, onClose: vi.fn() });
  }
  try {
    await act(async () => root.render(createElement(Fixture)));
    const article = document.querySelector<HTMLElement>(".card-reader-scroll")!;
    const gallery = document.querySelector<HTMLElement>(".card-reader-images")!;
    const articleScroll = vi.fn(); const galleryScroll = vi.fn();
    Object.defineProperty(article, "scrollBy", { configurable: true, value: articleScroll });
    Object.defineProperty(gallery, "scrollBy", { configurable: true, value: galleryScroll });
    const rail = document.querySelector(".card-reader-contents")!;
    expect(document.querySelector(".card-reader-meta")?.textContent).toBe("0 sources");
    await act(async () => [...rail.querySelectorAll("button")].find(button => button.textContent?.startsWith("Images"))!.click());
    expect(rail.querySelector("[aria-current='location']")?.textContent).toBe("Images2");
    expect(document.activeElement).toBe(gallery);
    await act(async () => gallery.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true })));
    expect(galleryScroll).toHaveBeenCalledWith({ top: 100, behavior: "smooth" });
    expect(articleScroll).not.toHaveBeenCalled();
    article.focus();
    await act(async () => article.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true })));
    expect(articleScroll).toHaveBeenCalledWith({ top: -100, behavior: "smooth" });
    await act(async () => gallery.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true })));
    expect(rail.querySelector("[aria-current='location']")?.textContent).toBe("Overview");
    expect(document.activeElement).toBe(article);
  } finally { await act(async () => root.unmount()); container.remove(); }
});
