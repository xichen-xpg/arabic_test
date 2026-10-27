"""Verify source coverage, grouping, original solutions and one-pass scheduling."""
import json
from collections import Counter
from pathlib import Path
from lxml import html
from PIL import Image
from inspect_exam_documents import ROOT
from select_exam_questions import QUESTION, question_spans
from build_exam_study import PPT_SUBJECTS

assert not QUESTION.match('题 2 分）')
assert QUESTION.match('(多选）16．选择题')[1]=='16'
assert QUESTION.match('---在此卷上答题无效---19. 题目')[1]=='19'
assert question_spans(['1. question','61.7 62.4','2. next'],0,3)==[(1,0,2),(2,2,3)]

root=ROOT/'data/exam-study'
bank=json.loads((root/'bank.json').read_text(encoding='utf-8'))
assert len(bank['subjects'])==9
assert {q['subject'] for q in bank['questions'].values()}==PPT_SUBJECTS
scheduled=[]
for day in bank['days']:
    subjects=[bank['questions'][t['id']]['subject'] for t in day['tasks']]
    assert len(subjects)==len(set(subjects))
    scheduled.extend(t['id'] for t in day['tasks'])
assert Counter(scheduled)==Counter({q:1 for q in bank['questions']})
for subject in bank['subjects']:
    items=[q for q in bank['questions'].values() if q['subject']==subject['id']]
    actual=[bank['questions'][t['id']]['id'] for d in bank['days'] for t in d['tasks'] if bank['questions'][t['id']]['subject']==subject['id']]
    assert actual==[q['id'] for q in items]
    assert len(actual)==subject['count']
assert len(bank['days'])==max(s['count'] for s in bank['subjects'])
assets=set()
for q in list(bank['questions'].values())+bank['readings']:
    assert q['ranges'] and all(a<b for a,b in q['ranges'])
    if q['kind']=='ppt':
        if q['topic']=='选择题':assert 1<=len(q['numbers'])<=5,q['source']
        if q['topic']=='数学解答题':assert len(q['numbers'])==1,q['source']
        assert q['subject']=='math' or q['topic']!='数学解答题'
        for page in q['pages']:
            with Image.open(root/page['src']) as image:
                assert abs(image.width-page['width']*1.5)<=2
                assert abs(image.height-page['height']*1.5)<=2
                image.verify()
    for kind in ('question','answer'):
        filename=q[kind].split('#')[0];path=root/filename
        doc=html.fromstring(path.read_text(encoding='utf-8'))
        if kind=='question':assert '【答案】' not in doc.text_content() and '【解析】' not in doc.text_content(),q['source']
        if '#' in q[kind]:assert doc.xpath('//*[@id="'+q[kind].split('#')[1]+'"]'),q['source']
        for img in doc.xpath('//img'):assets.add((path.parent/img.get('src')).resolve())
for asset in assets:
    with Image.open(asset) as image:image.verify()
assert {q['paper'] for q in bank['questions'].values()}=={s['id'] for s in bank['sources'] if s['subject'] in PPT_SUBJECTS}
assert {q['subject'] for q in bank['readings']}=={'chinese','english','physics','chemistry','biology'}
print(f"Validated {len(bank['sources'])} papers, {len(bank['questions'])} PPT groups, {len(bank['readings'])} reading groups, {len(bank['days'])} days, {len(assets)} source images")
