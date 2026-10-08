// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StartupControl } from "../src/components/StartupControl";
const mock = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
const translation = vi.hoisted(() => ({ t: (key: string) => key }));
vi.mock("../src/api", () => ({ api: { startup: mock } }));
vi.mock("../src/i18n", () => ({ useI18n: () => ({ t: translation.t }) }));
let host: HTMLDivElement, root: ReturnType<typeof createRoot>;
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); vi.resetAllMocks(); translation.t = key => key; host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
const state = { enabled: false, supported: true, requiresApproval: false };
it("saves startup immediately without saving API settings and reloads OS changes on focus", async () => {
  mock.get.mockResolvedValue(state); mock.set.mockResolvedValue({ ...state, enabled: true });
  await act(async () => root.render(createElement(StartupControl)));
  const checkbox = host.querySelector<HTMLInputElement>("input")!;
  await act(async () => checkbox.click());
  expect(mock.set).toHaveBeenCalledWith(true); expect(checkbox.checked).toBe(true);
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(checkbox.checked).toBe(false);
});
it("reports errors without falsely flipping the switch", async () => {
  mock.get.mockResolvedValue(state); mock.set.mockRejectedValue(new Error("System refused"));
  await act(async () => root.render(createElement(StartupControl)));
  await act(async () => host.querySelector<HTMLInputElement>("input")!.click());
  expect(host.textContent).toContain("System refused"); expect(host.querySelector<HTMLInputElement>("input")!.checked).toBe(false);
});
it("disables the browser preview control and shows pending macOS approval", async () => {
  mock.get.mockResolvedValue({ ...state, supported: false });
  await act(async () => root.render(createElement(StartupControl)));
  expect(host.querySelector<HTMLInputElement>("input")!.disabled).toBe(true);
  mock.get.mockResolvedValue({ ...state, requiresApproval: true });
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(host.textContent).toContain("startupApproval");
});
it("finishes a pending system write after language changes or focus returns", async () => {
  mock.get.mockResolvedValue(state);
  let finish!: (value: typeof state) => void;
  mock.set.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await act(async () => root.render(createElement(StartupControl)));
  await act(async () => host.querySelector<HTMLInputElement>("input")!.click());
  translation.t = key => "translated:" + key;
  await act(async () => { root.render(createElement(StartupControl)); window.dispatchEvent(new Event("focus")); });
  await act(async () => finish({ ...state, enabled: true }));
  const checkbox = host.querySelector<HTMLInputElement>("input")!;
  expect(checkbox.checked).toBe(true); expect(checkbox.disabled).toBe(false);
});
it("keeps the sidebar and settings switches synchronized with distinct IDs", async () => {
  let enabled = false;
  mock.get.mockImplementation(async () => ({ ...state, enabled }));
  mock.set.mockImplementation(async value => ({ ...state, enabled: enabled = value }));
  await act(async () => root.render([createElement(StartupControl, { compact: true, key: "sidebar" }), createElement(StartupControl, { key: "settings" })]));
  const sidebar = host.querySelector<HTMLInputElement>("#sidebar-launch-at-login")!;
  const settings = host.querySelector<HTMLInputElement>("#launch-at-login")!;
  await act(async () => sidebar.click());
  expect(sidebar.checked).toBe(true); expect(settings.checked).toBe(true);
  await act(async () => settings.click());
  expect(sidebar.checked).toBe(false); expect(settings.checked).toBe(false);
});
