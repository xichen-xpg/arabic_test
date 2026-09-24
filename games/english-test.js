(function () {
  "use strict";
  class EnglishTest {
    constructor(container, scheduler, onChange, ensureDate) {
      Object.assign(this, { container, scheduler, onChange, ensureDate });
      window.addEventListener("resize", () => this.fit());
    }
    fit() {
      if (!this.container.classList.contains("english-test-active") || this.container.hidden) return;
      const table = this.container.querySelector("table");
      table.style.zoom = "1";
      const padding = parseFloat(getComputedStyle(this.container).paddingBottom);
      const available = Math.max(120, this.container.getBoundingClientRect().bottom - table.getBoundingClientRect().top - padding - 2);
      const scale = Math.min(1, Math.max(0.75, available / table.getBoundingClientRect().height));
      table.style.zoom = String(scale);
    }
    hide() {
      clearInterval(this.timer);
      this.container.hidden = true;
      this.container.classList.remove("english-test-active");
    }
    renderOverview(container) {
      const summary = this.scheduler.testSummary();
      const test = this.scheduler.plan().test;
      container.innerHTML = `<h3>今日测试 · ${summary.passed}/${summary.pages * 2} 已通过</h3><div class="english-overview-rows"></div>`;
      const rows = container.querySelector("div");
      for (let index = 0; index < summary.pages * 2; index++) {
        const row = document.createElement("div");
        row.className = "english-overview-row";
        row.dataset.index = index;
        const label = document.createElement("span");
        label.textContent = `${index < summary.pages ? "英文选中文" : "中文选英文"} · ${index % summary.pages + 1}`;
        const status = document.createElement("span");
        const attempt = test.active && (test.active.index ?? test.passed) === index ? test.active : test.attempts?.[index];
        status.textContent = summary.completed.includes(index) ? "已通过 ✓" : attempt?.failed ? "未通过" : attempt ? "进行中" : "未开始";
        const time = document.createElement("span");
        const elapsed = test.latestTimes?.[index] ?? test.times?.[index];
        time.textContent = Number.isFinite(elapsed) ? `${(elapsed / 1000).toFixed(2)} 秒` : "—";
        const challenge = document.createElement("button");
        challenge.type = "button";
        challenge.textContent = "测试";
        challenge.addEventListener("click", () => this.onChange("test-open", index));
        const study = document.createElement("button");
        study.type = "button";
        study.textContent = "学习";
        study.disabled = !attempt && !summary.completed.includes(index);
        study.title = study.disabled ? "请先尝试本页测试" : "学习本页单词";
        study.addEventListener("click", () => this.onChange("test-study", index));
        row.append(label, status, time, challenge, study);
        rows.append(row);
      }
    }
    draw() {
      this.hide();
      this.container.hidden = false;
      const summary = this.scheduler.testSummary();
      const active = this.scheduler.plan().test?.active;
      if (active?.failed) {
        const needsStudy = this.scheduler.testStudyWords().length > 0;
        this.container.innerHTML = `<button class="secondary english-test-start" type="button"></button>`;
        const button = this.container.querySelector("button");
        button.textContent = needsStudy ? "重新学习本页单词" : "重做本页（25 秒）";
        button.addEventListener("click", () => {
          if (this.ensureDate()) return;
          if (needsStudy) this.onChange("test-relearn-required");
          else { this.scheduler.startTest(); this.draw(); }
        });
        button.focus({ preventScroll: true });
        return;
      }
      this.container.innerHTML = `<h3 class="english-test-title"></h3>
        <p class="english-note">每页最多 10 题，25 秒内全部选对才过关。选错或超时必须先重新学习本页全部单词，再重考；已通过的页会保留。全部英语测试通过后才统计平均用时和红旗。</p>
        <p class="english-test-clock" role="timer"></p>
        <div class="english-test-scroll"><table class="english-test-table"><tbody></tbody></table></div>
        <p class="english-test-feedback" role="status"></p>
        <button class="secondary english-test-start" type="button"></button>
        <button class="secondary english-test-close" type="button" hidden>收起测试（继续计时）</button>`;
      const title = this.container.querySelector("h3");
      const start = this.container.querySelector("button");
      const index = active?.index ?? summary.next ?? 0;
      const reverse = index >= summary.pages;
      title.textContent = summary.done && !active ? "两组测试已通过 ✓ 英文每日打卡完成" :
        `${reverse ? "第二组 · 中文选英文" : "第一组 · 英文选中文"} · 第 ${index % summary.pages + 1}/${summary.pages} 页`;
      start.hidden = Boolean(active && !active.failed);
      start.textContent = summary.done ? "重新测试" : summary.passed === summary.pages ? "开始第二组测试" : summary.passed > 0 ? "下一页测试" : "开始测试";
      if (!active && summary.passed > 0 && !summary.done) {
        this.container.querySelector(".english-test-feedback").textContent = "上一页测试已通过 ✓ 请继续。";
      }
      start.addEventListener("click", () => {
        if (this.ensureDate()) return;
        if (summary.done) this.scheduler.restartTest();
        this.scheduler.startTest();
        this.draw();
      });
      if (!active) {
        if (!summary.done) {
          const study = document.createElement("button");
          study.type = "button";
          study.className = "secondary english-study-next";
          study.textContent = "学习下一个测试的单词";
          study.addEventListener("click", () => this.onChange("test-study", summary.next));
          this.container.append(study);
        }
        return;
      }
      this.container.classList.add("english-test-active");
      const close = this.container.querySelector(".english-test-close");
      close.hidden = false;
      close.addEventListener("click", () => this.container.classList.remove("english-test-active"));
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
            this.onChange(result === "passed" ? "test-page-passed" : "test-updated");
          });
          td.append(button);
          tr.append(td);
        }
        tbody.append(tr);
      });
      const tick = () => {
        if (this.ensureDate()) { this.hide(); return; }
        const remaining = Math.max(0, Math.ceil((active.deadline - Date.now()) / 1000));
        this.container.querySelector(".english-test-clock").textContent = active.failed ? "本页未过关" : `剩余 ${remaining} 秒`;
        if (!active.failed && remaining === 0) {
          this.scheduler.answerTest(-1, null);
          this.draw();
          this.onChange("test-updated");
        }
      };
      if (!active.failed) this.timer = setInterval(tick, 100);
      this.fit();
      tick();
    }
  }
  window.EnglishTest = EnglishTest;
})();
