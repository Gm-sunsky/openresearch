// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectSidebar } from "../src/components/ProjectSidebar";
import { I18nProvider } from "../src/i18n";
import type { Project } from "../src/shared/contracts";

const projects: Project[] = [
  { id: "a", name: "Research Alpha", description: "新能源", goal: "追踪市场", focus: ["电池"], updateSelected: true },
  { id: "b", name: "Research Beta", description: "医药", goal: "临床成果", focus: ["Health policy"], updateSelected: false },
].map((project) => ({ ...project, updateFrequency: "daily", status: "active", cardCount: 1, sourceCount: 0, createdAt: "2026-10-04", updatedAt: "2026-10-04" }));
let root: Root;
let container: HTMLDivElement;
const onSelect = vi.fn();
const onToggleUpdate = vi.fn();

function element<T extends HTMLElement>(selector: string): T {
  const found = container.querySelector<T>(selector);
  if (!found) throw new Error(`Element not found: ${selector}`);
  return found;
}

async function click(selector: string) {
  await act(async () => { element(selector).click(); });
}

async function search(value: string) {
  await act(async () => {
    const input = element<HTMLInputElement>('input[type="search"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function key(target: EventTarget, key: string, modifiers: KeyboardEventInit = {}) {
  await act(async () => { target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...modifiers })); });
}

async function render(language = "zh-CN") {
  window.localStorage.setItem("ai-research-board-language", language);
  await act(async () => {
    root.render(createElement(I18nProvider, null, createElement(ProjectSidebar, {
      projects, selectedId: "a", onSelect, onToggleUpdate, updatingIds: new Set<string>(),
      selectionSaving: false, onCreate: vi.fn(), onSettings: vi.fn(),
    })));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
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

describe("project search", () => {
  it("opens and focuses search, matches all project fields and clears without changing selection", async () => {
    await render();
    await click('[aria-controls="project-search"]');
    expect(document.activeElement).toBe(element('input[type="search"]'));
    for (const query of ["alpha", "新能源", "追踪市场", "电池", "  ALPHA 电池  "]) {
      await search(query);
      expect(container.querySelectorAll(".project-nav-item")).toHaveLength(1);
      expect(element('[aria-current="page"]').textContent).toContain("Alpha");
      expect(element<HTMLInputElement>('input[type="checkbox"]').checked).toBe(true);
    }
    await search("health POLICY");
    expect(container.querySelectorAll(".project-nav-item")).toHaveLength(1);
    expect(container.querySelector('[aria-current="page"]')).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
    expect(onToggleUpdate).not.toHaveBeenCalled();
    await click('[aria-label="清空项目搜索"]');
    expect(container.querySelectorAll(".project-nav-item")).toHaveLength(2);
    expect(element('[aria-current="page"]').textContent).toContain("Alpha");
  });

  it("shows no-match state and Enter does not select a hidden project", async () => {
    await render();
    await click('[aria-controls="project-search"]');
    await search("missing");
    expect(element('[role="status"]').textContent).toContain("没有匹配的项目");
    await key(element('input[type="search"]'), "Enter");
    expect(onSelect).not.toHaveBeenCalled();
    await key(element('input[type="search"]'), "Escape");
    expect(container.querySelector('input[type="search"]')).toBeNull();
    expect(container.querySelectorAll(".project-nav-item")).toHaveLength(2);
    expect(document.activeElement).toBe(element('[aria-controls="project-search"]'));
  });

  it("supports Ctrl/Cmd+K and selecting the first match with Enter in English", async () => {
    await render("en");
    await key(window, "k", { ctrlKey: true });
    const input = element<HTMLInputElement>('[aria-label="Search projects"]');
    expect(document.activeElement).toBe(input);
    await search("Beta");
    await key(input, "Enter");
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("b");
    expect(onToggleUpdate).not.toHaveBeenCalled();
    expect(container.querySelector('input[type="search"]')).toBeNull();
    await key(window, "K", { metaKey: true });
    expect(element<HTMLInputElement>('input[type="search"]').value).toBe("");
    expect(document.activeElement).toBe(element('input[type="search"]'));
  });
});
