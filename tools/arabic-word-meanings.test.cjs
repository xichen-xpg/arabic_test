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
  assert.equal(context.window.ArabicWordMeanings.render('أريد ماء.', false).hidden, true);
  assert.equal(context.window.ArabicWordMeanings.render('أريد ماء.', true).hidden, false);
  for (const file of ['english-practice.js', 'english-test.js']) {
    assert.match(fs.readFileSync(require.resolve(`../games/${file}`), 'utf8'), /button\.append\(ArabicWordMeanings\.render\(/);
  }
});

test('word meanings reveal only after choosing the correct answer', () => {
  const practice = fs.readFileSync(require.resolve('../games/english-practice.js'), 'utf8');
  const exam = fs.readFileSync(require.resolve('../games/english-test.js'), 'utf8');
  assert.match(practice, /if \(this.scheduler.languageCode === "ar" && this.selected\)/);
  assert.match(practice, /choice.append\(ArabicWordMeanings.render\(options\[optionIndex\].word\)\)/);
  assert.doesNotMatch(practice, /meaning.textContent = option.zh/);
  assert.doesNotMatch(exam, /meaning.textContent = this.scheduler.words.get\(id\).zh/);
  assert.match(exam, /if \(reverse && this.scheduler.languageCode === "ar" && active.answers\[index\] === row.id\)/);
});

test('practice renders no Chinese in options before selection or after a wrong click', () => {
  const context = fixture();
  function element() {
    return {
      children: [], textContent: '', classList: { add() {} },
      append(...nodes) { this.children.push(...nodes); },
      prepend(node) { this.children.unshift(node); },
      replaceChildren() { this.children = []; },
      setAttribute() {}, focus() {},
      addEventListener(type, handler) { this[type] = handler; },
      querySelectorAll() { return this.children; }
    };
  }
  context.document.createElement = element;
  vm.runInContext(fs.readFileSync(require.resolve('../games/english-practice.js'), 'utf8'), context);
  const practice = Object.create(context.window.EnglishPractice.prototype);
  const bank = Array.from(context.window.dailyArabicQuestionBank.slice(0, 4), (word, id) => ({ ...word, word: word.ar, id }));
  Object.assign(practice, {
    current: bank[0], selected: false,
    scheduler: { languageCode: 'ar', bank, mistake() {} },
    el: Object.fromEntries(['choices', 'feedback', 'choice-number', 'entry', 'choice-entry', 'input'].map(key => [key, element()])),
    ensureDate: () => false, speak() {}, saveDraft() {}, updateArabicKeyboard() {}
  });
  const hasChinese = node => /\p{Script=Han}/u.test(node.textContent) || node.children.some(hasChinese);
  practice.renderChoices();
  assert.equal(practice.el.choices.children.some(hasChinese), false);
  const correct = practice.el.choices.children.find(button => button.textContent === bank[0].word);
  const wrong = practice.el.choices.children.find(button => button !== correct);
  wrong.click();
  assert.equal(practice.el.choices.children.some(hasChinese), false);
  correct.click();
  assert.equal(practice.el.choices.children.every(hasChinese), true);
  assert.equal(practice.el.choices.children.every(button => button.children.some(child => child.className === 'arabic-choice-meanings')), true);
  practice.renderChoices();
  assert.equal(practice.el.choices.children.every(hasChinese), true);
});
