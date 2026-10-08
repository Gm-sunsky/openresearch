import { contextBridge, ipcRenderer } from "electron";
import type { ResearchBoardApi } from "../../src/shared/contracts";

// Sandboxed Electron preload scripts cannot require arbitrary local modules.
// Keep runtime channel names self-contained so the compiled preload only loads Electron.
const IPC_CHANNELS = {
  startupGet: "startup:get",
  startupSet: "startup:set",
  updatesChanged: "updates:changed",
  projectsList: "projects:list",
  projectsCreate: "projects:create",
  projectsRemove: "projects:remove",
  projectsPreview: "projects:preview",
  projectsUpdate: "projects:update",
  cardsList: "cards:list",
  cardsCreate: "cards:create",
  cardsUpdateLayout: "cards:update-layout",
  cardsUpdate: "cards:update",
  cardsSetLocked: "cards:set-locked",
  cardsPack: "cards:pack",
  cardsUnpack: "cards:unpack",
  cardsUnpackAll: "cards:unpack-all",
  cardsRemove: "cards:remove",
  sourcesList: "sources:list",
  sourcesCreate: "sources:create",
  sourcesUpdate: "sources:update",
  sourcesRemove: "sources:remove",
  discoveryList: "discovery:list",
  discoveryRun: "discovery:run",
  discoveryAccept: "discovery:accept",
  discoveryDismiss: "discovery:dismiss",
  settingsGet: "settings:get",
  settingsSave: "settings:save",
  settingsTest: "settings:test",
  updatesSelect: "updates:select",
  updatesRun: "updates:run",
  updatesHistory: "updates:history",
  changesList: "changes:list",
  changesResolve: "changes:resolve",
  linksOpen: "links:open",
  maintenanceBackup: "maintenance:backup",
  maintenanceOpenData: "maintenance:open-data",
} as const;

const api: ResearchBoardApi = {
  startup: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.startupGet),
    set: (enabled) => ipcRenderer.invoke(IPC_CHANNELS.startupSet, enabled),
  },
  projects: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.projectsList),
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.projectsCreate, input),
    remove: (projectId) => ipcRenderer.invoke(IPC_CHANNELS.projectsRemove, projectId),
    preview: (input) => ipcRenderer.invoke(IPC_CHANNELS.projectsPreview, input),
    update: (input) => ipcRenderer.invoke(IPC_CHANNELS.projectsUpdate, input),
  },
  cards: {
    list: (projectId) => ipcRenderer.invoke(IPC_CHANNELS.cardsList, projectId),
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.cardsCreate, input),
    updateLayout: (input) => ipcRenderer.invoke(IPC_CHANNELS.cardsUpdateLayout, input),
    update: (input) => ipcRenderer.invoke(IPC_CHANNELS.cardsUpdate, input),
    setLocked: (input) => ipcRenderer.invoke(IPC_CHANNELS.cardsSetLocked, input),
    pack: (input) => ipcRenderer.invoke(IPC_CHANNELS.cardsPack, input),
    unpack: (cardId) => ipcRenderer.invoke(IPC_CHANNELS.cardsUnpack, cardId),
    unpackAll: (packId) => ipcRenderer.invoke(IPC_CHANNELS.cardsUnpackAll, packId),
    remove: (cardId) => ipcRenderer.invoke(IPC_CHANNELS.cardsRemove, cardId),
  },
  sources: {
    list: (projectId) => ipcRenderer.invoke(IPC_CHANNELS.sourcesList, projectId),
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.sourcesCreate, input),
    update: (input) => ipcRenderer.invoke(IPC_CHANNELS.sourcesUpdate, input),
    remove: (sourceId) => ipcRenderer.invoke(IPC_CHANNELS.sourcesRemove, sourceId),
  },
  discovery: {
    list: (projectId) => ipcRenderer.invoke(IPC_CHANNELS.discoveryList, projectId),
    run: (projectId) => ipcRenderer.invoke(IPC_CHANNELS.discoveryRun, projectId),
    accept: (input) => ipcRenderer.invoke(IPC_CHANNELS.discoveryAccept, input),
    dismiss: (candidateId) => ipcRenderer.invoke(IPC_CHANNELS.discoveryDismiss, candidateId),
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.settingsGet),
    save: (input) => ipcRenderer.invoke(IPC_CHANNELS.settingsSave, input),
    test: (input) => ipcRenderer.invoke(IPC_CHANNELS.settingsTest, input),
  },
  updates: {
    onChanged: (listener) => {
      const changed = () => listener();
      ipcRenderer.on(IPC_CHANNELS.updatesChanged, changed);
      return () => { ipcRenderer.removeListener(IPC_CHANNELS.updatesChanged, changed); };
    },
    select: (projectIds) => ipcRenderer.invoke(IPC_CHANNELS.updatesSelect, projectIds),
    run: (projectId) => ipcRenderer.invoke(IPC_CHANNELS.updatesRun, projectId),
    history: (projectId) => ipcRenderer.invoke(IPC_CHANNELS.updatesHistory, projectId),
  },
  changes: {
    list: (projectId) => ipcRenderer.invoke(IPC_CHANNELS.changesList, projectId),
    resolve: (changeId) => ipcRenderer.invoke(IPC_CHANNELS.changesResolve, changeId),
  },
  links: {
    open: (url) => ipcRenderer.invoke(IPC_CHANNELS.linksOpen, url),
  },
  maintenance: {
    createBackup: () => ipcRenderer.invoke(IPC_CHANNELS.maintenanceBackup),
    openDataFolder: () => ipcRenderer.invoke(IPC_CHANNELS.maintenanceOpenData),
  },
};

contextBridge.exposeInMainWorld("researchBoard", api);
