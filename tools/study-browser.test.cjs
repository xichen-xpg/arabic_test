const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),output=path.join(root,'.math-test/study-eight');fs.mkdirSync(output,{recursive:true});
const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(!file.startsWith(root+path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
  res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.png':'image/png','.css':'text/css'})[path.extname(file)] || 'application/octet-stream');fs.createReadStream(file).pipe(res);
});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const site=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1100,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`${site}/games/daily-study.html`);await page.waitForSelector('#tasks .subject');
    assert.equal(await page.locator('#tasks .subject').count(),8);
    assert.equal(await page.locator('#tasks .lesson').count(),10);
    assert.doesNotMatch(await page.locator('#tasks').textContent(),/北京中考语文/);
    assert.equal(await page.locator('#checks input[value=chinese]').count(),0);
    assert.deepEqual(await page.locator('#tasks .lesson').first().locator('h3').allTextContents(),['1 · 知识点讲解','解题方法','2 · 例子推演','易错点','3 · 真题检查']);
    assert.equal(await page.locator('#tasks .lesson').first().getByText('原创讲解例子（非中考真题）',{exact:true}).isVisible(),true);
    for (const width of [390,1100]) {
      await page.setViewportSize({width,height:1000});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    }
    assert.equal(await page.locator('#timer').textContent(),'60:00');
    assert.equal(await page.locator('#completion button').isDisabled(),true);
    await page.evaluate(()=>{localStorage.setItem('math:reports',JSON.stringify({'2026-01-01':{onTime:true}}));localStorage.setItem('math:restart:topics-20261010','yes');});
    // A failed source-image fetch must not start timing or consume a day.
    await page.route('**/data/daily-study/pages/*.png',r=>r.abort());
    await page.click('#download');await page.waitForFunction(()=>!document.querySelector('#download').disabled);
    assert.equal(await page.evaluate(()=>localStorage.getItem(StudySession.key)),null);
    await page.unroute('**/data/daily-study/pages/*.png');
    // Preview is downloadable without creating a session.
    await page.selectOption('#daySelect','8');await page.click('#preview');
    let download=page.waitForEvent('download');await page.click('#download');await download;
    await page.waitForFunction(()=>!document.querySelector('#download').disabled);
    assert.equal(await page.evaluate(()=>localStorage.getItem(StudySession.key)),null);
    await page.click('#backToday');
    download=page.waitForEvent('download');await page.click('#download');
    await (await download).saveAs(path.join(output,'day-01.pptx'));
    await page.waitForFunction(()=>!document.querySelector('#download').disabled);
    const started=await page.evaluate(()=>StudySession.plan(localStorage).state);
    assert.equal(started.deadline-started.startedAt,3600000);
    await page.reload();await page.waitForSelector('#tasks .subject');
    assert.equal((await page.evaluate(()=>StudySession.plan(localStorage).state)).startedAt,started.startedAt);
    await page.locator('#checks input[value=math]').check();await page.click('#completion button');
    assert.match(await page.locator('#result').textContent(),/1\/8/);
    await page.screenshot({path:path.join(output,'study-page.png'),fullPage:true});
    for(const input of await page.locator('#checks input').all())await input.check();
    await page.fill('#interruptions','2');await page.click('#completion button');
    assert.match(await page.locator('#result').textContent(),/8\/8.*60分钟内完成/);
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('math:reports'))['2026-01-01'].onTime),true);
    await page.goto(`${site}/games/arabic-test.html#checkin`);
    await page.waitForSelector('.calendar-day.today .calendar-source');
    assert.equal(await page.locator('.calendar-day.today .calendar-source').count(),12);
    assert.doesNotMatch(await page.locator('#todayProgressSummary').textContent(),/undefined/);
    assert.equal(await page.locator('.calendar-day.today .calendar-source.done').count(),8);
    assert.equal(await page.locator('.calendar-day.today .calendar-all-done').count(),0);
    assert.match(await page.locator('#categorySelect').textContent(),/每日八科/);
    assert.match(await page.locator('#categorySelect').textContent(),/语文阅读 · 每天一篇/);
    assert.doesNotMatch(await page.locator('#categorySelect').textContent(),/餐厅题库|好朋友题库/);
    await page.screenshot({path:path.join(output,'checkin.png'),fullPage:true});
    // The reading is independent: completing the PPT does not check it off.
    await page.click('#practiceLink');
    await page.selectOption('#categorySelect','page:daily-chinese');await page.waitForURL('**/games/daily-chinese.html');
    await page.waitForSelector('#questions fieldset');
    const reading=await page.evaluate(async()=>{
      const b=await(await fetch('../data/chinese-reading/bank.json')).json();
      return b.readings[JSON.parse(localStorage.getItem('chinese:readings'))[StudySessionDate()].index];
      function StudySessionDate(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dubai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
    });
    assert.equal(await page.locator('#readingText').textContent(),reading.text);
    assert.equal(await page.locator('#questions fieldset').count(),5);
    assert.equal((await page.locator('.feedback').allTextContents()).join(''),'');
    for(const q of reading.questions)await page.locator(`input[name="${q.id}"][value="${q.answer}"]`).check();
    await page.click('#submit');assert.match(await page.locator('#result').textContent(),/答对 5\/5/);
    await page.reload();await page.waitForSelector('#questions fieldset');
    assert.match(await page.locator('#result').textContent(),/答对 5\/5/);
    await page.screenshot({path:path.join(output,'chinese-reading.png'),fullPage:true});
    await page.goto(`${site}/games/arabic-test.html#checkin`);await page.waitForSelector('.calendar-day.today .calendar-source');
    assert.equal(await page.locator('.calendar-day.today .calendar-source').count(),12);
    assert.equal(await page.locator('.calendar-day.today .calendar-source.done').count(),9);
    await page.click('#practiceLink');
    await page.selectOption('#categorySelect','page:daily-study');await page.waitForURL('**/games/daily-study.html');
    await page.waitForSelector('#tasks .subject');
    // Build all 45 decks and validate actual OOXML, editable answer areas and bounds.
    for(let day=1;day<=45;day++) {
      const result=await page.evaluate(async n=>{
        const b=await(await fetch('../data/daily-study/bank.json')).json(),d=b.days[n-1];
        const images=await StudyPpt.prepare(b,d),deck=StudyPpt.create(b,d,`预览_第${n}天`,images);
        const bytes=await deck.write({outputType:'base64',compression:true}),zip=await JSZip.loadAsync(bytes,{base64:true});
        const paths=Object.keys(zip.files).filter(p=>/^ppt\/slides\/slide\d+\.xml$/.test(p));
        let answers=0,overflow=[],leak=false,sequence=[],teaching=[];
        paths.sort((a,b)=>Number(a.match(/slide(\d+)/)[1])-Number(b.match(/slide(\d+)/)[1]));
        for(const p of paths){
          const xml=await zip.file(p).async('string');if(xml.includes('我的答案与依据'))answers++;
          if(xml.includes('【答案】') || xml.includes('【解析】') || xml.includes('北京中考语文') || xml.includes('语文 ·') || xml.includes('语文 作答页'))leak=true;
          const doc=new DOMParser().parseFromString(xml,'application/xml');
          const texts=Array.from(doc.getElementsByTagName('a:t'),t=>t.textContent);
          if(texts.some(t=>t.includes('· 知识点讲解'))){sequence.push('concept');teaching.push(texts);}
          else if(texts.some(t=>t.includes('· 例子推演'))){sequence.push('example');teaching.push(texts);}
          else if(texts.some(t=>t.includes('· 真题检查')))sequence.push('question');
          else if(xml.includes('我的答案与依据'))sequence.push('answer');
          for(const transform of doc.getElementsByTagName('a:xfrm')){
            const off=transform.getElementsByTagName('a:off')[0],ext=transform.getElementsByTagName('a:ext')[0];
            if(off && ext && (+off.getAttribute('y') + +ext.getAttribute('cy') > 6858000 || +off.getAttribute('x') + +ext.getAttribute('cx')>12192000))overflow.push(p);
          }
        }
        const expectedSequence=d.tasks.flatMap(t=>['concept','example',...b.questions[t.id].pages.map(()=> 'question'),'answer']);
        const completeTeaching=d.tasks.every((t,i)=>{
          const q=b.questions[t.id];
          return teaching[2*i].includes(q.teaching.concept) && teaching[2*i].includes(q.teaching.method)
            && teaching[2*i+1].includes(q.teaching.example) && teaching[2*i+1].includes(q.teaching.pitfall)
            && teaching[2*i+1].includes(q.teaching.exampleLabel);
        });
        return {bytes:[1,9,20,45].includes(n)?bytes:null,size:Math.floor(bytes.length*.75),slides:paths.length,answers,leak,overflow,
          completeTeaching,sequence,expectedSequence,expected:2+d.tasks.reduce((n,t)=>n+b.questions[t.id].pages.length+3,0)};
      },day);
      assert.equal(result.slides,result.expected);assert.equal(result.answers,10);assert.equal(result.leak,false);assert.deepEqual(result.overflow,[]);
      assert.equal(result.completeTeaching,true);assert.deepEqual(result.sequence,result.expectedSequence);
      assert.ok(result.size<10*1024*1024,`day ${day} exceeds 10MB`);
      if(result.bytes)fs.writeFileSync(path.join(output,`day-${String(day).padStart(2,'0')}.pptx`),Buffer.from(result.bytes,'base64'));
      if(day%9===0)console.log(`Validated ${day}/45 decks`);
    }
    assert.deepEqual(errors,[]);
    console.log('Browser checks passed: independent Chinese reading, 8-subject completion, 12 check-ins, preview, timer restoration, navigation, 45 PPTs without Chinese.');
  } finally {await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
