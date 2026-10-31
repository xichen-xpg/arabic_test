// Run with PLAYWRIGHT_MODULE pointing to an installed playwright package if needed.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png" };
const server = http.createServer((req, res) => {
  const file = path.resolve(root, "." + new URL(req.url, "http://localhost").pathname);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.setHeader("Content-Type", mime[path.extname(file)] || "application/octet-stream");
  fs.createReadStream(file).pipe(res);
});
(async () => {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"] });
    const context = await browser.newContext({ viewport: { width: 1100, height: 950 } });
    await context.route("**/*", route => {
      const url = new URL(route.request().url());
      return url.hostname === "127.0.0.1" ? route.continue() : route.abort();
    });
    await context.addInitScript(() => {
      const NativeDate = Date;
      const offset = NativeDate.parse('2026-10-31T08:00:00Z') - NativeDate.now();
      window.Date = class extends NativeDate {
        constructor(...args) { super(...(args.length ? args : [NativeDate.now() + offset])); }
        static now() { return NativeDate.now() + offset; }
      };
      if (!localStorage.getItem('test:restart-seeded')) {
        localStorage.setItem('arabic-test:arabic-learning:v1', JSON.stringify({ version: 1, records: { old: { stage: 3, due: '2026-10-31', lastCompleted: '2026-10-30' } }, days: {} }));
        localStorage.setItem('arabic-test:daily-checkins', JSON.stringify({ '2026-10-30': ['daily-arabic'], '2026-10-31': ['daily-arabic'] }));
        localStorage.setItem('test:restart-seeded', 'yes');
      }
      window.testSpeech = [];
      window.testMetrics = [];
      window.speechSynthesis.speak = utterance => { window.testSpeech.push({ text: utterance.text, lang: utterance.lang }); utterance.onend?.(); };
      window.speechSynthesis.cancel = () => {};
      window.speechSynthesis.getVoices = () => [];
      window.addEventListener("message", event => { if (event.data?.type === "arabic-test:metrics") window.testMetrics.push(event.data.payload); });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const url = `http://127.0.0.1:${server.address().port}/games/arabic-test.html#arabic`;
    await page.goto(url);
    const panel = page.locator("#arabicPanel");
    assert.equal(await panel.isVisible(), true);
    assert.equal(await panel.locator('.english-arabic-keyboard').isVisible(), true);
    assert.ok(await panel.locator('.english-arabic-keyboard button:disabled').count() > 30);
    assert.match(await panel.locator(".english-progress").innerText(), /新词 0\/15 · 复习 0\/0/);
    assert.equal(await panel.locator(".english-input").getAttribute("dir"), "rtl");
    const oldArabicSave = await page.evaluate(() => localStorage.getItem('arabic-test:arabic-learning:v1'));
    assert.equal(await page.evaluate(() => loadCheckins()[localDateKey()].includes(dailyArabicSourceKey)), false);
    assert.equal(await page.evaluate(() => loadCheckins()['2026-10-30'].includes(dailyArabicSourceKey)), true);
    assert.equal(await page.evaluate(() => arabicScheduler.bank.length), 351);
    const selection = await page.evaluate(() => ({
      expected: arabicLearningBank.map(word => word.id),
      actual: arabicScheduler.plan().fresh,
      lastWord: dailyArabicBank[0].ar,
      single: arabicLearningBank.find(word => !word.dialogueId).id,
      firstWord: arabicLearningBank[0].ar
    }));
    assert.equal(selection.actual.length, 15);
    assert.equal(new Set(selection.actual).size, 15);
    assert.ok(selection.actual.every(id => selection.expected.includes(id)));
    await page.reload();
    assert.deepEqual(await page.evaluate(() => arabicScheduler.plan().fresh), selection.actual);
    assert.equal(selection.firstWord, selection.lastWord);
    const added = await page.evaluate(() => dailyArabicBank);
    assert.equal(added.length, 351);
    assert.ok(added.every(word => word.ar && word.zh && word.rom && !word.dialogueId && !word.zh.includes("甲：") && !word.zh.includes("乙：")));
    assert.equal(await page.evaluate(() => arabicScheduler.dialogues.size), 0);
    await page.evaluate(() => {
      const state = arabicScheduler.load();
      delete state.days[localDateKey()];
      const yesterday = EnglishLearning.addDays(localDateKey(), -1);
      arabicLearningBank.slice(0, 10).forEach(word => {
        state.records[word.id] = { stage: 0, due: localDateKey(), lastCompleted: yesterday, trouble: false };
      });
      arabicScheduler.save(state);
      arabicPractice.draw();
    });
    assert.match(await panel.locator(".english-progress").innerText(), /新词 0\/15 · 复习 0\/10/);
    assert.equal(await panel.locator(".english-overview-row").count(), 6);
    const englishSave = await page.evaluate(() => localStorage.getItem(EnglishLearning.STORAGE_KEY));
    await panel.getByRole("button", { name: "开始测试", exact: true }).click();
    assert.equal(await page.evaluate(() => arabicScheduler.plan().test.active.deadline - arabicScheduler.plan().test.active.startedAt), 25000);
    assert.match(await panel.locator(".english-test-title").innerText(), /阿语选中文/);
    assert.equal(await panel.locator("th").first().getAttribute("dir"), "rtl");
    const optionRows = await panel.locator('tr').evaluateAll(rows => rows.map(row => ({
      prompt: row.querySelector('th').textContent,
      options: [...row.querySelectorAll('button')].map(button => button.textContent)
    })));
    for (const row of optionRows) {
      assert.equal(row.options.length, 4);
      assert.ok(row.options.every(text => /[?？؟]$/.test(text) === /[?？؟]$/.test(row.prompt)));
      assert.equal(new Set(row.options.map(text => text.match(/[。.!！?？؟]+$/)?.[0] || '')).size, 1);
    }
    const wrong = await page.evaluate(() => {
      const row = arabicScheduler.plan().test.active.rows[0];
      return EnglishLearning.testOptionText(arabicScheduler.words.get(row.options.find(id => id !== row.id)).zh, arabicScheduler.words.get(row.id).zh);
    });
    await panel.locator("tr").first().getByRole("button", { name: wrong, exact: true }).click();
    assert.equal(await panel.locator(".english-test-table").count(), 0);
    await page.reload();
    await panel.getByRole("button", { name: "重新学习本页单词", exact: true }).click();
    for (let i = 0; i < 10; i++) {
      const word = await page.evaluate(() => arabicPractice.current);
      await panel.getByRole("button", { name: word.word, exact: true }).click();
      await panel.locator(".english-input").fill(word.word);
      assert.equal(await panel.locator(".english-chinese-input").isHidden(), true);
      assert.equal(await page.evaluate(() => arabicPractice.finished), true);
      await panel.locator(".english-input").press("Enter");
    }
    assert.deepEqual((await page.evaluate(() => testSpeech.slice(-2))).map(part => part.lang), ["ar", "zh-CN"]);
    for (let index = 0; index < 6; index++) {
      await panel.locator(".english-test-start").click();
      const answers = await page.evaluate(() => {
        const active = arabicScheduler.plan().test.active;
        return active.rows.map(row => arabicScheduler.words.get(row.id)[active.index >= 3 ? "word" : "zh"]);
      });
      assert.match(await panel.locator(".english-test-title").innerText(), index < 3 ? /阿语选中文/ : /中文选阿语/);
      for (let row = 0; row < answers.length; row++) {
        await panel.locator("tr").nth(row).getByRole("button", { name: answers[row], exact: true }).click();
      }
      assert.equal(await page.evaluate(() => arabicScheduler.summary().done), index === 5);
      assert.equal(await page.evaluate(() => loadCheckins()[localDateKey()]?.includes(dailyArabicSourceKey) || false), index === 5);
    }
    assert.equal(await page.evaluate(() => localStorage.getItem(EnglishLearning.STORAGE_KEY)), englishSave);
    await page.locator("#checkinLink").click();
    assert.match(await page.locator(".calendar-day.today .calendar-source").filter({ hasText: "阿语" }).innerText(), /✓/);
    await page.locator("#practiceLink").click();
    await panel.getByRole("button", { name: "重新测试", exact: true }).click();
    assert.equal(await page.evaluate(() => arabicScheduler.summary().done), true);
    await page.evaluate(() => {
      arabicPractice.replay = { date: localDateKey(), queue: [arabicLearningBank.find(word => word.ar.includes("البولينج")).id] };
      arabicPractice.draw();
    });
    const bowling = await page.evaluate(() => arabicPractice.current);
    await panel.getByRole("button", { name: bowling.word, exact: true }).click();
    assert.match(await panel.locator(".english-prompt").innerText(), /保龄球/);
    assert.equal(await page.evaluate(() => arabicPractice.speakKey === speakKeySound), true);
    await page.evaluate(() => {
      window.testKeySounds = [];
      arabicPractice.speakKey = letter => { window.testKeySounds.push(letter); };
    });
    await panel.locator('.english-input').fill(bowling.word.slice(0, 1));
    const keyboard = panel.locator('.english-arabic-keyboard');
    await keyboard.getByRole('button', { name: bowling.word[1], exact: true }).click();
    assert.equal(await panel.locator('.english-input').inputValue(), bowling.word.slice(0, 2));
    await keyboard.getByRole('button', { name: '删除前一个字符', exact: true }).click();
    assert.equal(await panel.locator('.english-input').inputValue(), bowling.word.slice(0, 1));
    for (const letter of bowling.word.slice(1)) {
      await keyboard.getByRole('button', { name: letter === ' ' ? '空格' : letter, exact: true }).click();
    }
    assert.equal(await page.evaluate(() => arabicPractice.finished), true);
    assert.deepEqual(await page.evaluate(() => testKeySounds), [bowling.word[1], ...bowling.word.slice(1)].filter(letter => /^\p{L}$/u.test(letter)));
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    // The restarted plan must not import old index-based learning.
    const legacy = await page.evaluate(() => {
      const yesterday = EnglishLearning.addDays(localDateKey(), -1);
      const words = dailyArabicQuestions(yesterday);
      localStorage.setItem(dailyProgressStorageKey, JSON.stringify({ [yesterday]: { [dailyArabicSourceKey]: [0, 1] } }));
      localStorage.setItem(checkinStorageKey, JSON.stringify({ [yesterday]: [dailyArabicSourceKey] }));
      localStorage.removeItem(arabicStorageKey);
      return { yesterday, ids: [...new Set(words.map(word => `arabic:${word.ar}`))] };
    });
    await page.reload();
    const saved = await page.evaluate(() => arabicScheduler.load());
    for (const id of legacy.ids) assert.ok(!saved.records[id]);
    assert.equal(await page.evaluate(() => arabicScheduler.summary().review), 0);
    assert.equal(await page.evaluate(() => arabicScheduler.summary().fresh), 15);
    assert.equal(await page.evaluate(date => dailyProgressSummaries(date).find(s => s.source === dailyArabicSourceKey).done, legacy.yesterday), true);
    await page.reload();
    assert.deepEqual(await page.evaluate(() => arabicScheduler.load().records), saved.records);
    // Partial old progress also stays outside the restarted plan.
    const partial = await page.evaluate(() => {
      const yesterday = EnglishLearning.addDays(localDateKey(), -1);
      localStorage.setItem(dailyProgressStorageKey, JSON.stringify({ [yesterday]: { [dailyArabicSourceKey]: [0, 1] } }));
      localStorage.setItem(checkinStorageKey, "{}");
      localStorage.removeItem(arabicStorageKey);
      return [...new Set(dailyArabicQuestions(yesterday).slice(0, 2).map(word => `arabic:${word.ar}`))].sort();
    });
    await page.reload();
    assert.deepEqual(await page.evaluate(() => Object.keys(arabicScheduler.load().records).sort()), []);
    assert.equal(await page.evaluate(() => arabicScheduler.summary().review), 0);
    assert.equal(await page.evaluate(() => arabicScheduler.summary().done), false);
    // Reproduce a 21-question day: only the short last page was passed.
    await page.evaluate(() => {
      arabicScheduler.newLimit = 20;
      arabicScheduler.firstDay = undefined;
      localStorage.removeItem(arabicStorageKey);
      const plan = arabicScheduler.plan();
      const state = arabicScheduler.load();
      const day = state.days[localDateKey()];
      const review = arabicLearningBank.find(word => !word.dialogueId && !plan.fresh.includes(word.id));
      day.review = [review.id];
      day.completed = day.fresh.slice(0, 4);
      for (const id of [...day.completed, review.id]) state.records[id] = { stage: 0, due: localDateKey(), lastCompleted: localDateKey() };
      state.records[review.id].lastCompleted = EnglishLearning.addDays(localDateKey(), -1);
      day.test = { passed: 2, completed: [2, 5], times: { 2: 2250, 5: 1950 } };
      arabicScheduler.save(state);
      arabicScheduler.startTest(Date.now(), 1);
      const row = arabicScheduler.plan().test.active.rows[0];
      arabicScheduler.answerTest(0, row.options.find(id => id !== row.id));
      arabicScheduler.selectTest(0);
      arabicPractice.replay = null;
      arabicPractice.relearning = false;
      arabicPractice.draw();
    });
    const overview = panel.locator('.english-overview-row');
    assert.equal(await overview.count(), 6);
    // Even an unattempted page must be learnable, before testing it.
    assert.equal(await overview.nth(0).getByRole('button', { name: '学习', exact: true }).isEnabled(), true);
    await overview.nth(0).getByRole('button', { name: '学习', exact: true }).click();
    assert.equal(await panel.locator('.english-task').isVisible(), true);
    assert.equal(await panel.locator('.english-test').isVisible(), false);
    assert.equal(await page.evaluate(() => arabicPractice.replay.queue.length), 10);
    assert.equal(await page.evaluate(() => localStorage.getItem('arabic-test:arabic-learning:v1')), oldArabicSave);
    assert.equal(await page.evaluate(() => arabicPractice.current.id === arabicScheduler.questions()[0].id), true);
    // A failed page and the return-to-study button must both open its learning task.
    await overview.nth(1).getByRole('button', { name: '学习', exact: true }).click();
    assert.equal(await page.evaluate(() => arabicPractice.relearning), true);
    assert.equal(await page.evaluate(() => arabicPractice.replay), null);
    assert.equal(await panel.locator('.english-task').isVisible(), true);
    await overview.nth(1).getByRole('button', { name: '测试', exact: true }).click();
    await panel.getByRole('button', { name: '返回单词练习', exact: true }).click();
    assert.equal(await panel.locator('.english-task').isVisible(), true);
    assert.equal(await panel.locator('.english-test').isVisible(), false);
    assert.equal(await page.evaluate(() => arabicPractice.relearning), true);
    // The final page really contains one question; other study pages still have ten.
    await overview.nth(2).getByRole('button', { name: '学习', exact: true }).click();
    assert.equal(await page.evaluate(() => arabicPractice.replay.queue.length), 1);
    await overview.nth(0).getByRole('button', { name: '学习', exact: true }).click();
    assert.equal(await page.evaluate(() => arabicPractice.replay.queue.length), 10);
    assert.deepEqual(errors, []);
    console.log("Arabic checks passed: restart day 15/0, stable random selection, old records preserved without import, timed tests, keyboard audio/input, mobile and study navigation.");
    await context.close();
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
