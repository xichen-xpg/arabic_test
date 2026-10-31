"""Build the complete, ordered exam course and original-solution reading bank."""
import hashlib
import io
import json
import re
import subprocess
from difflib import SequenceMatcher
from pathlib import Path
from zipfile import ZipFile
from lxml import etree as ET
from PIL import Image, UnidentifiedImageError
import build_daily_study as legacy
from inspect_exam_documents import ROOT, CACHE, inventory
from select_exam_questions import SUBJECTS, QUESTION, select, load_body, split_english_reading

OUT = ROOT / 'data/exam-study'
legacy.OUT = OUT
legacy.STYLE += '\narticle{max-width:100%}'
ORDER = ['chinese','math','english','physics','chemistry','biology','politics','history','geography']
PPT_SUBJECTS = {'math','english','physics','chemistry','biology','history'}
NAMES = {v:k for k,v in SUBJECTS.items()}
NAMES['politics']='道德与法治'

class Exam(legacy.Paper):
    def __init__(self, record):
        self.file=Path(record['docx'])
        self.z=ZipFile(self.file)
        self.body=load_body(self.z)
        self.rels={r.get('Id'):r.get('Target') for r in ET.fromstring(self.z.read('word/_rels/document.xml.rels'))}

    def html(self,ranges):
        return ''.join(self.render(self.body[i]) for a,b in ranges for i in range(a,b))

    def picture(self,node):
        refs=node.xpath('.//v:imagedata/@r:id | .//a:blip/@r:embed',namespaces=legacy.NS)
        if not refs:
            boxes=node.findall('.//w:txbxContent',legacy.NS)
            if boxes:return ''.join(self.render(p) for box in boxes for p in box)
            lines=node.findall('.//v:line',legacy.NS)
            if lines:
                result=[]
                for line in lines:
                    x1,y1=[float(re.sub(r'[^0-9.+-]','',s) or 0) for s in line.get('from','0,0').split(',')]
                    x2,y2=[float(re.sub(r'[^0-9.+-]','',s) or 0) for s in line.get('to','1,1').split(',')]
                    w=max(1,abs(x2-x1));h=max(1,abs(y2-y1))
                    result.append(f'<svg xmlns="http://www.w3.org/2000/svg" width="{w*2}" height="{h*2}" viewBox="0 0 {w} {h}"><line x1="{x1-min(x1,x2)}" y1="{y1-min(y1,y2)}" x2="{x2-min(x1,x2)}" y2="{y2-min(y1,y2)}" stroke="black" stroke-width="0.5"/></svg>')
                return ''.join(result)
            raise ValueError('Picture without image: '+str(self.file))
        target=self.rels[refs[0]]
        raw=self.z.read(target.lstrip('/') if target.startswith('/') else 'word/'+target)
        vector=legacy.VECTORS/(hashlib.sha256(raw).hexdigest()+'.png')
        payload=vector.read_bytes() if target.lower().endswith(('.wmf','.emf')) else raw
        image=Image.open(io.BytesIO(payload))
        extension={'PNG':'.png','JPEG':'.jpg','GIF':'.gif','BMP':'.bmp'}.get(image.format)
        if extension is None:
            buf=io.BytesIO();image.save(buf,format='PNG');payload=buf.getvalue();extension='.png'
        digest=hashlib.sha256(payload).hexdigest()[:20];asset=OUT/'assets'/(digest+extension)
        if not asset.exists():
            try:image.verify()
            except (OSError,SyntaxError):
                # A few source PNGs have malformed trailing chunks but valid pixels.
                image=Image.open(io.BytesIO(payload));buf=io.BytesIO()
                image.save(buf,format=image.format);payload=buf.getvalue()
            asset.write_bytes(payload)
        extent=node.find('.//wp:extent',legacy.NS);shape=node.find('.//v:shape',legacy.NS)
        width=int(extent.get('cx'))/914400*144 if extent is not None else image.width/2
        if shape is not None:
            match=re.search(r'(?:^|;)width:([\d.]+)pt',shape.get('style',''))
            if match:width=float(match[1])*2
        return f'<img src="../assets/{asset.name}" style="width:{width:.2f}px" alt="原卷公式或图表">'

def identity(path):
    name=Path(path).stem
    name=re.sub(r'[（(][^）)]*[）)]','',name)
    return re.sub(r'\s+','',name)

def pair_answers(papers,records):
    answers=[r for r in records if re.search('解析|答案',Path(r['source']).name)]
    pairs={}
    for p in papers:
        name=Path(p['source']).name
        year=re.search(r'20\d\d',name)[0]
        candidates=[r for r in answers if r['subject']==p['subject'] and year in Path(r['source']).name]
        ranked=sorted(candidates,key=lambda r:SequenceMatcher(None,identity(p['source']),identity(r['source'])).ratio(),reverse=True)
        if not ranked:raise ValueError('Missing original solution: '+name)
        if len(ranked)>1 and identity(ranked[0]['source'])==identity(ranked[1]['source']):
            if ranked[0]['sha256']!=ranked[1]['sha256']:raise ValueError('Ambiguous solution: '+name)
        pairs[p['sha256']]=ranked[0]
    return pairs

def vectors(records):
    pending={}
    legacy.VECTORS.mkdir(exist_ok=True,parents=True)
    for r in records:
        with ZipFile(r['docx']) as archive:
            for name in archive.namelist():
                if not name.lower().endswith(('.wmf','.emf')):continue
                raw=archive.read(name);digest=hashlib.sha256(raw).hexdigest()
                output=legacy.VECTORS/(digest+'.png')
                if output.exists():continue
                source=legacy.VECTORS/(digest+Path(name).suffix);source.write_bytes(raw)
                try:
                    with Image.open(io.BytesIO(raw)) as im:
                        scale=min(4,3200/max(im.size));width,height=(max(1,round(v*scale)) for v in im.size)
                except UnidentifiedImageError:width=height=0
                pending[digest]=dict(source=str(source),output=str(output),width=width,height=height)
    if pending:
        manifest=CACHE/'vector-manifest.json';manifest.write_text(json.dumps(list(pending.values())),encoding='utf-8')
        subprocess.run(['powershell','-NoProfile','-ExecutionPolicy','Bypass','-File',str(ROOT/'tools/render_exam_vectors.ps1'),'-Manifest',str(manifest)],check=True)

def build():
    previous=json.loads((OUT/'bank.json').read_text(encoding='utf-8')) if (OUT/'bank.json').exists() else {}
    records=inventory()
    missing=[r['source'] for r in records if not Path(r['docx']).exists()]
    if missing:raise ValueError(f'{len(missing)} documents still need conversion')
    papers=[r for r in records if not re.search('解析|答案',Path(r['source']).name)]
    # Identical file copies are one source, while different district papers remain distinct.
    papers=list({r['sha256']:r for r in papers}.values())
    papers.sort(key=lambda r:(ORDER.index(SUBJECTS[r['subject'].split('-')[-1]]),Path(r['source']).name))
    pairs=pair_answers(papers,records)
    unique={};duplicates=[]
    for paper in sorted(papers,key=lambda r:Path(r['source']).suffix.lower()!='.docx'):
        answer_id=pairs[paper['sha256']]['sha256']
        if answer_id in unique:
            first=unique[answer_id]
            if identity(first['source']).replace('真题','试题')!=identity(paper['source']).replace('真题','试题'):
                raise ValueError('Two distinct papers matched the same solution')
            duplicates.append(dict(kept=str(Path(first['source']).relative_to(ROOT)),duplicate=str(Path(paper['source']).relative_to(ROOT))))
        else:unique[answer_id]=paper
    papers=sorted(unique.values(),key=lambda r:(ORDER.index(SUBJECTS[r['subject'].split('-')[-1]]),Path(r['source']).name))
    selections=[select(r) for r in papers]
    (CACHE/'selections.json').write_text(json.dumps(selections,ensure_ascii=False,indent=2),encoding='utf-8')
    for p in selections:
        if not any(g['kind']=='ppt' for g in p['groups']):raise ValueError('No PPT groups: '+p['source'])
    for folder in ('questions','answers','assets','pages'): (OUT/folder).mkdir(parents=True,exist_ok=True)
    vectors(papers+list(pairs.values()))
    questions={};readings=[];sources=[];queues={s:[] for s in ORDER};reading_queues={s:[] for s in ORDER}
    for record,selection in zip(papers,selections):
        exam=Exam(record);solution=pairs[record['sha256']];answers=Exam(solution)
        paper_id=record['sha256'][:16];sid=selection['subject'];name=identity(record['source'])
        solution_path=f'answers/{paper_id}.html'
        parts=[]
        answer_numbers=set()
        for node in answers.body:
            t=legacy.plain(node);match=QUESTION.match(t)
            if match:answer_numbers.add(int(match[1]))
            parts.append((f'<a id="q{match[1]}"></a>' if match else '')+answers.render(node))
        legacy.save_html(OUT/solution_path,name+' 原卷解析',''.join(parts))
        sources.append(dict(id=paper_id,subject=sid,paper=str(Path(record['source']).relative_to(ROOT)),
                            sha256=record['sha256'],answer=str(Path(solution['source']).relative_to(ROOT)),answerSha256=solution['sha256']))
        index=0
        for g in selection['groups']:
            cloze=sid=='english' and g['label']=='完形填空'
            if not cloze:index+=1
            if g['kind']=='ppt' and sid not in PPT_SUBJECTS:continue
            key=f'{sid}-{paper_id}-cloze' if cloze else f'{sid}-{paper_id}-{index:02d}'
            parent_key=key
            reading_parts=split_english_reading(record,g) if sid=='english' and g['kind']=='reading' else [g]
            for part_index,part in enumerate(reading_parts):
                key=parent_key+f'-passage-{part_index+1}' if len(reading_parts)>1 else parent_key
                numbers=part['numbers'];label=part['label']
                number_label='、'.join(map(str,numbers))
                title=f'{name} · {label}'+(f' 第{part_index+1}篇' if len(reading_parts)>1 else '')+(f' 第{number_label}题' if numbers else '')
                path=f'questions/{key}.html'
                content=exam.html(part['ranges'])
                if '【解析】' in content or '【答案】' in content:raise ValueError('Solution leaked into question: '+title)
                legacy.save_html(OUT/path,title,content)
                item=dict(id=key,subject=sid,topic=label,source=title,paper=paper_id,numbers=numbers,ranges=part['ranges'],
                      question=path,answer=solution_path+(f'#q{numbers[0]}' if numbers and numbers[0] in answer_numbers else ''),kind=part['kind'])
                if g['kind']=='reading':item['parentId']=parent_key
                old=previous.get('questions',{}).get(key,{})
                if old.get('ranges')==item['ranges'] and 'pages' in old:item['pages']=old['pages']
                if g['kind']=='ppt':questions[key]=item;queues[sid].append(key)
                else:reading_queues[sid].append(item)
        print(name,len(selection['groups']),flush=True)
    days=[dict(day=i+1,tasks=[dict(id=queues[s][i]) for s in ORDER if i<len(queues[s])])
          for i in range(max(map(len,queues.values())))]
    for i in range(max(map(len,reading_queues.values()))):
        readings.extend(reading_queues[s][i] for s in ORDER if i<len(reading_queues[s]))
    bank=dict(version='all-exams-20261027-six-subjects',minutes=60,subjects=[dict(id=s,name=NAMES[s],count=len(queues[s])) for s in ORDER],
              questions=questions,days=days,sources=sources,readings=readings,duplicates=duplicates,
              readingLegacyIds=previous.get('readingLegacyIds',[q['id'] for q in previous.get('readings',[])]))
    (OUT/'bank.json').write_text(json.dumps(bank,ensure_ascii=False,indent=2),encoding='utf-8')
    from build_exam_group_answers import build as build_group_answers
    build_group_answers()
    print(json.dumps(dict(papers=len(papers),questions=len(questions),readings=len(readings),days=len(days),subjects=bank['subjects']),ensure_ascii=False),flush=True)

if __name__=='__main__':build()
