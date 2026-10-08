const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
app.setPath('userData', path.join(root, 'tmp', 'automation-ui-profile'));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 900, show: false, webPreferences: { backgroundThrottling: false, nodeIntegration: false, contextIsolation: true } });
  const run = source => win.webContents.executeJavaScript(source);
  const until = async source => { for (let i = 0; i < 100; i++) { if (await run(source)) return; await new Promise(resolve => setTimeout(resolve, 50)); } throw Error('Timed out: ' + source); };
  try {
    await win.loadURL('http://127.0.0.1:5178');
    await win.webContents.insertCSS('* {animation:none!important;transition:none!important;}');
    await until('document.querySelector(".sidebar")');
    await run(`(async()=>{const {api}=await import(performance.getEntriesByType('resource').find(e=>new URL(e.name).pathname==='/src/api.ts').name);let enabled=false;api.startup={get:async()=>({enabled,supported:true,requiresApproval:false}),set:async(value)=>({enabled:enabled=value,supported:true,requiresApproval:false})};[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='设置').click();})()`);
    await until('document.querySelector("#launch-at-login")&&!document.querySelector("#launch-at-login").disabled');
    await run('document.querySelector("#launch-at-login").click()');
    await until('document.querySelector("#launch-at-login").checked&&!document.querySelector("#launch-at-login").disabled');
    await run('document.querySelector("#launch-at-login").click()'); await until('!document.querySelector("#launch-at-login").checked');
    const bounds = JSON.parse(await run('JSON.stringify({dialog:document.querySelector(".settings-dialog").getBoundingClientRect().toJSON(),footer:document.querySelector(".settings-dialog footer").getBoundingClientRect().toJSON(),height:innerHeight})'));
    const output = path.join(root, 'docs', 'verification'); fs.mkdirSync(output, { recursive: true });
    win.webContents.invalidate(); await new Promise(resolve => setTimeout(resolve, 250));
    await win.webContents.capturePage();
    win.webContents.invalidate(); await new Promise(resolve => setTimeout(resolve, 250));
    fs.writeFileSync(path.join(output, 'automation-settings.png'), (await win.webContents.capturePage()).toPNG());
    console.log(bounds);
    assert(bounds.dialog.top >= 0 && bounds.footer.bottom <= bounds.height, 'Settings and save actions must remain within the viewport');
    win.setSize(1080, 680);
    await until('innerHeight<680');
    assert(await run('document.querySelector(".settings-dialog footer").getBoundingClientRect().bottom<=innerHeight'), 'Save actions must remain visible at the minimum app size');
    fs.writeFileSync(path.join(output, 'automation-ui.json'), JSON.stringify({ toggleOnOff: true, saveActionsVisible: true, bounds }, null, 2));
    console.log('PASS: settings startup switch toggles both ways and save actions remain visible');
  } catch (error) { console.error(error); process.exitCode = 1; } finally { win.destroy(); app.exit(process.exitCode || 0); }
});
