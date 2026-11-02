const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture() {
  const html = fs.readFileSync(require.resolve('../games/arabic-test.html'), 'utf8');
  const context = { window: {}, document: { createElement: () => ({ children: [], append(...nodes) { this.children.push(...nodes); } }) } };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve('../games/daily-arabic.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(require.resolve('../games/arabic-word-meanings.js'), 'utf8'), context);
  vm.runInContext(`const ArabicWordMeanings = window.ArabicWordMeanings;
    const allQuestions = window.dailyArabicQuestionBank;
    ${html.match(/const arabicWordMeanings = \{[\s\S]*?\n    \};/)[0]}
    ${html.slice(html.indexOf('    function normalizeArabicWord('), html.indexOf('    function renderWordMeanings('))}`, context);
  return context;
}

test('every word in the current Arabic bank has a meaning', () => {
  const context = fixture();
  const missing = vm.runInContext(`allQuestions.flatMap(item => arabicWords(item.ar)).filter(word => wordMeaning(word) === "看整句意思")`, context);
  assert.deepEqual(Array.from(new Set(missing)), []);
});

test('each Arabic word renders with its own Chinese meaning in RTL order', () => {
  const context = fixture();
  const list = context.window.ArabicWordMeanings.render('أريد ماء.');
  assert.equal(list.dir, 'rtl');
  assert.equal(list.children.length, 2);
  assert.equal(list.children[0].children[0].textContent, 'أريد');
  assert.equal(list.children[0].children[1].textContent, '我想要');
  assert.equal(list.children[1].children[1].textContent, '水');
  for (const file of ['english-practice.js', 'english-test.js']) {
    assert.match(fs.readFileSync(require.resolve(`../games/${file}`), 'utf8'), /button\.append\(ArabicWordMeanings\.render\(/);
  }
});
