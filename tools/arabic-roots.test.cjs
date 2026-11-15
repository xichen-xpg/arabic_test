const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

function bank(source) {
  const context = { window: {} };
  vm.runInNewContext(source, context);
  return JSON.parse(JSON.stringify(context.window.dailyArabicQuestionBank));
}
const current = bank(fs.readFileSync(require.resolve('../games/daily-arabic.js'), 'utf8'));

test('each sentence has ordered root annotations for every surface word', () => {
  for (const sentence of current) {
    assert.deepEqual(sentence.roots.map(item => item.word), sentence.ar.replace(/[.،؟!]/g, '').trim().split(/\s+/));
    for (const item of sentence.roots) {
      if (item.root === null) assert.ok(item.note);
      else assert.match(item.root, /^[ء-ي]( [ء-ي]){2,3}$/);
    }
  }
});

test('annotations preserve weak radicals, doubled radicals and non-derived words', () => {
  const words = new Map(current.flatMap(item => item.roots).map(item => [item.word, item]));
  for (const [word, root] of Object.entries({ أريد: 'ر و د', أحب: 'ح ب ب', خذني: 'أ خ ذ', أراك: 'ر أ ي', أستعير: 'ع و ر', كتابي: 'ك ت ب' })) {
    assert.equal(words.get(word).root, root);
  }
  assert.equal(words.get('في').root, null);
  assert.equal(words.get('بيتزا').root, null);
});

test('existing sentence text, IDs and ordering remain unchanged', () => {
  const original = bank(execFileSync('git', ['show', 'HEAD:games/daily-arabic.js'], { encoding: 'utf8' }));
  assert.deepEqual(current.map(({ roots, ...item }) => item), original);
});
