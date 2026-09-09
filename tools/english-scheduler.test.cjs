const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { Scheduler, addDays, normalize, STORAGE_KEY } = require("../games/english-scheduler.js");

function fixture(count = 2000) {
  let date = "2026-09-09";
  const data = new Map();
  const storage = { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value) };
  const bank = Array.from({ length: count }, (_, i) => ({ id: `word-${i}` }));
  const scheduler = new Scheduler(bank, storage, () => date);
  return { scheduler, storage, bank, advance(days = 1) { date = addDays(date, days); }, finish() { scheduler.questions().forEach(word => scheduler.complete(word.id)); } };
}

test("daily limits, fixed plans, reloads and incomplete new words", () => {
  const f = fixture();
  const first = f.scheduler.plan();
  assert.equal(first.fresh.length, 30);
  f.scheduler.complete(first.fresh[0]);
  assert.deepEqual(f.scheduler.plan().fresh, first.fresh);
  const reload = new Scheduler(f.bank, f.storage, () => first.date);
  assert.deepEqual(reload.plan(), f.scheduler.plan());
  f.advance(5);
  const next = f.scheduler.plan();
  assert.deepEqual(next.review, [first.fresh[0]]);
  assert.ok(next.fresh.includes(first.fresh[1]));
  assert.equal(next.fresh.length, 30);
  assert.equal(new Set([...next.review, ...next.fresh]).size, 31);
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

test("overdue backlog replaces new words, historical reads do not create days", () => {
  const f = fixture();
  for (let day = 0; day < 10; day++) { f.finish(); f.advance(); }
  const history = f.scheduler.summary("2026-09-09", false);
  f.advance(100);
  const plan = f.scheduler.plan();
  assert.equal(plan.review.length, 50);
  assert.equal(plan.fresh.length, 0);
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

test("long-run review load never exceeds 50 and all 2,000 words remain reachable", () => {
  // Keep serialization cheap for the long simulation without changing scheduler behaviour.
  let date = "2026-09-09";
  const scheduler = new Scheduler(Array.from({ length: 2000 }, (_, i) => ({ id: `word-${i}` })), {} , () => date);
  let state = { version: 1, records: {}, days: {} };
  scheduler.load = () => state;
  scheduler.save = value => { state = value; };
  let firstPass = null;
  for (let day = 0; day < 1800; day++) {
    const plan = scheduler.plan();
    assert.ok(plan.fresh.length <= 30);
    assert.ok(plan.fresh.length + plan.review.length <= 50);
    scheduler.questions().forEach(word => scheduler.complete(word.id));
    if (Object.keys(state.records).length === 2000) { firstPass = day + 1; break; }
    date = addDays(date, 1);
  }
  assert.ok(firstPass, "New words must not be permanently starved by reviews");
  console.log(`Simulated first pass: ${firstPass} study days at the 50-word cap.`);
});

test("an existing 30/20 plan expands in place to 50/30", () => {
  const f = fixture();
  const state = f.scheduler.load();
  state.days["2026-09-09"] = { date: "2026-09-09", review: [], fresh: f.bank.slice(0, 20).map(word => word.id), completed: [], failed: [], retry: [], drafts: {}, deferred: 0 };
  f.scheduler.save(state);
  const upgraded = f.scheduler.plan();
  assert.equal(upgraded.fresh.length, 30);
  assert.equal(upgraded.review.length, 0);
  assert.equal(upgraded.dailyLimit, 50);
  assert.equal(upgraded.newLimit, 30);
});
