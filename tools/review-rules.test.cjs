const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Scheduler } = require('../games/english-scheduler.js');

function setup(languageCode, newLimit = languageCode === 'ar' ? 5 : 20) {
  const bank = Array.from({ length: 90 }, (_, i) => ({ id: `w${i}`, word: `word ${i}`, zh: `词${i}` }));
  const data = new Map();
  const storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
  return new Scheduler(bank, storage, () => '2026-10-31', { languageCode, newLimit, reviewLimit: languageCode === 'ar' ? 10 : 30 });
}
for (const language of ['ar', 'en-GB']) {
  test(`${language}: review only contains previous-date learning, never today's learning`, () => {
    const scheduler = setup(language);
    const state = scheduler.load();
    for (let i = 0; i < 40; i++) state.records[`w${i}`] = { stage: 0, due: '2026-10-30', lastCompleted: '2026-10-29' };
    state.records.w40 = { stage: 0, due: '2026-10-30', lastCompleted: '2026-10-31' };
    scheduler.save(state);
    const plan = scheduler.plan();
    assert.equal(plan.fresh.length, language === 'ar' ? 5 : 20);
    assert.equal(plan.review.length, language === 'ar' ? 10 : 30);
    assert.ok(!plan.review.includes('w40'));
    assert.ok(plan.review.every(id => state.records[id].lastCompleted < scheduler.clock()));
    assert.ok(plan.fresh.every(id => !plan.review.includes(id)));
    scheduler.complete(plan.fresh[0]);
    const saved = scheduler.load();
    saved.days[scheduler.clock()].review.push(plan.fresh[0], 'w40');
    scheduler.save(saved);
    assert.ok(!scheduler.plan().review.includes(plan.fresh[0]));
    assert.ok(!scheduler.plan().review.includes('w40'));
  });
}
test('Arabic started plans shrink to five new questions without losing completion', () => {
  const scheduler = setup('ar', 20);
  const old = scheduler.plan();
  old.fresh.slice(0, 4).forEach(id => scheduler.complete(id));
  scheduler.newLimit = 5;
  const plan = scheduler.plan();
  assert.equal(plan.fresh.length, 5);
  assert.equal(plan.completed.length, 4);
  assert.equal(plan.newLimit, 5);
  assert.equal(scheduler.next().id, 'w4');
  const saved = JSON.stringify(scheduler.load());
  scheduler.plan();
  assert.equal(JSON.stringify(scheduler.load()), saved);
});
test('Arabic retains already-completed work exceeding the new quota', () => {
  const scheduler = setup('ar', 20);
  scheduler.plan().fresh.slice(0, 8).forEach(id => scheduler.complete(id));
  scheduler.newLimit = 5;
  assert.equal(scheduler.plan().fresh.length, 8);
  assert.equal(scheduler.plan().completed.length, 8);
  assert.equal(scheduler.next(), null);
});
test('review never pulls an unlearned or today-learned dialogue partner', () => {
  const scheduler = setup('ar');
  for (const order of [0, 1]) {
    const word = scheduler.bank[order];
    Object.assign(word, { dialogueId: 'pair', dialogueOrder: order });
  }
  scheduler.dialogues.set('pair', ['w0', 'w1']);
  const state = scheduler.load();
  state.records.w0 = { stage: 0, due: '2026-10-30', lastCompleted: '2026-10-29' };
  state.records.w1 = { stage: 0, due: '2026-10-30', lastCompleted: '2026-10-31' };
  scheduler.save(state);
  assert.equal(scheduler.plan().review.length, 0);
  const ids = scheduler.questions().map(word => word.id);
  assert.ok(!ids.includes('w0') && !ids.includes('w1'));
});

test('new and review lists do not repeat the same sentence under different IDs', () => {
  const scheduler = setup('ar');
  scheduler.bank[1].word = scheduler.bank[0].word;
  const state = scheduler.load();
  state.records.w0 = { stage: 0, due: '2026-10-30', lastCompleted: '2026-10-29' };
  scheduler.save(state);
  assert.deepEqual(scheduler.plan().review, ['w0']);
  assert.ok(!scheduler.plan().fresh.includes('w1'));
});

test('switching to independent sentences retains learning and resets old grouped tests once', () => {
  const scheduler = setup('ar');
  scheduler.plan();
  scheduler.complete('w0');
  const state = scheduler.load();
  state.days[scheduler.clock()].test = { passed: 1, completed: [0] };
  scheduler.save(state);
  scheduler.independentSentences = true;
  const plan = scheduler.plan();
  assert.deepEqual(plan.completed, ['w0']);
  assert.equal(plan.test.passed, 0);
  assert.equal(plan.orderVersion, 'independent-v1');
  const saved = JSON.stringify(scheduler.load());
  scheduler.plan();
  assert.equal(JSON.stringify(scheduler.load()), saved);
});

test('Arabic materials are short independent sentences without question-answer groups', () => {
  const fs = require('node:fs'), vm = require('node:vm');
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../games/daily-arabic.js'), 'utf8'), context);
  const bank = context.window.dailyArabicQuestionBank;
  assert.equal(bank.length, 351);
  assert.ok(bank.every(word => !word.dialogueId && word.dialogueOrder === undefined && !word.legacyAr));
  assert.ok(bank.every(word => word.ar && word.zh && word.rom && word.ar.split(/\s+/).length <= 4));
  for (const field of ['ar', 'zh']) {
    const normalized = bank.map(word => word[field].replace(/[.؟،。？！]/g, '').trim());
    assert.equal(new Set(normalized).size, bank.length);
  }
});
