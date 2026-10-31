const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  const file = path.join(root, new URL(req.url, 'http://localhost').pathname);
  if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css' })[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => { window.print = () => { window.printCalls = (window.printCalls || 0) + 1; }; });
    const base = `http://127.0.0.1:${server.address().port}`;
    await page.goto(base + '/games/arabic-test.html#poems');
    await page.locator('#printPoemButton').waitFor();
    const plan = await page.evaluate(() => ({ count: dailyPoemQuestions().length, works: window.dailyPoemWorks, title: dailyPoemQuestions()[0].title }));
    assert.equal(plan.count, 1);
    assert.ok(plan.works.length > 0);
    assert.ok(plan.works.every(work => (work.fullText.join('').match(/\p{Script=Han}/gu) || []).length <= 60));
    await page.click('#printPoemButton');
    assert.equal(await page.evaluate(() => window.printCalls), 1);
    assert.ok((await page.locator('#poemPrintContent').textContent()).includes(plan.title));
    await page.emulateMedia({ media: 'print' });
    assert.equal(await page.locator('.app').isVisible(), false);
    assert.equal(await page.locator('#poemPrintContent').isVisible(), true);
    await page.emulateMedia({ media: 'screen' });
    await page.reload();
    assert.equal(await page.evaluate(() => dailyPoemQuestions()[0].title), plan.title);
    await page.goto(base + '/games/daily-chinese.html');
    await page.waitForFunction(() => !document.querySelector('#printReadingButton').disabled);
    const original = await page.locator('#materials iframe').evaluate(frame => frame.contentDocument.querySelector('article').textContent);
    assert.equal(await page.locator('#readingPrintContent article').textContent(), original);
    await page.click('#printReadingButton');
    assert.equal(await page.evaluate(() => window.printCalls), 1);
    await page.emulateMedia({ media: 'print' });
    assert.equal(await page.locator('#materials').isVisible(), false);
    assert.equal(await page.locator('#readingPrintContent').isVisible(), true);
    assert.deepEqual(errors, []);
    console.log('Daily poem and full reading print checks passed.');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
