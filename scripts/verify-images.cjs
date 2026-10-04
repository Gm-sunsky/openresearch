const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
app.setPath('userData', path.join(root, 'tmp', 'image-qa-profile'));
const output = path.join(root, 'docs', 'verification');
app.whenReady().then(async () => {
  const window = new BrowserWindow({ width: 1280, height: 1120, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  const errors=[];
  window.webContents.on('console-message', (_event, level, message) => { if (level===3) errors.push(message); });
  try {
    await window.loadURL('http://127.0.0.1:5178/scripts/qa/images.html');
    await window.webContents.insertCSS('* { animation: none !important; transition: none !important; }');
    await window.webContents.executeJavaScript(`Promise.all([...document.images].map(img => img.complete ? Promise.resolve() : new Promise(resolve => { img.onload=resolve; img.onerror=resolve; })))`);
    await new Promise(resolve=>setTimeout(resolve, 700));
    const results = await window.webContents.executeJavaScript(`([...document.querySelectorAll('.research-card')].map(card=>{
      const img=card.querySelector('img'), frame=card.querySelector('.card-image-frame');
      if(!img||!frame) return {id:card.dataset.cardId,visible:false};
      const r=img.getBoundingClientRect(),f=frame.getBoundingClientRect(),c=card.getBoundingClientRect();
      return {id:card.dataset.cardId,visible:r.width>0&&r.height>0,natural:[img.naturalWidth,img.naturalHeight],image:[r.width,r.height],frame:[f.width,f.height],objectFit:getComputedStyle(img).objectFit,insideCard:r.left>=c.left&&r.right<=c.right+.5&&r.top>=c.top&&r.bottom<=c.bottom+.5,insideFrame:r.left>=f.left-.5&&r.right<=f.right+.5&&r.top>=f.top-.5&&r.bottom<=f.bottom+.5};
    }))`);
    const image=await window.webContents.capturePage();
    fs.writeFileSync(path.join(output,'image-fit.png'),image.toPNG());
    fs.writeFileSync(path.join(output,'image-fit.json'),JSON.stringify({results,errors},null,2));
    console.log(JSON.stringify({results,errors},null,2));
    if(results.length!==6||results.some(r=>!r.visible||!r.insideCard||!r.insideFrame||r.objectFit!=='contain')||errors.length) process.exitCode=1;
  } catch(error){ console.error(error);process.exitCode=1; }
  finally { window.destroy(); app.exit(process.exitCode||0); }
});
