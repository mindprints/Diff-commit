import { _electron as electron } from 'playwright';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const app = await electron.launch({ args: ['.'] });
try {
  for (let i = 0; i < 20; i++) {
    const urls = app.windows().map(w => w.url());
    console.log('WINDOWS_TICK', i, JSON.stringify(urls));
    if (urls.some(u => (u || '').includes('localhost:5173'))) break;
    try { await app.waitForEvent('window', { timeout: 1000 }); } catch {}
    await sleep(250);
  }

  const page = app.windows().find(w => (w.url() || '').includes('localhost:5173'));
  if (!page) throw new Error(`Renderer window not found. URLs: ${JSON.stringify(app.windows().map(w => w.url()))}`);

  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    try { win.webContents.closeDevTools(); } catch {}
    win.focus();
    return true;
  });

  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(() => (document.body?.innerText || '').includes('Editor'), null, { timeout: 20000 });

  const opened = await app.evaluate(({ Menu, BrowserWindow }) => {
    const menu = Menu.getApplicationMenu();
    const tools = menu?.items?.find((i) => (i.label || '').toLowerCase() === 'tools');
    const prompts = tools?.submenu?.items?.find((i) => (i.label || '').toLowerCase().includes('manage prompts'));
    if (!prompts || typeof prompts.click !== 'function') return { ok: false };
    prompts.click(prompts, BrowserWindow.getAllWindows()[0], {});
    return { ok: true, label: prompts.label };
  });
  console.log('OPEN_PROMPTS', JSON.stringify(opened));

  await sleep(2000);

  const result = await page.evaluate(() => {
    const text = document.body.innerText || '';
    const labels = Array.from(document.querySelectorAll('.prompt-node-pill .project-node-title'))
      .map((el) => el.textContent?.trim() || '')
      .filter(Boolean);
    return {
      hasEditor: text.includes('Editor'),
      hasPromptGraph: text.includes('Return to Editor') && text.includes('Search prompts'),
      promptNodeCount: document.querySelectorAll('.prompt-node-pill').length,
      labels,
      repoIntelLabels: labels.filter((l) => l.toLowerCase().includes('repo intel')),
      textSample: text.slice(0, 2000),
    };
  });

  await page.screenshot({ path: 'playwright-prompt-graph-check-app-ready.png', fullPage: true });
  console.log('RESULT', JSON.stringify(result, null, 2));
} finally {
  await app.close();
}
