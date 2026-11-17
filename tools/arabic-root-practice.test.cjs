const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture(requireChinese = false) {
  const buttons = [];
  const context = { window: {}, document: { createElement: () => ({
    handlers: {}, setAttribute() {}, addEventListener(name, handler) { this.handlers[name] = handler; }
  }) } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../games/english-practice.js'), 'utf8'), context);
  const practice = Object.create(context.window.EnglishPractice.prototype);
  const element = () => ({ value: '', hidden: true, disabled: false, focus() { this.focused = true; } });
  Object.assign(practice, {
    requireChinese, selected: false, finished: false, rootIndex: 0,
    current: { id: 'sentence', word: 'أحب كتابي.' },
    rootItems: [{ word: 'أحب', root: 'ح ب ب' }, { word: 'كتابي', root: 'ك ت ب' }],
    el: Object.fromEntries(['root-entry', 'root-input', 'root-prompt', 'root-progress', 'entry', 'input', 'feedback'].map(key => [key, element()])),
    chineseInput: element(), ensureDate: () => false, buttons,
    container: { querySelector: () => ({ append: button => buttons.push(button) }) },
    scheduler: { draft(id, draft) { practice.draft = draft; } }
  });
  return practice;
}

test('virtual keyboard types roots first and switches to the sentence after the last root', () => {
  const p = fixture();
  p.selected = true;
  p.rootItems = [p.rootItems[0]];
  for (const input of [p.el['root-input'], p.el.input]) {
    input.setRangeText = function (text, start, end) {
      this.value = this.value.slice(0, start) + text + this.value.slice(end);
      this.selectionStart = this.selectionEnd = start + text.length;
    };
  }
  p.showRootStage();
  p.renderArabicKeyboard();
  const click = letter => p.buttons.find(button => button.textContent === letter).handlers.click();
  click('ح');
  click('ب');
  assert.equal(p.el['root-input'].value, 'حب');
  click('⌫');
  assert.equal(p.el['root-input'].value, 'ح');
  click('ب');
  click('ب');
  assert.equal(p.rootsPending(), false);
  assert.equal(p.el.entry.hidden, false);
  click('أ');
  assert.equal(p.el.input.value, 'أ');
});

test('correct choice reveals roots, and only all correct roots unlock the sentence', () => {
  const p = fixture();
  p.showRootStage();
  assert.equal(p.el['root-entry'].hidden, true);
  p.selected = true;
  p.showRootStage();
  assert.equal(p.el.entry.hidden, true);
  assert.equal(p.el.input.disabled, true);
  assert.match(p.el['root-prompt'].textContent, /ح ب ب/);
  p.el['root-input'].value = 'ح ب ت';
  p.updateRootInput();
  assert.equal(p.rootIndex, 0);
  p.el.input.value = p.current.word;
  let completed = 0;
  p.scheduler.complete = () => completed++;
  p.completeAnswer();
  assert.equal(completed, 0, 'cannot bypass roots by setting the sentence input');
  p.el['root-input'].value = 'ح ب ب';
  p.updateRootInput();
  assert.equal(p.rootIndex, 1);
  assert.equal(p.el.entry.hidden, true);
  assert.equal(p.draft.rootIndex, 1);
  assert.equal(p.el['root-input'].value, '');
  p.el['root-input'].value = 'كتب';
  p.updateRootInput();
  assert.equal(p.rootIndex, 2);
  assert.equal(p.el.entry.hidden, false);
  assert.equal(p.el.input.disabled, false);
  assert.equal(p.el.input.focused, true);
  assert.equal(p.el['root-entry'].hidden, true);
  assert.equal(completed, 0, 'roots alone do not complete the lesson');
});

test('root drafts preserve partial answers and stage for resuming', () => {
  const p = fixture();
  p.selected = true;
  p.rootIndex = 1;
  p.el['root-input'].value = 'ك ت';
  p.saveDraft();
  const resumed = fixture();
  resumed.selected = p.draft.selected;
  resumed.rootIndex = p.draft.rootIndex;
  resumed.el['root-input'].value = p.draft.rootAnswer;
  resumed.showRootStage();
  assert.match(resumed.el['root-prompt'].textContent, /ك ت ب/);
  assert.equal(resumed.el['root-input'].value, 'ك ت');
  assert.equal(resumed.el.entry.hidden, true);
});

test('sentences without roots skip root input, and English does not require roots', () => {
  const p = fixture();
  p.selected = true;
  p.rootItems = [];
  p.showRootStage();
  assert.equal(p.el.entry.hidden, false);
  assert.equal(p.el['root-entry'].hidden, true);
  assert.equal(fixture(true).rootsPending(), false);
});
