"""Export the complete parent review and study map from the live math bank."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
folder = ROOT / 'data/math'
bank = json.loads((folder / 'lessons.json').read_text(encoding='utf-8'))
lessons = bank['lessons']
plan = [
    '中考数学专题复习整体规划',
    '版本：2026-10-10｜50个学习日｜300道原创单选题｜已学过初中内容',
    '',
    '一、目标与边界',
    '按数与代数、图形与几何、统计与概率、综合与实践组织复习，目标是查漏补缺、条件分析与综合迁移。',
    '这是本项目的50日复习安排，不是官方课时或某年北京考试范围的保证，也不是初中三年新授课。',
    '每课6题，先做巩固，再做挑战；每题必须在PPT写出关键步骤、理由或图示。课程按知识联系自然递进。',
    '50课共300题均已准备，配有学习材料、答案和解析。',
    '几何用文字给出完整条件，要求学生画图；选择题含证明依据与作图原理辨析，不能代替实际尺规操作和开放式证明评阅。',
    '',
    '二、每天怎样做',
    '建议：方法材料8分钟，6题独立作答约18分钟，检查保存4分钟。复杂综合题可额外安排订正日。',
    '第一遍不看解析，选择答案并写依据；家长对照review.txt核验。错题标注：概念、计算、漏条件、分类或表达。',
    '建议每完成5课回看错题，至少选2题隔日遮住答案重做；此项是学习建议，网页尚未自动生成错题课。',
    '50个学习日不等于50个连续日历日。系统按实际开始下载的日期推进，缺一天不会跳过课程。',
    '当前系统以开始下载作为当天课程记录，不会核验答题是否正确；一课下载后的下一学习日推进下一课。',
    '网页仍保留30分钟计时。手动邮件无法确认打卡；自动发信模式只核验提交时间，不批改数学答案。',
    '',
    '三、整体阶段',
    '01—10：数与式，60题；从数的概念、数轴与绝对值，推进到运算、实数、整式、因式分解、分式与根式。',
    '11—15：方程与不等式，30题；一次、分式、方程组、整数解、二次与建模。',
    '16—21：函数，36题；坐标、一次、反比例、二次、参数、应用。',
    '22—28：几何基础与四边形，42题；角、三角形、全等、勾股、平行四边形与特殊四边形。',
    '29—35：相似、三角函数、圆与变换，42题；含测量、切线、扇形、旋转与尺规作图依据。',
    '36：空间观念，6题；视图、立方块堆、相对面与展开思想。',
    '37—42：统计与概率，36题；抽样、统计图、中心与离散、四分位数、树状图、实验决策。',
    '43—50：综合强化，48题；动点、存在性、新定义、边界分类、最优方案、证明、函数综合与验收。',
    '',
    '四、逐日目录与材料',
]
review = ['中考数学完整题库教师审阅版', '50课｜300题｜包含答案和解析，请勿作为学生空白试卷使用。', '']
for lesson in lessons:
    title = f"第{lesson['day']:02d}课｜{lesson['title']}｜{lesson['unit']}"
    plan.extend([title, f"方法重点：{lesson['materials'][-1]['text']}", ''])
    review.extend(['=' * 64, title, ''])
    for material in lesson['materials']:
        review.extend([f"【{material['title']}】", material['text'], ''])
    for i, q in enumerate(lesson['questions'], 1):
        review.extend([f"{i}. [{q['level']}] {q['text']}",
                       *[f"   {'ABCD'[j]}. {option}" for j, option in enumerate(q['options'])],
                       f"答案：{'ABCD'[q['answer']]}", f"解析：{q['explanation']}", ''])
plan.extend([
    '五、PPT生成与课程进度',
    '题目、材料、答案已固定写入lessons.json；点击“开始并下载PPT”时浏览器即时排版生成当天文件，不会临时调用AI编题。',
    '每份PPT包含全部当天学习材料、6道题及空白作答区域，不包含答案和教师解析。',
    '50课使用同一套生成流程，按当天课程下载对应PPT。',
    '当天重复下载、刷新保留计时，下一学习日进下一课。',
    '自动发信后端需要部署本次代码后才能使用新课程记录；未更新时网页保留直接下载方式。',
    '',
    '六、参考与核验',
    '覆盖框架核对：教育部《义务教育数学课程标准（2022年版）》；不将本题库称为官方题库。',
    bank['scope']['standard'],
    '本地命题思路参考：' + '；'.join(bank['referenceNotes']['documents']),
    bank['referenceNotes']['use'],
    bank['referenceNotes']['limitations'],
    '所有新增题为原创练习。结构检查可核验选项数、唯一索引、ID与材料引用；计算题另做独立数值检查，不能替代全部教学审阅。',
    '',
    '七、审阅时建议看什么',
    '先看目录是否需要调整顺序，再看每课6题是否符合孩子实际水平。若基础题可秒答但综合题无法写过程，应加强解释，不必只增加计算量。',
    '重点查看第20、35、44、45、48、49课，分别代表参数、证明、分类、新定义与综合推理。',
])
(folder / 'overall-plan.txt').write_text('\n'.join(plan) + '\n', encoding='utf-8')
(folder / 'review.txt').write_text('\n'.join(review) + '\n', encoding='utf-8')
print('Exported plan and review:', len(lessons), 'lessons;', sum(len(l['questions']) for l in lessons), 'questions')
