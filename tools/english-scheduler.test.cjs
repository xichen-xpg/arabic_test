const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { Scheduler, addDays, normalize, STORAGE_KEY } = require("../games/english-scheduler.js");
const { matchesMeaning } = require("../games/english-scheduler.js");
const { exampleParts } = require("../games/english-scheduler.js");
test("stored mixed examples retain sentence order for bilingual speech", () => {
  const word = { word: "depletion", mixedExample: "过度灌溉可能导致地下水depletion。" };
  assert.deepEqual(exampleParts(word), [{ text: "过度灌溉可能导致地下水", lang: "zh-CN" }, { text: "depletion", lang: "en-GB" }, { text: "。", lang: "zh-CN" }]);
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve("../games/daily-english.js"), "utf8"), context);
  for (const entry of context.window.dailyEnglishQuestionBank) {
    assert.match(entry.mixedExample, /\p{Script=Han}/u);
    assert.ok(entry.mixedExample.includes(entry.word));
    assert.equal(exampleParts(entry).map(part => part.text).join(""), entry.mixedExample);
  }
});
test("Chinese learning accepts a complete individual meaning, not a substring", () => {
  assert.equal(matchesMeaning("分配", "分配；拨出"), true);
  assert.equal(matchesMeaning("拨出", "分配；拨出"), true);
  assert.equal(matchesMeaning("分配；拨出", "分配；拨出"), true);
  assert.equal(matchesMeaning(" 拨 出 ", "分配、拨出"), true);
  assert.equal(matchesMeaning("分", "分配；拨出"), false);
  assert.equal(matchesMeaning("", "分配；拨出"), false);
  assert.equal(matchesMeaning("错误", "分配；拨出"), false);
});

function fixture(count = 2000) {
  let date = "2026-09-09";
  const data = new Map();
  const storage = { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value) };
  const bank = Array.from({ length: count }, (_, i) => ({ id: `word-${i}` }));
  const scheduler = new Scheduler(bank, storage, () => date);
  return { scheduler, storage, bank, advance(days = 1) { date = addDays(date, days); }, finish() { scheduler.questions().forEach(word => scheduler.complete(word.id)); } };
}

test("six timed pages earn a flag strictly below 15 seconds and retain the first record", () => {
  for (const duration of [14900, 15000, 16000]) {
    const f = fixture(100);
    f.bank.forEach((word, index) => { word.word = `word ${index}`; word.zh = `意思 ${index}`; });
    f.finish();
    f.advance();
    assert.equal(f.scheduler.testSummary().pages, 3);
    for (let page = 0; page < 6; page++) {
      f.scheduler.startTest(100000);
      const rows = f.scheduler.plan().test.active.rows;
      const reload = new Scheduler(f.bank, f.storage, () => f.scheduler.clock());
      rows.forEach((row, i) => reload.answerTest(i, row.id, 100000 + duration));
      if (page < 5) {
        assert.equal(reload.testSummary().averageSeconds, null);
        assert.equal(reload.testSummary().fast, false);
        assert.equal(reload.plan().testTiming, undefined);
      }
    }
    assert.equal(f.scheduler.testSummary().averageSeconds, duration / 1000);
    assert.equal(f.scheduler.testSummary().fast, duration < 15000);
    f.scheduler.restartTest();
    f.scheduler.startTest(200000);
    f.scheduler.answerTest(-1, null, 225000);
    assert.equal(f.scheduler.testSummary().averageSeconds, duration / 1000);
    assert.equal(f.scheduler.summary().done, true);
    f.advance();
    assert.equal(f.scheduler.testSummary().averageSeconds, null);
    assert.equal(f.scheduler.testSummary("2026-09-10").averageSeconds, duration / 1000);
  }
});

test("individual tests may pass out of order and retries do not inflate completion", () => {
  const f = fixture(100);
  f.bank.forEach((word, i) => { word.word = `word ${i}`; word.zh = `意思 ${i}`; });
  f.finish(); f.advance();
  const finishPage = (index, duration = 10000) => {
    f.scheduler.startTest(100000, index);
    f.scheduler.plan().test.active.rows.forEach((row, i) => f.scheduler.answerTest(i, row.id, 100000 + duration));
  };
  finishPage(5);
  assert.deepEqual(f.scheduler.testSummary().completed, [5]);
  assert.equal(f.scheduler.summary().freshDone, 10);
  assert.equal(f.scheduler.summary().reviewDone, 0);
  finishPage(5, 12000);
  assert.equal(f.scheduler.testSummary().passed, 1);
  assert.equal(f.scheduler.plan().test.latestTimes[5], 12000);
  assert.equal(f.scheduler.plan().test.times[5], 10000);
  f.scheduler.startTest(100000, 2);
  f.scheduler.answerTest(-1, null, 125000);
  finishPage(1);
  f.scheduler.startTest(130000, 2);
  assert.equal(f.scheduler.plan().test.active.failed, true);
  f.scheduler.testStudyWords().forEach(id => f.scheduler.completeTestStudy(id));
  for (const index of [4, 3, 2, 0]) finishPage(index);
  assert.equal(f.scheduler.summary().done, true);
  const timing = JSON.stringify(f.scheduler.plan().testTiming);
  finishPage(5, 15000);
  assert.equal(f.scheduler.testSummary().passed, 6);
  assert.equal(JSON.stringify(f.scheduler.plan().testTiming), timing);
});

test("a full four-page day earns a flag after improved retakes, including saved older results", () => {
  const f = fixture(30);
  f.scheduler.plan();
  const state = f.scheduler.load();
  state.days[f.scheduler.clock()].test = { passed: 4, completed: [0, 1, 2, 3], times: Array(4).fill(18000), latestTimes: Object.fromEntries(Array.from({ length: 4 }, (_, i) => [i, 12000])) };
  state.days[f.scheduler.clock()].testTiming = { pages: 4, totalMs: 72000 };
  f.scheduler.save(state);
  assert.equal(f.scheduler.testSummary().averageSeconds, 12);
  assert.equal(f.scheduler.testSummary().fast, true);
  f.scheduler.restartTest();
  assert.equal(f.scheduler.testSummary().fast, true);
  assert.equal(f.scheduler.testSummary().averageSeconds, 12);
  assert.equal(f.scheduler.summary().done, true);
});

test("daily check-in requires both timed tests; failures, reloads and short pages", () => {
  const f = fixture(13);
  f.bank.forEach((word, index) => { word.word = `word ${index}`; word.zh = `意思 ${index}`; });
  f.scheduler.plan();
  f.scheduler.startTest(1000);
  assert.equal(f.scheduler.plan().test.active.rows.length, 10);
  assert.equal(f.scheduler.summary().learningDone, false);
  assert.equal(f.scheduler.summary().done, false);
  f.scheduler.startTest(1000);
  const first = f.scheduler.plan().test.active.rows[0];
  assert.equal(f.scheduler.answerTest(0, first.options.find(id => id !== first.id), 1001), "wrong");
  assert.equal(f.scheduler.testSummary().passed, 0);
  f.scheduler.startTest(2000);
  assert.equal(f.scheduler.plan().test.active.failed, true);
  assert.equal(f.scheduler.testStudyWords().length, 10);
  f.scheduler.testStudyWords().forEach(id => f.scheduler.completeTestStudy(id));
  f.scheduler.startTest(2000);
  const reload = new Scheduler(f.bank, f.storage, () => "2026-09-09");
  reload.startTest(3000);
  assert.equal(reload.plan().test.active.deadline, 27000);
  assert.equal(reload.answerTest(0, first.id, 27000), "timeout");
  assert.equal(reload.testSummary().passed, 0);
  assert.equal(reload.testStudyWords().length, 10);
  reload.testStudyWords().forEach(id => reload.completeTestStudy(id));
  for (let page = 0; page < 4; page++) {
    reload.startTest(30000);
    const rows = reload.plan().test.active.rows;
    assert.equal(rows.length, page % 2 === 1 ? 3 : 10);
    rows.forEach((row, index) => {
      assert.equal(new Set(row.options).size, 4);
      assert.equal(reload.answerTest(index, row.id, 30001), index === rows.length - 1 ? "passed" : "correct");
    });
    assert.equal(reload.summary().done, page === 3);
    assert.equal(reload.summary().freshDone, Math.min(13, (page + 1) * 10));
  }
  assert.equal(Object.keys(reload.load().records).length, 13);
  const records = JSON.stringify(reload.load().records);
  reload.restartTest();
  assert.equal(reload.testSummary().passed, 0);
  assert.equal(reload.summary().done, true);
  reload.startTest(40000);
  const repeat = reload.plan().test.active.rows[0];
  assert.equal(reload.answerTest(0, repeat.options.find(id => id !== repeat.id), 40001), "wrong");
  assert.equal(reload.summary().done, true);
  assert.equal(new Scheduler(f.bank, f.storage, () => "2026-09-09").summary().done, true);
  assert.equal(JSON.stringify(reload.load().records), records);
  f.advance();
  assert.equal(f.scheduler.summary().done, false);
  assert.equal(f.scheduler.summary("2026-09-09").done, true);
});

test("past test passes sync learning once and review backlog is current", () => {
  const f = fixture(100);
  f.finish();
  f.advance();
  const plan = f.scheduler.plan();
  assert.equal(f.scheduler.summary().deferred, 10);
  const state = f.scheduler.load();
  state.days[plan.date].test = { passed: 6 };
  f.scheduler.save(state);
  f.scheduler.syncTestLearning();
  assert.equal(f.scheduler.summary().reviewDone, 10);
  assert.equal(f.scheduler.summary().freshDone, 20);
  assert.equal(Object.keys(f.scheduler.load().records).length, 40);
  const after = JSON.stringify(f.scheduler.load());
  f.scheduler.syncTestLearning();
  assert.equal(JSON.stringify(f.scheduler.load()), after);
});

test("daily limits, fixed plans, reloads and incomplete new words", () => {
  const f = fixture();
  const first = f.scheduler.plan();
  assert.equal(first.fresh.length, 20);
  f.scheduler.complete(first.fresh[0]);
  assert.deepEqual(f.scheduler.plan().fresh, first.fresh);
  const reload = new Scheduler(f.bank, f.storage, () => first.date);
  assert.deepEqual(reload.plan(), f.scheduler.plan());
  f.advance(5);
  const next = f.scheduler.plan();
  assert.deepEqual(next.review, [first.fresh[0]]);
  assert.ok(next.fresh.includes(first.fresh[1]));
  assert.equal(next.fresh.length, 20);
  assert.equal(new Set([...next.review, ...next.fresh]).size, 21);
});

test("successful reviews follow days 1, 2, 4, 7, 15, 30 then widen", () => {
  const f = fixture(1);
  const dates = [0, 1, 2, 4, 7, 15, 30, 60, 120, 240, 420];
  let previous = 0;
  for (let i = 0; i < dates.length - 1; i++) {
    f.advance(dates[i] - previous);
    f.finish();
    assert.equal(f.scheduler.load().records["word-0"].due, addDays("2026-09-09", dates[i + 1]));
    previous = dates[i];
  }
});

test("wrong options require another pass and reset to tomorrow, once only", () => {
  const f = fixture(2);
  f.scheduler.plan();
  f.scheduler.mistake("word-0");
  assert.equal(f.scheduler.complete("word-0", true), "retry");
  assert.equal(f.scheduler.summary().completed, 0);
  assert.equal(f.scheduler.next().id, "word-1");
  f.scheduler.complete("word-1");
  assert.equal(f.scheduler.next().id, "word-0");
  assert.equal(f.scheduler.complete("word-0"), "completed");
  assert.equal(f.scheduler.complete("word-0"), "ignored");
  assert.equal(f.scheduler.load().records["word-0"].due, "2026-09-10");
  assert.equal(f.scheduler.summary().completed, 2);
});

test("same-day mistakes stay in their original category; reviews only use earlier days", () => {
  const f = fixture();
  const first = f.scheduler.plan();
  const id = first.fresh[0];
  f.scheduler.mistake(id);
  f.scheduler.complete(id, true);
  assert.equal(f.scheduler.summary().review, 0);
  assert.ok(f.scheduler.plan().fresh.includes(id));
  f.finish();
  assert.equal(f.scheduler.summary().freshDone, 20);
  assert.equal(f.scheduler.summary().reviewDone, 0);

  f.advance();
  const second = f.scheduler.plan();
  assert.equal(second.fresh.length, 20);
  assert.equal(second.review.length, 10);
  assert.ok(second.review.every(word => first.completed.includes(word) || first.fresh.includes(word)));
  assert.ok(second.review.every(word => f.scheduler.load().records[word].lastCompleted < second.date));
  const freshId = second.fresh[0];
  const reviewId = second.review[0];
  for (const word of [freshId, reviewId]) {
    f.scheduler.mistake(word);
    f.scheduler.complete(word, true);
    assert.deepEqual(f.scheduler.plan().review, second.review);
    f.scheduler.complete(word);
  }
  const reload = new Scheduler(f.bank, f.storage, () => second.date);
  assert.deepEqual(reload.plan().review, second.review);
  assert.equal(reload.summary().freshDone, 1);
  assert.equal(reload.summary().reviewDone, 1);
  assert.ok(!reload.plan().review.includes(freshId));
});

test("overdue backlog is capped while 20 new words remain, historical reads do not create days", () => {
  const f = fixture();
  for (let day = 0; day < 10; day++) { f.finish(); f.advance(); }
  const history = f.scheduler.summary("2026-09-09", false);
  f.advance(100);
  const plan = f.scheduler.plan();
  assert.equal(plan.review.length, 10);
  assert.equal(plan.fresh.length, 20);
  assert.ok(plan.deferred > 0);
  const snapshot = f.storage.getItem(STORAGE_KEY);
  assert.equal(f.scheduler.summary("2025-01-01"), null);
  assert.equal(f.scheduler.summary("2030-01-01"), null);
  assert.equal(f.storage.getItem(STORAGE_KEY), snapshot);
  assert.deepEqual(f.scheduler.summary("2026-09-09", false), history);
});

test("IME drafts survive reload; punctuation is lenient but missing words fail", () => {
  const f = fixture();
  f.scheduler.plan();
  f.scheduler.draft("word-0", { selected: true, en: "We need", zh: "我们需要" });
  assert.equal(f.scheduler.plan().drafts["word-0"].zh, "我们需要");
  assert.equal(normalize("We  need clean energy!", "en"), normalize("we need clean energy.", "en"));
  assert.equal(normalize("我们需要，清洁能源！", "zh"), normalize("我们需要清洁能源。", "zh"));
  assert.notEqual(normalize("We need energy", "en"), normalize("We need clean energy", "en"));
  assert.notEqual(normalize("a sustainable", "en"), normalize("asustainable", "en"));
  f.advance();
  assert.equal(f.scheduler.complete("word-0"), "ignored");
});

test("2,000-word bank integrity and source metadata", () => {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve("../games/daily-english.js"), "utf8"), context);
  const bank = context.window.dailyEnglishQuestionBank;
  assert.equal(bank.length, 2000);
  assert.equal(new Set(bank.map(word => word.word)).size, 2000);
  for (const basic of ["school", "apple", "book", "good", "allocated", "allocating"]) assert.ok(!bank.some(word => word.word === basic));
  for (const word of bank) {
    for (const key of ["id", "word", "pos", "zh", "en", "cn", "category", "selection", "exampleSource"]) assert.ok(word[key], `${word.id}: missing ${key}`);
    assert.match(word.en.toLowerCase(), new RegExp(`\\b${word.word}\\b`));
    assert.match(word.cn, /[\u4e00-\u9fff]/);
    assert.ok(bank.filter(other => other.pos === word.pos && other.zh !== word.zh).length >= 3);
  }
});

test("each full day has 20 new words plus at most 10 reviews", () => {
  // Keep serialization cheap for the long simulation without changing scheduler behaviour.
  let date = "2026-09-09";
  const scheduler = new Scheduler(Array.from({ length: 2000 }, (_, i) => ({ id: `word-${i}` })), {} , () => date);
  let state = { version: 1, records: {}, days: {} };
  scheduler.load = () => state;
  scheduler.save = value => { state = value; };
  let firstPass = null;
  for (let day = 0; day < 1800; day++) {
    const plan = scheduler.plan();
    const learnedBeforeToday = Object.keys(state.records).length;
    assert.equal(plan.fresh.length, Math.min(20, 2000 - learnedBeforeToday));
    assert.ok(plan.review.length <= 10);
    assert.ok(plan.fresh.length + plan.review.length <= 30);
    scheduler.questions().forEach(word => scheduler.complete(word.id));
    if (Object.keys(state.records).length === 2000) { firstPass = day + 1; break; }
    date = addDays(date, 1);
  }
  assert.ok(firstPass, "New words must not be permanently starved by reviews");
  console.log(`Simulated first pass: ${firstPass} study days at the 30-word cap.`);
});

test("an untouched 30-new plan shrinks to 20 new words", () => {
  const f = fixture();
  const state = f.scheduler.load();
  state.days["2026-09-09"] = { date: "2026-09-09", review: [], fresh: f.bank.slice(0, 30).map(word => word.id), completed: [], failed: [], retry: [], drafts: {}, deferred: 0 };
  f.scheduler.save(state);
  const upgraded = f.scheduler.plan();
  assert.equal(upgraded.fresh.length, 20);
  assert.equal(upgraded.review.length, 0);
  assert.equal(upgraded.dailyLimit, 30);
  assert.equal(upgraded.newLimit, 20);
  assert.equal(upgraded.reviewLimit, 10);
});

test("started plans retain word order, test progress and check-in records", () => {
  for (const activity of ["study", "test", "checkin"]) {
    const f = fixture();
    const plan = f.scheduler.plan();
    const state = f.scheduler.load();
    const saved = state.days[plan.date];
    saved.fresh = f.bank.slice(0, 30).map(word => word.id);
    saved.dailyLimit = 50; saved.newLimit = 30; saved.reviewLimit = 20;
    if (activity === "study") saved.completed = [saved.fresh[0]];
    if (activity === "test") saved.test = { passed: 1, completed: [5], times: { 5: 12000 } };
    if (activity === "checkin") saved.test = { passed: 0, checkedIn: true };
    f.scheduler.save(state);
    assert.deepEqual(f.scheduler.plan(), saved);
    assert.deepEqual(f.scheduler.load(), state);
    f.advance();
    assert.equal(f.scheduler.plan().fresh.length, 20);
  }
});

test("a review-heavy existing plan migrates to 20 new plus 10 pending reviews", () => {
  const f = fixture();
  const state = f.scheduler.load();
  for (let i = 0; i < 50; i++) state.records[`word-${i}`] = { stage: 0, due: "2026-09-09", trouble: false };
  state.days["2026-09-09"] = { date: "2026-09-09", review: f.bank.slice(0, 50).map(word => word.id), fresh: [], completed: [], failed: [], retry: [], drafts: {}, deferred: 0, dailyLimit: 50, newLimit: 30 };
  f.scheduler.save(state);
  const upgraded = f.scheduler.plan();
  assert.equal(upgraded.review.length, 10);
  assert.equal(upgraded.fresh.length, 20);
  assert.equal(upgraded.deferred, 40);
});
