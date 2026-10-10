/* Extend the site's existing PptxGenJS worksheet workflow. */
(function () {
  async function prepare(bank, day) {
    const images={};
    for (const task of day.tasks) for (const page of bank.questions[task.id].pages) {
      if (images[page.src]) continue;
      const response=await fetch(`../data/daily-study/${page.src}`);
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
    ppt.author='每日九科'; ppt.title=title; ppt.subject='中考知识点与真题'; ppt.lang='zh-CN';
    ppt.theme={headFontFace:'Microsoft YaHei',bodyFontFace:'Microsoft YaHei',lang:'zh-CN'};
    const names=Object.fromEntries(bank.subjects.map(s=>[s.id,s.name]));
    let number=0;
    const text=(slide,value,x,y,w,h,size=20,extra={})=>slide.addText(value,{x,y,w,h,fontFace:'Microsoft YaHei',fontSize:size,color:'17202A',margin:0,valign:'top',...extra});
    function slide(heading,footer='') {
      const s=ppt.addSlide();s.background={color:'FFFFFF'};
      text(s,heading,.65,.35,12,.6,28,{bold:true,color:'0F766E'});
      text(s,`${title}  ${++number}  ${footer}`,.65,7.08,12,.25,10,{color:'667085'});
      return s;
    }
    let s=slide(`第${day.day}天 九科复习`);
    text(s,`今日重点：${day.focus.map(id=>names[id]).join('、')}`,.8,1.45,11.7,.6,28);
    text(s,'先学知识点 → 看例子 → 独立做真题\n九科短题各3分钟：讲解1分钟＋检查2分钟\n两个重点题组各14分钟：讲解3分钟＋检查11分钟\n最后检查保存5分钟，合计60分钟',.8,2.4,11.7,2.8,24,{paraSpaceAfterPt:14});
    text(s,'讲解与例子为项目编写，例子不是中考真题。真题检查保留原卷材料与题号。\n作答页填写答案与步骤；雅思、阿语、古诗词另计时间。完成后返回网页确认。',.8,5.8,11.7,1,17,{color:'667085'});
    day.tasks.forEach(task=>{
      const q=bank.questions[task.id];
      const type=q.kind==='focus'?'重点题组':'短题';
      const teaching=q.teaching;
      const budget=`${type} 共${task.minutes}分钟（含讲解${q.kind==='focus'?3:1}分钟）${task.repeat?' 间隔重做':''}`;
      s=slide(`${names[q.subject]} · 知识点讲解`,budget);
      text(s,q.topic,.8,1.15,11.7,.6,25,{bold:true});
      text(s,teaching.concept,.8,2,11.7,2.1,24,{breakLine:false});
      text(s,'解题方法',.8,4.4,11.7,.45,21,{bold:true,color:'0F766E'});
      text(s,teaching.method,.8,5.08,11.7,1.4,22);
      s.addNotes(`对应检查：${q.source}。本页讲解为项目编写，不是原卷内容。`);
      s=slide(`${names[q.subject]} · 例子推演`,budget);
      text(s,teaching.exampleLabel,.8,1.15,11.7,.45,18,{color:'667085'});
      text(s,teaching.example,.8,2,11.7,2.2,24);
      text(s,'易错点',.8,4.5,11.7,.45,21,{bold:true,color:'0F766E'});
      text(s,teaching.pitfall,.8,5.15,11.7,1.25,22);
      s.addNotes(`对应检查：${q.source}。本页为原创教学示例；下一页起独立完成原卷真题。`);
      q.pages.forEach((p,i)=>{
        s=slide(`${names[q.subject]} · 真题检查`,budget);
        text(s,`${q.source}  材料 ${i+1}/${q.pages.length}`,.75,1.05,11.8,.35,14,{color:'667085'});
        text(s,`${q.topic}\n先独立作答，再到家长版核对解析；需要回看讲解时，记下还不熟悉的知识点。`,.75,1.48,11.8,.85,18);
        const width=11.8, height=width*p.height/p.width;
        s.addImage({data:images[p.src],x:.75,y:2.38,w:width,h:height});
        s.addNotes(`${q.source}\n题目文件：data/daily-study/${q.question}\n原卷文件及SHA256见data/daily-study/bank.json的sources。`);
      });
      s=slide(`${names[q.subject]} 作答页`,q.source);
      text(s,`${q.topic}  ${type}  共${task.minutes}分钟（含讲解）`,.8,1.2,11.7,.5,22);
      text(s,'我的答案与依据（题组请按原题号逐项作答）：',.8,2,11.7,.5,20);
      text(s,'在此输入答案、步骤或插入公式与图形。',.8,2.7,11.7,3.9,20,{color:'667085'});
    });
    s=slide('检查与专注记录');
    text(s,'检查：九科是否都有答案？重点题组的小问是否有遗漏？\n检查：题号、单位、符号和推理步骤是否完整？\n保存：保留原文件名，保存为PPTX。',.8,1.5,11.7,2.2,24,{paraSpaceAfterPt:16});
    text(s,'实际中断次数：____    尚未完成的题号：____\n今天需要订正的知识点：____\n返回网页确认已完成科目。超时仍可完成，按实际用时记录。',.8,4.5,11.7,1.9,22);
    return ppt;
  }
  window.StudyPpt={prepare,create};
})();
