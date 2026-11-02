const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { Scheduler } = require("../games/english-scheduler.js");

test("Arabic reloads retain progress across order versions; future plans use newest first", () => {
  const html = fs.readFileSync(require.resolve("../games/arabic-test.html"), "utf8");
  assert.doesNotMatch(html, /delete\s+\w+\.days\[/);
  assert.doesNotMatch(html, /selectionOrder\s*!==/);
  for (const version of [undefined, "newest-first-v1", "newest-first-v2"]) {
    const context = { window: {}, allQuestions: [], dailyArabicSourceKey: "daily-arabic" };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(require.resolve("../games/daily-arabic.js"), "utf8"), context);
    const declaration = html.match(/const arabicLearningBank = [\s\S]*?;\r?\n/)[0];
    vm.runInContext(`const dailyArabicBank = window.dailyArabicQuestionBank; ${declaration}
      globalThis.bank = arabicLearningBank;`, context);
    const data = new Map();
    const storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
    let date = "2026-09-29";
    const old = new Scheduler([...context.bank].reverse(), storage, () => date);
    old.plan();
    date = "2026-09-30";
    old.complete(old.plan().fresh[0]);
    old.startTest();
    const state = old.load();
    state.selectionOrder = version;
    old.save(state);
    const saved = JSON.stringify(old.load());
    for (let reload = 0; reload < 3; reload++) {
      const scheduler = new Scheduler(context.bank, storage, () => date);
      scheduler.plan();
      scheduler.summary();
      scheduler.testSummary();
      assert.equal(JSON.stringify(scheduler.load()), saved);
    }
    date = "2026-10-01";
    const scheduler = new Scheduler(context.bank, storage, () => date);
    const expected = Array.from(context.bank).filter(word => !state.records[word.id]).slice(0, 20).map(word => word.id);
    for (let i = 0; i < expected.length - 1; i++) {
      const word = scheduler.words.get(expected[i]);
      const next = scheduler.words.get(expected[i + 1]);
      if (word.dialogueId && word.dialogueId === next.dialogueId && word.dialogueOrder > next.dialogueOrder) {
        [expected[i], expected[i + 1]] = [expected[i + 1], expected[i]];
        i++;
      }
    }
    assert.deepEqual(Array.from(scheduler.plan().fresh), expected);
    assert.equal(scheduler.plan().review.length, 1);
  }
});

function dialogueScheduler() {
  const bank = Array.from({ length: 24 }, (_, i) => ({ id: `single-${i}`, word: `word ${i}`, zh: `释义${i}` }));
  for (let i = 0; i < 12; i++) {
    for (const order of [1, 0]) bank.push({ id: `pair-${i}-${order}`, word: `turn ${i} ${order}`, zh: `对话${i}句${order}`,
      dialogueId: `pair-${i}`, dialogueOrder: order, legacyAr: `old-${i}` });
  }
  const data = new Map();
  const storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
  return new Scheduler(bank, storage, () => '2026-10-31', { languageCode: 'ar', reviewLimit: 10 });
}

function assertPairs(scheduler, ids) {
  ids.forEach((id, index) => {
    const word = scheduler.words.get(id);
    if (!word.dialogueId) return;
    if (word.dialogueOrder === 0) {
      assert.equal(ids[index + 1], id.replace(/0$/, '1'));
      assert.notEqual(index % 10, 9, 'dialogue must stay on one test page');
    } else assert.equal(ids[index - 1], id.replace(/1$/, '0'));
  });
}

test('Arabic material updates replace missing saved questions without ending learning early', () => {
  const scheduler = dialogueScheduler();
  const state = scheduler.load();
  const date = scheduler.clock();
  state.records['single-0'] = { stage: 2, due: '2026-11-02', lastCompleted: date };
  state.days[date] = {
    date, review: [], fresh: ['single-0', 'single-1', 'removed-old-sentence'],
    completed: ['single-0'], failed: [], retry: [], drafts: {},
    dailyLimit: 30, newLimit: 20, reviewLimit: 10,
    test: { passed: 0, active: { index: 0, rows: [{ id: 'removed-old-sentence' }] } }
  };
  scheduler.save(state);
  assert.equal(scheduler.next().id, 'single-1');
  scheduler.complete('single-1');
  assert.ok(scheduler.next(), 'a removed sentence must not end the day after one question');
  const repaired = scheduler.plan();
  assert.equal(repaired.fresh.length, 20);
  assert.ok(repaired.completed.includes('single-0'));
  assert.ok(repaired.completed.includes('single-1'));
  assert.equal(scheduler.load().records['single-0'].stage, 2);
  assert.ok(!repaired.fresh.includes('removed-old-sentence'));
  assert.equal(repaired.test.active, undefined);
  assertPairs(scheduler, scheduler.questions().map(word => word.id));
  const saved = JSON.stringify(scheduler.load());
  scheduler.plan();
  assert.equal(JSON.stringify(scheduler.load()), saved, 'repair runs once');
});

test('dialogues stay together across review/new quotas, learning retries and both test directions', () => {
  const scheduler = dialogueScheduler();
  const state = scheduler.load();
  // Nine ordinary reviews plus a due answer; its question is not independently due.
  for (let i = 0; i < 9; i++) state.records[`single-${i}`] = { stage: 0, due: '2026-10-30', lastCompleted: '2026-10-29' };
  state.records['pair-0-1'] = { stage: 0, due: '2026-10-29', lastCompleted: '2026-10-28' };
  state.records['pair-0-0'] = { stage: 0, due: '2026-11-02', lastCompleted: '2026-10-28' };
  scheduler.save(state);
  const plan = scheduler.plan();
  assert.ok(plan.review.length <= 10);
  assert.ok(plan.fresh.length <= 20);
  assert.ok(plan.review.includes('pair-0-0'));
  assertPairs(scheduler, scheduler.questions().map(word => word.id));
  const question = scheduler.next();
  assert.equal(question.id, 'pair-0-0');
  scheduler.complete(question.id, true);
  assert.notEqual(scheduler.next().id, 'pair-0-1', 'do not show answer before retrying question');
  while (scheduler.next() && scheduler.next().id !== question.id) scheduler.complete(scheduler.next().id);
  scheduler.complete(question.id);
  assert.equal(scheduler.next().id, 'pair-0-1');
  scheduler.complete(scheduler.next().id);
  const pages = scheduler.testSummary().pages;
  for (let page = 0; page < pages * 2; page++) {
    scheduler.startTest(1000, page);
    const expected = scheduler.questions().slice(page % pages * 10, (page % pages + 1) * 10).map(word => word.id);
    assert.deepEqual(scheduler.plan().test.active.rows.map(row => row.id).sort(), expected.sort());
  }
});

test('old combined dialogue progress migrates to both turns and invalidates old test rows once', () => {
  const scheduler = dialogueScheduler();
  const state = scheduler.load();
  const legacy = 'arabic:old-0';
  state.records[legacy] = { stage: 2, due: '2026-11-02', lastCompleted: '2026-10-30' };
  state.days['2026-10-31'] = { review: [], fresh: [legacy], completed: [legacy], failed: [], retry: [], drafts: {}, test: { passed: 2 }, testTiming: { pages: 2, totalMs: 1000 } };
  scheduler.save(state);
  const migrated = scheduler.load();
  assert.deepEqual(migrated.days['2026-10-31'].fresh, ['pair-0-0', 'pair-0-1']);
  assert.deepEqual(migrated.days['2026-10-31'].completed, ['pair-0-0', 'pair-0-1']);
  assert.equal(migrated.records['pair-0-0'].stage, 2);
  assert.equal(migrated.records['pair-0-1'].due, '2026-11-02');
  assert.equal(migrated.days['2026-10-31'].test.passed, 0);
  assert.deepEqual(scheduler.load(), migrated);
});


test("Arabic quotas change on November 3 without changing November 2 progress", () => {
  const bank = Array.from({ length: 40 }, (_, i) => ({ id: `quota-${i}`, word: `word ${i}`, zh: `meaning ${i}` }));
  const data = new Map();
  const storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
  let date = "2026-11-02";
  const scheduler = new Scheduler(bank, storage, () => date, {
    languageCode: "ar", newLimit: 5, reviewLimit: 10,
    limitChange: { date: "2026-11-03", newLimit: 3, reviewLimit: 5 }
  });
  const state = scheduler.load();
  for (const word of bank.slice(0, 12)) state.records[word.id] = { due: date, lastCompleted: "2026-11-01", stage: 0 };
  scheduler.save(state);
  const before = JSON.stringify(scheduler.plan());
  assert.equal(scheduler.plan().fresh.length, 5);
  assert.equal(scheduler.plan().review.length, 10);
  date = "2026-11-03";
  assert.equal(scheduler.plan().fresh.length, 3);
  assert.equal(scheduler.plan().review.length, 5);
  assert.equal(JSON.stringify(scheduler.plan("2026-11-02", false)), before);
});


test("Arabic test pages allow 30 seconds while English retains 25 seconds", () => {
  for (const [languageCode, duration] of [["ar", 30000], ["en-GB", 25000]]) {
    const bank = Array.from({ length: 10 }, (_, i) => ({ id: `timer-${i}`, word: `word ${i}`, zh: `meaning ${i}` }));
    const data = new Map();
    const storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
    const scheduler = new Scheduler(bank, storage, () => "2026-11-02", { languageCode });
    scheduler.startTest(1000);
    const active = scheduler.plan().test.active;
    assert.equal(active.deadline, 1000 + duration);
    const row = active.rows[0];
    assert.notEqual(scheduler.answerTest(0, row.id, active.deadline - 1), "failed");
    scheduler.answerTest(1, active.rows[1].id, active.deadline);
    assert.equal(scheduler.plan().test.active.failed, true);
  }
});


test("a single passed page below 15 seconds earns a calendar flag", () => {
  for (const duration of [14999, 15000, 20000]) {
    const data = new Map();
    const storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
    const bank = Array.from({ length: 12 }, (_, i) => ({ id: `flag-${i}`, word: `word ${i}`, zh: `meaning ${i}` }));
    const scheduler = new Scheduler(bank, storage, () => "2026-11-02", { languageCode: "ar" });
    scheduler.startTest(1000);
    scheduler.plan().test.active.rows.forEach((row, i) => scheduler.answerTest(i, row.id, 1000 + duration));
    assert.equal(scheduler.testSummary().done, false);
    assert.equal(scheduler.testSummary().fastPage, duration < 15000);
    const reloaded = new Scheduler(bank, storage, () => "2026-11-02", { languageCode: "ar" });
    assert.equal(reloaded.testSummary().fastPage, duration < 15000);
  }
});


test("calendar flags and test duration text are connected to the scheduler", () => {
  const html = fs.readFileSync(require.resolve("../games/arabic-test.html"), "utf8");
  assert.match(html, /fastPage:englishScheduler\.testSummary\(dateKey, false\)\?\.fastPage/);
  assert.match(html, /fastPage:arabicScheduler\.testSummary\(dateKey, false\)\?\.fastPage/);
  assert.ok(html.includes("\u{1f6a9}"));
  const ui = fs.readFileSync(require.resolve("../games/english-test.js"), "utf8");
  assert.ok(ui.includes('${seconds}'));
  assert.doesNotMatch(ui, /25/);
});
