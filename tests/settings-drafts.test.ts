// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { SettingsDialog } from "../src/components/SettingsDialog";
import { I18nProvider } from "../src/i18n";
import { api } from "../src/api";
import type { AiSettings } from "../src/shared/contracts";
vi.mock("../src/api", () => ({ api: { settings: { save: vi.fn(), test: vi.fn() }, maintenance: {} } }));
it("preserves API setting drafts during refresh and ignores old test results after reopening", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); localStorage.setItem("ai-research-board-language", "zh-CN");
  const settings: AiSettings = { provider: "openai-compatible", protocol: "chat-completions", baseUrl: "https://example.com/v1", model: "original-model", apiKeyConfigured: false, apiKeyHint: null, autoDiscoverSources: true, autoAddVerifiedSources: false, aiOrganizeContent: true, language: "zh-CN", maxUpdateBatches: 20, updatedAt: null };
  const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
  let reject!: (error: Error) => void;
  vi.mocked(api.settings.test).mockImplementation(() => new Promise((_resolve, rejectPromise) => { reject = rejectPromise; }));
  const render = (open: boolean, value = settings) => act(async () => root.render(createElement(I18nProvider, null, createElement(SettingsDialog, { open, settings: value, onClose: vi.fn(), onSaved: vi.fn() }))));
  const type = (value: string) => act(async () => { const field = container.querySelector<HTMLInputElement>("#api-model")!; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value); field.dispatchEvent(new Event("input", { bubbles: true })); });
  try {
    await render(true); await type("typed-draft-model"); await render(true, { ...settings, updatedAt: "2026-10-07" });
    expect(container.querySelector<HTMLInputElement>("#api-model")!.value).toBe("typed-draft-model");
    await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "测试连接")!.click());
    await render(false); await render(true, { ...settings, model: "saved-model" }); await type("reopened-editor-draft");
    await act(async () => reject(new Error("Old test failure")));
    expect(container.querySelector<HTMLInputElement>("#api-model")!.value).toBe("reopened-editor-draft");
    expect(container.textContent).not.toContain("Old test failure");
  } finally { await act(async () => root.unmount()); container.remove(); localStorage.clear(); }
});
