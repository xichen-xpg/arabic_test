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
    await page.addStyleTag({ content: "*, *::before, *::after { transition: none !important; animation: none !important; }" });
    await page.selectOption("#categorySelect", "source:daily-english");
    await page.locator(".english-choices button").first().waitFor();
    assert.equal(await page.locator(".english-choices button").count(), 4);
    assert.match(await page.locator(".english-progress").innerText(), /新词 0\/30/);
    const first = await page.evaluate(() => englishPractice.current);
    async function chooseWithKeyboard(word) {
      const option = page.getByRole("button", { name: word.word, exact: true });
      const number = (await option.innerText()).match(/^[1-4]/)[0];
      assert.equal(await page.locator(".english-choice-number").evaluate(el => el === document.activeElement), true);
      await page.keyboard.type(number);
      await page.keyboard.press("Enter");
      assert.equal(await page.locator(".english-input").evaluate(el => el === document.activeElement), true);
    }
    async function relearnPage() {
      assert.equal(await page.locator(".english-test-table").count(), 0);
      assert.equal(await page.locator(".english-test").locator(":scope > *").count(), 1);
      await page.getByRole("button", { name: "重新学习本页单词", exact: true }).click();
      assert.match(await page.locator(".english-kind").innerText(), /本页重新学习/);
      assert.equal(await page.locator(".english-open-test").isHidden(), true);
      const expected = await page.evaluate(() => englishScheduler.testStudyWords());
      for (const id of expected) {
        const word = await page.evaluate(() => englishPractice.current);
        assert.equal(word.id, id);
        await chooseWithKeyboard(word);
        await page.locator(".english-input").fill(word.word);
        await page.keyboard.press("Enter");
      }
      assert.equal(await page.evaluate(() => englishScheduler.testStudyWords().length), 0);
    }
    await page.getByRole("button", { name: "开始测试", exact: true }).click();
    assert.equal(await page.locator(".english-test-table tr").count(), 10);
    assert.equal(await page.evaluate(() => englishScheduler.summary().completed), 0);
    assert.equal(await page.locator(".english-task").isHidden(), true);
    const earlyWrong = await page.evaluate(() => {
      const row = englishScheduler.plan().test.active.rows[0];
      return englishScheduler.words.get(row.options.find(id => id !== row.id)).zh;
    });
    await page.locator(".english-test-table tr").first().getByRole("button", { name: earlyWrong, exact: true }).click();
    await page.reload();
    await page.selectOption("#categorySelect", "source:daily-english");
    await relearnPage();
    await page.getByRole("button", { name: "返回单词练习", exact: true }).click();
    assert.equal(await page.evaluate(() => englishPractice.current.id), first.id);
    const wrong = page.locator(".english-choices button").filter({ hasNotText: first.word }).first();
    const wrongWord = (await wrong.innerText()).replace(/^[1-4]\.\s*/, "");
    await wrong.click();
    assert.equal(await page.evaluate(() => testSpeech.at(-1).text), wrongWord);
    await chooseWithKeyboard(first);
    const expectedSpeech = [{ text: first.word, lang: "en-GB" }, { text: first.zh, lang: "zh-CN" }];
    assert.deepEqual(await page.evaluate(() => testSpeech.slice(-2)), expectedSpeech);
    await page.evaluate(() => { window.testSpeech = []; });
    await page.locator(".english-speak-word").click();
    assert.deepEqual(await page.evaluate(() => testSpeech), expectedSpeech);
    assert.equal(await page.locator(".english-example, .english-translation, .english-chinese-input").count(), 0);
    assert.equal(await page.locator(".english-check").count(), 0);
    await page.locator(".english-input").fill("unfinished");
    assert.equal(await page.locator(".english-input").inputValue(), "");
    assert.equal(await page.evaluate(() => englishScheduler.summary().completed), 0);
    await page.locator(".english-input").fill(first.word.slice(0, 2).toUpperCase());
    await page.reload();
    await page.addStyleTag({ content: "*, *::before, *::after { transition: none !important; animation: none !important; }" });
    await page.selectOption("#categorySelect", "source:daily-english");
    assert.equal(await page.locator(".english-input").inputValue(), first.word.slice(0, 2).toUpperCase());
    await page.locator(".english-input").fill(first.word.toUpperCase());
    assert.match(await page.locator(".english-feedback").innerText(), /队尾/);
    assert.equal(await page.evaluate(() => englishScheduler.summary().completed), 0);
    await page.keyboard.press("Enter");
    assert.notEqual(await page.evaluate(() => englishPractice.current.id), first.id);
    for (let i = 0; i < 30; i++) {
      const word = await page.evaluate(() => englishPractice.current);
      await chooseWithKeyboard(word);
      await page.locator(".english-input").fill(word.word);
      await page.keyboard.press("Enter");
    }
    assert.equal(await page.evaluate(() => englishScheduler.summary().completed), 30);
    assert.equal(await page.locator(".english-test-table").count(), 0);
    assert.equal(await page.locator(".english-test-start").innerText(), "重做本页（20 秒）");
    assert.equal(await page.evaluate(() => englishScheduler.summary().done), false);
    assert.equal(await page.evaluate(() => loadCheckins()[localDateKey()]?.includes(englishSourceKey) || false), false);
    await page.locator(".english-test-start").click();
    assert.equal(await page.locator(".english-test-table tr").count(), 10);
    assert.equal(await page.locator(".english-test-table tr").first().locator("th, td").count(), 5);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.setViewportSize({ width: 1100, height: 950 });
    const deadline = await page.evaluate(() => englishScheduler.plan().test.active.deadline);
    await page.reload();
    await page.selectOption("#categorySelect", "source:daily-english");
    assert.equal(await page.evaluate(() => englishScheduler.plan().test.active.deadline), deadline);
    const wrongAnswer = await page.evaluate(() => {
      const row = englishScheduler.plan().test.active.rows[0];
      return englishScheduler.words.get(row.options.find(id => id !== row.id)).zh;
    });
    await page.locator(".english-test-table tr").first().getByRole("button", { name: wrongAnswer, exact: true }).click();
    await relearnPage();
    assert.equal(await page.evaluate(() => englishScheduler.testSummary().passed), 0);
    await page.locator(".english-test-start").click();
    await page.evaluate(() => {
      const state = englishScheduler.load();
      state.days[englishScheduler.clock()].test.active.deadline = Date.now() - 1;
      englishScheduler.save(state);
      englishPractice.test.draw();
    });
    await relearnPage();
    for (let batch = 0; batch < 6; batch++) {
      await page.locator(".english-test-start").click();
      const answers = await page.evaluate(() => {
        const test = englishScheduler.plan().test;
        return test.active.rows.map(row => englishScheduler.words.get(row.id)[test.passed >= 3 ? "word" : "zh"]);
      });
      for (let row = 0; row < answers.length; row++) {
        await page.locator(".english-test-table tr").nth(row).getByRole("button", { name: answers[row], exact: true }).click();
      }
      assert.equal(await page.evaluate(() => englishScheduler.summary().done), batch === 5);
      assert.equal(await page.evaluate(() => loadCheckins()[localDateKey()]?.includes(englishSourceKey) || false), batch === 5);
      await page.evaluate(() => renderCalendar());
      const englishCheckin = page.locator(".calendar-day.today .calendar-source").filter({ hasText: "完成英语测试" });
      assert.equal(await englishCheckin.count(), 1);
      assert.equal(await englishCheckin.locator(".calendar-source-count").textContent(), batch === 5 ? "✓" : "未完成");
    }
    assert.match(await page.locator(".english-test-title").innerText(), /英文每日打卡完成/);
    const savedLearning = await page.evaluate(() => localStorage.getItem(EnglishLearning.STORAGE_KEY));
    await page.getByRole("button", { name: "重新学习", exact: true }).click();
    assert.equal(await page.locator(".english-choices button").count(), 4);
    const replayWord = await page.evaluate(() => englishPractice.current);
    await page.locator(".english-choices button").filter({ hasNotText: replayWord.word }).first().click();
    for (let i = 0; i < 31; i++) {
      const word = await page.evaluate(() => englishPractice.current);
      await page.getByRole("button", { name: word.word, exact: true }).click();
      await page.locator(".english-input").fill(word.word);
      await page.locator(".english-next").click();
    }
    assert.match(await page.locator(".english-feedback").innerText(), /重新学习已完成/);
    assert.equal(await page.evaluate(() => localStorage.getItem(EnglishLearning.STORAGE_KEY)), savedLearning);
    await page.getByRole("button", { name: "重新学习", exact: true }).click();
    assert.equal(await page.evaluate(() => englishPractice.current.id), replayWord.id);
    await page.reload();
    await page.selectOption("#categorySelect", "source:daily-english");
    assert.equal(await page.evaluate(() => englishScheduler.summary().completed), 30);
    await page.locator("#checkinLink").click();
    const today = page.locator(".calendar-day.today");
    assert.match(await today.innerText(), /每日阿语50题/);
    assert.match(await today.innerText(), /完成英语测试/);
    assert.equal(await today.locator(".calendar-source").filter({ hasText: "完成英语测试" }).locator(".calendar-source-count").innerText(), "✓");
    await page.locator("#practiceLink").click();
    await page.selectOption("#categorySelect", "source:daily-arabic");
    assert.equal(await page.locator("#englishPanel").isHidden(), true);
    assert.equal(await page.locator("#choices button").count(), 4);
    await page.selectOption("#categorySelect", "source:daily-poems");
    assert.equal(await page.locator("#arabicInput").getAttribute("lang"), "zh-CN");
    assert.ok(await page.locator("#softKeyboard button").count() > 0);
    await page.selectOption("#categorySelect", "source:daily-english");
    // Force a page-open midnight rollover, keeping real-time clock deterministic.
    await page.evaluate(() => { practiceDate = "2000-01-01"; ensurePracticeDate(); });
    assert.match(await page.locator(".english-test-title").innerText(), /英文每日打卡完成/);
    assert.equal(await page.evaluate(() => englishScheduler.summary().completed), 30);
    await page.setViewportSize({ width: 390, height: 844 });
    const checkinsBeforeRepeat = await page.evaluate(() => localStorage.getItem(checkinStorageKey));
    await page.getByRole("button", { name: "重新测试", exact: true }).click();
    assert.match(await page.locator(".english-test-title").innerText(), /第一组.*第 1\/3 页/);
    assert.equal(await page.locator(".english-test-table tr").count(), 10);
    await page.reload();
    await page.selectOption("#categorySelect", "source:daily-english");
    assert.equal(await page.evaluate(() => englishScheduler.summary().done), true);
    assert.equal(await page.evaluate(() => localStorage.getItem(checkinStorageKey)), checkinsBeforeRepeat);
    await page.locator("#checkinLink").click();
    assert.equal(await page.locator(".calendar-day.today .calendar-source").filter({ hasText: "完成英语测试" }).locator(".calendar-source-count").innerText(), "✓");
    await page.locator("#practiceLink").click();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    if (process.env.ENGLISH_SCREENSHOT) await page.screenshot({ path: process.env.ENGLISH_SCREENSHOT, fullPage: true });
    assert.deepEqual(errors, []);
    console.log("Browser checks passed: choices/audio, live word typing, retries, reload, calendar, Arabic/poems, rollover, mobile layout.");
    await context.close();
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
