const { app, BrowserWindow, net, nativeTheme } = require('electron');
const path = require('node:path'), fs = require('node:fs'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const folder = path.join(root, 'tmp', 'unknown-material-' + Date.now());
app.setPath('userData', folder);
app.whenReady().then(async () => {
  const { ResearchDatabase } = require('../dist-electron/electron/main/database.js');
  const { ApiSettingsService } = require('../dist-electron/electron/main/api-settings.js');
  const { AiApiClient } = require('../dist-electron/electron/main/ai-client.js');
  const { FeedService } = require('../dist-electron/electron/main/feed-service.js');
  const { SourceDiscoveryAgent } = require('../dist-electron/electron/main/source-discovery.js');
  const { registerIpcHandlers } = require('../dist-electron/electron/main/ipc.js');
  const { StartupService } = require('../dist-electron/electron/main/startup.js');
  const db = await ResearchDatabase.open(path.join(folder, 'fixture.sqlite'), require.resolve('sql.js/dist/sql-wasm.wasm'));
  const settings = new ApiSettingsService(db, { available: () => false, encrypt: () => { throw Error('fixture'); }, decrypt: () => { throw Error('fixture'); } });
  settings.save({ ...settings.get(), language: 'zh-CN' });
  const ai = new AiApiClient(settings, net.fetch.bind(net), 'zh-CN');
  const feeds = new FeedService(db, net.fetch.bind(net), ai);
  registerIpcHandlers(db, feeds, settings, ai, new SourceDiscoveryAgent(db, ai, settings, net.fetch.bind(net)), new StartupService(app, 'linux'));
  const project = db.createProject({ name: '演出信息核对', description: '演出甲、演出乙', goal: '确认开票信息', focus: ['开票信息'], updateFrequency: 'daily' });
  const old = '• 演出甲：截至本次更新，已核对 6 条来源材料，但没有找到可直接支持“开票信息”的证据。\n• 已检查对象：演出甲。这表示当前来源覆盖不足，不代表确定没有变化。\n• 演出乙：官方确认10月14日不开票。';
  const card = db.createCard({ projectId: project.id, type: 'analysis', title: '开票信息：最新状态', content: old, summary: old, focusCategory: '开票信息', updateBatchId: 'fixture-batch', updateBatchAt: '2026-10-14T09:00:00Z' });
  const win = new BrowserWindow({ show: false, width: 1440, height: 960, webPreferences: { preload: path.join(root, 'dist-electron/electron/preload/index.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
  const run = value => win.webContents.executeJavaScript(value);
  const until = async value => { for (let i = 0; i < 100; i++) { if (await run(value)) return; await new Promise(resolve => setTimeout(resolve, 50)); } throw Error('UI condition timed out: ' + value); };
  try {
    nativeTheme.themeSource = 'light';
    await win.loadFile(path.join(root, 'dist/index.html'));
    await until(`document.querySelector('[data-card-id="${card.id}"]')`);
    await run(`document.querySelector('[data-card-id="${card.id}"]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`);
    await until('document.querySelector(".card-reader-text")');
    const text = await run('document.querySelector(".card-reader-text").textContent');
    assert(text.includes('演出甲：未知'));
    assert(text.includes('官方确认10月14日不开票'));
    assert(!text.includes('没有找到'));
    const output = path.join(root, 'docs', 'verification'); fs.mkdirSync(output, { recursive: true });
    for (const theme of ['light', 'dark']) {
      nativeTheme.themeSource = theme; win.webContents.invalidate();
      await new Promise(resolve => setTimeout(resolve, 250)); await win.webContents.capturePage();
      fs.writeFileSync(path.join(output, `unknown-material-${theme}.png`), (await win.webContents.capturePage()).toPNG());
    }
    fs.writeFileSync(path.join(output, 'unknown-material-native.json'), JSON.stringify({ legacyUnknownVisible: true, confirmedNegativePreserved: true, verboseMissingRemoved: true, themes: ['light', 'dark'], userDataChanged: false }, null, 2));
    console.log('PASS: native reader compacts legacy missing evidence while preserving confirmed negative facts in both themes');
  } finally { win.destroy(); db.close(); }
}).then(() => app.quit()).catch(error => { console.error(error); app.exit(1); });
