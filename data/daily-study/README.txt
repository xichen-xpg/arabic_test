八科题库维护说明

入口：games/daily-study.html。每天下载一个PPTX，包含八科短题和两个重点题组。语文阅读通过下拉菜单单独进入，不包含在PPT中，另计时间。
45天逐日安排见 overall-plan.txt；知识点、原卷文件名与SHA256见 bank.json。
题目和教师解析分别在 questions/ 与 answers/，原图在 assets/，PPT分页图片在 pages/。
每个题组依次包含概念讲解、方法、原创例子、易错点，再进入真题检查及作答页。
讲解和原创例子为项目编写，不属于原卷；检查题来自家庭提供的2023年北京各科试卷及2024年北京历史试卷。
短题3分钟建议讲解1分钟、检查2分钟；重点15分钟建议讲解3分钟、检查12分钟，均包含在60分钟内。
每个选题条目保留原题号；英语阅读、完形等为题组，包含多个原题号。重复题按实际排课标记。
题库为主要知识点练习轮换，不保证穷尽所有考点。整篇作文、英语听说、实物实验另做专项。

生成流程（在项目根目录运行，使用具备lxml、Pillow的Python及Playwright的Node环境）：
1. python tools/build_daily_study.py
2. node tools/render_daily_study.cjs
3. python tools/validate_daily_study.py
4. node tools/study-session.test.cjs
5. node tools/study-browser.test.cjs

原卷目录默认 C:/Users/xiche/Downloads/北京中考。选题范围明确列于 tools/daily_study_selections.json。
讲解源文件为 tools/daily_study_teaching.py，按学科及原题号对应；构建题库时自动加入。
仅修改讲解时运行 python tools/daily_study_teaching.py，可更新bank.json而不重新生成真题图片。
range为Word正文的零起始节点索引，起止均包含；修改来源文件时必须重新检查题干、共用材料及解析。
公式用Windows GDI+转换MathType的WMF/EMF预览，避免Pillow直接播放WMF时的字符重叠。
需要Office的OMML2MML.XSL处理原生Word公式。首次构建会运行本仓库的向量转换脚本。
Playwright包不在默认模块路径时设置PLAYWRIGHT_MODULE。测试只模拟既有数学邮件服务，不实际发信。
浏览器按需生成PPTX，讲解、例子和作答区域是可编辑文本，原题内容作为图片保留。

进度保存：daily-study:sessions:v1，记录位于当前浏览器localStorage，不跨设备同步。
成功生成作业后开始60分钟计时；下载失败不消耗课程；重下、刷新、跨日继续不重置。
当天已完成可继续复习；下一次实际学习日才进入下一天。未完成则保留原作业继续。
逐科本人确认完成，八科都确认后记录结束时间；超时完成照常保留，并单独标记超时。
目录预览不创建作业记录。旧数学专项与语文阅读记录保留。语文提交阅读答案后独立打卡，不由PPT确认替代。
八科页的邮箱链接仅打开邮件编辑器，不自动附加文件，不核验邮件，也不批改答案。
