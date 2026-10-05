(async function () {
  const $ = id => document.getElementById(id);
  let lesson, state = null, connected = false, busy = false, offset = 0;
  const reportKey = 'math:reports';
  $('apiBase').value = window.mathConfig.apiBase || localStorage.getItem('math:api') || '';
  $('accessCode').value = sessionStorage.getItem('math:access') || '';
  const notice = message => { $('notice').textContent = message; };
  function saveReport(value) {
    if (!value) return;
    const reports = JSON.parse(localStorage.getItem(reportKey) || '{}');
    reports[value.date] = value;
    localStorage.setItem(reportKey, JSON.stringify(reports));
    const checkins = JSON.parse(localStorage.getItem('arabic-test:daily-checkins') || '{}');
    const sources = new Set(checkins[value.date] || []);
    if (value.onTime) sources.add('daily-math'); else sources.delete('daily-math');
    checkins[value.date] = [...sources];
    localStorage.setItem('arabic-test:daily-checkins', JSON.stringify(checkins));
  }
  async function api(route, options = {}) {
    const base = $('apiBase').value.trim().replace(/\/$/, '');
    const parsed = new URL(base);
    if (parsed.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(parsed.hostname)) throw new Error('作业服务必须使用HTTPS。');
    const response = await fetch(`${base}${route}`, { ...options, signal: AbortSignal.timeout(60000), headers: {
      Authorization: `Bearer ${$('accessCode').value}`, ...options.headers
    }});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '服务连接失败。');
    if (result.serverNow) offset = result.serverNow - Date.now();
    return result;
  }
  function draw() {
    $('materials').replaceChildren();
    $('lessonTitle').textContent = lesson?.title || '本阶段课程已完成';
    if (lesson) lesson.materials.forEach((material, index) => {
      const article = document.createElement('article');
      const heading = document.createElement('h2'); heading.textContent = `${index + 1}. ${material.title}`;
      const p = document.createElement('p'); p.textContent = material.text;
      article.append(heading, p); $('materials').append(article);
    });
    $('filename').textContent = state ? `${state.title}.pptx` : '';
    tick();
  }
  function tick() {
    const remaining = state ? Math.max(0, state.deadline - (state.sentAt || Date.now() + offset)) : 1800000;
    const seconds = Math.ceil(remaining / 1000);
    $('timer').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    $('download').disabled = busy || !connected || !lesson;
    $('download').textContent = state ? '重新下载 PPT（不重置计时）' : '开始并下载 PPT';
    $('send').disabled = busy || !connected || !state || !!state.sentAt;
    $('result').textContent = state?.sentAt
      ? `${state.onTime ? '今日数学完成 ✓' : '超时提交，未获得按时完成打卡'} · 用时 ${Math.ceil((state.sentAt - state.startedAt) / 1000)} 秒 · 邮件已发送`
      : state && remaining === 0 ? '30分钟已到，仍可发送作业，但不计按时完成。' : '';
  }
  async function connect() {
    connected = false; tick();
    const plan = await api('/today');
    lesson = plan.lesson; state = plan.state;
    // Keep an unfinished assignment across midnight in this browser session.
    const activeId = sessionStorage.getItem('math:active');
    const active = plan.history.find(item => item.id === activeId && !item.sentAt);
    if (active && !state) { state = active; lesson = bank.lessons[active.lessonIndex]; }
    plan.history.forEach(saveReport);
    connected = true;
    localStorage.setItem('math:api', $('apiBase').value.trim());
    sessionStorage.setItem('math:access', $('accessCode').value);
    $('connection').open = false;
    $('lessonMeta').textContent = `${state?.date || plan.date} · ${lesson?.questions.length || 0} 道单选题 · 30分钟`;
    notice(lesson ? '已连接。先阅读材料，点击下载后开始计时。' : '已完成当前五课，后续课程待补充。');
    draw();
  }
  let bank;
  try {
    const response = await fetch('../data/math/lessons.json');
    if (!response.ok) throw new Error('学习材料加载失败。');
    bank = await response.json(); lesson = bank.lessons[0]; draw();
    if ($('apiBase').value && $('accessCode').value) await connect();
    else { $('connection').open = true; notice('可先阅读。下载计时与发邮件需要先连接作业服务。'); }
  } catch (error) { notice(error.message); }
  $('connectForm').addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return; busy = true; tick();
    try { await connect(); } catch (error) { notice(error.message); }
    finally { busy = false; tick(); }
  });
  $('download').addEventListener('click', async () => {
    if (busy) return; busy = true; tick();
    try {
      if (!state) {
        state = await api('/start', { method: 'POST' });
        lesson = bank.lessons[state.lessonIndex];
        $('lessonMeta').textContent = `${state.date} · ${lesson.questions.length} 道单选题 · 30分钟`;
      }
      sessionStorage.setItem('math:active', state.id);
      saveReport(state); draw();
      await window.MathPpt.create(lesson, state.title).writeFile({ fileName: `${state.title}.pptx`, compression: true });
      notice('下载已发起，计时中。作答后上传并发送；重复下载不会重置计时。');
    } catch (error) { notice(`${error.message} 如下载失败，可重新下载，原计时仍保留。`); }
    finally { busy = false; tick(); }
  });
  $('submitForm').addEventListener('submit', async event => {
    event.preventDefault(); if (busy || !state || state.sentAt) return;
    const file = $('answerFile').files[0];
    if (!file || !/\.pptx$/i.test(file.name) || file.size > 10 * 1024 * 1024) { notice('请选择不超过10MB的.pptx文件。'); return; }
    busy = true; tick(); notice('正在上传并发送邮件，请保留页面…');
    try {
      state = await api('/submit', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-Assignment-Id': state.id }, body: file });
      saveReport(state); sessionStorage.removeItem('math:active');
      notice('邮件服务已确认发送，可在每日打卡中查看结果。');
    } catch (error) { notice(`${error.message} 未确认完成；可连接恢复进度或用同一文件重试。`); }
    finally { busy = false; tick(); }
  });
  setInterval(tick, 1000);
})();
