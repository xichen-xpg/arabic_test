(async function () {
  const $=id=>document.getElementById(id);
  const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dubai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const date=today(),key='exam-reading:sessions:v1';
  try {
    const response=await fetch('../data/exam-study/bank.json?v=20261027-six-subjects');
    if(!response.ok)throw new Error('阅读题库加载失败，请刷新重试。');
    const bank=await response.json(),records=JSON.parse(localStorage.getItem(key)||'{}');
    const last=Object.keys(records).sort().at(-1);
    const state=records[date]||{index:last?records[last].index+1:0,answer:'',submitted:false};
    const reading=bank.readings[state.index];
    if(!reading){$('notice').textContent='已完成全部'+bank.readings.length+'组原卷阅读。';return;}
    const save=()=>{const latest=JSON.parse(localStorage.getItem(key)||'{}');latest[date]=state;localStorage.setItem(key,JSON.stringify(latest));};
    save();
    $('readingTitle').textContent=reading.source;
    const subject=bank.subjects.find(s=>s.id===reading.subject).name;
    $('readingMeta').textContent=date+' · '+subject+' · 第'+(state.index+1)+'/'+bank.readings.length+'组';
    $('notice').textContent='阅读原卷材料，按原题号作答，再核对原卷解析。';
    const frame=document.createElement('iframe');frame.src='../data/exam-study/'+reading.question;frame.title='原卷阅读材料与题目';
    frame.style.cssText='width:100%;height:700px;border:1px solid #d7dee8;background:white';
    frame.addEventListener('load',()=>{
      const doc=frame.contentDocument;
      if(!doc?.body)return;
      $('readingPrintContent').replaceChildren(...Array.from(doc.body.childNodes,node=>node.cloneNode(true)));
      doc.querySelectorAll('style').forEach(node=>{
        const style=document.createElement('style');style.textContent='@media print {'+node.textContent+'}';$('readingPrintContent').prepend(style);
      });
      $('readingPrintContent').querySelectorAll('img').forEach(image=>image.src=new URL(image.getAttribute('src'),doc.baseURI).href);
      $('printReadingButton').disabled=false;
    });
    $('printReadingButton').addEventListener('click',()=>window.print());
    $('readingText').replaceWith(frame);
    const label=document.createElement('label');label.htmlFor='readingAnswer';label.textContent='我的答案（按原题号填写）';
    const input=document.createElement('textarea');input.id='readingAnswer';input.rows=10;input.required=true;input.value=state.answer;input.style.cssText='display:block;width:100%;box-sizing:border-box;font:inherit;margin:12px 0';
    input.addEventListener('input',()=>{state.answer=input.value;save();});
    const details=document.createElement('details'),summary=document.createElement('summary'),link=document.createElement('a');
    summary.textContent='原卷答案与解析';link.href='../data/exam-study/'+reading.answer;link.target='_blank';link.rel='noopener';link.textContent='打开本卷解析（按原题号核对）';details.append(summary,link);
    const confirm=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.required=true;check.checked=state.submitted;confirm.append(check,' 我已作答并核对原卷解析');
    $('questions').append(label,input,details,confirm);
    $('assignment').hidden=false;
    const showDone=()=>{$('result').textContent='今日阅读已完成 ✓';input.disabled=true;check.disabled=true;$('submit').disabled=true;};
    if(state.submitted)showDone();
    $('assignment').addEventListener('submit',event=>{
      event.preventDefault();if(today()!==date){location.reload();return;}
      if(!input.value.trim()){input.setCustomValidity('请填写答案。');input.reportValidity();input.setCustomValidity('');return;}
      state.submitted=true;save();
      const checkins=JSON.parse(localStorage.getItem('arabic-test:daily-checkins')||'{}');
      checkins[date]=[...new Set([...(checkins[date]||[]),'daily-chinese'])];
      localStorage.setItem('arabic-test:daily-checkins',JSON.stringify(checkins));showDone();
    });
  } catch(error){$('notice').textContent=error.message;}
})();
