const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('Arabic virtual keys share typed input, cursor editing, validation and completion', () => {
  const buttons = [];
  const document = { createElement: () => ({
    handlers: {}, setAttribute() {}, addEventListener(name, handler) { this.handlers[name] = handler; }
  }) };
  const context = { window: {}, document };
  vm.runInNewContext(fs.readFileSync(require.resolve('../games/english-practice.js'), 'utf8'), context);
  const practice = Object.create(context.window.EnglishPractice.prototype);
  const input = {
    value: '', selectionStart: 0, selectionEnd: 0, disabled: false, readOnly: false,
    focus() {},
    setRangeText(text, start, end) {
      this.value = this.value.slice(0, start) + text + this.value.slice(end);
      this.selectionStart = this.selectionEnd = start + text.length;
    }
  };
  let completed = 0, drafts = 0, next = 0;
  const spoken = [];
  Object.assign(practice, {
    container: { querySelector: () => ({ append: button => buttons.push(button) }) },
    el: { input }, current: { word: 'أين هو؟' }, selected: true, finished: false, requireChinese: false,
    lastValidInput: '', ensureDate: () => false, saveDraft: () => drafts++, speakKey: letter => spoken.push(letter),
    completeAnswer() { completed++; this.finished = true; }, draw: () => next++
  });
  practice.renderArabicKeyboard();
  const click = label => buttons.find(button => button.textContent === label).handlers.click();
  const type = value => {
    input.value = value;
    input.selectionStart = input.selectionEnd = value.length;
    practice.updateInput();
  };
  // Physical input starts the same answer that virtual keys finish.
  type('أ');
  click('ي');
  assert.equal(input.value, 'أي');
  click('ب');
  assert.equal(input.value, 'أي', 'incorrect virtual key follows ordinary validation');
  input.selectionStart = input.selectionEnd = 2;
  click('ن');
  click('⌫');
  assert.equal(input.value, 'أي');
  click('ن');
  input.selectionStart = 1;
  input.selectionEnd = 2;
  click('ي');
  assert.equal(input.value, 'أين', 'selected text is replaced at the cursor');
  input.selectionStart = input.selectionEnd = input.value.length;
  click('空格');
  type('أين ه');
  click('و');
  click('؟');
  assert.equal(input.value, 'أين هو؟');
  assert.equal(completed, 1);
  assert.ok(drafts > 0);
  click('ا');
  assert.equal(input.value, 'أين هو؟', 'finished answer cannot be edited');
  click('下一题 ↵');
  assert.equal(next, 1);
  assert.ok(buttons.some(button => button.textContent === 'ؤ'));
  assert.ok(buttons.some(button => button.textContent === '.'));
  assert.deepEqual(spoken, ['ي', 'ن', 'ن', 'و'], 'only accepted virtual letters play audio, not typing, punctuation, deletion or rejected input');
});
