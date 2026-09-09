(function () {
  "use strict";
  const { normalize } = window.EnglishLearning;
  class EnglishPractice {
    constructor(container, scheduler, onChange, ensureDate) {
      this.container = container;
      this.scheduler = scheduler;
      this.onChange = onChange;
      this.ensureDate = ensureDate;
      container.innerHTML = `
        <p class="english-progress" aria-live="polite"></p>
        <p class="english-note">每天最多 50 词，优先复习；新词最多 30 个。选对单词后，照着输入完整中英文例句。</p>
        <div class="english-task">
          <p class="english-kind question-label"></p>
          <p class="english-prompt chinese"></p>
          <div class="english-choices choices" aria-label="英文单词选项"></div>
          <div class="english-entry" hidden>
            <p class="english-word"></p>
            <div class="actions">
              <button class="secondary english-speak-word" type="button">🔊 单词发音</button>
              <button class="secondary english-speak-sentence" type="button">🔊 例句发音</button>
            </div>
            <p class="english-example" lang="en" dir="ltr"></p>
            <p class="english-translation" lang="zh-CN"></p>
            <label>完整输入英文例句<textarea class="english-input" lang="en" dir="ltr" rows="3" spellcheck="false" autocomplete="off"></textarea></label>
            <label>完整输入中文译文<textarea class="english-chinese-input" lang="zh-CN" dir="ltr" rows="3" spellcheck="false" autocomplete="off"></textarea></label>
            <p class="english-note">忽略大小写、常见标点和多余空格；中文请按显示的译文输入。</p>
            <div class="actions"><button class="primary english-check" type="button">检查两句</button></div>
            <details class="english-credit"><summary>词条与例句来源</summary><p></p><a target="_blank" rel="noopener" href="games/english-sources.html">查看题库选词规则与来源</a></details>
          </div>
        </div>
        <p class="english-feedback feedback" aria-live="polite"></p>
        <p class="english-audio-status english-note" role="status"></p>
        <button class="ghost english-next" type="button" hidden>下一词</button>`;
      this.el = {};
      for (const name of ["progress", "kind", "prompt", "choices", "entry", "word", "example", "translation", "input", "chinese-input", "check", "feedback", "next", "task", "audio-status", "credit"]) {
        this.el[name] = container.querySelector(`.english-${name}`);
      }
      container.querySelector(".english-speak-word").addEventListener("click", () => this.speak(this.current.word));
      container.querySelector(".english-speak-sentence").addEventListener("click", () => this.speak(this.current.en));
      this.el.check.addEventListener("click", () => this.check());
      this.el.next.addEventListener("click", () => this.draw());
      for (const name of ["input", "chinese-input"]) {
        const input = this.el[name];
        input.addEventListener("compositionstart", () => { this.composing = true; });
        input.addEventListener("compositionend", () => { this.composing = false; this.saveDraft(); });
        input.addEventListener("input", () => { if (!this.composing) this.saveDraft(); });
        input.addEventListener("keydown", event => {
          if (event.isComposing || this.composing || event.keyCode === 229) return;
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            if (this.finished) this.draw();
            else if (name === "input") this.el["chinese-input"].focus();
            else this.check();
          }
        });
      }
    }
    status() {
      const s = this.scheduler.summary();
      const learned = Object.keys(this.scheduler.load().records).length;
      this.el.progress.textContent = `今日新词 ${s.freshDone}/${s.fresh} · 复习 ${s.reviewDone}/${s.review} · 已学 ${learned}/${this.scheduler.bank.length}` +
        (s.deferred ? ` · ${s.deferred} 个到期词顺延` : "");
    }
    saveDraft() {
      if (!this.current || this.finished || this.ensureDate()) return;
      this.scheduler.draft(this.current.id, { selected: this.selected, wrong: this.wrong, en: this.el.input.value, zh: this.el["chinese-input"].value });
    }
    draw() {
      if (this.ensureDate()) return;
      window.speechSynthesis?.cancel();
      this.current = this.scheduler.next();
      this.finished = false;
      this.composing = false;
      this.el.feedback.textContent = "";
      this.el["audio-status"].textContent = "";
      this.el.feedback.className = "english-feedback feedback";
      this.el.next.hidden = true;
      this.status();
      this.el.task.hidden = !this.current;
      if (!this.current) {
        this.el.feedback.textContent = "今日英语任务已完成 ✓ 明天继续复习与新词学习。";
        this.el.feedback.classList.add("success");
        this.onChange("question-loaded");
        return;
      }
      const plan = this.scheduler.plan();
      const draft = plan.drafts[this.current.id] || {};
      this.selected = Boolean(draft.selected);
      this.wrong = Boolean(draft.wrong);
      this.el.kind.textContent = `${plan.fresh.includes(this.current.id) ? "新词" : "复习"}${plan.retry.includes(this.current.id) ? " · 错词再练" : ""} · ${this.current.category} · ${this.current.pos}`;
      this.el.prompt.textContent = this.current.zh;
      this.el.word.textContent = `${this.current.word}${this.current.phonetic ? ` /${this.current.phonetic}/` : ""}`;
      this.el.example.textContent = this.current.en;
      this.el.translation.textContent = this.current.cn;
      this.el.credit.querySelector("p").textContent = this.current.exampleSource === "original"
        ? "例句：本项目编写。" : "例句：Tatoeba 社区，CC BY 2.0 FR；中文已统一为简体。";
      this.el.input.value = draft.en || "";
      this.el["chinese-input"].value = draft.zh || "";
      this.el.input.disabled = false;
      this.el["chinese-input"].disabled = false;
      this.el.check.disabled = false;
      this.el.entry.hidden = !this.selected;
      this.renderChoices();
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
      for (const option of options) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "choice";
        button.lang = "en";
        button.textContent = option.word;
        button.disabled = this.selected;
        if (this.selected && option.id === this.current.id) button.classList.add("correct");
        button.addEventListener("click", () => {
          if (this.ensureDate() || this.selected) return;
          this.speak(option.word);
          if (option.id !== this.current.id) {
            button.classList.add("wrong");
            button.disabled = true;
            this.wrong = true;
            this.scheduler.mistake(this.current.id);
            this.el.feedback.textContent = "再想一想，选择符合中文意思的单词。这个词稍后会再练一次。";
          } else {
            this.selected = true;
            button.classList.add("correct");
            this.el.choices.querySelectorAll("button").forEach(choice => { choice.disabled = true; });
            this.el.entry.hidden = false;
            this.el.feedback.textContent = "选对了，请完整输入下面的两句。";
            this.el.input.focus();
          }
          this.saveDraft();
        });
        this.el.choices.append(button);
      }
    }
    check() {
      if (this.composing || this.ensureDate() || !this.current || !this.selected || this.finished) return;
      const en = normalize(this.el.input.value, "en") === normalize(this.current.en, "en");
      const zh = normalize(this.el["chinese-input"].value, "zh") === normalize(this.current.cn, "zh");
      if (!en || !zh) {
        this.el.feedback.textContent = `${!en ? "英文例句" : ""}${!en && !zh ? "和" : ""}${!zh ? "中文译文" : ""}还不一致，请对照原句检查。`;
        this.el.feedback.className = "english-feedback feedback error";
        (!en ? this.el.input : this.el["chinese-input"]).focus();
        return;
      }
      const result = this.scheduler.complete(this.current.id, this.wrong);
      this.finished = true;
      this.el.input.disabled = true;
      this.el["chinese-input"].disabled = true;
      this.el.check.disabled = true;
      this.el.next.hidden = false;
      this.el.feedback.className = "english-feedback feedback success";
      this.el.feedback.textContent = result === "retry" ? "两句正确！这个词已放到队尾，再答对一次即可完成。" : "完成 ✓ 已计入今日进度。";
      this.status();
      this.onChange(result === "completed" ? "question-completed" : "word-retry");
    }
    speak(text) {
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
        if (!["canceled", "interrupted"].includes(event.error)) this.el["audio-status"].textContent = "朗读暂不可用，请检查设备是否安装英语语音后重试。";
      };
      synth.speak(voice);
    }
  }
  window.EnglishPractice = EnglishPractice;
})();
