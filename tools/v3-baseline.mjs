// v3 baseline exports (docs/v3/BASELINE.md): drives the real app in headless Chromium and prints sha256, size and
// time for the baseline exports as JSON. Dev-only; Playwright is NOT a repo dependency. Install it outside the repo:
//   mkdir /tmp/pw && (cd /tmp/pw && npm i playwright)
// The repo files are served to the page through Playwright routing (no http.server needed; it drops connections under load).
//   PLAYWRIGHT=/tmp/pw/node_modules/playwright/index.mjs [PKCHROME=/path/to/chromium] node tools/v3-baseline.mjs > out.json
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, statSync } from 'node:fs';
const repo = new URL('..', import.meta.url).pathname.replace(/\/$/, ''), base = 'http://localhost:8080/', START = `${base}?dev`; // ?dev: the console helpers (pickFilmLook)
const browser = await chromium.launch({ executablePath: process.env.PKCHROME || undefined });
const out = [], logs = [];
const sha = b => createHash('sha256').update(b).digest('hex');
const types = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', wasm: 'application/wasm',
  jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', svg: 'image/svg+xml', woff2: 'font/woff2', txt: 'text/plain' };
async function fresh() {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
  await ctx.route(`${base}**`, route => {
    let path = decodeURIComponent(new URL(route.request().url()).pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = repo + path;
    if (!existsSync(file) || !statSync(file).isFile()) return route.fulfill({ status: 404, body: 'not found' });
    route.fulfill({ status: 200, body: readFileSync(file), contentType: types[file.split('.').pop()] || 'application/octet-stream' });
  });
  const page = await ctx.newPage();
  page.on('console', m => { if (['error', 'warning'].includes(m.type())) logs.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', e => logs.push('pageerror: ' + e.message));
  page.on('request', r => { if (!r.url().startsWith(base) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) logs.push('offsite: ' + r.url()); });
  await page.goto(START); await page.waitForLoadState('networkidle');
  return { ctx, page };
}
async function record(page, label, trigger) {
  const t0 = Date.now();
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 180000 }), trigger()]);
  const ms = Date.now() - t0;
  const buf = readFileSync(await dl.path());
  const dims = await page.evaluate(async b64 => { const r = await fetch('data:;base64,' + b64); const bm = await createImageBitmap(await r.blob()); return [bm.width, bm.height]; }, buf.toString('base64'));
  out.push({ label, file: dl.suggestedFilename(), sha256: sha(buf), px: dims.join(' × '), bytes: buf.length, ms });
  console.error('done', label, ms);
}
// [kind, look, size]: 'share' exports scale the photo down (a different code path from Full).
const looks = [['basic', 'clean-pop'], ['basic', 'warm-natural'], ['basic', 'faded-print'], ['film', 'kodak-portra-400'], ['film', 'look-superia-xtra-400'], ['film', 'bw-ilford-hp5-plus'], ['basic', 'clean-pop', 'share']];
for (const [kind, id, size] of looks) {
  const { ctx, page } = await fresh();
  await page.click('#sampleButton', { timeout: 90000 });
  await page.waitForFunction(() => document.body.classList.contains('editing') || !!document.querySelector('[data-preset]:not([hidden])'), null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  if (kind === 'basic') await page.locator(`[data-preset="${id}"]`).first().click();
  else await page.evaluate(id => window.pickFilmLook('film:' + id), id);
  await page.waitForTimeout(kind === 'film' ? 6000 : 1500);
  await record(page, `${kind === 'basic' ? 'Basic' : 'Kamo'} · ${id}${size ? ` · ${size} size` : ''}`, async () => { await page.click('#exportButton'); if (size) await page.click(`[data-size="${size}"]`); await page.click('#confirmExport'); });
  await ctx.close();
}
{
  const { ctx, page } = await fresh();
  const files = [1, 2, 3, 4].map(n => ({ name: `sample-${n}.jpg`, mimeType: 'image/jpeg', buffer: readFileSync(`${repo}/images/model.jpg`) }));
  await page.setInputFiles('#fileInput', files);
  await page.waitForTimeout(3000);
  await page.click('#collageButton');
  await page.waitForTimeout(1500);
  await page.locator('[data-template="grid-4"]').first().click();
  await page.waitForTimeout(3000);
  await record(page, 'Collage · grid-4 (2 × 2), 4 × sample', async () => { await page.click('#exportButton'); await page.click('#collageDownload'); });
  await ctx.close();
}
{ // framed prints, one slot emptied: the photo is scaled down for its slot, and the empty frame is drawn (v3 Task 2)
  const { ctx, page } = await fresh();
  await page.setInputFiles('#fileInput', [1, 2].map(n => ({ name: `sample-${n}.jpg`, mimeType: 'image/jpeg', buffer: readFileSync(`${repo}/images/model.jpg`) })));
  await page.waitForTimeout(3000);
  await page.click('#collageButton'); await page.waitForTimeout(1500);
  await page.locator('[data-template="diptych-side"]').first().click(); await page.waitForTimeout(2500);
  await page.locator('#collageSlots [data-slot="1"]').click(); await page.waitForTimeout(300); await page.keyboard.press('Delete'); await page.waitForTimeout(1500);
  await record(page, 'Collage · diptych-side, slot 2 empty', async () => { await page.click('#exportButton'); await page.click('#collageDownload'); });
  await ctx.close();
}
console.log(JSON.stringify({ browser: browser.version(), out, logs }, null, 1));
await browser.close();
