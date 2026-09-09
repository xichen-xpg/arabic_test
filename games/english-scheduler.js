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
        if (create && (existing.dailyLimit !== DAILY_LIMIT || existing.newLimit !== NEW_LIMIT)) {
          const scheduled = new Set([...existing.review, ...existing.fresh]);
          const due = Object.entries(state.records)
            .filter(([id, record]) => this.words.has(id) && record.due <= date && !scheduled.has(id))
            .sort((a, b) => Number(b[1].trouble) - Number(a[1].trouble) || a[1].due.localeCompare(b[1].due) || a[0].localeCompare(b[0]));
          const previousReviewCount = existing.review.length;
          for (const [id] of due) {
            if (scheduled.size >= DAILY_LIMIT) break;
            existing.review.push(id);
            scheduled.add(id);
          }
          for (const word of this.bank) {
            if (scheduled.size >= DAILY_LIMIT || existing.fresh.length >= NEW_LIMIT) break;
            if (!state.records[word.id] && !scheduled.has(word.id)) {
              existing.fresh.push(word.id);
              scheduled.add(word.id);
            }
          }
          existing.dailyLimit = DAILY_LIMIT;
          existing.newLimit = NEW_LIMIT;
          existing.deferred = Math.max(0, due.length - (existing.review.length - previousReviewCount));
          this.save(state);
        }
        return existing;
      }
      if (!create) return null;
      const due = Object.entries(state.records)
        .filter(([id, record]) => this.words.has(id) && record.due <= date)
        .sort((a, b) => Number(b[1].trouble) - Number(a[1].trouble) || a[1].due.localeCompare(b[1].due) || a[0].localeCompare(b[0]));
      const review = due.slice(0, DAILY_LIMIT).map(([id]) => id);
      const fresh = this.bank.filter(word => !state.records[word.id]).slice(0, Math.min(NEW_LIMIT, DAILY_LIMIT - review.length)).map(word => word.id);
      const plan = { date, review, fresh, completed: [], failed: [], retry: [], drafts: {}, deferred: Math.max(0, due.length - review.length), dailyLimit: DAILY_LIMIT, newLimit: NEW_LIMIT };
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
    summary(date = this.clock(), create = date === this.clock()) {
      const plan = this.plan(date, create);
      if (!plan) return null;
      const count = ids => ids.filter(id => plan.completed.includes(id)).length;
      return { fresh: plan.fresh.length, review: plan.review.length, freshDone: count(plan.fresh), reviewDone: count(plan.review),
        total: plan.fresh.length + plan.review.length, completed: plan.completed.length, deferred: plan.deferred,
        done: plan.completed.length === plan.fresh.length + plan.review.length };
    }
  }
  const api = { Scheduler, today, normalize, addDays, STORAGE_KEY, INTERVALS, DAILY_LIMIT, NEW_LIMIT };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.EnglishLearning = api;
})(typeof window !== "undefined" ? window : globalThis);
