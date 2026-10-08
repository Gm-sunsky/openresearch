const { app, BrowserWindow, nativeTheme }=require('electron'); const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');const output=path.join(root,'docs','verification');app.setPath('userData',path.join(root,'tmp','card-space-profile'));
app.whenReady().then(async()=>{
  const win=new BrowserWindow({width:1440,height:1000,show:false,webPreferences:{contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  const run=code=>win.webContents.executeJavaScript(code);const until=async code=>{for(let i=0;i<200;i++){if(await run(code))return;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out: '+code);};
  const apiCode="const {api}=await import(performance.getEntriesByType('resource').find(e=>new URL(e.name).pathname==='/src/api.ts').name);";
  const refresh=()=>run('document.querySelector(".source-action").click()');
  const shot=async name=>{await new Promise(r=>setTimeout(r,400));await win.webContents.capturePage();fs.writeFileSync(path.join(output,name),(await win.webContents.capturePage()).toPNG());};
  const errors=[];win.webContents.on('console-message',e=>{if(e.level===3)errors.push(e.message);});
  try{
    fs.mkdirSync(output,{recursive:true});nativeTheme.themeSource='light';await win.loadURL('http://127.0.0.1:5178');await win.webContents.insertCSS('* { animation:none !important; transition:none !important; overflow-anchor:none !important; }');await until('document.querySelector("[data-card-id=\\\"demo-1\\\"]")');
    const full=Array.from({length:28},(_,i)=>`资料 ${i+1}：官方公告的完整整理文字，包含时间、地点、来源核验和相关限制。`).join('\n');
    const overview='本批次已确认重要公告及售票安排，另有待核验信息。'+ '各对象的核心结论和证据状态已汇总，请在资料窗口核对全部引用。'.repeat(3);
    await run(`(async()=>{${apiCode} const cards=await api.cards.list('browser-demo');for(const card of cards){if(card.packId==='demo-update-pack'){card.size={width:640,height:620};card.position={x:96,y:80};card.imageUrl=null;card.images=[];}else card.position={x:96,y:1800};}const first=cards.find(c=>c.id==='demo-1');first.title='官方公告：上映会追加剧场及特别鼎谈';first.content=${JSON.stringify(full)};first.summary=${JSON.stringify(overview)};})()`);await refresh();
    await until('Number(document.querySelector("[data-card-id=\\\"demo-1\\\"] .card-content").dataset.visibleLines)>14');
    const large=JSON.parse(await run('JSON.stringify((()=>{const card=document.querySelector("[data-card-id=\\\"demo-1\\\"]"),p=card.querySelector(".card-content"),f=card.querySelector("footer");return {mode:p.dataset.textMode,lines:Number(p.dataset.visibleLines),text:p.textContent,inline:p.getAttribute("style"),computed:getComputedStyle(p).maxHeight,parent:p.parentElement.getBoundingClientRect().toJSON(),scrollHeight:p.scrollHeight,height:p.getBoundingClientRect().height,gap:f.getBoundingClientRect().top-p.getBoundingClientRect().bottom,lineHeight:parseFloat(getComputedStyle(p).lineHeight)};})())'));

    assert.equal(large.mode,'full');assert.equal(large.text,full);assert(large.lines>14);assert(large.gap<large.lineHeight+2,'Long text must fill the available space up to the footer');assert(large.gap>=-1,'Text must not overlap the footer');await shot('card-space-large-light.png');
    await run(`(async()=>{${apiCode} for(const card of await api.cards.list('browser-demo'))if(card.packId==='demo-update-pack')card.size={width:320,height:220};})()`);await refresh();await until('document.querySelector("[data-card-id=\\\"demo-1\\\"] .card-content").dataset.textMode==="overview"');
    assert.equal(await run('document.querySelector("[data-card-id=\\\"demo-1\\\"] .card-content").textContent'),overview);
    await run(`(async()=>{${apiCode} for(const card of await api.cards.list('browser-demo'))if(card.packId==='demo-update-pack'){card.size={width:640,height:620};card.position={x:96,y:600};}})()`);await refresh();await until('Number(document.querySelector("[data-card-id=\\\"demo-1\\\"] .card-content").dataset.visibleLines)>14');
    await run('document.querySelector(".board-scroll").scrollTop=480');await new Promise(r=>setTimeout(r,250));
    await until('document.querySelector("[data-card-id=\\\"demo-1\\\"]").getBoundingClientRect().top>80');
    win.webContents.focus();await new Promise(r=>setTimeout(r,100));
    await run('window.qaWheels=[];document.addEventListener("wheel",e=>{window.qaWheels.push({delta:e.deltaY,target:e.target.className,cancelable:e.cancelable,cancelled:e.defaultPrevented});},true)');
    const before=await run('document.querySelector(".board-scroll").scrollTop');
    const point=JSON.parse(await run('JSON.stringify((()=>{const r=document.querySelector("[data-card-id=\\\"demo-1\\\"]").getBoundingClientRect();return {x:Math.round(r.left+100),y:Math.round(r.top+120)};})())'));
    win.webContents.focus();
    win.webContents.sendInputEvent({type:'mouseMove',...point});win.webContents.sendInputEvent({type:'mouseWheel',...point,deltaY:-160,canScroll:true});await until('document.querySelector("[data-card-id=\\\"demo-5\\\"]")');
    await new Promise(r=>setTimeout(r,250));assert(Math.abs(await run('document.querySelector(".board-scroll").scrollTop')-before)<1,'A native wheel over a pack must not scroll the board');
    win.webContents.sendInputEvent({type:'mouseWheel',...point,deltaY:160,canScroll:true});await until('document.querySelector("[data-card-id=\\\"demo-1\\\"]")');
    for(let i=0;i<6;i++)win.webContents.sendInputEvent({type:'mouseWheel',...point,deltaY:-1,canScroll:true});await new Promise(r=>setTimeout(r,200));assert(Math.abs(await run('document.querySelector(".board-scroll").scrollTop')-before)<1,'Small/throttled packets must not leak scrolling: '+await run('document.querySelector(".board-scroll").scrollTop'));
    const outside=JSON.parse(await run('JSON.stringify((()=>{const r=document.querySelector(".board-scroll").getBoundingClientRect();return {x:Math.round(r.left+30),y:Math.round(r.top+300)};})())'));
    win.webContents.sendInputEvent({type:'mouseMove',...outside});win.webContents.sendInputEvent({type:'mouseWheel',...outside,deltaY:-160,canScroll:true});await until(`document.querySelector('.board-scroll').scrollTop>${before+30}`);
    await run('document.querySelector(".board-scroll").scrollTop=480');nativeTheme.themeSource='dark';await until("matchMedia('(prefers-color-scheme: dark)').matches");await until("getComputedStyle(document.documentElement).getPropertyValue('--surface').trim()==='#24282e'");win.webContents.invalidate();await shot('card-space-large-dark.png');
    assert.equal(errors.length,0,JSON.stringify(errors));fs.writeFileSync(path.join(output,'card-space-wheel.json'),JSON.stringify({large:{...large,textLength:large.text.length,text:undefined},smallOverview:true,packNativeWheelNoBoardScroll:true,smallPacketsConsumed:true,outsideWheelScrolls:true,errors},null,2));console.log('PASS: measured full-text expansion, small overview, native pack-only wheel, and normal outside scrolling');
  }catch(error){console.error(error);process.exitCode=1;}finally{win.destroy();app.exit(process.exitCode||0);}
});
