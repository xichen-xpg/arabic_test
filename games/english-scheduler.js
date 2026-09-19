/* Daily word plans are immutable; review intervals advance only on completion. */
(function (root) {
  "use strict";
  const STORAGE_KEY = "arabic-test:english-learning:v1";
  // Successful early reviews fall on days 1, 2, 4, 7, 15, 30.
  // Mature words expand to 30/60/120/180-day gaps so reviews cannot crowd
  // out the remaining new words forever under the 50-word daily limit.
  const INTERVALS = [1, 1, 2, 3, 8, 15, 30, 60, 120, 180];
  const DAILY_LIMIT = 50;
  const NEW_LIMIT = 30;
  const REVIEW_LIMIT = 20;
  const addDays = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
  function today() {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }
  function normalize(value, language) {
    const clean = value.normalize("NFKC").toLowerCase().replace(/[’‘]/g, "'").replace(/\p{P}/gu, "").trim();
    return language === "zh" ? clean.replace(/\s+/g, "") : clean.replace(/\s+/g, " ");
  }
  function matchesMeaning(answer, meaning) {
    const typed = normalize(answer, "zh");
    return Boolean(typed) && [meaning, ...meaning.split(/[；;，,、/／|\n]+/)].some(part => normalize(part, "zh") === typed);
  }
  class Scheduler {
    constructor(bank, storage, clock = today) {
      this.bank = bank;
      this.storage = storage;
      this.clock = clock;
      this.words = new Map(bank.map(word => [word.id, word]));
    }
    load() {
      try {
        const value = JSON.parse(this.storage.getItem(STORAGE_KEY));
        if (value?.version === 1 && value.records && value.days) return value;
      } catch { /* An absent or damaged save starts a fresh plan. */ }
      return { version: 1, records: {}, days: {} };
    }
    save(state) { this.storage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    plan(date = this.clock(), create = date === this.clock()) {
      const state = this.load();
      if (state.days[date]) {
        const existing = state.days[date];
        if (create && !existing.test) { existing.test = { passed: 0 }; this.save(state); }
        if (create && (existing.dailyLimit !== DAILY_LIMIT || existing.newLimit !== NEW_LIMIT || existing.reviewLimit !== REVIEW_LIMIT)) {
          const completed = new Set(existing.completed);
          const completedReviews = existing.review.filter(id => completed.has(id));
          const pendingReviews = existing.review.filter(id => !completed.has(id));
          existing.review = [...completedReviews, ...pendingReviews.slice(0, Math.max(0, REVIEW_LIMIT - completedReviews.length))];
          const scheduled = new Set([...existing.review, ...existing.fresh]);
          const due = Object.entries(state.records)
            .filter(([id, record]) => this.words.has(id) && record.due <= date && !scheduled.has(id) && !completed.has(id))
            .sort((a, b) => Number(b[1].trouble) - Number(a[1].trouble) || a[1].due.localeCompare(b[1].due) || a[0].localeCompare(b[0]));
          for (const [id] of due) {
            if (existing.review.length >= REVIEW_LIMIT) break;
            existing.review.push(id);
            scheduled.add(id);
          }
          for (const word of this.bank) {
            if (existing.fresh.length >= NEW_LIMIT) break;
            if (!state.records[word.id] && !scheduled.has(word.id)) {
              existing.fresh.push(word.id);
              scheduled.add(word.id);
            }
          }
          existing.dailyLimit = DAILY_LIMIT;
          existing.newLimit = NEW_LIMIT;
          existing.reviewLimit = REVIEW_LIMIT;
          existing.deferred = Object.entries(state.records)
            .filter(([id, record]) => this.words.has(id) && record.due <= date && !existing.review.includes(id) && !completed.has(id)).length;
          this.save(state);
        }
        return existing;
      }
      if (!create) return null;
      const due = Object.entries(state.records)
        .filter(([id, record]) => this.words.has(id) && record.due <= date)
        .sort((a, b) => Number(b[1].trouble) - Number(a[1].trouble) || a[1].due.localeCompare(b[1].due) || a[0].localeCompare(b[0]));
      const review = due.slice(0, REVIEW_LIMIT).map(([id]) => id);
      const fresh = this.bank.filter(word => !state.records[word.id]).slice(0, NEW_LIMIT).map(word => word.id);
      const plan = { date, review, fresh, completed: [], failed: [], retry: [], drafts: {}, deferred: Math.max(0, due.length - review.length), dailyLimit: DAILY_LIMIT, newLimit: NEW_LIMIT, reviewLimit: REVIEW_LIMIT };
      plan.test = { passed: 0 };
      state.days[date] = plan;
      this.save(state);
      return plan;
    }
    questions(date = this.clock(), create = date === this.clock()) {
      const plan = this.plan(date, create);
      return plan ? [...plan.review, ...plan.fresh].map(id => this.words.get(id)) : [];
    }
    next() {
      const plan = this.plan();
      const remaining = [...plan.review, ...plan.fresh].filter(id => !plan.completed.includes(id));
      return this.words.get(remaining.find(id => !plan.retry.includes(id)) || plan.retry.find(id => remaining.includes(id))) || null;
    }
    draft(id, draft) {
      const state = this.load();
      const plan = state.days[this.clock()];
      if (!plan || ![...plan.review, ...plan.fresh].includes(id) || plan.completed.includes(id)) return;
      plan.drafts[id] = draft;
      this.save(state);
    }
    mistake(id) {
      const state = this.load();
      const plan = state.days[this.clock()];
      if (!plan || ![...plan.review, ...plan.fresh].includes(id) || plan.completed.includes(id)) return;
      if (!plan.failed.includes(id)) plan.failed.push(id);
      this.save(state);
    }
    complete(id, needsRetry = false) {
      const state = this.load();
      const date = this.clock();
      const plan = state.days[date];
      if (!plan || ![...plan.review, ...plan.fresh].includes(id) || plan.completed.includes(id)) return "ignored";
      delete plan.drafts[id];
      if (needsRetry) {
        plan.retry = [...plan.retry.filter(word => word !== id), id];
        this.save(state);
        return "retry";
      }
      const previous = state.records[id];
      const failed = plan.failed.includes(id);
      const stage = !previous || failed ? 0 : Math.min(previous.stage + 1, INTERVALS.length - 1);
      state.records[id] = { stage, due: addDays(date, INTERVALS[stage]), lastCompleted: date, trouble: failed };
      plan.completed.push(id);
      plan.retry = plan.retry.filter(word => word !== id);
      this.save(state);
      return "completed";
    }
    testSummary(date = this.clock(), create = date === this.clock()) {
      const plan = this.plan(date, create);
      if (!plan) return null;
      const pages = Math.ceil((plan.review.length + plan.fresh.length) / 10);
      const passed = plan.test?.passed || 0;
      const timing = plan.testTiming;
      const averageSeconds = timing ? timing.totalMs / timing.pages / 1000 : null;
      return { pages, passed, done: pages > 0 && passed === pages * 2,
        averageSeconds, fast: timing?.pages === 10 && averageSeconds < 15 };
    }
    restartTest() {
      if (!this.testSummary().done) return;
      this.syncTestLearning();
      const state = this.load();
      state.days[this.clock()].test = { passed: 0, checkedIn: true };
      this.save(state);
    }
    startTest(now = Date.now()) {
      const summary = this.summary();
      if (this.testSummary().done || !summary.total) return;
      const state = this.load();
      const plan = state.days[this.clock()];
      const test = plan.test || { passed: 0 };
      if (test.active && (!test.active.failed || this.testStudyWords().length)) return;
      const pages = Math.ceil(summary.total / 10);
      const reverse = test.passed >= pages;
      const ids = [...plan.review, ...plan.fresh].slice((test.passed % pages) * 10, (test.passed % pages + 1) * 10);
      const shuffle = values => {
        for (let i = values.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [values[i], values[j]] = [values[j], values[i]];
        }
        return values;
      };
      test.active = { startedAt: now, deadline: now + 20000, answers: {}, failed: false, rows: ids.map(id => {
        const word = this.words.get(id);
        const field = reverse ? "word" : "zh";
        const seen = new Set([word[field]]);
        const choices = shuffle(this.bank.filter(item => item.id !== id && item.zh !== word.zh && item.word !== word.word))
          .filter(item => { if (seen.has(item[field])) return false; seen.add(item[field]); return true; }).slice(0, 3);
        return { id, options: shuffle([id, ...choices.map(item => item.id)]) };
      }) };
      plan.test = test;
      this.save(state);
    }
    testStudyWords() {
      const active = this.plan().test?.active;
      return active?.failed ? active.rows.map(row => row.id).filter(id => !(active.learned || []).includes(id)) : [];
    }
    completeTestStudy(id) {
      if (!this.testStudyWords().includes(id)) return;
      const state = this.load();
      const active = state.days[this.clock()].test.active;
      active.learned = [...(active.learned || []), id];
      this.save(state);
      this.complete(id);
    }
    syncTestLearning() {
      const plan = this.plan();
      const ids = [...plan.review, ...plan.fresh];
      const count = plan.test?.checkedIn ? ids.length : (plan.test?.passed || 0) * 10;
      const learned = new Set([...ids.slice(0, count), ...(plan.test?.active?.learned || [])]);
      [...learned].filter(id => !plan.completed.includes(id)).forEach(id => this.complete(id));
    }
    answerTest(rowIndex, optionId, now = Date.now()) {
      const state = this.load();
      const plan = state.days[this.clock()];
      const test = plan?.test;
      const active = test?.active;
      if (!active || active.failed) return "ignored";
      if (now >= active.deadline) {
        active.failed = true;
        this.save(state);
        return "timeout";
      }
      const row = active.rows[rowIndex];
      if (!row || active.answers[rowIndex] || !row.options.includes(optionId)) return "ignored";
      active.answers[rowIndex] = optionId;
      if (optionId !== row.id) active.failed = true;
      const passed = !active.failed && Object.keys(active.answers).length === active.rows.length;
      if (passed) {
        test.times = test.times || [];
        test.times[test.passed] = Number.isFinite(active.startedAt) ? Math.max(0, now - active.startedAt) : null;
        test.passed++;
        const pages = Math.ceil((plan.review.length + plan.fresh.length) / 10) * 2;
        if (!plan.testTiming && test.passed === pages && Array.from({ length: pages }, (_, i) => test.times[i]).every(Number.isFinite)) {
          plan.testTiming = { pages, totalMs: test.times.reduce((sum, ms) => sum + ms, 0) };
        }
        delete test.active;
      }
      this.save(state);
      if (passed) this.syncTestLearning();
      return passed ? "passed" : active.failed ? "wrong" : "correct";
    }
    summary(date = this.clock(), create = date === this.clock()) {
      const plan = this.plan(date, create);
      if (!plan) return null;
      const count = ids => ids.filter(id => plan.completed.includes(id)).length;
      const deferred = date === this.clock() ? Object.entries(this.load().records)
        .filter(([id, record]) => this.words.has(id) && record.due <= date && !plan.review.includes(id) && !plan.completed.includes(id)).length : plan.deferred;
      return { fresh: plan.fresh.length, review: plan.review.length, freshDone: count(plan.fresh), reviewDone: count(plan.review),
        total: plan.fresh.length + plan.review.length, completed: plan.completed.length, deferred,
        learningDone: plan.completed.length === plan.fresh.length + plan.review.length,
        done: date < this.clock() && !plan.test
          ? plan.completed.length === plan.fresh.length + plan.review.length : Boolean(plan.test?.checkedIn) || this.testSummary(date, create).done };
    }
  }
  const api = { Scheduler, today, normalize, matchesMeaning, addDays, STORAGE_KEY, INTERVALS, DAILY_LIMIT, NEW_LIMIT, REVIEW_LIMIT };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.EnglishLearning = api;
})(typeof window !== "undefined" ? window : globalThis);
