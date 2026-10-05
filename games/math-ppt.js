/* Editable worksheet layout. Generated in the browser, with no AI calls. */
(function () {
  function create(lesson, title) {
    const ppt = new window.PptxGenJS();
    ppt.layout = 'LAYOUT_WIDE';
    ppt.author = '每日数学'; ppt.subject = lesson.title; ppt.title = title;
    ppt.lang = 'zh-CN';
    ppt.theme = { headFontFace: 'Microsoft YaHei', bodyFontFace: 'Microsoft YaHei', lang: 'zh-CN' };
    const text = (slide, value, x, y, w, h, size = 22, extra = {}) => slide.addText(value, {
      x, y, w, h, fontFace: 'Microsoft YaHei', fontSize: size, color: '17202A',
      margin: 0, breakLine: false, valign: 'top', ...extra
    });
    function page(heading, number) {
      const slide = ppt.addSlide(); slide.background = { color: 'FFFFFF' };
      text(slide, heading, .65, .4, 12, .6, 30, { bold: true, color: '0F766E' });
      text(slide, `${title}  ·  ${number}`, .65, 7.05, 12, .25, 11, { color: '667085' });
      return slide;
    }
    let number = 0;
    lesson.materials.forEach((material, index) => {
      const slide = page(`学习材料 ${index + 1} · ${material.title}`, ++number);
      text(slide, material.text, .8, 1.55, 11.7, 3.8, 26, { paraSpaceAfterPt: 18 });
      text(slide, '读完后用自己的话说明规则，再完成后面的单选题。\n每题填写答案，并写出依据、步骤或画图。', .8, 5.8, 11.7, .9, 18, { color: '667085' });
    });
    lesson.questions.forEach((question, index) => {
      const slide = page(`第 ${index + 1} 题 · ${question.level}`, ++number);
      text(slide, question.text, .75, 1.2, 11.8, .85, 23);
      question.options.forEach((option, i) => text(slide, `${'ABCD'[i]}. ${option}`, .85 + (i % 2) * 5.85, 2.2 + Math.floor(i / 2) * .65, 5.5, .6, 20));
      text(slide, '我的答案：________', .85, 3.6, 11.5, .4, 20);
      text(slide, '依据与解题步骤（可插入公式、画图）：', .85, 4.15, 11.5, .4, 18, { color: '667085' });
      // Editable empty text area; the rest of the slide is intentionally blank.
      text(slide, ' ', .85, 4.65, 11.5, 2.15, 20);
    });
    return ppt;
  }
  window.MathPpt = { create };
})();
