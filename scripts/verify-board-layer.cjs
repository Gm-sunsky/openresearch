const { app, BrowserWindow, nativeTheme } = require('electron');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'docs', 'verification');
app.setPath('userData', path.join(root, 'tmp', 'board-layer-profile'));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 1000, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  const run = source => win.webContents.executeJavaScript(source);
  const until = async source => { for(let i=0;i<120;i++){if(await run(source))return;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out: '+source); };
  const capture = async name => { win.webContents.invalidate();await new Promise(r=>setTimeout(r,200));await win.webContents.capturePage();win.webContents.invalidate();await new Promise(r=>setTimeout(r,200));fs.writeFileSync(path.join(output,name),(await win.webContents.capturePage()).toPNG()); };
  try {
    fs.mkdirSync(output,{recursive:true});nativeTheme.themeSource='light';await win.loadURL('http://127.0.0.1:5178');await win.webContents.insertCSS('*{animation:none!important;transition:none!important;}');
    await until('document.querySelectorAll(".update-node").length===2');
    await run(`(async()=>{const {api}=await import(performance.getEntriesByType('resource').find(e=>new URL(e.name).pathname==='/src/api.ts').name);await api.cards.create({projectId:'browser-demo',type:'note',title:'滚动验证',content:'用于延长隔离测试画布',position:{x:100,y:1900}});document.querySelector('.source-action').click();})()`);
    await until('document.querySelector(".board-canvas").clientHeight>1900');
    await run('document.querySelector(".board-scroll").scrollTop=180');await new Promise(r=>setTimeout(r,250));
    const check = async () => JSON.parse(await run(`JSON.stringify((()=>{const tools=document.querySelector('.board-tools'),label=document.querySelector('.update-node strong'),r=label.getBoundingClientRect(),bar=tools.getBoundingClientRect();const hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);const paddingHit=document.elementFromPoint(bar.left+4,r.top+r.height/2);return {overlap:r.top<bar.bottom,covered:!!hit?.closest('.board-tools'),paddingCovered:!!paddingHit?.closest('.board-tools'),nodeLayer:Number(getComputedStyle(document.querySelector('.update-node-sticky')).zIndex),toolLayer:Number(getComputedStyle(tools).zIndex)};})())`));
    const light=await check();assert(light.overlap&&light.covered&&light.paddingCovered&&light.nodeLayer<light.toolLayer);await capture('board-layer-light.png');
    nativeTheme.themeSource='dark';await until("matchMedia('(prefers-color-scheme:dark)').matches");const dark=await check();assert(dark.covered&&dark.paddingCovered);await capture('board-layer-dark.png');
    await run('document.querySelector(".board-scroll").scrollTop=0');await new Promise(r=>setTimeout(r,200));
    assert(await run("(()=>{const r=document.querySelector('.update-node strong').getBoundingClientRect();return !!document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.closest('.update-node');})()"),'Navigation must become reachable below the toolbar');
    const point=JSON.parse(await run("JSON.stringify((()=>{const r=document.querySelectorAll('.update-node')[1].getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};})())"));
    win.webContents.focus();win.webContents.sendInputEvent({type:'mouseMove',...point});win.webContents.sendInputEvent({type:'mouseDown',...point,button:'left',clickCount:1});win.webContents.sendInputEvent({type:'mouseUp',...point,button:'left',clickCount:1});
    await until('document.querySelector(".board-scroll").scrollTop>200');
    fs.writeFileSync(path.join(output,'board-layer.json'),JSON.stringify({light,dark,visibleNavigationClickable:true},null,2));console.log('PASS: toolbar covers scrolled navigation in light/dark themes and visible nodes remain clickable');
  } catch(error) {console.error(error);process.exitCode=1;} finally {win.destroy();app.exit(process.exitCode||0);}
});
