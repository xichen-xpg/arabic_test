/* Render only original question content for the left half of each PPT slide. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'../data/exam-study');
(async()=>{
  const bank=JSON.parse(fs.readFileSync(path.join(root,'bank.json'),'utf8'));
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1000,height:900},deviceScaleFactor:1.5});
  try {
    let count=0;
    for(const q of Object.values(bank.questions)){
      if(process.argv.includes('--missing') && q.pages?.every(p=>fs.existsSync(path.join(root,p.src))))continue;
      await page.setViewportSize({width:1000,height:900});
      await page.goto(pathToFileURL(path.join(root,q.question)).href);
      await page.evaluate(async()=>{
        document.querySelector('h1').remove();
        const style=document.createElement('style');style.textContent='article{padding:8px 16px;line-height:1.4}p{margin:4px 0}table{margin:6px 0}td p{margin:2px 0}';document.head.append(style);
        await Promise.all(Array.from(document.images,img=>img.decode()));await document.fonts.ready;
      });
      let height=await page.locator('article').evaluate(e=>Math.ceil(e.getBoundingClientRect().height));
      let width=1000;
      if(height>1600){
        // Keep the entire major question on one slide, using the available left-side width.
        width=2000;await page.setViewportSize({width,height:900});
        await page.addStyleTag({content:'article{width:2000px;column-count:2;column-gap:32px}article>p,table,tr{break-inside:avoid}'});
        height=await page.locator('article').evaluate(e=>Math.ceil(e.getBoundingClientRect().height));
      }
      const file=`pages/${q.id}.png`;
      await page.locator('article').screenshot({path:path.join(root,file)});
      q.pages=[{src:file,width,height}];
      if(++count%50===0)console.log(`Rendered ${count}/${Object.keys(bank.questions).length}`);
    }
    fs.writeFileSync(path.join(root,'bank.json'),JSON.stringify(bank,null,2)+'\n');
    console.log(`Rendered all ${count} original question groups`);
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
