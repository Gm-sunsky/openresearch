// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { I18nProvider } from "../src/i18n";
import { ProjectSettingsDialog } from "../src/components/ProjectSettingsDialog";
import type { Project } from "../src/shared/contracts";

it("keeps project settings drafts during polling and reloads on reopening", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  const project: Project = { id: "a", name: "Original", description: "", goal: "Goal", focus: ["Topic"], informationDepth: "standard", updateFrequency: "daily", updateSelected: false, status: "active", cardCount: 0, sourceCount: 0, createdAt: "2026-10-06T00:00:00Z", updatedAt: "2026-10-06T00:00:00Z" };
  const render = async (open: boolean, value = project) => act(async () => root.render(createElement(I18nProvider, null, createElement(ProjectSettingsDialog, { open, project: value, onClose: vi.fn(), onSave: vi.fn(), onDelete: vi.fn() }))));
  try {
    await render(true);
    const input = container.querySelector("input")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Unsaved draft");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await render(true, { ...project, cardCount: 20 });
    expect(input.value).toBe("Unsaved draft");
    await render(false);
    await render(true, { ...project, name: "Latest saved" });
    expect(container.querySelector("input")!.value).toBe("Latest saved");
  } finally { await act(async () => root.unmount()); container.remove(); }
});
