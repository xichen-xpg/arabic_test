(function () {
  "use strict";
  class EnglishTest {
    constructor(container, scheduler, onChange, ensureDate) {
      Object.assign(this, { container, scheduler, onChange, ensureDate });
    }
    hide() {
      clearInterval(this.timer);
      this.container.hidden = true;
    }
    draw() {
      this.hide();
      if (this.scheduler.testStudyWords().length) {
        this.onChange("test-relearn-required");
        return;
      }
      this.container.hidden = false;
      const summary = this.scheduler.testSummary();
      const active = this.scheduler.plan().test?.active;
      this.container.innerHTML = `<h3 class="english-test-title"></h3>
        <p class="english-note">每页最多 10 题，20 秒内全部选对才过关。选错或超时必须先重新学习本页全部单词，再重考；已通过的页会保留。</p>
        <p class="english-test-clock" role="timer"></p>
        <div class="english-test-scroll"><table class="english-test-table"><tbody></tbody></table></div>
        <p class="english-test-feedback" role="status"></p>
        <button class="secondary english-test-start" type="button"></button>`;
      const title = this.container.querySelector("h3");
      const feedback = this.container.querySelector(".english-test-feedback");
      const start = this.container.querySelector("button");
      const reverse = summary.passed >= summary.pages;
      title.textContent = summary.done ? "两组测试已通过 ✓ 英文每日打卡完成" :
        `${reverse ? "第二组 · 中文选英文" : "第一组 · 英文选中文"} · 第 ${summary.passed % summary.pages + 1}/${summary.pages} 页`;
      start.hidden = summary.done || Boolean(active && !active.failed);
      start.textContent = active?.failed ? "重做本页（20 秒）" : "开始测试";
      start.addEventListener("click", () => {
        if (this.ensureDate()) return;
        this.scheduler.startTest();
        this.draw();
      });
      if (!active || summary.done) return;
      const tbody = this.container.querySelector("tbody");
      active.rows.forEach((row, index) => {
        const tr = document.createElement("tr");
        const prompt = document.createElement("th");
        prompt.scope = "row";
        prompt.textContent = this.scheduler.words.get(row.id)[reverse ? "zh" : "word"];
        tr.append(prompt);
        for (const id of row.options) {
          const td = document.createElement("td");
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = this.scheduler.words.get(id)[reverse ? "word" : "zh"];
          button.disabled = active.failed || Boolean(active.answers[index]);
          if (active.answers[index] === id) button.className = id === row.id ? "correct" : "wrong";
          button.addEventListener("click", () => {
            if (this.ensureDate()) return;
            const result = this.scheduler.answerTest(index, id);
            this.draw();
            if (result === "passed") this.onChange("test-page-passed");
          });
          td.append(button);
          tr.append(td);
        }
        tbody.append(tr);
      });
      if (active.failed) feedback.textContent = "本页未过关；本页单词已重新学完，现在可以重考。";
      const tick = () => {
        if (this.ensureDate()) { this.hide(); return; }
        const remaining = Math.max(0, Math.ceil((active.deadline - Date.now()) / 1000));
        this.container.querySelector(".english-test-clock").textContent = active.failed ? "本页未过关" : `剩余 ${remaining} 秒`;
        if (!active.failed && remaining === 0) {
          this.scheduler.answerTest(-1, null);
          this.draw();
        }
      };
      if (!active.failed) this.timer = setInterval(tick, 100);
      tick();
    }
  }
  window.EnglishTest = EnglishTest;
})();
