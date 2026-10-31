/* Daily word plans are immutable; review intervals advance only on completion. */
(function (root) {
  "use strict";
  const STORAGE_KEY = "arabic-test:english-learning:v1";
  // Successful early reviews fall on days 1, 2, 4, 7, 15, 30.
  // Mature words expand to 30/60/120/180-day gaps so reviews cannot crowd
  // out the remaining new words forever under the 50-word daily limit.
  const INTERVALS = [1, 1, 2, 3, 8, 15, 30, 60, 120, 180];
  const DAILY_LIMIT = 50;
  const NEW_LIMIT = 20;
  const REVIEW_LIMIT = 30;
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
  function sentenceKind(value = '') {
    return /[?？؟]\s*$/.test(value) ? 'question' : /[!！]\s*$/.test(value) ? 'exclamation' : 'statement';
  }
  function testOptionText(value, reference) {
    const ending = reference.match(/[。.!！?？؟]+\s*$/)?.[0].trim() || '';
    return value.replace(/[。.!！?？؟]+\s*$/, '').trimEnd() + ending;
  }
  function exampleParts(word) {
    const index = word.mixedExample.indexOf(word.word);
    return [{ text: word.mixedExample.slice(0, index), lang: "zh-CN" }, { text: word.word, lang: "en-GB" },
      { text: word.mixedExample.slice(index + word.word.length), lang: "zh-CN" }].filter(part => part.text);
  }
  class Scheduler {
    constructor(bank, storage, clock = today, options = {}) {
      this.bank = bank;
      this.storage = storage;
      this.clock = clock;
      this.storageKey = options.storageKey || STORAGE_KEY;
      this.languageName = options.languageName || "英文";
      this.languageCode = options.languageCode || "en-GB";
      this.reviewLimit = options.reviewLimit ?? REVIEW_LIMIT;
      this.newLimit = options.newLimit ?? NEW_LIMIT;
      this.firstDay = options.firstDay;
      this.firstDayNewLimit = options.firstDayNewLimit ?? this.newLimit;
      this.randomNew = options.randomNew || false;
      this.independentSentences = options.independentSentences || false;
      this.words = new Map(bank.map(word => [word.id, word]));
      this.dialogues = new Map();
      for (const word of bank.filter(word => word.dialogueId)) {
        if (!this.dialogues.has(word.dialogueId)) this.dialogues.set(word.dialogueId, []);
        this.dialogues.get(word.dialogueId).push(word.id);
      }
      for (const ids of this.dialogues.values()) ids.sort((a, b) => this.words.get(a).dialogueOrder - this.words.get(b).dialogueOrder);
    }
    group(id) { return this.dialogues.get(this.words.get(id)?.dialogueId) || [id]; }
    planIds(plan) {
      const ids = [...plan.review, ...plan.fresh];
      if (!this.dialogues.size) return ids;
      // Pairs first keeps both turns on the same ten-question test page.
      const pairs = [], singles = [], seen = new Set();
      for (const id of ids) {
        if (seen.has(id)) continue;
        const group = this.group(id).filter(member => ids.includes(member));
        group.forEach(member => seen.add(member));
        (group.length > 1 ? pairs : singles).push(...group);
      }
      return [...pairs, ...singles];
    }
    selectGroups(candidates, limit, excluded = new Set()) {
      const selected = [];
      for (const id of candidates) {
        const group = this.group(id);
        if (group.some(member => excluded.has(member) || selected.includes(member)) || selected.length + group.length > limit) continue;
        selected.push(...group);
      }
      return selected;
    }
    testRows(ids, reverse) {
      const shuffle = values => {
        for (let i = values.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [values[i], values[j]] = [values[j], values[i]];
        }
        return values;
      };
      return ids.map(id => {
        const word = this.words.get(id);
        const field = reverse ? 'word' : 'zh';
        const seen = new Set([normalize(word[field], 'word')]);
        const choices = shuffle(this.bank.filter(item => item.id !== id && item.zh !== word.zh && item.word !== word.word &&
          sentenceKind(item[field]) === sentenceKind(word[field])))
          .filter(item => {
            const text = normalize(item[field], 'word');
            if (seen.has(text)) return false;
            seen.add(text);
            return true;
          }).slice(0, 3);
        return { id, options: shuffle([id, ...choices.map(item => item.id)]) };
      });
    }
    load() {
      try {
        const value = JSON.parse(this.storage.getItem(this.storageKey));
        if (value?.version === 1 && value.records && value.days) {
          let changed = false;
          for (const ids of this.dialogues.values()) {
            const legacy = `arabic:${this.words.get(ids[0]).legacyAr}`;
            if (value.records[legacy]) {
              for (const id of ids) value.records[id] ||= { ...value.records[legacy] };
              delete value.records[legacy];
              changed = true;
            }
            for (const plan of Object.values(value.days)) {
              if (![...plan.review, ...plan.fresh].includes(legacy)) continue;
              for (const key of ['review', 'fresh', 'completed', 'failed', 'retry']) {
                plan[key] = [...new Set((plan[key] || []).flatMap(id => id === legacy ? ids : [id]))];
              }
              delete plan.drafts?.[legacy];
              // Old test rows referred to the combined sentence; retain learning progress.
              plan.test = { passed: 0 };
              delete plan.testTiming;
              changed = true;
            }
          }
          if (changed) this.save(value);
          return value;
        }
      } catch { /* An absent or damaged save starts a fresh plan. */ }
      return { version: 1, records: {}, days: {} };
    }
    save(state) { this.storage.setItem(this.storageKey, JSON.stringify(state)); }
    previouslyLearned(id, state, date) {
      return this.group(id).every(member => {
        const record = state.records[member];
        return record && record.lastCompleted < date;
      });
    }
    plan(date = this.clock(), create = date === this.clock()) {
      const NEW_LIMIT = date === this.firstDay ? this.firstDayNewLimit : this.newLimit;
      const REVIEW_LIMIT = this.reviewLimit;
      const DAILY_LIMIT = NEW_LIMIT + REVIEW_LIMIT;
      const state = this.load();
      if (state.days[date]) {
        const existing = state.days[date];
        const previousNewLimit = existing.newLimit;
        if (create && this.languageCode === 'ar' && [...existing.review, ...existing.fresh].some(id => !this.words.has(id))) {
          // Sentence edits change text-based IDs. Repair today's obsolete plan,
          // retaining completed current material and leaving historical days alone.
          const valid = ids => ids.filter(id => this.words.has(id));
          const due = Object.entries(state.records)
            .filter(([id, record]) => this.words.has(id) && record.due <= date && this.previouslyLearned(id, state, date) && !existing.completed.includes(id))
            .sort((a, b) => Number(b[1].trouble) - Number(a[1].trouble) || a[1].due.localeCompare(b[1].due) || a[0].localeCompare(b[0]));
          const retainedFresh = valid(existing.fresh);
          existing.review = this.selectGroups([...valid(existing.review), ...due.map(([id]) => id)],
            Math.max(REVIEW_LIMIT, valid(existing.review).length), new Set(retainedFresh));
          existing.fresh = this.selectGroups([...retainedFresh, ...this.bank.filter(word => !state.records[word.id]).map(word => word.id)],
            Math.max(NEW_LIMIT, retainedFresh.length), new Set(existing.review));
          const scheduled = new Set([...existing.review, ...existing.fresh]);
          for (const key of ['completed', 'failed', 'retry']) existing[key] = existing[key].filter(id => scheduled.has(id));
          existing.drafts = Object.fromEntries(Object.entries(existing.drafts).filter(([id]) => scheduled.has(id)));
          existing.test = existing.test?.checkedIn ? { passed: 0, checkedIn: true, checkedInWords: valid(existing.test.checkedInWords || [...existing.completed]) } : { passed: 0 };
          delete existing.testTiming;
          existing.dailyLimit = DAILY_LIMIT;
          existing.newLimit = NEW_LIMIT;
          existing.reviewLimit = REVIEW_LIMIT;
          existing.deferred = due.filter(([id]) => !scheduled.has(id)).length;
          this.save(state);
        }
        if (create && !existing.test) { existing.test = { passed: 0 }; this.save(state); }
        // Keep started plans stable: test page indices refer to their original words.
        const started = existing.completed.length || existing.failed.length || existing.retry.length || Object.keys(existing.drafts).length ||
          existing.test?.passed || existing.test?.active || existing.test?.checkedIn || Object.keys(existing.test?.attempts || {}).length;
        // Upgrade today's former English quota, retaining only tests with identical words.
        if (create && started && this.reviewLimit === 30 && existing.newLimit === 20 && existing.reviewLimit === 10) {
          const oldIds = [...existing.review, ...existing.fresh];
          const oldPages = Math.ceil(oldIds.length / 10);
          const test = existing.test || { passed: 0 };
          const completed = test.completed || Array.from({ length: test.passed || 0 }, (_, i) => i);
          const checkedIn = test.checkedIn || completed.length === oldPages * 2;
          const due = Object.entries(state.records)
            .filter(([id, record]) => this.words.has(id) && record.due <= date && this.previouslyLearned(id, state, date) && !oldIds.includes(id))
            .sort((a, b) => Number(b[1].trouble) - Number(a[1].trouble) || a[1].due.localeCompare(b[1].due) || a[0].localeCompare(b[0]));
          existing.review.push(...due.slice(0, Math.max(0, REVIEW_LIMIT - existing.review.length)).map(([id]) => id));
          const ids = [...existing.review, ...existing.fresh];
          const pages = Math.ceil(ids.length / 10);
          const remap = index => {
            const words = oldIds.slice((index % oldPages) * 10, (index % oldPages + 1) * 10);
            for (let page = 0; page < pages; page++) {
              if (JSON.stringify(words) === JSON.stringify(ids.slice(page * 10, (page + 1) * 10))) return page + (index >= oldPages ? pages : 0);
            }
            return -1;
          };
          const remapValues = values => Object.fromEntries(Object.entries(values || {}).flatMap(([index, value]) => {
            const next = remap(Number(index));
            return next < 0 ? [] : [[next, value]];
          }));
          test.completed = completed.map(remap).filter(index => index >= 0);
          test.passed = test.completed.length;
          test.times = remapValues(test.times);
          test.latestTimes = remapValues(test.latestTimes);
          test.attempts = remapValues(test.attempts);
          Object.entries(test.attempts).forEach(([index, attempt]) => { attempt.index = Number(index); });
          if (test.active) {
            const index = remap(test.active.index ?? completed.length);
            if (index < 0) delete test.active; else test.active.index = index;
          }
          if (checkedIn) { test.checkedIn = true; test.checkedInWords = oldIds; }
          existing.test = test;
          existing.dailyLimit = DAILY_LIMIT;
          existing.reviewLimit = REVIEW_LIMIT;
          this.save(state);
        }
        if (create && !started && (existing.dailyLimit !== DAILY_LIMIT || existing.newLimit !== NEW_LIMIT || existing.reviewLimit !== REVIEW_LIMIT)) {
          const completed = new Set(existing.completed);
          const completedReviews = existing.review.filter(id => completed.has(id));
          const pendingReviews = existing.review.filter(id => !completed.has(id));
          existing.review = [...completedReviews, ...pendingReviews.slice(0, Math.max(0, REVIEW_LIMIT - completedReviews.length))];
          existing.fresh = existing.fresh.slice(0, NEW_LIMIT);
          const scheduled = new Set([...existing.review, ...existing.fresh]);
          const due = Object.entries(state.records)
            .filter(([id, record]) => this.words.has(id) && record.due <= date && this.previouslyLearned(id, state, date) && !scheduled.has(id) && !completed.has(id))
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
          if (this.dialogues.size) {
            existing.review = this.selectGroups(existing.review, REVIEW_LIMIT);
            existing.fresh = this.selectGroups(existing.fresh, NEW_LIMIT, new Set(existing.review));
          }
          existing.deferred = Object.entries(state.records)
            .filter(([id, record]) => this.words.has(id) && record.due <= date && this.previouslyLearned(id, state, date) && !existing.review.includes(id) && !completed.has(id)).length;
          this.save(state);
        }
        if (create) {
          const completed = new Set(existing.completed);
          const freshText = new Set(existing.fresh.map(id => normalize(this.words.get(id)?.word || id, 'word')));
          const validReview = existing.review.filter(id => !freshText.has(normalize(this.words.get(id)?.word || id, 'word')) &&
            (completed.has(id) || this.previouslyLearned(id, state, date)));
          const quotaChanged = this.languageCode === 'ar' && previousNewLimit !== NEW_LIMIT;
          if (quotaChanged || validReview.length !== existing.review.length) {
            const oldIds = this.planIds(existing);
            if (quotaChanged) {
              const retained = [...new Set(existing.fresh.filter(id => this.group(id).some(member => completed.has(member) || existing.drafts[member])).flatMap(id => this.group(id)))];
              const selected = this.selectGroups(retained, Math.max(NEW_LIMIT, retained.length));
              existing.fresh = selected.concat(this.selectGroups(existing.fresh, Math.max(0, NEW_LIMIT - selected.length), new Set(selected)));
            }
            const candidates = Object.entries(state.records)
              .filter(([id, record]) => this.words.has(id) && record.due <= date && this.previouslyLearned(id, state, date))
              .sort((a, b) => Number(b[1].trouble) - Number(a[1].trouble) || a[1].due.localeCompare(b[1].due) || a[0].localeCompare(b[0]));
            existing.review = this.selectGroups([...validReview, ...candidates.map(([id]) => id)], REVIEW_LIMIT, new Set(existing.fresh));
            const scheduled = new Set([...existing.review, ...existing.fresh]);
            for (const key of ['failed', 'retry']) existing[key] = existing[key].filter(id => scheduled.has(id));
            existing.drafts = Object.fromEntries(Object.entries(existing.drafts).filter(([id]) => scheduled.has(id)));
            existing.newLimit = NEW_LIMIT;
            existing.dailyLimit = DAILY_LIMIT;
            if (JSON.stringify(oldIds) !== JSON.stringify(this.planIds(existing))) {
              existing.test = existing.test?.checkedIn ? { passed: 0, checkedIn: true, checkedInWords: oldIds } : { passed: 0 };
              delete existing.testTiming;
            }
            this.save(state);
          }
        }
        if (create && this.independentSentences && existing.orderVersion !== 'independent-v1') {
          // Removing dialogue grouping can change test page membership.
          const checkedIn = existing.test?.checkedIn;
          existing.test = checkedIn ? { passed: 0, checkedIn: true, checkedInWords: existing.completed.slice() } : { passed: 0 };
          delete existing.testTiming;
          existing.orderVersion = 'independent-v1';
          this.save(state);
        }
        const active = existing.test?.active;
        if (create && active && !active.failed && active.choiceVersion !== 1) {
          const pages = Math.ceil((existing.review.length + existing.fresh.length) / 10);
          active.rows = this.testRows(active.rows.map(row => row.id), active.index >= pages);
          active.choiceVersion = 1;
          this.save(state);
        }
        return existing;
      }
      if (!create) return null;
      const due = Object.entries(state.records)
        .filter(([id, record]) => this.words.has(id) && record.due <= date && this.previouslyLearned(id, state, date))
        .sort((a, b) => Number(b[1].trouble) - Number(a[1].trouble) || a[1].due.localeCompare(b[1].due) || a[0].localeCompare(b[0]));
      const review = this.selectGroups(due.map(([id]) => id), REVIEW_LIMIT);
      const reviewText = new Set(review.map(id => normalize(this.words.get(id).word || id, 'word')));
      const excluded = new Set(this.bank.filter(word => reviewText.has(normalize(word.word || word.id, 'word'))).map(word => word.id));
      const candidates = this.bank.filter(word => !state.records[word.id]).map(word => word.id);
      if (this.randomNew) {
        for (let i = candidates.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
        }
      }
      const fresh = this.selectGroups(candidates, NEW_LIMIT, excluded);
      const plan = { date, review, fresh, completed: [], failed: [], retry: [], drafts: {}, deferred: Math.max(0, due.length - review.length), dailyLimit: DAILY_LIMIT, newLimit: NEW_LIMIT, reviewLimit: REVIEW_LIMIT };
      plan.test = { passed: 0 };
      if (this.independentSentences) plan.orderVersion = 'independent-v1';
      state.days[date] = plan;
      this.save(state);
      return plan;
    }
    questions(date = this.clock(), create = date === this.clock()) {
      const plan = this.plan(date, create);
      return plan ? this.planIds(plan).map(id => this.words.get(id)) : [];
    }
    next() {
      const plan = this.plan();
      const remaining = this.planIds(plan).filter(id => !plan.completed.includes(id));
      const retry = id => this.group(id).some(member => plan.retry.includes(member));
      return this.words.get(remaining.find(id => !retry(id)) || remaining[0]) || null;
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
      const completed = plan.test?.completed || Array.from({ length: passed }, (_, i) => i);
      const next = Array.from({ length: pages * 2 }, (_, i) => i).find(i => !completed.includes(i));
      const done = pages > 0 && completed.length === pages * 2;
      const times = Array.from({ length: pages * 2 }, (_, index) => plan.test?.latestTimes?.[index] ?? plan.test?.times?.[index]);
      const latest = done && times.every(Number.isFinite) ? { pages: pages * 2, totalMs: times.reduce((sum, ms) => sum + ms, 0) } : null;
      const timing = latest && (!plan.testTiming || latest.totalMs / latest.pages < plan.testTiming.totalMs / plan.testTiming.pages) ? latest : plan.testTiming;
      const averageSeconds = timing ? timing.totalMs / timing.pages / 1000 : null;
      return { pages, passed: completed.length, completed, next, done, timing,
        averageSeconds, fast: Boolean(timing && timing.pages > 0 && averageSeconds < 15) };
    }
    restartTest() {
      if (!this.testSummary().done) return;
      this.syncTestLearning();
      const timing = this.testSummary().timing;
      const state = this.load();
      if (timing) state.days[this.clock()].testTiming = timing;
      state.days[this.clock()].test = { passed: 0, checkedIn: true };
      this.save(state);
    }
    selectTest(index) {
      const summary = this.testSummary();
      if (!Number.isInteger(index) || index < 0 || index >= summary.pages * 2) return;
      const state = this.load();
      const test = state.days[this.clock()].test;
      test.attempts = test.attempts || {};
      if (test.active) test.attempts[test.active.index ?? test.passed] = test.active;
      test.active = test.attempts[index];
      this.save(state);
    }
    startTest(now = Date.now(), index = this.plan().test?.active?.index ?? this.testSummary().next) {
      const summary = this.summary();
      if (!summary.total || !Number.isInteger(index) || index < 0 || index >= Math.ceil(summary.total / 10) * 2) return;
      this.selectTest(index);
      const state = this.load();
      const plan = state.days[this.clock()];
      const test = plan.test || { passed: 0 };
      test.completed = test.completed || Array.from({ length: test.passed }, (_, i) => i);
      if (test.active && (!test.active.failed || this.testStudyWords().length)) return;
      const pages = Math.ceil(summary.total / 10);
      const reverse = index >= pages;
      const ids = this.planIds(plan).slice((index % pages) * 10, (index % pages + 1) * 10);
      const rows = this.testRows(ids, reverse);
      for (let i = rows.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rows[i], rows[j]] = [rows[j], rows[i]];
      }
      if (rows.length > 1 && rows.every((row, i) => row.id === ids[i])) rows.push(rows.shift());
      test.active = { index, startedAt: now, deadline: now + 25000, answers: {}, failed: false,
        choiceVersion: 1, rows };
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
      const ids = this.planIds(plan);
      const summary = this.testSummary();
      const passedWords = summary.completed.flatMap(index => ids.slice((index % summary.pages) * 10, (index % summary.pages + 1) * 10));
      const learned = new Set([...(plan.test?.checkedIn ? [...(plan.test.checkedInWords || ids), ...passedWords] : passedWords), ...(plan.test?.active?.learned || [])]);
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
        const index = active.index ?? test.passed;
        test.completed = test.completed || Array.from({ length: test.passed }, (_, i) => i);
        test.times = test.times || [];
        if (!test.completed.includes(index)) {
          test.times[index] = Number.isFinite(active.startedAt) ? Math.max(0, now - active.startedAt) : null;
          test.completed.push(index);
        }
        test.lastIndex = index;
        test.lastTime = Number.isFinite(active.startedAt) ? Math.max(0, now - active.startedAt) : null;
        test.latestTimes = test.latestTimes || {};
        test.latestTimes[index] = test.lastTime;
        test.passed = test.completed.length;
        if (test.attempts) delete test.attempts[index];
        const pages = Math.ceil((plan.review.length + plan.fresh.length) / 10) * 2;
        const times = Array.from({ length: pages }, (_, i) => test.latestTimes?.[i] ?? test.times[i]);
        if (test.passed === pages && times.every(Number.isFinite)) {
          const totalMs = times.reduce((sum, ms) => sum + ms, 0);
          if (!plan.testTiming || totalMs / pages < plan.testTiming.totalMs / plan.testTiming.pages) plan.testTiming = { pages, totalMs };
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
      const state = this.load();
      const deferred = date === this.clock() ? Object.entries(state.records)
        .filter(([id, record]) => this.words.has(id) && record.due <= date && this.previouslyLearned(id, state, date) && !plan.review.includes(id) && !plan.completed.includes(id)).length : plan.deferred;
      return { fresh: plan.fresh.length, review: plan.review.length, freshDone: count(plan.fresh), reviewDone: count(plan.review),
        total: plan.fresh.length + plan.review.length, completed: plan.completed.length, deferred,
        learningDone: plan.completed.length === plan.fresh.length + plan.review.length,
        done: date < this.clock() && !plan.test
          ? plan.completed.length === plan.fresh.length + plan.review.length : Boolean(plan.test?.checkedIn) || this.testSummary(date, create).done };
    }
  }
  const api = { Scheduler, today, normalize, matchesMeaning, sentenceKind, testOptionText, exampleParts, addDays, STORAGE_KEY, INTERVALS, DAILY_LIMIT, NEW_LIMIT, REVIEW_LIMIT };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.EnglishLearning = api;
})(typeof window !== "undefined" ? window : globalThis);
