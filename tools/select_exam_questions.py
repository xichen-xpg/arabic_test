"""Select original exam blocks by subject rules, recording every source range."""
import json
import re
from pathlib import Path
from zipfile import ZipFile
from lxml import etree as ET
from inspect_exam_documents import ROOT, CACHE, NS, inventory

SUBJECTS = {'数学':'math','语文':'chinese','英语':'english','物理':'physics','化学':'chemistry',
            '生物':'biology','政治':'politics','历史':'history','地理':'geography'}
HEADING = re.compile(r'^\s*(?:[一二三四五六七八九十]+\s*[、．.：:]\s*)?'
                     r'(单项选择|单选选择|多项选择|实验选择|非选择题|选择题|单项填空|填空题|解答题|计算题|实验[与和]?探究|实验解答|'
                     r'科普阅读|基础[·•・]?运用|古诗文阅?读|文言文阅读|名著阅读|现代文阅读|完形填空|'
                     r'阅读理解|阅读表达|阅读下列|阅读短文|文段表达|作文|写作|听对话|听短文|听力)')
QUESTION = re.compile(r'^\s*(?:-[\-在此卷上答题无效\s]*)?(?:[（(]多选[）)]\s*)?(\d{1,2})(?:\s*[．、.]|\s+(?=[\u4e00-\u9fffA-Za-z]))')

def load_body(z):
    root=ET.fromstring(z.read('word/document.xml'))
    body=root.find('w:body',NS)
    if 'word/numbering.xml' in z.namelist():
        numbering=ET.fromstring(z.read('word/numbering.xml'));val='{'+NS['w']+'}val'
        abstracts={n.get('{'+NS['w']+'}abstractNumId'):n for n in numbering.findall('w:abstractNum',NS)}
        nums={n.get('{'+NS['w']+'}numId'):n for n in numbering.findall('w:num',NS)};counts={}
        for p in body.iter('{'+NS['w']+'}p'):
            prop=p.find('w:pPr/w:numPr',NS)
            if prop is None or prop.find('w:numId',NS) is None:continue
            ident=prop.find('w:numId',NS).get(val);lev=prop.find('w:ilvl',NS);level=lev.get(val) if lev is not None else '0'
            if ident not in nums:continue
            num=nums[ident];abstract=abstracts[num.find('w:abstractNumId',NS).get(val)]
            spec=abstract.find(f'w:lvl[@w:ilvl="{level}"]',NS)
            if spec is None:continue
            fmt=spec.find('w:numFmt',NS).get(val)
            if fmt not in ('decimal','upperLetter','lowerLetter','chineseCounting'):continue
            start=spec.find('w:start',NS);start=int(start.get(val)) if start is not None else 1
            override=num.find(f'w:lvlOverride[@w:ilvl="{level}"]/w:startOverride',NS)
            if override is not None:start=int(override.get(val))
            key=(ident,level);counts[key]=counts.get(key,start-1)+1;n=counts[key]
            value=str(n) if fmt=='decimal' else chr((65 if fmt=='upperLetter' else 97)+n-1) if 'Letter' in fmt else ('一二三四五六七八九十'[n-1] if n<=10 else str(n))
            label=spec.find('w:lvlText',NS).get(val).replace('%'+str(int(level)+1),value)
            r=ET.Element('{'+NS['w']+'}r');t=ET.SubElement(r,'{'+NS['w']+'}t');t.text=label+' '
            p.insert(1 if p.find('w:pPr',NS) is not None else 0,r)
    return list(body)

def document(record):
    with ZipFile(record['docx']) as z:
        body = load_body(z)
    return body, [''.join(n.xpath('.//w:t/text()', namespaces=NS)) for n in body]

def sections(texts,subject=None):
    starts=[]
    for i,raw in enumerate(texts):
        t=raw.replace('､','、')
        part=re.match(r'^\s*(?:[一二三四五六七八九十]+[、.．]\s*)?第([一二三四])部分',t)
        if part and subject not in ('chinese','english'):
            starts.append((i,'选择题' if part[1]=='一' else '非选择题'))
            continue
        if re.match(r'^\s*[一二三四五六七八九十]+[、．.]本部分',t):
            starts.append((i,'选择题' if '选项' in t else '非选择题'));continue
        if re.match(r'^\s*第[ⅠⅡ一二12]+卷',t):
            starts.append((i,'非选择题' if '非选择' in t else '选择题'));continue
        match=HEADING.match(t)
        if match and (re.match(r'^\s*[一二三四五六七八九十]+\s*[、．.：:]',t)
                      or re.match(r'^\s*[^（(]{2,12}[（(]',t)):
            starts.append((i,match[1]))
        elif re.match(r'^\s*[一二三四五六七八九十]+\s*[、．.：:]',t):
            name='科普阅读' if re.search(r'科.阅读',t) else '选择题' if re.search(r'多选|选择',t) and '非选择' not in t else '其他'
            starts.append((i,name))
    return [(i, starts[k+1][0] if k+1<len(starts) else len(texts), name)
            for k,(i,name) in enumerate(starts)]

def question_spans(texts, start, end):
    starts=[]
    for i in range(start,end):
        m=QUESTION.match(texts[i])
        if m and (not starts or starts[-1][1]<int(m[1])<=starts[-1][1]+2):
            starts.append((i,int(m[1])))
    return [(n,i,starts[k+1][0] if k+1<len(starts) else end)
            for k,(i,n) in enumerate(starts)]

def select(record):
    sid=SUBJECTS[record['subject'].split('-')[-1]]
    body,texts=document(record)
    groups=[]
    def add(kind,label,ranges,numbers=()):
        ranges=[list(r) for r in ranges if r[0]<r[1]]
        if ranges:
            groups.append(dict(kind=kind,label=label,ranges=ranges,numbers=list(numbers)))
    spans=sections(texts,sid)
    if not spans and sid=='biology':
        qs=question_spans(texts,0,len(texts))
        stop=next((a for n,a,b in qs if not all(re.search(letter+r'[.．、\s]', ''.join(texts[a:b])) for letter in 'ABCD')),len(texts))
        spans=[(qs[0][1],stop,'选择题'),(stop,len(texts),'非选择题')]
    choices=[]
    for start,end,name in spans:
        qs=question_spans(texts,start,end)
        if sid=='english':
            if name in ('单项填空','单项选择'):add('ppt','单项填空',[(start,end)],[n for n,a,b in qs])
            elif name.startswith('阅读') and (qs or end-start>4):add('reading',name,[(start,end)],[n for n,a,b in qs])
        elif sid=='chinese':
            if name.startswith(('基础','古诗文')):
                selected=[]
                for n,a,b in qs:
                    text=''.join(texts[a:b])
                    if re.match(r'^\s*\d+[.．、\s]+\s*(?:[（(][^）)]*[）)]\s*)?(?:默写|补写)',texts[a]):
                        add('ppt','默写',[(a,b)],[n])
                    elif name.startswith('基础') and ((re.search(r'[AＡ][.．、）)]',text) and re.search(r'[BＢ][.．、）)]',text)) or ('【甲】' in text and '【乙】' in text and '一项' in text)):
                        subs=[i for i in range(a+1,b) if re.match(r'^\s*[（(]\d+[）)]',texts[i])]
                        if subs:
                            kept=[]
                            for k,i in enumerate(subs):
                                stop=subs[k+1] if k+1<len(subs) else b
                                block=''.join(texts[i:stop])
                                if (re.search(r'[AＡ][.．、）)]',block) and re.search(r'[BＢ][.．、）)]',block)) or ('【甲】' in block and '【乙】' in block and '一项' in block):kept.append((i,stop))
                            if kept:selected.append((n,[(a,subs[0])]+kept))
                        else:selected.append((n,[(a,b)]))
                if selected:
                    material=[]
                    for n,rs in selected:
                        a=rs[0][0]
                        context=next((i for i in range(a-1,start,-1) if re.match(r'^第[一二三四五]部分',texts[i])),None)
                        if context is not None:
                            stop=next((i for i in range(context+1,a+1) if QUESTION.match(texts[i])),a)
                            material.append((context,stop))
                    ranges=sorted(set([(start+1,qs[0][1])]+material+[r for n,rs in selected for r in rs]))
                    add('ppt','基础选择题',ranges,[n for n,rs in selected])
                memo=next((i for i in range(start,end) if re.match(r'^\s*[（(][一二三][）)]\s*默写',texts[i])),None)
                if memo is not None:
                    stop=next((i for i in range(memo+1,end) if re.match(r'^\s*[（(][一二三][）)]',texts[i])),end)
                    # Use the subsection once instead of also adding its numbered questions.
                    groups[:]=[g for g in groups if not(g['label']=='默写' and memo<=g['ranges'][0][0]<stop)]
                    add('ppt','默写',[(memo,stop)],[n for n,a,b in qs if memo<=a<stop])
            if '读' in name:
                # Omit the memorisation subsection from the reading assignment.
                memo=next((i for i in range(start,end) if re.match(r'^\s*[（(]一[）)]\s*默写',texts[i])),None) if name.startswith('古诗文') else None
                reading_start=start
                if memo is not None:
                    following=next((i for i in range(memo+1,end) if re.match(r'^\s*[（(][二三][）)]',texts[i])),None)
                    if following is not None:reading_start=following
                add('reading',name,[(reading_start,end)],[n for n,a,b in qs if a>=reading_start])
        else:
            if '选择' in name and '非选择' not in name:
                # The printed question count bounds sections whose next heading is missing.
                # Start after the section instructions, not numbered exam notices.
                instruction=next(((i,re.search(r'共\s*(\d+)\s*(?:道|小)?题',texts[i]))
                                  for i in range(start,min(start+12,end))
                                  if re.search(r'共\s*(\d+)\s*(?:道|小)?题',texts[i]) and not QUESTION.match(texts[i])),None)
                if instruction:
                    start=instruction[0]
                    count=int(instruction[1][1])
                    qs=question_spans(texts,start+1,end)[:count]
                    if len(qs)!=count:raise ValueError(f'Choice count mismatch: {record["source"]}: {len(qs)}/{count}')
                choices.extend((n,a,b,start) for n,a,b in qs)
            elif sid=='math' and name in ('解答题','计算题'):
                for n,a,b in qs:add('ppt','数学解答题',[(a,b)],[n])
            if sid in ('physics','chemistry','biology'):
                if name=='科普阅读':
                    # Some source documents omit the following calculation heading.
                    if qs and re.search(r'阅读',texts[qs[0][1]]):
                        for n,a,b in qs:
                            if re.search(r'阅读',texts[a]):add('reading','科普阅读',[(a,b)],[n])
                    else:add('reading','科普阅读',[(start,end)],[n for n,a,b in qs])
                else:
                    for n,a,b in qs:
                        if re.search(r'阅读.{0,16}(?:科普|短文|文章|资料)|科普阅读',texts[a]):
                            add('reading','科普阅读',[(a,b)],[n])
    for index in range(0,len(choices),5):
        chunk=choices[index:index+5];ranges=[]
        for n,a,b,section_start in chunk:
            # Include shared map/passage introductions, including across five-question boundaries.
            context=next((i for i in range(a-1,section_start,-1)
                          if re.search(r'(?:完成|回答).{0,25}(?:题|小题)',texts[i]) and not QUESTION.match(texts[i])),None)
            if context is not None:
                first=next((i for i in range(context+1,a+1) if QUESTION.match(texts[i])),a)
                ranges.append((context,first))
            elif a==next((x[1] for x in choices if x[3]==section_start),a):
                ranges.append((section_start+1,a))
            ranges.append((a,b))
        # Overlapping ranges are a union, not duplicated source content.
        merged=[]
        for a,b in sorted(ranges):
            if merged and a<=merged[-1][1]:merged[-1][1]=max(b,merged[-1][1])
            else:merged.append([a,b])
        add('ppt','选择题',merged,[n for n,a,b,s in chunk])
    groups.sort(key=lambda g:g['ranges'][0][0])
    return dict(source=record['source'],docx=record['docx'],sha256=record['sha256'],subject=sid,
                sections=[dict(start=a,end=b,name=n) for a,b,n in spans],groups=groups)

if __name__=='__main__':
    records=inventory()
    papers=[r for r in records if not re.search('解析|答案',Path(r['source']).name)]
    missing=[r['source'] for r in papers if not Path(r['docx']).exists()]
    if missing:raise RuntimeError(f'{len(missing)} source papers still need conversion')
    result=[select(r) for r in papers]
    (CACHE/'selections.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    for p in result:print(Path(p['source']).name,[(g['kind'],g['label'],g['numbers']) for g in p['groups']],flush=True)
