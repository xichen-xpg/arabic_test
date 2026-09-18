(function () {
  "use strict";
  class EnglishPractice {
    constructor(container, scheduler, onChange, ensureDate) {
      this.container = container;
      this.scheduler = scheduler;
      this.onChange = onChange;
      this.ensureDate = ensureDate;
      container.innerHTML = `
        <p class="english-progress" aria-live="polite"></p>
        <button class="secondary english-open-test" type="button">开始测试</button>
        <button class="secondary english-back-study" type="button" hidden>返回单词练习</button>
        <p class="english-note">每天固定学习 30 个新词，另安排最多 20 个复习词，仅来自前几天学过且到期的词。当天错词再练不增加复习数量。选对后，再完整输入一次英文单词。</p>
        <div class="english-task">
          <p class="english-kind question-label"></p>
          <p class="english-prompt chinese"></p>
          <div class="english-choices choices" aria-label="英文单词选项"></div>
          <label class="english-choice-entry">输入 1–4，按回车选择<input class="english-choice-number" type="text" inputmode="numeric" maxlength="1" autocomplete="off" aria-label="选项编号"></label>
          <div class="english-entry" hidden>
            <p class="english-word"></p>
            <div class="actions">
              <button class="secondary english-speak-word" type="button">🔊 单词发音</button>
            </div>
            <label>输入英文单词<input class="english-input" lang="en" dir="ltr" type="text" spellcheck="false" autocomplete="off" autocapitalize="none"></label>
            <p class="english-note">输入错误的字母不会保留，完整拼对后按回车进入下一词。</p>
            <details class="english-credit"><summary>词条来源</summary><p></p><a target="_blank" rel="noopener" href="games/english-sources.html">查看题库选词规则与来源</a></details>
          </div>
        </div>
        <section class="english-test" hidden></section>
        <p class="english-feedback feedback" aria-live="polite"></p>
        <p class="english-audio-status english-note" role="status"></p>
        <button class="ghost english-next" type="button" hidden>下一词</button>
        <button class="secondary english-restart" type="button" hidden>重新学习</button>`;
      this.el = {};
      this.test = new EnglishTest(container.querySelector(".english-test"), scheduler, event => {
        if (event === "test-relearn-required") { this.draw(); return; }
        if (scheduler.summary().done) this.el.feedback.textContent = "两组测试已通过 ✓ 今日英文打卡完成。";
        onChange(event);
      }, ensureDate);
      for (const name of ["progress", "kind", "prompt", "choices", "entry", "word", "input", "feedback", "next", "restart", "task", "audio-status", "credit", "open-test", "back-study", "choice-entry", "choice-number"]) {
        this.el[name] = container.querySelector(`.english-${name}`);
      }
      container.querySelector(".english-speak-word").addEventListener("click", () => this.speak(this.current.word, this.current.zh));
      this.el.next.addEventListener("click", () => this.draw());
      this.el["open-test"].addEventListener("click", () => {
        if (this.ensureDate()) return;
        this.saveDraft();
        window.speechSynthesis?.cancel();
        this.el.task.hidden = true;
        this.el.next.hidden = true;
        this.el.feedback.textContent = "";
        this.el["audio-status"].textContent = "";
        this.el["open-test"].hidden = true;
        this.el["back-study"].hidden = false;
        this.scheduler.startTest();
        this.test.draw();
      });
      this.el["back-study"].addEventListener("click", () => this.draw());
      this.el.restart.addEventListener("click", () => {
        if (this.ensureDate()) return;
        this.replay = { date: this.scheduler.clock(), queue: this.scheduler.questions().map(word => word.id) };
        this.draw();
      });
      this.el.input.addEventListener("input", () => this.updateInput());
      this.el["choice-number"].addEventListener("keydown", event => {
        if (event.key !== "Enter" || event.isComposing || event.repeat) return;
        event.preventDefault();
        if (this.ensureDate() || this.selected) return;
        const number = this.el["choice-number"].value;
        if (!/^[1-4]$/.test(number)) return;
        this.el.choices.querySelectorAll("button")[Number(number) - 1]?.click();
        this.el["choice-number"].value = "";
      });
      this.el.input.addEventListener("keydown", event => {
        if (event.key !== "Enter" || event.isComposing || event.repeat) return;
        event.preventDefault();
        if (this.finished) this.draw();
      });
    }
    status() {
      const s = this.scheduler.summary();
      const learned = Object.keys(this.scheduler.load().records).length;
      this.el.progress.textContent = `今日新词 ${s.freshDone}/${s.fresh} · 复习 ${s.reviewDone}/${s.review} · 已学 ${learned}/${this.scheduler.bank.length}` +
        (s.deferred ? ` · ${s.deferred} 个到期词顺延` : "");
    }
    saveDraft() {
      if (!this.current || this.finished || this.ensureDate() || this.replay || this.relearning) return;
      this.scheduler.draft(this.current.id, { selected: this.selected, wrong: this.wrong, answer: this.el.input.value });
    }
    draw() {
      if (this.ensureDate()) return;
      this.test.hide();
      window.speechSynthesis?.cancel();
      if (this.replay && this.replay.date !== this.scheduler.clock()) this.replay = null;
      const studyWords = this.scheduler.testStudyWords();
      const wasRelearning = this.relearning;
      this.relearning = studyWords.length > 0;
      this.current = this.relearning ? this.scheduler.words.get(studyWords[0]) : wasRelearning ? null : this.replay ? this.scheduler.words.get(this.replay.queue[0]) : this.scheduler.next();
      this.finished = false;
      this.el.feedback.textContent = "";
      this.el["audio-status"].textContent = "";
      this.el.feedback.className = "english-feedback feedback";
      this.el.next.hidden = true;
      this.status();
      this.el.task.hidden = !this.current;
      this.el["open-test"].hidden = !this.current || this.relearning;
      this.el["open-test"].textContent = this.scheduler.summary().done ? "查看测试结果" : "开始测试";
      this.el["back-study"].hidden = true;
      this.el.restart.hidden = Boolean(this.current) || !this.scheduler.summary().total;
      if (!this.current) {
        this.el.feedback.textContent = this.replay ? "重新学习已完成 ✓ 打卡数据保持不变，可再次练习。" : "今日单词学习已完成，请通过两组限时测试完成英文打卡。";
        if (!this.replay && this.scheduler.summary().done) this.el.feedback.textContent = "两组测试已通过 ✓ 今日英文打卡完成。";
        if (wasRelearning) {
          this.el.feedback.textContent = "本页单词已重新学完，可以重考。";
          this.el["back-study"].hidden = !this.scheduler.next();
        }
        this.test.draw();
        this.el.feedback.classList.add("success");
        this.onChange("question-loaded");
        return;
      }
      const plan = this.scheduler.plan();
      const draft = this.replay || this.relearning ? {} : plan.drafts[this.current.id] || {};
      this.selected = Boolean(draft.selected);
      this.wrong = Boolean(draft.wrong);
      this.el.kind.textContent = `${plan.fresh.includes(this.current.id) ? "新词" : "复习"}${plan.retry.includes(this.current.id) ? " · 错词再练" : ""} · ${this.current.category} · ${this.current.pos}`;
      if (this.replay) this.el.kind.textContent = `重新学习 · ${this.current.category} · ${this.current.pos}`;
      if (this.relearning) {
        this.el.kind.textContent = `测试未过关 · 本页重新学习 · 剩余 ${studyWords.length} 词`;
        this.el.feedback.textContent = "必须重新学完本页全部单词才能重考：选对后完整输入英文单词。";
      }
      this.el.prompt.textContent = this.current.zh;
      this.el.word.textContent = `${this.current.word}${this.current.phonetic ? ` /${this.current.phonetic}/` : ""}`;
      this.el.credit.querySelector("p").textContent = `本词条：${this.current.selection}。`;
      const draftAnswer = draft.answer || "";
      this.lastValidInput = this.current.word.toLowerCase().startsWith(draftAnswer.toLowerCase()) ? draftAnswer : "";
      this.el.input.value = this.lastValidInput;
      this.el.input.disabled = false;
      this.el.input.readOnly = false;
      this.el.entry.hidden = !this.selected;
      this.el["choice-entry"].hidden = this.selected;
      this.el["choice-number"].value = "";
      this.renderChoices();
      (this.selected ? this.el.input : this.el["choice-number"]).focus({ preventScroll: true });
      this.onChange("question-loaded");
    }
    renderChoices() {
      const candidates = this.scheduler.bank.filter(word => word.id !== this.current.id && word.zh !== this.current.zh && word.pos === this.current.pos);
      // Select distractors without duplicates, preferring the same part of speech.
      for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
      }
      const options = candidates.slice(0, 3);
      options.splice(Math.floor(Math.random() * 4), 0, this.current);
      this.el.choices.replaceChildren();
      for (const [index, option] of options.entries()) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "choice";
        button.lang = "en";
        button.textContent = option.word;
        const number = document.createElement("span");
        number.textContent = `${index + 1}. `;
        number.setAttribute("aria-hidden", "true");
        button.prepend(number);
        button.disabled = this.selected;
        if (this.selected && option.id === this.current.id) button.classList.add("correct");
        button.addEventListener("click", () => {
          if (this.ensureDate() || this.selected) return;
          this.speak(option.word, option.id === this.current.id ? this.current.zh : "");
          if (option.id !== this.current.id) {
            button.classList.add("wrong");
            button.disabled = true;
            this.wrong = true;
            if (!this.replay && !this.relearning) this.scheduler.mistake(this.current.id);
            this.el.feedback.textContent = "再想一想，选择符合中文意思的单词。这个词稍后会再练一次。";
            this.el["choice-number"].focus();
          } else {
            this.selected = true;
            button.classList.add("correct");
            this.el.choices.querySelectorAll("button").forEach(choice => { choice.disabled = true; });
            this.el.entry.hidden = false;
            this.el["choice-entry"].hidden = true;
            this.el.feedback.textContent = "选对了，请完整输入这个英文单词。";
            this.el.input.focus();
          }
          this.saveDraft();
        });
        this.el.choices.append(button);
      }
    }
    updateInput() {
      if (this.ensureDate() || !this.current || !this.selected || this.finished) return;
      const typed = this.el.input.value;
      if (!this.current.word.toLowerCase().startsWith(typed.toLowerCase())) {
        this.el.input.value = this.lastValidInput;
        return;
      }
      this.lastValidInput = typed;
      this.saveDraft();
      if (typed.toLowerCase() !== this.current.word.toLowerCase()) return;
      let result;
      if (this.relearning) {
        if (!this.wrong) this.scheduler.completeTestStudy(this.current.id);
        result = this.wrong ? "study-retry" : "replayed";
      } else if (this.replay) {
        this.replay.queue.shift();
        if (this.wrong) this.replay.queue.push(this.current.id);
        result = this.wrong ? "retry" : "replayed";
      } else {
        result = this.scheduler.complete(this.current.id, this.wrong);
      }
      this.finished = true;
      this.el.input.readOnly = true;
      this.el.next.hidden = false;
      this.el.feedback.className = "english-feedback feedback success";
      this.el.feedback.textContent = result === "retry" ? "拼写正确！这个词已放到队尾，再答对一次即可完成。" : "完成 ✓ 已计入今日进度。";
      if (result === "replayed") this.el.feedback.textContent = "完成 ✓ 打卡数据保持不变。";
      if (result === "study-retry") this.el.feedback.textContent = "拼写正确！请再完整答对本词一次，才能继续。";
      this.status();
      this.onChange(result === "completed" ? "question-completed" : "word-retry");
    }
    speak(text, chineseText = "") {
      if (!("speechSynthesis" in window)) {
        this.el["audio-status"].textContent = "当前浏览器不支持朗读，仍可继续答题。";
        return;
      }
      const synth = window.speechSynthesis;
      synth.cancel();
      const voice = new SpeechSynthesisUtterance(text);
      const english = synth.getVoices().filter(item => /^en[-_]/i.test(item.lang));
      voice.voice = english.find(item => /^en[-_]GB$/i.test(item.lang)) || english[0] || null;
      voice.lang = voice.voice?.lang || "en-GB";
      voice.rate = 0.85;
      this.el["audio-status"].textContent = "";
      voice.onerror = event => {
        if (!["canceled", "interrupted"].includes(event.error)) this.el["audio-status"].textContent = "朗读暂不可用，请检查设备是否安装对应语言的语音后重试。";
      };
      synth.speak(voice);
      if (chineseText) {
        const chineseVoice = new SpeechSynthesisUtterance(chineseText);
        const chinese = synth.getVoices().filter(item => /^zh[-_]/i.test(item.lang));
        chineseVoice.voice = chinese.find(item => /^zh[-_]CN$/i.test(item.lang)) || chinese[0] || null;
        chineseVoice.lang = chineseVoice.voice?.lang || "zh-CN";
        chineseVoice.rate = 0.85;
        chineseVoice.onerror = voice.onerror;
        synth.speak(chineseVoice);
      }
    }
  }
  window.EnglishPractice = EnglishPractice;
})();
