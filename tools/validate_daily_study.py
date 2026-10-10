"""Validate coverage, traceable source slices, shared answers, images and timing."""
import json
from pathlib import Path
from lxml import html
from PIL import Image
from daily_study_teaching import attach_teaching

root=Path(__file__).resolve().parents[1]/'data/daily-study'
bank=json.loads((root/'bank.json').read_text(encoding='utf-8'))
expected_teaching=attach_teaching(json.loads((root/'bank.json').read_text(encoding='utf-8')))
ids={s['id'] for s in bank['subjects']}
assert len(ids)==8 and 'chinese' not in ids and len(bank['days'])==45 and len(bank['sources'])==8
counts={s:0 for s in ids};seen=set();pages=0
for day in bank['days']:
    assert len(day['tasks'])==10 and len(set(day['focus']))==2
    assert sum(t['minutes'] for t in day['tasks'])+day['checkMinutes']==60
    assert {bank['questions'][t['id']]['subject'] for t in day['tasks']}==ids
    for subject in day['focus']: counts[subject]+=1
    for t in day['tasks']:
        assert t['repeat']==(t['id'] in seen);seen.add(t['id'])
assert set(counts.values())=={11,12}
assert seen==set(bank['questions'])
for q in bank['questions'].values():
    assert q['knowledge'] and q['source'] and q['numbers']
    assert q['teaching']==expected_teaching['questions'][q['id']]['teaching'],q['id']
    assert all(q['teaching'][field].strip() for field in ['concept','method','example','pitfall'])
    assert q['teaching']['exampleLabel']=='原创讲解例子（非中考真题）'
    for kind in ['question','answer']:
        file=root/q[kind]; doc=html.fromstring(file.read_text(encoding='utf-8'))
        if kind=='question':
            assert '【答案】' not in doc.text_content() and '【解析】' not in doc.text_content(),q['id']
            assert '试卷共' not in doc.text_content() and '考生须知' not in doc.text_content(),q['id']
        else: assert '【答案】' in doc.text_content(),q['id']
        for image in doc.xpath('//img'):
            with Image.open(file.parent/image.get('src')) as im: im.verify()
    assert q['pages'],q['id']
    for p in q['pages']:
        assert 0<p['height']<=380
        with Image.open(root/p['src']) as im:
            # Chromium may round the document's final CSS pixel before scaling.
            assert im.width==1500 and abs(im.height-p['height']*1.5)<=2
        pages+=1
print(f'Validated {len(seen)} selections with teaching, worked examples and pitfalls, {pages} image pages, 45 days, 8 subjects, 60 minutes, balanced focus and marked repeats.')
