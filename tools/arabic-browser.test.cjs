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
    const url = `http://127.0.0.1:${server.address().port}/games/arabic-test.html`;
    await page.goto(url);
    const panel = page.locator("#arabicPanel");
    assert.equal(await panel.isVisible(), true);
    assert.match(await panel.locator(".english-progress").innerText(), /新词 0\/20 · 复习 0\/0/);
    assert.equal(await panel.locator(".english-input").getAttribute("dir"), "rtl");
    const selection = await page.evaluate(() => ({
      expected: [...new Set([...dailyArabicBank].reverse().map(word => `arabic:${word.ar}`))].slice(0, 20),
      actual: arabicScheduler.plan().fresh,
      lastWord: dailyArabicBank[dailyArabicBank.length - 1].ar,
      firstWord: arabicLearningBank[0].ar
    }));
    assert.deepEqual(selection.actual, selection.expected);
    assert.equal(selection.firstWord, selection.lastWord);
    const added = await page.evaluate(() => dailyArabicBank.filter(word => word.exampleAr));
    assert.equal(added.length, 13);
    assert.equal(new Set(added.map(word => word.exampleAr)).size, 13);
    assert.equal(new Set(added.map(word => word.exampleZh)).size, 13);
    assert.ok(added.every(word => word.exampleAr && word.exampleZh));
    assert.equal(await page.evaluate(() => arabicLearningBank.filter(word => word.exampleAr).length), 13);
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
    assert.match(await panel.locator(".english-progress").innerText(), /新词 0\/20 · 复习 0\/10/);
    assert.equal(await panel.locator(".english-overview-row").count(), 6);
    const englishSave = await page.evaluate(() => localStorage.getItem(EnglishLearning.STORAGE_KEY));
    await panel.getByRole("button", { name: "开始测试", exact: true }).click();
    assert.equal(await page.evaluate(() => arabicScheduler.plan().test.active.deadline - arabicScheduler.plan().test.active.startedAt), 25000);
    assert.match(await panel.locator(".english-test-title").innerText(), /阿语选中文/);
    assert.equal(await panel.locator("th").first().getAttribute("dir"), "rtl");
    const wrong = await page.evaluate(() => {
      const row = arabicScheduler.plan().test.active.rows[0];
      return arabicScheduler.words.get(row.options.find(id => id !== row.id)).zh;
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
    assert.match(await page.locator(".calendar-day.today .calendar-source").filter({ hasText: "完成阿语测试" }).innerText(), /✓.*平均.*🚩/s);
    await page.locator("#practiceLink").click();
    await panel.getByRole("button", { name: "重新测试", exact: true }).click();
    assert.equal(await page.evaluate(() => arabicScheduler.summary().done), true);
    await page.evaluate(() => {
      arabicPractice.replay = { date: localDateKey(), queue: [arabicLearningBank.find(word => word.zh === "保龄球").id] };
      arabicPractice.draw();
    });
    const bowling = await page.evaluate(() => arabicPractice.current);
    await panel.getByRole("button", { name: bowling.word, exact: true }).click();
    assert.match(await panel.locator(".english-example").innerText(), /周五晚上/);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    // Import old index-based records once and preserve their historical check-in.
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
    for (const id of legacy.ids) assert.ok(saved.records[id]);
    assert.equal(await page.evaluate(() => arabicScheduler.summary().review), 10);
    assert.equal(await page.evaluate(() => arabicScheduler.summary().fresh), 20);
    assert.equal(await page.evaluate(date => dailyProgressSummaries(date).find(s => s.source === dailyArabicSourceKey).done, legacy.yesterday), true);
    await page.reload();
    assert.deepEqual(await page.evaluate(() => arabicScheduler.load().records), saved.records);
    // A partially completed legacy day imports only the completed words.
    const partial = await page.evaluate(() => {
      const yesterday = EnglishLearning.addDays(localDateKey(), -1);
      localStorage.setItem(dailyProgressStorageKey, JSON.stringify({ [yesterday]: { [dailyArabicSourceKey]: [0, 1] } }));
      localStorage.setItem(checkinStorageKey, "{}");
      localStorage.removeItem(arabicStorageKey);
      return [...new Set(dailyArabicQuestions(yesterday).slice(0, 2).map(word => `arabic:${word.ar}`))].sort();
    });
    await page.reload();
    assert.deepEqual(await page.evaluate(() => Object.keys(arabicScheduler.load().records).sort()), partial);
    assert.equal(await page.evaluate(() => arabicScheduler.summary().review), partial.length);
    assert.equal(await page.evaluate(() => arabicScheduler.summary().done), false);
    assert.deepEqual(errors, []);
    console.log("Arabic checks passed: 20/10 plan, six timed tests, failed-page study, Arabic audio/input, examples, check-in/flag, independent saves, legacy import, mobile.");
    await context.close();
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
