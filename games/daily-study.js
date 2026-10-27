(async function () {
  const $=id=>document.getElementById(id);
  let bank,day,state,busy=false,preview=false;
  const notice=message=>{$('notice').textContent=message;};
  function link(text,href) {const a=document.createElement('a');a.textContent=text;a.href=href;a.target='_blank';a.rel='noopener';return a;}
  const filename=()=>`${state?.date || StudySession.today()}_PPT作业_第${day.day}天`;
  function tick() {
    const left=state ? Math.max(0,state.deadline-(state.finishedAt || Date.now())) : 3600000;
    const seconds=Math.ceil(left/1000);
    $('timer').textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
    $('download').disabled=busy || !day;
    $('download').textContent=preview?'下载复习PPT':state?'重新下载PPT':'开始并下载PPT';
    $('completionFields').disabled=busy || !state || preview;
    $('emailLink').hidden=preview || !state;
    $('result').textContent=state?.finishedAt ? `PPT已完成 · 用时${Math.ceil((state.finishedAt-state.startedAt)/60000)}分钟` : state && left===0?'时间到，可继续完成作业。':'';
  }
  function draw() {
    $('tasks').replaceChildren();$('answers').replaceChildren();$('checks').replaceChildren();
    if (!day) { $('dayTitle').textContent='本轮全部真题已完成';$('focus').textContent='可从目录选择已学过的作业复习。';tick();return; }
    $('dayTitle').textContent=`${preview?'目录预览':'当前作业'} · 第${day.day}/${bank.days.length}天${state?` · ${state.date}`:''}`;
    $('focus').textContent=`今天${day.tasks.length}科，每科一个题组，按原卷顺序推进。`;
    const activeSubjects=bank.subjects.filter(subject=>day.tasks.some(t=>bank.questions[t.id].subject===subject.id));
    activeSubjects.forEach(subject=>{
      const article=document.createElement('article');article.className='subject';
      const h=document.createElement('h2');h.textContent=subject.name;article.append(h);
      day.tasks.filter(t=>bank.questions[t.id].subject===subject.id).forEach(task=>{
        const q=bank.questions[task.id],p=document.createElement('p');
        const lesson=document.createElement('section');lesson.className='lesson';
        p.textContent=q.topic;
        lesson.append(p);
        lesson.append(link(q.source,`../data/exam-study/${q.question}`));
        for(const image of q.pages){const img=document.createElement('img');img.src=`../data/exam-study/${image.src}`;img.alt=q.source;img.loading='lazy';img.style.cssText='display:block;max-width:100%;height:auto;margin:12px 0';lesson.append(img);}
        const solution=document.createElement('details'),summary=document.createElement('summary');summary.textContent='原卷答案与解析';
        solution.append(summary,link('打开本卷解析（按原题号核对）',`../data/exam-study/${q.answer}`));lesson.append(solution);article.append(lesson);
        const answer=document.createElement('p');answer.append(link(q.source,`../data/exam-study/${q.answer}`));$('answers').append(answer);
      });
      $('tasks').append(article);
    });
    const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value='ppt';input.checked=activeSubjects.every(s=>!!state?.completed[s.id]);
    label.append(input,'PPT全部作答并保存');$('checks').append(label);
    $('interruptions').value=state?.interruptions || 0;
    $('filename').textContent=state?`${filename()}.pptx`:'';
    $('emailLink').href=`mailto:xichen.app@gmail.com?subject=${encodeURIComponent(filename())}&body=${encodeURIComponent('PPT作业见附件。请手动添加已完成的PPTX。')}`;
    tick();
  }
  function current() {const p=StudySession.plan(localStorage);day=bank.days[p.day-1];state=p.state;preview=false;draw();}
  try {
    const response=await fetch('../data/exam-study/bank.json?v=20261027-six-subjects');
    if (!response.ok) throw new Error('题库加载失败，请刷新。');bank=await response.json();
    for (const d of bank.days) {const option=document.createElement('option');option.value=d.day;option.textContent=`第${d.day}天`; $('daySelect').append(option);}
    current();notice('');
  } catch(error) {notice(error.message);}
  $('download').addEventListener('click',async()=>{
    if (busy) return;
    const date=StudySession.today();
    if (!preview) current();
    if (!day) return;busy=true;tick();notice('正在准备真题图片并生成合并PPT…');
    try {
      // Loading and generation failures must not consume a day or start a timer.
      const images=await StudyPpt.prepare(bank,day);
      const title=`${state?.date || date}_PPT作业_第${day.day}天`;const ppt=StudyPpt.create(bank,day,title,images);
      const blob=await ppt.write({outputType:'blob',compression:true});
      if (!preview) state=StudySession.start(localStorage,date,Date.now(),bank.days.length);
      const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${title}.pptx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
      draw();notice(preview?'复习PPT已下载。':'PPT已下载，计时开始。');
    } catch(error) {notice(error.message);}
    finally {busy=false;tick();}
  });
  $('completion').addEventListener('submit',event=>{
    event.preventDefault();if (!state || preview || busy) return;
    try {
      const subjects=day.tasks.map(t=>bank.questions[t.id].subject);
      state=StudySession.save(localStorage,state.date,subjects,$('checks').querySelector('input').checked?subjects:[],Number($('interruptions').value));
      draw();notice('打卡已保存。');
    } catch(error) {notice(error.message);}
  });
  $('preview').addEventListener('click',()=>{if(busy || !bank)return;day=bank.days[Number($('daySelect').value)-1];state=null;preview=true;draw();});
  $('backToday').addEventListener('click',()=>{if(!busy && bank)current();});
  setInterval(tick,1000);
})();
