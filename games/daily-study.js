(async function () {
  const $=id=>document.getElementById(id);
  let bank,day,state,busy=false,preview=false;
  const notice=message=>{$('notice').textContent=message;};
  function link(text,href) {const a=document.createElement('a');a.textContent=text;a.href=href;a.target='_blank';a.rel='noopener';return a;}
  const filename=()=>`${state?.date || StudySession.today()}_九科复习_第${day.day}天`;
  function tick() {
    const left=state ? Math.max(0,state.deadline-(state.finishedAt || Date.now())) : 3600000;
    const seconds=Math.ceil(left/1000);
    $('timer').textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
    $('download').disabled=busy || !day;
    $('download').textContent=preview?'下载预览 PPT（不计时）':state?'重新下载 PPT（不重置计时）':'开始并下载合并 PPT';
    $('completionFields').disabled=busy || !state || preview;
    $('emailLink').hidden=preview || !state;
    $('result').textContent=state ? `${Object.keys(state.completed).length}/9 科已确认${state.finishedAt?` · ${state.onTime?'60分钟内完成':'超时完成'} · 用时${Math.ceil((state.finishedAt-state.startedAt)/60000)}分钟` : left===0?' · 60分钟已到，可继续作答并如实记录':''} · 中断${state.interruptions}次` : '';
  }
  function draw() {
    $('tasks').replaceChildren();$('answers').replaceChildren();$('checks').replaceChildren();
    if (!day) { $('dayTitle').textContent='45天练习已完成';tick();return; }
    const names=Object.fromEntries(bank.subjects.map(s=>[s.id,s.name]));
    $('dayTitle').textContent=`${preview?'目录预览':'当前作业'} · 第${day.day}/45天${state?` · ${state.date}`:''}`;
    $('focus').textContent=`重点：${day.focus.map(s=>names[s]).join('、')}`;
    bank.subjects.forEach(subject=>{
      const article=document.createElement('article');article.className='subject';
      const h=document.createElement('h2');h.textContent=subject.name;article.append(h);
      day.tasks.filter(t=>bank.questions[t.id].subject===subject.id).forEach(task=>{
        const q=bank.questions[task.id],p=document.createElement('p');
        const lesson=document.createElement('section');lesson.className='lesson';
        p.textContent=`${q.kind==='focus'?'重点题组':'短题'} · 共${task.minutes}分钟（含讲解${q.kind==='focus'?3:1}分钟） · ${q.topic}${task.repeat?' · 间隔重做':''}`;
        lesson.append(p);
        for (const [heading,content] of [
          ['1 · 知识点讲解',q.teaching.concept],['解题方法',q.teaching.method],
          ['2 · 例子推演',q.teaching.example],['易错点',q.teaching.pitfall]
        ]) {
          const h=document.createElement('h3'),body=document.createElement('p');
          h.textContent=heading;body.textContent=content;lesson.append(h);
          if (heading==='2 · 例子推演') {const label=document.createElement('p');label.className='muted';label.textContent=q.teaching.exampleLabel;lesson.append(label);}
          lesson.append(body);
        }
        const check=document.createElement('h3');check.textContent='3 · 真题检查';
        const instruction=document.createElement('p');instruction.textContent='先独立作答，再核对家长版解析；需要回看讲解时，记下还不熟悉的知识点。';
        lesson.append(check,instruction,link(q.source,`../data/daily-study/${q.question}`));article.append(lesson);
        const answer=document.createElement('p');answer.append(link(`${q.source}：${q.topic}`,`../data/daily-study/${q.answer}`));$('answers').append(answer);
      });
      $('tasks').append(article);
      const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=subject.id;input.checked=!!state?.completed[subject.id];
      label.append(input,`${subject.name}：本日全部题目已作答并保存`);$('checks').append(label);
    });
    $('interruptions').value=state?.interruptions || 0;
    $('filename').textContent=state?`${filename()}.pptx`:'';
    $('emailLink').href=`mailto:xichen.app@gmail.com?subject=${encodeURIComponent(filename())}&body=${encodeURIComponent('九科作业见附件。请手动添加已完成的PPTX。')}`;
    tick();
  }
  function current() {const p=StudySession.plan(localStorage);day=bank.days[p.day-1];state=p.state;preview=false;draw();}
  try {
    const response=await fetch('../data/daily-study/bank.json?v=20261010-teaching');
    if (!response.ok) throw new Error('题库加载失败，请刷新。');bank=await response.json();
    for (const d of bank.days) {const option=document.createElement('option');option.value=d.day;option.textContent=`第${d.day}天`; $('daySelect').append(option);}
    current();notice('每个题组先讲知识点、演示例子，再用北京真题检查。讲解和原创例子不属于原卷；网页下方与合并PPT均可阅读。');
  } catch(error) {notice(error.message);}
  $('download').addEventListener('click',async()=>{
    if (busy || !day) return;busy=true;tick();notice('正在准备真题图片并生成合并PPT…');
    try {
      // Loading and generation failures must not consume a day or start a timer.
      const images=await StudyPpt.prepare(bank,day);
      const title=filename();const ppt=StudyPpt.create(bank,day,title,images);
      const blob=await ppt.write({outputType:'blob',compression:true});
      if (!preview) state=StudySession.start(localStorage);
      const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${title}.pptx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
      draw();notice(preview?'预览PPT已生成，未开始计时，也未改变学习进度。':'合并PPT已生成，计时开始。按科目连续作答，保存后回来确认完成记录。');
    } catch(error) {notice(error.message);}
    finally {busy=false;tick();}
  });
  $('completion').addEventListener('submit',event=>{
    event.preventDefault();if (!state || preview || busy) return;
    try {
      state=StudySession.save(localStorage,state.date,bank.subjects.map(s=>s.id),Array.from($('checks').querySelectorAll('input:checked'),i=>i.value),Number($('interruptions').value));
      draw();notice('完成记录已保存在本浏览器，可回到每日打卡查看；此记录为本人确认，不代表答案已批改。');
    } catch(error) {notice(error.message);}
  });
  $('preview').addEventListener('click',()=>{if(busy || !bank)return;day=bank.days[Number($('daySelect').value)-1];state=null;preview=true;draw();});
  $('backToday').addEventListener('click',()=>{if(!busy && bank)current();});
  setInterval(tick,1000);
})();
