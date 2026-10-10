const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const output = path.join(root, '.math-test');
fs.mkdirSync(output, { recursive: true });
const staticServer = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json' };
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream'); fs.createReadStream(file).pipe(res);
});
(async () => {
  const { createMathServer, validatePptx } = await import('../server/math-server.mjs');
  await new Promise(resolve => staticServer.listen(0, '127.0.0.1', resolve));
  const site = `http://127.0.0.1:${staticServer.address().port}`;
  let mailCount = 0;
  const api = createMathServer({ dbPath: ':memory:', token: 'test-family-code-123456789', origin: site, from: 'fake@example.com', apiKey: 'fake', sendEmail: async () => { mailCount++; return { id: 'test-mail' }; } });
  await new Promise(resolve => api.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 1000, height: 1100 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${site}/games/daily-math.html`);
    await page.waitForSelector('#materials article');
    assert.equal(await page.locator('#download').isDisabled(), false);
    assert.equal(await page.locator('#submitForm').isVisible(), false);
    const directPromise = page.waitForEvent('download');
    await page.click('#download');
    const direct = await directPromise;
    assert.match(direct.suggestedFilename(), /^\d{8}_正数和负数\.pptx$/);
    const directState = await page.evaluate(() => JSON.parse(localStorage.getItem('math:downloads')));
    const mailHref = await page.locator('#emailLink').getAttribute('href');
    assert.ok(mailHref.startsWith('mailto:xichen.app@gmail.com?subject='));
    assert.ok(decodeURIComponent(mailHref).includes('正数和负数'));
    assert.equal(mailCount, 0);
    await page.reload();
    await page.waitForFunction(() => !document.querySelector('#download').disabled);
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('math:downloads'))), directState);
    assert.equal(await page.evaluate(() => localStorage.getItem('arabic-test:daily-checkins')), null);
    await page.locator('#connection summary').click();
    await page.fill('#apiBase', `http://127.0.0.1:${api.address().port}`);
    await page.fill('#accessCode', 'test-family-code-123456789');
    await page.locator('#connectForm button').click();
    await page.waitForFunction(() => !document.querySelector('#download').disabled);
    const downloadPromise = page.waitForEvent('download');
    await page.click('#download');
    const download = await downloadPromise;
    assert.match(download.suggestedFilename(), /^\d{8}_正数和负数\.pptx$/);
    const file = path.join(output, download.suggestedFilename());
    await download.saveAs(file);
    validatePptx(fs.readFileSync(file), path.basename(file, '.pptx'));
    const start = await page.evaluate(() => JSON.parse(localStorage.getItem('math:reports')));
    await page.reload();
    await page.waitForFunction(() => !document.querySelector('#download').disabled);
    const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('math:reports')));
    for (const date of Object.keys(start)) assert.equal(restored[date].startedAt, start[date].startedAt);
    // Inspect all generated worksheet slides and ensure no answer key leaked.
    const coverage = await page.evaluate(async () => {
      const bank = await (await fetch('../data/math/lessons.json')).json();
      const results = [];
      for (const lesson of bank.lessons) {
        const deck = MathPpt.create(lesson, `20261005_${lesson.title}`);
        const bytes = await deck.write({ outputType: 'base64', compression: true });
        const zip = await JSZip.loadAsync(bytes, { base64: true });
        const slides = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name));
        const xml = await Promise.all(slides.map(name => zip.file(name).async('string')));
        results.push({ title: lesson.title, bytes, count: slides.length, expected: lesson.materials.length + lesson.questions.length, hasBlank: xml.filter(text => text.includes('我的答案')).length, questions: lesson.questions.length, answerLeak: xml.some(text => text.includes('正确答案')) });
      }
      return results;
    });
    for (const lesson of coverage) {
      assert.equal(lesson.count, lesson.expected); assert.equal(lesson.hasBlank, lesson.questions); assert.equal(lesson.answerLeak, false);
      fs.writeFileSync(path.join(output, `20261005_${lesson.title}.pptx`), Buffer.from(lesson.bytes, 'base64'));
    }
    await page.locator('#answerFile').setInputFiles(file);
    await page.click('#send');
    await page.waitForFunction(() => document.querySelector('#result').textContent.includes('今日数学完成'));
    assert.equal(mailCount, 1);
    await page.screenshot({ path: path.join(output, 'math-page.png'), fullPage: true });
    await page.goto(`${site}/games/arabic-test.html#checkin`);
    await page.waitForFunction(() => document.querySelector('#todayProgressSummary').textContent.includes('数学完成 ✓'));
    assert.equal(await page.locator('#categorySelect option[value="page:daily-math"]').count(), 1);
    assert.equal(await page.locator('#categorySelect option[value="source:restaurant"], #categorySelect option[value="source:best-friend"]').count(), 0);
    await page.screenshot({ path: path.join(output, 'checkin.png'), fullPage: true });
    await page.goto(`${site}/games/arabic-test.html`);
    await page.selectOption('#categorySelect', 'page:daily-chinese');
    await page.waitForURL('**/games/daily-chinese.html');
    await page.waitForSelector('#questions input');
    assert.equal(await page.locator('#questions fieldset').count(), 5);
    await page.locator('#questions fieldset').first().locator('input').first().check();
    await page.reload();
    await page.waitForSelector('#questions input');
    assert.equal(await page.locator('#questions input').first().isChecked(), true);
    const bank = JSON.parse(fs.readFileSync(path.join(root, 'data/chinese-reading/bank.json'), 'utf8'));
    for (const q of bank.readings[0].questions) await page.locator(`input[name="${q.id}"][value="${q.answer}"]`).check();
    await page.click('#submit');
    assert.match(await page.locator('#result').textContent(), /答对 5\/5/);
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#result').textContent.includes('今日语文完成'));
    assert.equal(await page.locator('#submit').isDisabled(), true);
    await page.goto(`${site}/games/arabic-test.html#checkin`);
    await page.waitForFunction(() => document.querySelector('#todayProgressSummary').textContent.includes('语文完成 ✓'));
    await page.goto(`${site}/games/arabic-test.html`);
    await page.selectOption('#categorySelect', 'page:daily-math');
    await page.waitForURL('**/games/daily-math.html');
    await page.waitForSelector('#materials article');
    assert.deepEqual(errors, []);
    console.log('PASS: connection, PPT download, reload timer, all 5 lesson decks, email, calendar.', file);
  } finally {
    await browser?.close();
    await new Promise(resolve => api.close(resolve));
    await new Promise(resolve => staticServer.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
