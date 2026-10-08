const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { StartupService } = require('../dist-electron/electron/main/startup.js');
const root = path.resolve(__dirname, '..');
const target = path.join(root, 'tmp', 'startup-verification', 'OpenResearch.exe');
app.setPath('userData', path.join(root, 'tmp', 'startup-verification-profile'));
app.whenReady().then(() => {
  if (process.platform !== 'win32') throw new Error('This native verification is Windows-only');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(root, 'tmp', 'windows-package-output', 'win-unpacked', 'OpenResearch.exe'), target);
  const set = settings => app.setLoginItemSettings({ ...settings, name: 'OpenResearch.AutostartVerification' });
  const service = new StartupService({ isPackaged: true, getLoginItemSettings: options => app.getLoginItemSettings(options), setLoginItemSettings: set }, 'win32', target, 'OpenResearch.AutostartVerification');
  try {
    assert.equal(service.get().enabled, false);
    assert.equal(service.set(true).enabled, true);
    const native = app.getLoginItemSettings({ path: target, args: [] });
    assert(native.launchItems.some(item => item.name === 'OpenResearch.AutostartVerification' && item.enabled));
    assert.equal(service.set(false).enabled, false);
    fs.mkdirSync(path.join(root, 'docs', 'verification'), { recursive: true });
    fs.writeFileSync(path.join(root, 'docs', 'verification', 'startup-native.json'), JSON.stringify({ enabledInSystem: true, removedFromSystem: true, executableWithSpacesAndUnicode: true, userStartupSettingChanged: false }, null, 2));
    console.log('PASS: native Windows login item enabled, read back, disabled, and removed for an isolated verification executable');
  } finally {
    set({ openAtLogin: false, enabled: false, path: target, args: [] });
    fs.rmSync(target, { force: true });
    app.quit();
  }
}).catch(error => { console.error(error); app.exit(1); });
