/* Extend the site's existing PptxGenJS worksheet workflow. */
(function () {
  async function prepare(bank, day) {
    const images={};
    for (const task of day.tasks) for (const page of bank.questions[task.id].pages) {
      if (images[page.src]) continue;
      const response=await fetch(`../data/exam-study/${page.src}`);
      if (!response.ok) throw new Error('真题图片加载失败，请重试。');
      const blob=await response.blob();
      images[page.src]=await new Promise((resolve,reject)=>{
        const reader=new FileReader(); reader.onload=()=>resolve(reader.result); reader.onerror=reject; reader.readAsDataURL(blob);
      });
    }
    return images;
  }
  function create(bank, day, title, images) {
    const ppt=new window.PptxGenJS(); ppt.layout='LAYOUT_WIDE';
    ppt.author='PPT'; ppt.title=title; ppt.subject='中考真题'; ppt.lang='zh-CN';
    ppt.theme={headFontFace:'Microsoft YaHei',bodyFontFace:'Microsoft YaHei',lang:'zh-CN'};
    const names=Object.fromEntries(bank.subjects.map(s=>[s.id,s.name]));
    let number=0;
    const text=(slide,value,x,y,w,h,size=20,extra={})=>slide.addText(value,{x,y,w:x<6.6667?Math.min(w,6.35-x):w,h,fontFace:'Microsoft YaHei',fontSize:size,color:'17202A',margin:0,valign:'top',fit:'shrink',...extra});
    function slide(heading) {
      const s=ppt.addSlide();s.background={color:'FFFFFF'};
      text(s,heading,.65,.35,5.7,.6,24,{bold:true,color:'0F766E'});
      text(s,`${title}  ${++number}`,.65,7.08,5.7,.3,8,{color:'667085'});
      return s;
    }
    day.tasks.forEach(task=>{
      const q=bank.questions[task.id];
      const s=slide(`${names[q.subject]} · 真题检查`);
      text(s,q.source,.65,1.05,5.7,.45,12,{color:'667085'});
      const width=5.7, availableHeight=5.3;
      const totalHeight=q.pages.reduce((sum,p)=>sum+width*p.height/p.width,0);
      const scale=Math.min(1,availableHeight/totalHeight);
      let y=1.55;
      q.pages.forEach(p=>{
        const w=width*scale,h=w*p.height/p.width;
        s.addImage({data:images[p.src],x:.65,y,w,h});
        y+=h;
      });
      s.addShape(ppt.ShapeType.line,{x:6.6667,y:.35,w:0,h:6.5,line:{color:'D5DDDF',width:1}});
      text(s,'我的答案与依据',7,.45,5.7,.5,22,{bold:true,color:'0F766E'});
      text(s,'在此输入答案、步骤或插入公式与图形。',7,1.2,5.7,5.6,18,{color:'667085'});
      s.addNotes(`${q.source}\n题目文件：data/exam-study/${q.question}\n原卷文件及SHA256见data/exam-study/bank.json的sources。`);
    });
    return ppt;
  }
  window.StudyPpt={prepare,create};
})();
