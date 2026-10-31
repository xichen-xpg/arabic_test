const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.math-test/all-exams/qa');fs.mkdirSync(out,{recursive:true});
const bank=JSON.parse(fs.readFileSync(path.join(root,'data/exam-study/bank.json'),'utf8'));
const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.png':'image/png','.css':'text/css'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const base=`http://127.0.0.1:${server.address().port}`;
  try {
    const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+'/index.html');
    const home=page.frameLocator('#arabicFrame');
    await home.locator('.calendar-day.today .calendar-source').first().waitFor();
    assert.deepEqual(await home.locator('.calendar-day.today .calendar-source-name').allTextContents(),['PPT','英语','阅读','阿语','每日一首']);
    await page.goto(base+'/games/daily-study.html');await page.waitForSelector('#tasks .subject');
    assert.equal(await page.locator('#tasks .subject').count(),6);
    assert.deepEqual(await page.locator('#tasks .subject h2').allTextContents(),['数学','英语','物理','化学','生物','历史']);
    assert.equal(await page.locator('#daySelect option').count(),bank.days.length);
    for(let i=0;i<bank.days[0].tasks.length;i++){
      const q=bank.questions[bank.days[0].tasks[i].id];
      assert.equal(await page.locator('#tasks .lesson details a').nth(i).getAttribute('href'),'../data/exam-study/'+q.answer+'?v='+bank.version);
      assert.equal(q.answer,`answers/${q.id}.html`);
    }
    await page.locator('#tasks .lesson details summary').first().click();
    const solution=page.frameLocator('#tasks .lesson iframe').first();
    await solution.locator('section[data-question]').first().waitFor();
    assert.deepEqual(await solution.locator('section[data-question]').evaluateAll(nodes=>nodes.map(n=>Number(n.dataset.question))),bank.questions[bank.days[0].tasks[0].id].numbers);
    assert.doesNotMatch(await page.locator('#tasks').textContent(),/知识点讲解|例子推演|易错点|重点题组/);
    await page.evaluate(()=>localStorage.setItem('daily-study:sessions:v1',JSON.stringify({'2026-01-01':{day:20}})));
    await page.route('**/data/exam-study/pages/*.png',r=>r.abort());
    await page.click('#download');await page.waitForFunction(()=>!document.querySelector('#download').disabled);
    assert.equal(await page.evaluate(()=>localStorage.getItem(StudySession.key)),null);
    await page.unroute('**/data/exam-study/pages/*.png');
    const download=page.waitForEvent('download');await page.click('#download');await(await download).saveAs(path.join(out,'day-01.pptx'));
    await page.waitForFunction(()=>!document.querySelector('#download').disabled);
    assert.equal(await page.evaluate(()=>StudySession.plan(localStorage).state.day),1);
    assert.ok(await page.evaluate(()=>localStorage.getItem('daily-study:sessions:v1')));
    const started=await page.evaluate(()=>StudySession.plan(localStorage).state.startedAt);
    await page.reload();await page.waitForSelector('#tasks .subject');
    assert.equal(await page.evaluate(()=>StudySession.plan(localStorage).state.startedAt),started);
    await page.check('#checks input');await page.click('#completion button');assert.match(await page.locator('#result').textContent(),/已完成/);
    await page.screenshot({path:path.join(out,'daily-ppt.png'),fullPage:false});
    await page.setViewportSize({width:390,height:844});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    // Exercise a shorter day after other subjects have finished.
    const last=bank.days.at(-1);
    await page.evaluate(n=>{localStorage.setItem(StudySession.key,JSON.stringify({[StudySession.today()]:{day:n,date:StudySession.today(),startedAt:Date.now(),deadline:Date.now()+3600000,completed:{},interruptions:0}}))},last.day);
    await page.reload();await page.waitForSelector('#tasks .subject');assert.equal(await page.locator('#tasks .subject').count(),last.tasks.length);
    await page.check('#checks input');await page.click('#completion button');assert.match(await page.locator('#result').textContent(),/已完成/);
    const clozeDays=bank.days.filter(d=>d.tasks.some(t=>bank.questions[t.id].topic==='完形填空')).map(d=>d.day);
    assert.equal(clozeDays.length,12);
    for(const n of [...new Set([1,12,24,bank.days.length,...clozeDays])]){
      const result=await page.evaluate(async n=>{
        const b=await(await fetch('../data/exam-study/bank.json')).json(),d=b.days[n-1];
        const images=await StudyPpt.prepare(b,d),ppt=StudyPpt.create(b,d,`第${n}天`,images);
        const bytes=await ppt.write({outputType:'base64',compression:true}),zip=await JSZip.loadAsync(bytes,{base64:true});
        const files=Object.keys(zip.files).filter(p=>/^ppt\/slides\/slide\d+\.xml$/.test(p));let bad=[];
        for(const file of files){
          const xml=await zip.file(file).async('string'),doc=new DOMParser().parseFromString(xml,'application/xml');
          if(!xml.includes('我的答案与依据')||/【答案】|【解析】|知识点讲解|例子推演|语文|政治|道德与法治|地理/.test(xml))bad.push(file);
          for(const tag of ['p:pic','p:sp'])for(const shape of doc.getElementsByTagName(tag)){
            const off=shape.getElementsByTagName('a:off')[0],ext=shape.getElementsByTagName('a:ext')[0];if(!off||!ext)continue;
            const x=+off.getAttribute('x'),right=x+ +ext.getAttribute('cx'),bottom=+off.getAttribute('y')+ +ext.getAttribute('cy');
            if(bottom>6858000||right>12192000||(tag==='p:pic'&&right>6096000))bad.push(file);
          }
        }
        return {bytes,count:files.length,expected:d.tasks.length,bad};
      },n);
      assert.equal(result.count,result.expected);assert.deepEqual(result.bad,[]);
      fs.writeFileSync(path.join(out,`day-${n}.pptx`),Buffer.from(result.bytes,'base64'));
    }
    await page.goto(base+'/games/daily-chinese.html');await page.waitForSelector('#readingAnswer');
    assert.match(await page.locator('#notice').textContent(),/原卷解析/);
    await page.fill('#readingAnswer','按原题号填写的阅读答案');await page.reload();await page.waitForSelector('#readingAnswer');assert.equal(await page.inputValue('#readingAnswer'),'按原题号填写的阅读答案');
    await page.check('#questions input[type=checkbox]');await page.click('#submit');assert.match(await page.locator('#result').textContent(),/已完成/);
    await page.screenshot({path:path.join(out,'reading-mobile.png'),fullPage:false});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.goto(base+'/games/arabic-test.html#checkin');
    await page.waitForSelector('.calendar-day.today .calendar-source');
    assert.equal(await page.locator('.calendar-day.today .calendar-source.done').count(),2);
    assert.equal(await page.evaluate(()=>{
      const key='daily-study:sessions:all-exams-v1',records=JSON.parse(localStorage.getItem(key));
      records['2025-01-01']={day:1,completed:{chinese:1},finishedAt:1};localStorage.setItem(key,JSON.stringify(records));
      return dailyProgressSummaries('2025-01-01').find(s=>s.source==='daily-chinese').done;
    }),false);
    assert.deepEqual(errors,[]);
    console.log(`Passed ordered course UI, original readings, saved progress, source-load failure, variable subject completion and PPT exports for ${bank.days.length} day course.`);
  } finally {await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
