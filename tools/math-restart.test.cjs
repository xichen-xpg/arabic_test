const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('course restart clears only math check-ins once and preserves old records', () => {
  const values = new Map([
    ['math:reports', JSON.stringify({ '2026-10-09': { lessonIndex: 4, onTime: true } })],
    ['math:downloads', JSON.stringify({ '2026-10-09': { lessonIndex: 4 } })],
    ['arabic-test:daily-checkins', JSON.stringify({ '2026-10-09': ['daily-math', 'daily-english', 'daily-chinese'] })],
  ]);
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
  const source = fs.readFileSync(require('node:path').join(__dirname, '../games/math-restart.js'), 'utf8');
  const context = vm.createContext({ localStorage: storage, sessionStorage: storage });
  vm.runInContext(source, context);
  assert.deepEqual(JSON.parse(storage.getItem('arabic-test:daily-checkins'))['2026-10-09'], ['daily-english', 'daily-chinese']);
  assert.equal(storage.getItem('math:reports'), null);
  assert.ok(storage.getItem('math:reports:before-topics-20261010'));
  assert.ok(storage.getItem('math:downloads'));
  storage.setItem('math:reports', '{"new":true}');
  storage.setItem('arabic-test:daily-checkins', '{"2026-10-10":["daily-math"]}');
  vm.runInContext(source, context);
  assert.equal(storage.getItem('math:reports'), '{"new":true}');
  assert.equal(storage.getItem('arabic-test:daily-checkins'), '{"2026-10-10":["daily-math"]}');
});
