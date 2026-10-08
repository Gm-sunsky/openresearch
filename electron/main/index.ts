import path from "node:path";
import { existsSync } from "node:fs";
import { app, BrowserWindow, net, safeStorage, powerMonitor } from "electron";
import { IPC_CHANNELS } from "../../src/shared/contracts";
import { StartupService, usesBuiltRenderer } from "./startup";
import { AiApiClient } from "./ai-client";
import { ApiSettingsService, type SecretProtector } from "./api-settings";
import { ResearchDatabase } from "./database";
import { FeedService } from "./feed-service";
import { registerIpcHandlers } from "./ipc";
import { ProjectScheduler } from "./scheduler";
import { loadResearchSkill } from "./research-skill";
import { SourceDiscoveryAgent } from "./source-discovery";

// Preserve the existing data directory when upgrading from AI Research Board.
const legacyProfiles = ["AI Research Board", "ai-research-board"].map((name) => path.join(app.getPath("appData"), name));
app.setPath("userData", legacyProfiles.find((directory) => existsSync(path.join(directory, "research-board.sqlite"))) ?? legacyProfiles[0]);

let database: ResearchDatabase | null = null;
let scheduler: ProjectScheduler | null = null;
const hasInstanceLock = app.requestSingleInstanceLock();
app.on("second-instance", () => {
  if (!database) return;
  const window = BrowserWindow.getAllWindows()[0] ?? createMainWindow();
  if (window.isMinimized()) window.restore();
  window.show(); window.focus();
});

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 680,
    show: false,
    title: `OpenResearch ${app.getVersion()}`,
    backgroundColor: "#f1efe9",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once("ready-to-show", () => window.show());
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("http://127.0.0.1:5173")) event.preventDefault();
  });

  if (usesBuiltRenderer(app.isPackaged, process.argv)) {
    void window.loadFile(path.join(__dirname, "../../../dist/index.html"));
  } else {
    void window.loadURL("http://127.0.0.1:5173");
    if (process.env.RESEARCH_BOARD_DEVTOOLS === "1") window.webContents.openDevTools({ mode: "detach" });
  }

  return window;
}

async function startApplication(): Promise<void> {
  const wasmPath = app.isPackaged
    ? path.join(process.resourcesPath, "sql-wasm.wasm")
    : require.resolve("sql.js/dist/sql-wasm.wasm");
  database = await ResearchDatabase.open(path.join(app.getPath("userData"), "research-board.sqlite"), wasmPath);
  const chromiumFetch = net.fetch.bind(net) as unknown as typeof fetch;
  const protector: SecretProtector = {
    available: () => safeStorage.isEncryptionAvailable(),
    encrypt: (value) => safeStorage.encryptString(value).toString("base64"),
    decrypt: (value) => safeStorage.decryptString(Buffer.from(value, "base64")),
  };
  const settings = new ApiSettingsService(database, protector);
  const ai = new AiApiClient(settings, chromiumFetch, app.getLocale(), loadResearchSkill(app.getAppPath()));
  const feeds = new FeedService(database, chromiumFetch, ai);
  const discovery = new SourceDiscoveryAgent(database, ai, settings, chromiumFetch);
  scheduler = new ProjectScheduler(database, feeds, discovery, settings, () => {
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send(IPC_CHANNELS.updatesChanged);
  });
  const applicationPath = app.getAppPath();
  const startup = new StartupService(app, process.platform, process.execPath, "OpenResearch", {
    appPath: applicationPath,
    buildReady: () => existsSync(path.join(applicationPath, "dist/index.html")) && existsSync(path.join(applicationPath, "dist-electron/electron/main/index.js")),
  });
  registerIpcHandlers(database, feeds, settings, ai, discovery, startup);
  scheduler.start();
  powerMonitor.on("resume", checkAfterResume);
  createMainWindow();
}

app.whenReady().then(async () => {
  if (!hasInstanceLock) { app.quit(); return; }
  await startApplication();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
}).catch((error) => {
  console.error("Failed to start OpenResearch", error);
  app.quit();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  powerMonitor.removeListener("resume", checkAfterResume);
  scheduler?.stop();
  database?.close();
  scheduler = null;
  database = null;
});

function checkAfterResume(): void {
  void scheduler?.checkDueProjects().catch(error => console.error("Wake update check failed", error));
}
