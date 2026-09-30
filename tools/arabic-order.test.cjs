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
    assert.deepEqual(Array.from(scheduler.plan().fresh), expected);
    assert.equal(scheduler.plan().review.length, 1);
  }
});
