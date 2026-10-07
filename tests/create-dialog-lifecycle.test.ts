// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { CreateProjectDialog } from "../src/components/CreateProjectDialog";
import { I18nProvider } from "../src/i18n";
import { api } from "../src/api";
import type { Project } from "../src/shared/contracts";
vi.mock("../src/api", () => ({ api: { projects: { preview: vi.fn(), create: vi.fn() } } }));
it("does not let a late create response close or reset a reopened text editor", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  localStorage.setItem("ai-research-board-language", "zh-CN");
  const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
  const onCreated = vi.fn(); const onClose = vi.fn();
  let resolve!: (project: Project) => void;
  const project: Project = { id: "old-request", name: "Old", description: "Description", goal: "Goal", focus: ["Focus"], informationDepth: "standard", updateFrequency: "daily", updateSelected: false, status: "active", cardCount: 0, sourceCount: 0, createdAt: "2026-10-07", updatedAt: "2026-10-07" };
  vi.mocked(api.projects.preview).mockResolvedValue(project);
  vi.mocked(api.projects.create).mockImplementation(() => new Promise(done => { resolve = done; }));
  const render = (open: boolean) => act(async () => root.render(createElement(I18nProvider, null, createElement(CreateProjectDialog, { open, onClose, onCreated }))));
  const type = async (value: string) => act(async () => { const field = container.querySelector("textarea")!; Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, value); field.dispatchEvent(new Event("input", { bubbles: true })); });
  try {
    await render(true); await type("第一份需求");
    await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "分析需求")!.click());
    await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "创建")!.click());
    expect(api.projects.create).toHaveBeenCalledOnce();
    await render(false); await render(true); await type("新的中文需求草稿");
    await act(async () => resolve(project));
    expect(onCreated).not.toHaveBeenCalled(); expect(onClose).not.toHaveBeenCalled();
    expect(container.querySelector("textarea")!.value).toBe("新的中文需求草稿");
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
  } finally { await act(async () => root.unmount()); container.remove(); localStorage.clear(); }
});
