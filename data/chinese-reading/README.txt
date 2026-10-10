每日中文阅读题库 v1.1.0

范围
100篇，500道四选一单选题：现代文60篇、古文20篇、古诗词20篇。
现代文选自朱自清、鲁迅、许地山、徐志摩、郁达夫的作品。
收录全文或组文中独立题名的完整分篇，不用摘要替代阅读原文。
古文选篇属于大部头古籍的完整选章，不代表收录整部古籍。
已接入games/daily-chinese.html，作为下拉菜单“语文阅读”的独立项目，不进入合并PPT。

文件
bank.json：唯一规范数据源；语文阅读网页直接读取 readings 数组。
catalog.txt：100篇目录、正文汉字数、难度、预计阅读答题时长。
review.txt：全部原文、题目、参考答案、解析、原文依据及来源。
beijing-reference.json：北京试卷参考文件、文件哈希、题号与同类命题考点。
beijing-review-notes.txt：本轮参考范围、修订方式和校验说明。

字段
id：稳定篇目编号；questions[].id 为稳定题目编号。
category：modern / classical_prose / classical_poetry。
text：页面实际展示的阅读正文，以换行分段。
textExtent、textNote：全文或独立分篇的范围说明。
characterCount：正文汉字数量，不计标点、空白、字母和数字。
estimatedMinutes：按每分钟250汉字阅读再加5分钟答题粗估。
difficulty：编辑初分，未经过学习者测试或中考难度标定。
questions：每篇5题，包含skill、prompt、4项options、answer、explanation、evidence。
answer：A/B/C/D之一，对应选项id。前端随机排序时应保留选项id。
selectionMode：correct表示选恰当项，incorrect表示选不恰当项；以完整题干为准。
referencePatterns：指向beijing-reference.json的patterns，仅表示参考同类命题方式。
revisionType：regenerated为整体重写，distractors_rewritten为保留考点并重写干扰项。
evidence：正文中的支持性短引文；理解题需结合全文判断。
source：网络底本URL及可获取的修订号，或已有项目文本的位置。
source.editorialChanges：部分校字记录；通用繁简、标点及页面杂项清理不逐字列出。
textSha256：当前正文UTF-8内容的SHA-256。
rights：原作公版判断及适用地域；现代文另含作者卒年及依据链接。
questionOrigin：original_practice。examProvenance为null，未冒称历年中考真题。

版权与版本
原作公版判断限中国大陆，依据《中华人民共和国著作权法》第二十二、二十三条。
https://www.ncac.gov.cn/xxfb/flfg/flfg_532/202103/t20210309_50530.html
作者署名权、修改权、保护作品完整权不因财产权期限届满而消失。
使用原作正文，不收录现代译文、出版社注释或现成试卷题目。
现代文底本主要为维基文库传录；进行繁简转换、排版清理和必要校字。
原作旧式用词及不同版本异文可能与现行课本不同，以本条正文作答。
正式上线前可根据审阅意见继续进行版本校勘；当前不是权威校勘本。
公版结论不自动适用于所有国家和地区。
题目及解析为本题库原创参考练习，文学理解允许在审阅时修改。

校验与导出（仓库根目录运行，Python标准库即可）
python tools/validate_chinese_bank.py
python tools/export_chinese_review.py
修改bank.json后，应同步更新正文汉字数及textSha256，再运行校验和导出。
校验涵盖数量、唯一编号、选项结构、来源字段、正文哈希和题文引文对应。
自动校验不能替代对文学解释、干扰项质量和原文版本的人工审阅。

本轮修订
参考用户提供的2022—2026北京中考语文文件，保持100篇公版原文和每篇5题不变。
100篇各整体重写一道综合题；其余400道重新设计错误选项，个别正确项作等义完善。
强化语境辨析、前后照应、材料组织、人物认识变化、论证关系和炼字分析。
10道诗词题采用选“不恰当项”的方式，每题仍只有一个正确选项id。
不是复刻整张北京中考卷：原卷含填空和简答，本题库依用户要求均转为单选训练。
参考文件的年份与名称按用户文件记录；未独立认证其官方出处。
