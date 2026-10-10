/* Rasterize source formula/diagram content without cutting a text line or image. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '../data/daily-study');
(async () => {
  const bank = JSON.parse(fs.readFileSync(path.join(root, 'bank.json'), 'utf8'));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1100, height: 1000 }, deviceScaleFactor: 1.5 });
  const output = path.join(root, 'pages'); fs.mkdirSync(output, { recursive: true });
  try {
    let count = 0;
    for (const q of Object.values(bank.questions)) {
      if (process.argv.length>2 && !process.argv.slice(2).includes(q.id)) continue;
      await page.goto(pathToFileURL(path.join(root, q.question)).href);
      await page.evaluate(async () => {
        document.querySelector('h1').remove();
        document.querySelector('article').style.padding = '8px 24px';
        // The biology record form has four independent panels, including a
        // nested data table. Stack the panels, keeping that data table intact.
        for (const table of document.querySelectorAll('table')) {
          if (!table.querySelector('table')) continue;
          const blocks=document.createElement('div');
          for (const row of Array.from(table.rows)) for (const cell of Array.from(row.cells)) {
            const block=document.createElement('div');block.innerHTML=cell.innerHTML;blocks.append(block);
          }
          table.replaceWith(blocks);
        }
        document.querySelectorAll('td').forEach(cell=>cell.style.verticalAlign='top');
        for (const img of document.images) {
          await img.decode();
          // Preserve proportions of larger maps and tables on the slide.
          if (img.height > 340) { img.style.width = `${img.width * 340 / img.height}px`; }
        }
        await document.fonts.ready;
      });
      const layout = await page.evaluate(() => {
        const article = document.querySelector('article');
        const intervals = [];
        const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
          if (!node.textContent.trim()) continue;
          const range = document.createRange(); range.selectNodeContents(node);
          for (const rect of range.getClientRects()) if (rect.height) intervals.push([Math.floor(rect.top - 2), Math.ceil(rect.bottom + 2)]);
        }
        for (const img of article.querySelectorAll('img,math')) {
          const r = img.getBoundingClientRect(); intervals.push([Math.floor(r.top - 2), Math.ceil(r.bottom + 2)]);
        }
        intervals.sort((a,b) => a[0]-b[0]);
        const merged = [];
        for (const interval of intervals) {
          const last = merged.at(-1);
          if (last && interval[0] < last[1]) last[1] = Math.max(last[1], interval[1]);
          else merged.push(interval);
        }
        return { intervals: merged, height: Math.ceil(article.getBoundingClientRect().height) };
      });
      q.pages = [];
      let y = 0;
      while (y < layout.height) {
        let end = Math.min(y + 380, layout.height);
        const crossing = layout.intervals.find(([top,bottom]) => top < end && bottom > end);
        if (crossing) end = crossing[0];
        if (end <= y) throw new Error(`${q.id}: unbreakable content at ${y}`);
        const file = `${q.id}-${q.pages.length + 1}.png`;
        await page.screenshot({ path: path.join(output,file), fullPage:true, clip: { x: 0, y, width: 1000, height: end-y } });
        q.pages.push({ src:`pages/${file}`, width:1000, height:end-y });
        y = end;
      }
      if (++count % 30 === 0) console.log(`Rendered ${count}/${Object.keys(bank.questions).length}`);
    }
    fs.writeFileSync(path.join(root,'bank.json'), JSON.stringify(bank,null,2)+'\n');
    console.log(`Rendered ${count} selections / ${Object.values(bank.questions).reduce((n,q)=>n+q.pages.length,0)} pages`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
