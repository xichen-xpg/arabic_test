九科题库维护说明

入口：games/daily-study.html。每天下载一个PPTX，包含九科短题和两个重点题组。
45天逐日安排见 overall-plan.txt；知识点、原卷文件名与SHA256见 bank.json。
题目和教师解析分别在 questions/ 与 answers/，原图在 assets/，PPT分页图片在 pages/。
知识点提示为项目整理，不属于原卷。题目来自家庭提供的2023年北京各科试卷及2024年北京历史试卷。
每个选题条目保留原题号；英语阅读、完形等为题组，包含多个原题号。重复题按实际排课标记。
题库为主要知识点练习轮换，不保证穷尽所有考点。整篇作文、英语听说、实物实验另做专项。

生成流程（在项目根目录运行，使用具备lxml、Pillow的Python及Playwright的Node环境）：
1. python tools/build_daily_study.py
2. node tools/render_daily_study.cjs
3. python tools/validate_daily_study.py
4. node tools/study-session.test.cjs
5. node tools/study-browser.test.cjs

原卷目录默认 C:/Users/xiche/Downloads/北京中考。选题范围明确列于 tools/daily_study_selections.json。
range为Word正文的零起始节点索引，起止均包含；修改来源文件时必须重新检查题干、共用材料及解析。
公式用Windows GDI+转换MathType的WMF/EMF预览，避免Pillow直接播放WMF时的字符重叠。
需要Office的OMML2MML.XSL处理原生Word公式。首次构建会运行本仓库的向量转换脚本。
Playwright包不在默认模块路径时设置PLAYWRIGHT_MODULE。测试只模拟既有数学邮件服务，不实际发信。
浏览器按需生成PPTX，原题内容作为图片保留，答案与步骤区域是可编辑文本框。

进度保存：daily-study:sessions:v1，记录位于当前浏览器localStorage，不跨设备同步。
成功生成作业后开始60分钟计时；下载失败不消耗课程；重下、刷新、跨日继续不重置。
当天已完成可继续复习；下一次实际学习日才进入下一天。未完成则保留原作业继续。
逐科本人确认完成，九科都确认后记录结束时间；超时完成照常保留，并单独标记超时。
目录预览不创建作业记录。旧数学、语文专项记录保留，专项加练不替代新的九科作业。
九科页的邮箱链接仅打开邮件编辑器，不自动附加文件，不核验邮件，也不批改答案。
