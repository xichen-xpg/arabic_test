(async function () {
  const $ = id => document.getElementById(id);
  const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const date = today();
  const storageKey = 'chinese:readings';
  try {
    const response = await fetch('../data/chinese-reading/bank.json');
    if (!response.ok) throw new Error('题库加载失败，请刷新重试。');
    const bank = await response.json();
    const records = JSON.parse(localStorage.getItem(storageKey) || '{}');
    const last = Object.keys(records).sort().at(-1);
    const state = records[date] || { index: last ? records[last].index + 1 : 0, answers: {}, submitted: false };
    const reading = bank.readings[state.index];
    if (!reading) { $('notice').textContent = '已完成全部100篇阅读。'; return; }
    const save = () => {
      const latest = JSON.parse(localStorage.getItem(storageKey) || '{}');
      latest[date] = state;
      localStorage.setItem(storageKey, JSON.stringify(latest));
    };
    save();
    $('readingTitle').textContent = reading.title;
    const category = { modern: '现代文', classical_prose: '文言文', classical_poetry: '古诗词' }[reading.category];
    $('readingMeta').textContent = `${date} · 第 ${state.index + 1}/${bank.readings.length} 篇 · ${reading.author} · ${category} · 预计${reading.estimatedMinutes}分钟`;
    $('readingText').textContent = reading.text;
    $('notice').textContent = '先读原文，再完成五道单选题。提交后查看答案与解析。';
    function showResult() {
      let score = 0;
      reading.questions.forEach(q => {
        if (state.answers[q.id] === q.answer) score++;
        const feedback = document.getElementById(`${q.id}-feedback`);
        feedback.textContent = `${state.answers[q.id] === q.answer ? '回答正确' : `你选了 ${state.answers[q.id]}`} · 正确答案：${q.answer}。${q.explanation} 原文依据：${q.evidence}`;
      });
      $('assignment').querySelectorAll('input, button').forEach(el => { el.disabled = true; });
      $('result').textContent = `今日语文完成 ✓ · 答对 ${score}/${reading.questions.length} 题`;
    }
    reading.questions.forEach((q, index) => {
      const fieldset = document.createElement('fieldset');
      const legend = document.createElement('legend');
      legend.textContent = `${index + 1}. ${q.prompt}`;
      fieldset.append(legend);
      q.options.forEach(option => {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'radio'; input.name = q.id; input.value = option.id; input.required = true;
        input.checked = state.answers[q.id] === option.id;
        input.addEventListener('change', () => { state.answers[q.id] = option.id; save(); });
        label.append(input, `${option.id}. ${option.text}`);
        fieldset.append(label);
      });
      const feedback = document.createElement('p');
      feedback.id = `${q.id}-feedback`; feedback.className = 'feedback';
      fieldset.append(feedback); $('questions').append(fieldset);
    });
    $('assignment').hidden = false;
    if (state.submitted) showResult();
    $('assignment').addEventListener('submit', event => {
      event.preventDefault();
      if (today() !== date) { window.location.reload(); return; }
      state.submitted = true;
      save();
      const checkins = JSON.parse(localStorage.getItem('arabic-test:daily-checkins') || '{}');
      checkins[date] = [...new Set([...(checkins[date] || []), 'daily-chinese'])];
      localStorage.setItem('arabic-test:daily-checkins', JSON.stringify(checkins));
      showResult();
    });
  } catch (error) { $('notice').textContent = `无法加载阅读练习：${error.message}`; }
})();
