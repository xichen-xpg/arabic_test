const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Scheduler, sentenceKind, testOptionText, normalize } = require('../games/english-scheduler.js');

function fixture() {
  const bank = Array.from({ length: 16 }, (_, i) => ({
    id: `word-${i}`, word: i < 8 ? `Question ${i}؟` : `Statement ${i}${i % 2 ? '.' : ''}`,
    zh: i < 8 ? `问题${i}？` : `陈述${i}${i % 2 ? '。' : ''}`
  }));
  const data = new Map();
  const storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
  return new Scheduler(bank, storage, () => '2026-10-31');
}

test('both test directions offer four distinct choices with the same sentence type as the prompt', () => {
  const scheduler = fixture();
  const pages = scheduler.testSummary().pages;
  for (let index = 0; index < pages * 2; index++) {
    scheduler.startTest(1000, index);
    const active = scheduler.plan().test.active;
    const prompt = index >= pages ? 'zh' : 'word';
    const field = index >= pages ? 'word' : 'zh';
    for (const row of active.rows) {
      const answer = scheduler.words.get(row.id);
      assert.equal(row.options.length, 4);
      assert.equal(new Set(row.options).size, 4);
      assert.ok(row.options.includes(row.id));
      const rendered = row.options.map(id => testOptionText(scheduler.words.get(id)[field], answer[field]));
      assert.equal(new Set(rendered.map(value => normalize(value, 'word'))).size, 4);
      assert.ok(rendered.every(text => sentenceKind(text) === sentenceKind(answer[prompt])));
      const endings = rendered.map(text => text.match(/[。.!！?？؟]+$/)?.[0] || '');
      assert.equal(new Set(endings).size, 1);
    }
  }
});

test('active saved tests upgrade their options without resetting answers or timers', () => {
  const scheduler = fixture();
  scheduler.startTest(1000, 0);
  const state = scheduler.load();
  const active = state.days[scheduler.clock()].test.active;
  delete active.choiceVersion;
  active.rows[0].options = ['word-0', 'word-8', 'word-9', 'word-10'];
  active.answers[0] = 'word-0';
  scheduler.save(state);
  const upgraded = scheduler.plan().test.active;
  assert.equal(upgraded.choiceVersion, 1);
  assert.equal(upgraded.deadline, 26000);
  assert.equal(upgraded.answers[0], 'word-0');
  assert.ok(upgraded.rows[0].options.every(id => sentenceKind(scheduler.words.get(id).zh) === 'question'));
  const saved = JSON.stringify(scheduler.load());
  scheduler.plan();
  assert.equal(JSON.stringify(scheduler.load()), saved);
});

test('displayed option endings follow the answer without changing stored material', () => {
  assert.equal(testOptionText('陈述。', '正确答案'), '陈述');
  assert.equal(testOptionText('陈述', '正确答案。'), '陈述。');
  assert.equal(testOptionText('كيف حالك?', 'أين البيت؟'), 'كيف حالك؟');
  assert.equal(testOptionText('Ready!', 'Go!'), 'Ready!');
});

test('every current Arabic sentence has enough same-type distractors in both languages', () => {
  const fs = require('node:fs'), vm = require('node:vm'), context = { window: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../games/daily-arabic.js'), 'utf8'), context);
  const bank = context.window.dailyArabicQuestionBank.map((word, i) => ({ ...word, id: `ar-${i}`, word: word.ar }));
  const scheduler = new Scheduler(bank, { getItem() { return null; }, setItem() {} });
  for (const reverse of [false, true]) {
    const field = reverse ? 'word' : 'zh';
    for (const row of scheduler.testRows(bank.map(word => word.id), reverse)) {
      assert.equal(row.options.length, 4);
      assert.ok(row.options.every(id => sentenceKind(scheduler.words.get(id)[field]) === sentenceKind(scheduler.words.get(row.id)[field])));
    }
  }
});
