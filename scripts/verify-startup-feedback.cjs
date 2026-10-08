const { app } = require('electron');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const { StartupService } = require('../dist-electron/electron/main/startup.js');
const root = path.resolve(__dirname, '..');
const fixture = path.join(root, 'tmp', 'startup feedback 验证');
const entryName = 'OpenResearch.StartupFeedbackVerification';
function copyDirectory(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name), to = path.join(destination, entry.name);
    if (entry.isDirectory()) copyDirectory(from, to); else fs.copyFileSync(from, to);
  }
}
app.setPath('userData', path.join(root, 'tmp', 'startup-feedback-harness'));
app.whenReady().then(async () => {
  assert.equal(process.platform, 'win32');
  assert(fixture.startsWith(root + path.sep));
  fs.mkdirSync(fixture, { recursive: true });
  copyDirectory(path.join(root, 'dist'), path.join(fixture, 'dist'));
  copyDirectory(path.join(root, 'dist-electron'), path.join(fixture, 'dist-electron'));
  fs.mkdirSync(path.join(fixture, 'research-skills', 'general-information-research'), { recursive: true });
  fs.copyFileSync(path.join(root, 'research-skills', 'general-information-research', 'SKILL.md'), path.join(fixture, 'research-skills', 'general-information-research', 'SKILL.md'));
  fs.writeFileSync(path.join(fixture, 'package.json'), JSON.stringify({ name: 'openresearch-startup-feedback-verification', version: JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version, main: 'bootstrap.cjs' }));
  fs.writeFileSync(path.join(fixture, 'bootstrap.cjs'), `
const {app}=require('electron');const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const entryName=${JSON.stringify(entryName)},output=${JSON.stringify(path.join(root,'docs','verification'))};
const originalPath=app.getPath.bind(app),read=app.getLoginItemSettings.bind(app),write=app.setLoginItemSettings.bind(app);
app.getPath=name=>name==='appData'?path.join(__dirname,'isolated-appdata'):originalPath(name);
let rejectWrite=false;
app.getLoginItemSettings=options=>{const value=read(options);return {...value,launchItems:value.launchItems.filter(item=>item.name===entryName).map(item=>({...item,name:'OpenResearch'}))};};
app.setLoginItemSettings=options=>{if(rejectWrite)throw Error('验证用系统写入拒绝');write({...options,name:entryName});};
const timer=setTimeout(()=>{console.error('Startup UI verification timed out');app.exit(1);},30000);
app.on('browser-window-created',(_event,win)=>{
  win.show=()=>{};win.webContents.setBackgroundThrottling(false);
  win.webContents.once('did-finish-load',async()=>{
    const run=source=>win.webContents.executeJavaScript(source);
    const until=async source=>{for(let i=0;i<100;i++){if(await run(source))return;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out '+source);};
    try{
      assert(win.webContents.getURL().startsWith('file:'),'Login launch must use built files, not a Vite URL');
      await until('document.querySelector("#sidebar-launch-at-login")?.checked&&!document.querySelector("#sidebar-launch-at-login").disabled');
      assert(await run('document.querySelector(".sidebar-startup [role=status]").textContent.length>5'));
      await run('document.querySelector(".sidebar-footer .sidebar-action").click()');
      await until('document.querySelector("#launch-at-login")?.checked&&!document.querySelector("#launch-at-login").disabled');
      await run('document.querySelector("#launch-at-login").click()');
      await until('!document.querySelector("#launch-at-login").checked&&!document.querySelector("#sidebar-launch-at-login").checked&&!document.querySelector("#launch-at-login").disabled');
      const disabled=await run('document.querySelector(".settings-dialog .startup-control [role=status]").textContent');assert(/未开启|Disabled/.test(disabled));
      rejectWrite=true;await run('document.querySelector("#launch-at-login").click()');
      await until('document.querySelector(".settings-dialog .startup-control [role=alert]")');
      assert(!(await run('document.querySelector("#launch-at-login").checked')));
      assert((await run('document.querySelector(".settings-dialog .startup-control [role=alert]").textContent')).includes('验证用系统写入拒绝'));
      rejectWrite=false;await run('document.querySelector(".settings-dialog .startup-control [role=alert] button").click()');
      await until('!document.querySelector(".settings-dialog .startup-control [role=alert]")&&!document.querySelector("#launch-at-login").disabled');
      await run('document.querySelector("#launch-at-login").click()');
      await until('document.querySelector("#launch-at-login").checked&&document.querySelector("#sidebar-launch-at-login").checked&&!document.querySelector("#launch-at-login").disabled');
      const enabled=await run('document.querySelector(".settings-dialog .startup-control [role=status]").textContent');assert(/已开启|Enabled/.test(enabled));
      fs.mkdirSync(output,{recursive:true});win.webContents.invalidate();await new Promise(r=>setTimeout(r,200));await win.webContents.capturePage();win.webContents.invalidate();await new Promise(r=>setTimeout(r,200));fs.writeFileSync(path.join(output,'startup-feedback-enabled.png'),(await win.webContents.capturePage()).toPNG());
      await run('document.querySelector("#launch-at-login").click()');await until('!document.querySelector("#launch-at-login").checked&&!document.querySelector("#launch-at-login").disabled');
      fs.writeFileSync(path.join(output,'startup-feedback-native.json'),JSON.stringify({registeredArguments:process.argv.slice(1),builtRenderer:win.webContents.getURL().startsWith('file:'),enabled,disabled,systemErrorVisible:true,retry:true,sidebarSettingsSynced:true,userPreferenceChanged:false},null,2));
      console.log('PASS_CHILD: real login command opens compiled UI, toggles system entry and reports success/error in both controls');clearTimeout(timer);app.quit();
    }catch(error){console.error(error);app.exit(1);}
  });
});
require('./dist-electron/electron/main/index.js');
`);
  const host = { isPackaged: false, getLoginItemSettings: options => app.getLoginItemSettings(options), setLoginItemSettings: settings => app.setLoginItemSettings(settings) };
  const service = new StartupService(host, 'win32', process.execPath, entryName, { appPath: fixture, buildReady: true });
  let child;
  try {
    assert.equal(service.set(true).enabled, true);
    const raw = JSON.parse(execFileSync('powershell.exe', ['-NoProfile','-NonInteractive','-Command', `[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false); (Get-ItemPropertyValue -LiteralPath 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -Name '${entryName}') | ConvertTo-Json -Compress`], { windowsHide: true, encoding: 'utf8' }).trim());
    const quoted = '"' + process.execPath + '"';
    const prefix = raw.startsWith(quoted) ? quoted : process.execPath;
    assert(raw.startsWith(prefix));
    const tail = raw.slice(prefix.length).trim();
    await new Promise((resolve,reject) => {
      child = spawn(process.execPath,[tail],{cwd:process.env.SystemRoot || root,windowsHide:true,windowsVerbatimArguments:true,stdio:['ignore','pipe','pipe']});
      let stdout='',stderr='';child.stdout.on('data',data=>{stdout+=data;});child.stderr.on('data',data=>{stderr+=data;});
      child.on('error',reject);child.on('exit',code=>code===0&&stdout.includes('PASS_CHILD')?resolve():reject(Error('Child verification failed: '+stdout+stderr)));
    });
    assert.equal(service.get().enabled,false);
    console.log('PASS: exact native Windows login command, compiled frontend, enabled/disabled feedback, error/retry and switch synchronization');
  } finally {
    if(child&&child.exitCode===null)child.kill();
    host.setLoginItemSettings({openAtLogin:false,enabled:false,name:entryName,path:process.execPath,args:[`"${fixture}"`,'openresearch-login-start']});
  }
}).then(()=>app.quit()).catch(error=>{console.error(error);app.exit(1);});
