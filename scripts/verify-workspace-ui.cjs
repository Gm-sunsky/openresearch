const { app, BrowserWindow, nativeTheme } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'docs', 'verification');
app.setPath('userData', path.join(root, 'tmp', 'workspace-ui-profile'));
app.whenReady().then(async () => {
  const window = new BrowserWindow({ width: 1440, height: 1000, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  const errors = [];
  const run = code => window.webContents.executeJavaScript(code);
  const until = async code => {
    for (let attempt = 0; attempt < 160; attempt++) {
      if (await run(code)) return;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error(`Timed out: ${code}`);
  };
  const screenshot = async name => {
    await new Promise(resolve => setTimeout(resolve, 800));
    await run('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    await window.webContents.capturePage();
    await new Promise(resolve => setTimeout(resolve, 100));
    fs.writeFileSync(path.join(output, name), (await window.webContents.capturePage()).toPNG());
  };
  window.webContents.on('console-message', event => { if (event.level === 3) errors.push(event.message); });
  try {
    fs.mkdirSync(output, { recursive: true });
    nativeTheme.themeSource = 'light';
    await window.loadURL(process.env.OPENRESEARCH_UI_URL || 'http://127.0.0.1:5178');
    await until('document.querySelectorAll(".research-card").length >= 4');
    await window.webContents.insertCSS('* { animation-duration: .01ms !important; transition-duration: .01ms !important; }');
    const cardColors = () => run(`([...document.querySelectorAll('.research-card')].map(card => ({id:card.dataset.cardId,background:getComputedStyle(card).backgroundColor,title:getComputedStyle(card.querySelector('h2')).color,body:getComputedStyle(card.querySelector('.card-content')).color})))`);
    const light = await cardColors();
    assert.equal(new Set(light.map(card => card.background)).size, 1, 'All card types share one surface in light mode');
    await screenshot('workspace-light.png');
    nativeTheme.themeSource = 'dark';
    await until("matchMedia('(prefers-color-scheme: dark)').matches");
    const dark = await cardColors();
    assert.equal(new Set(dark.map(card => card.background)).size, 1, 'All card types share one surface in dark mode');
    assert.notEqual(light[0].background, dark[0].background, 'System theme changes card surfaces without restarting');
    await screenshot('workspace-dark.png');
    nativeTheme.themeSource = 'light';
    await until("!matchMedia('(prefers-color-scheme: dark)').matches");
    assert.equal((await cardColors())[0].background, light[0].background, 'Switching back restores light mode');
    await run("document.querySelector('button[aria-controls=\"project-search\"]').click()");
    await until("document.activeElement === document.querySelector('#project-search input')");
    await run(`(()=>{ const input=document.querySelector('#project-search input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'no-such-project'); input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    await until("document.querySelectorAll('.project-nav-item').length === 0");
    await run("document.querySelector('#project-search input').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
    await until("document.querySelectorAll('.project-nav-item').length === 1 && !document.querySelector('#project-search')");
    await run("document.querySelector('.board-tools button[aria-pressed=\"false\"]').click()");
    await until("document.querySelectorAll('.timeline-entry').length === 5");
    await screenshot('workspace-timeline.png');
    nativeTheme.themeSource = 'dark';
    await until("matchMedia('(prefers-color-scheme: dark)').matches");
    await screenshot('workspace-timeline-dark.png');
    await run("[...document.querySelectorAll('.timeline-entry')].find(button=>button.textContent.includes('会员先行抽选与售票状态')).click()");
    await until("document.querySelector('[data-card-id=\"demo-5\"]') && !document.querySelector('.timeline-view') && document.querySelector('#card-event-date')");
    await run("document.querySelector('button[aria-label=\"打开数据目录\"]').click()");
    await until("document.querySelector('.data-folder-error')?.textContent.includes('桌面客户端')");
    assert.equal(errors.length, 0, JSON.stringify(errors));
    fs.writeFileSync(path.join(output, 'workspace-ui.json'), JSON.stringify({ light, dark, timelineEntries: 5, searchRestored: true, packedCardOpened: 'demo-5', dataFolderErrorHandled: true, errors }, null, 2));
    console.log('PASS: project search, directory error handling, live system theme, timeline and packed-card navigation');
  } catch (error) { console.error(error); process.exitCode = 1; }
  finally { window.destroy(); app.exit(process.exitCode || 0); }
});
