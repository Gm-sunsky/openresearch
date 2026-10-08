import { describe, expect, it, vi } from "vitest";
import type { App } from "electron";
import { StartupService } from "../electron/main/startup";

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
  it("never registers the development executable or unsupported platforms", () => {
    for (const f of [fixture("win32", false), fixture("linux")]) {
      expect(f.service.get().supported).toBe(false);
      expect(() => f.service.set(true)).toThrow();
      expect(f.setLoginItemSettings).not.toHaveBeenCalled();
      expect(f.getLoginItemSettings).not.toHaveBeenCalled();
    }
  });
  it("rejects malformed input before touching system settings", () => {
    const f = fixture();
    expect(() => f.service.set("true" as unknown as boolean)).toThrow("参数无效");
    expect(f.setLoginItemSettings).not.toHaveBeenCalled();
  });
});
