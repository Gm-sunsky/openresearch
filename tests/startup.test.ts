import { describe, expect, it, vi } from "vitest";
import type { App } from "electron";
import { StartupService, usesBuiltRenderer } from "../electron/main/startup";

function fixture(platform: NodeJS.Platform = "win32", packaged = true) {
  let enabled = false;
  const item = { name: "OpenResearch", path: "C:\\Program Files\\OpenResearch\\OpenResearch.exe", args: [], scope: "user", enabled: true };
  const getLoginItemSettings = vi.fn(() => ({ openAtLogin: platform === "darwin" && enabled, executableWillLaunchAtLogin: enabled, status: enabled ? "enabled" : "not-registered", launchItems: enabled ? [item] : [] }));
  const setLoginItemSettings = vi.fn((input: { openAtLogin?: boolean }) => { enabled = input.openAtLogin === true; });
  const host = { isPackaged: packaged, getLoginItemSettings, setLoginItemSettings } as unknown as App;
  return { getLoginItemSettings, setLoginItemSettings, service: new StartupService(host, platform, "C:\\Program Files\\OpenResearch\\OpenResearch.exe") };
}

describe("system startup settings", () => {
  it("enables and removes the Windows login item with an exact executable and matching read arguments", () => {
    const f = fixture();
    expect(f.service.get().enabled).toBe(false);
    expect(f.service.set(true).enabled).toBe(true);
    expect(f.setLoginItemSettings).toHaveBeenLastCalledWith({ openAtLogin: true, enabled: true, name: "OpenResearch", path: "C:\\Program Files\\OpenResearch\\OpenResearch.exe", args: [] });
    expect(f.getLoginItemSettings).toHaveBeenLastCalledWith({ path: "C:\\Program Files\\OpenResearch\\OpenResearch.exe", args: [] });
    expect(f.service.set(false).enabled).toBe(false);
  });
  it("does not claim that externally disabled Windows startup is enabled", () => {
    const f = fixture();
    f.getLoginItemSettings.mockReturnValue({ openAtLogin: true, executableWillLaunchAtLogin: false, status: "enabled", launchItems: [{ name: "OpenResearch", path: "C:\\Program Files\\OpenResearch\\OpenResearch.exe", args: [], scope: "user", enabled: false }] });
    expect(f.service.get().enabled).toBe(false);
    expect(() => f.service.set(true)).toThrow("系统未应用");
  });
  it("supports macOS native login items and reports pending OS approval", () => {
    const f = fixture("darwin");
    f.getLoginItemSettings.mockReturnValue({ openAtLogin: false, executableWillLaunchAtLogin: false, status: "requires-approval", launchItems: [] });
    expect(f.service.set(true)).toEqual({ enabled: false, supported: true, requiresApproval: true });
    expect(f.setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: true });
  });
  it("enables and disables the primary macOS app without Windows path arguments", () => {
    const f = fixture("darwin");
    expect(f.service.set(true).enabled).toBe(true);
    expect(f.setLoginItemSettings).toHaveBeenLastCalledWith({ openAtLogin: true });
    expect(f.service.set(false).enabled).toBe(false);
  });
  it("never registers a bare development executable or unsupported platforms", () => {
    for (const f of [fixture("win32", false), fixture("linux")]) {
      expect(f.service.get().supported).toBe(false);
      expect(() => f.service.set(true)).toThrow();
      expect(f.setLoginItemSettings).not.toHaveBeenCalled();
      expect(f.getLoginItemSettings).not.toHaveBeenCalled();
    }
  });
  it("registers a compiled Windows development app with its quoted project path and login launch flag", () => {
    let registered: { openAtLogin?: boolean; args?: string[] } = {};
    const applicationPath = "D:\\Research workspace\\信息研究";
    const host = {
      isPackaged: false,
      getLoginItemSettings: vi.fn(() => ({ openAtLogin: false, launchItems: registered.openAtLogin ? [{ name: "OpenResearch", path: "C:\\Electron\\electron.exe", enabled: true, args: registered.args!.map(arg => arg.replace(/^"(.*)"$/, "$1")) }] : [] })),
      setLoginItemSettings: vi.fn((value: typeof registered) => { registered = value; }),
    } as unknown as App;
    const service = new StartupService(host, "win32", "C:\\Electron\\electron.exe", "OpenResearch", { appPath: applicationPath, buildReady: true });
    expect(service.get().supported).toBe(true);
    expect(service.set(true).enabled).toBe(true);
    expect(registered.args).toEqual([`"${applicationPath}"`, "openresearch-login-start"]);
    expect(service.set(false).enabled).toBe(false);
    const other = new StartupService(host, "win32", "C:\\Electron\\electron.exe", "OpenResearch", { appPath: "D:\\Another app", buildReady: true });
    service.set(true);
    expect(other.get().enabled).toBe(false);
  });
  it("does not enable a development app before its compiled renderer is ready", () => {
    const f = fixture("win32", false);
    const host = { isPackaged: false, getLoginItemSettings: f.getLoginItemSettings, setLoginItemSettings: f.setLoginItemSettings } as unknown as App;
    const service = new StartupService(host, "win32", "electron.exe", "OpenResearch", { appPath: "D:\\Project", buildReady: false });
    expect(service.get()).toMatchObject({ supported: false, unavailableReason: "build" });
    expect(() => service.set(true)).toThrow();
    expect(f.setLoginItemSettings).not.toHaveBeenCalled();
  });
  it("loads the compiled renderer for login launch without requiring a Vite server", () => {
    expect(usesBuiltRenderer(false, ["electron.exe", "D:\\Project", "--launch-at-login"])).toBe(true);
    expect(usesBuiltRenderer(false, ["electron.exe", "D:\\Project", "openresearch-login-start"])).toBe(true);
    expect(usesBuiltRenderer(false, ["electron.exe", "D:\\Project"])).toBe(false);
    expect(usesBuiltRenderer(true, [])).toBe(true);
  });
  it("rechecks build availability when the user builds files after starting the development app", () => {
    const f = fixture("win32", false);
    const host = { isPackaged: false, getLoginItemSettings: f.getLoginItemSettings, setLoginItemSettings: f.setLoginItemSettings } as unknown as App;
    let ready = false;
    const service = new StartupService(host, "win32", "electron.exe", "OpenResearch", { appPath: "D:\\Project", buildReady: () => ready });
    expect(service.get().supported).toBe(false);
    ready = true;
    expect(service.get().supported).toBe(true);
    ready = false;
    expect(service.get().unavailableReason).toBe("build");
  });
  it("rejects malformed input before touching system settings", () => {
    const f = fixture();
    expect(() => f.service.set("true" as unknown as boolean)).toThrow("参数无效");
    expect(f.setLoginItemSettings).not.toHaveBeenCalled();
  });
});
