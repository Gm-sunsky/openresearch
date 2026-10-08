import type { App } from "electron";
import type { StartupSettings } from "../../src/shared/contracts";

type StartupHost = Pick<App, "isPackaged" | "getLoginItemSettings" | "setLoginItemSettings">;

/** The operating system is authoritative, including changes made outside the app. */
export class StartupService {
  constructor(private readonly host: StartupHost, private readonly platform = process.platform, private readonly executable = process.execPath, private readonly name = "OpenResearch") {}

  get(): StartupSettings {
    const supported = this.host.isPackaged && (this.platform === "win32" || this.platform === "darwin");
    if (!supported) return { enabled: false, supported: false, requiresApproval: false };
    const state = this.host.getLoginItemSettings(this.platform === "win32" ? { path: this.executable, args: [] } : {});
    const ownItem = this.platform === "win32" ? state.launchItems.find(item => item.name === this.name && item.path.toLowerCase() === this.executable.toLowerCase() && item.args.length === 0) : null;
    return {
      supported,
      enabled: this.platform === "win32" ? ownItem?.enabled === true : state.openAtLogin,
      requiresApproval: state.status === "requires-approval",
    };
  }

  set(enabled: boolean): StartupSettings {
    if (typeof enabled !== "boolean") throw new Error("自启动开关参数无效 / Invalid startup setting");
    if (!this.get().supported) throw new Error("请在 Windows 或 macOS 正式桌面版中设置自启动 / Use the packaged desktop app");
    this.host.setLoginItemSettings(this.platform === "win32"
      ? { openAtLogin: enabled, enabled, name: this.name, path: this.executable, args: [] }
      : { openAtLogin: enabled });
    const state = this.get();
    if (state.enabled !== enabled && !state.requiresApproval) throw new Error("系统未应用自启动设置，请检查系统登录项 / The system did not apply the login-item setting");
    return state;
  }
}
