"""Build a traceable eight-subject PPT bank from the family's supplied papers.

Question selections are explicit inclusive Word body ranges, preserving shared
reading passages, maps, formula images and original question numbers.
"""
import hashlib
import html
import io
import json
import re
import subprocess
from pathlib import Path
from zipfile import ZipFile
from lxml import etree as ET
from PIL import Image
from daily_study_teaching import attach_teaching

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path('C:/Users/xiche/Downloads/北京中考')
OUT = ROOT / 'data/daily-study'
OUT.mkdir(parents=True, exist_ok=True)
VECTORS = ROOT / '.math-test/vector-cache'
NS = {'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
      'r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
      'v':'urn:schemas-microsoft-com:vml', 'a':'http://schemas.openxmlformats.org/drawingml/2006/main',
      'wp':'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
      'm':'http://schemas.openxmlformats.org/officeDocument/2006/math'}
MATHML = ET.XSLT(ET.parse('C:/Program Files/Microsoft Office/root/Office16/OMML2MML.XSL'))
STYLE = '''body{margin:0;color:#17202a;background:#fff;font-family:"SimSun","Times New Roman",serif}
article{box-sizing:border-box;width:1000px;padding:24px;font-size:24px;line-height:1.65}
p{margin:8px 0;overflow-wrap:anywhere}img{vertical-align:middle;max-width:100%;height:auto}
table{border-collapse:collapse;width:100%;margin:12px 0;table-layout:fixed}td{border:1px solid #777;padding:6px;overflow-wrap:anywhere}td p{margin:2px 0}
h1{font: bold 24px "Microsoft YaHei";color:#0f766e} .tab{display:inline-block;width:24px}
.emphasis{text-emphasis:dot;text-emphasis-position:under} math{font-size:1.05em}'''

def tag(node): return ET.QName(node).localname
def plain(node): return ''.join(node.xpath('.//w:t/text()', namespaces=NS))

def prepare_vectors(selections):
    """GDI+ preserves MathType glyph positions; Pillow's WMF playback does not."""
    VECTORS.mkdir(parents=True,exist_ok=True)
    pending={}
    for s in selections:
        for file in (SOURCE/('北京中考-'+s.get('folder',s['name']))).glob(f'{s["year"]}*.docx'):
            with ZipFile(file) as z:
                for name in z.namelist():
                    if not name.lower().endswith(('.wmf','.emf')): continue
                    raw=z.read(name);digest=hashlib.sha256(raw).hexdigest()
                    output=VECTORS/(digest+'.png')
                    if output.exists(): continue
                    source=VECTORS/(digest+Path(name).suffix);source.write_bytes(raw)
                    with Image.open(io.BytesIO(raw)) as im:
                        scale=min(4,3200/max(im.size))
                        width,height=(max(1,round(v*scale)) for v in im.size)
                    pending[digest]={'source':str(source),'output':str(output),'width':width,'height':height}
    if pending:
        manifest=VECTORS/'manifest.json';manifest.write_text(json.dumps(list(pending.values())),encoding='utf-8')
        subprocess.run(['powershell','-NoProfile','-ExecutionPolicy','Bypass','-File',str(ROOT/'tools/render_exam_vectors.ps1'),'-Manifest',str(manifest)],check=True)

class Paper:
    def __init__(self, subject, year, answers=False):
        files = [p for p in (SOURCE / ('北京中考-' + subject)).glob(f'{year}*.docx')
                 if ('解析' in p.name) == answers]
        assert len(files) == 1, (subject, year, files)
        self.file = files[0]
        self.z = ZipFile(self.file)
        self.body = list(ET.fromstring(self.z.read('word/document.xml')).find('w:body', NS))
        self.rels = {r.get('Id'):r.get('Target') for r in ET.fromstring(self.z.read('word/_rels/document.xml.rels'))}
        self.questions = {}
        for i, node in enumerate(self.body):
            t = plain(node)
            match = re.match(r'^\s*(\d{1,2})(?:[.．、]\s*|\s+(?=[\u4e00-\u9fffA-Za-z]))', t)
            if match and not any(s in t[:35] for s in ['本试卷', '试卷共', '在试卷和', '试题答案', '在答题卡上', '考试结束']):
                n = int(match[1])
                if n not in self.questions: self.questions[n] = i
        self.hash = hashlib.sha256(self.file.read_bytes()).hexdigest()

    def picture(self, node):
        refs = node.xpath('.//v:imagedata/@r:id | .//a:blip/@r:embed', namespaces=NS)
        if not refs: raise ValueError(f'Picture without fallback: {self.file.name}')
        target = self.rels[refs[0]]
        raw = self.z.read(target.lstrip('/') if target.startswith('/') else 'word/' + target)
        image = Image.open(io.BytesIO(raw))
        if image.format in ('WMF', 'EMF'):
            image = Image.open(VECTORS/(hashlib.sha256(raw).hexdigest()+'.png'))
        image = image.convert('RGBA')
        buf = io.BytesIO(); image.save(buf, format='PNG')
        digest = hashlib.sha256(buf.getvalue()).hexdigest()[:20]
        asset = OUT / 'assets' / (digest + '.png'); asset.parent.mkdir(exist_ok=True)
        if not asset.exists(): asset.write_bytes(buf.getvalue())
        width = None
        shape = node.find('.//v:shape', NS)
        if shape is not None:
            m = re.search(r'(?:^|;)width:([\d.]+)pt', shape.get('style',''))
            if m: width = float(m[1]) * 96 / 72 * 1.5
        extent = node.find('.//wp:extent', NS)
        if width is None and extent is not None: width = int(extent.get('cx')) / 914400 * 96 * 1.5
        if width is None: width = image.width / 2
        return f'<img src="../assets/{asset.name}" style="width:{width:.2f}px" alt="原卷公式或图表">'

    def render(self, node):
        t = tag(node)
        if t == 'oMath': return str(MATHML(node)).replace('<?xml version="1.0"?>','')
        if t == 'oMathPara': return ''.join(self.render(c) for c in node if tag(c)=='oMath')
        if t in ('object','pict','drawing'): return self.picture(node)
        if t == 'AlternateContent':
            f = next((c for c in node if tag(c)=='Fallback'), None)
            return self.render(f if f is not None else node[0])
        if t == 't': return html.escape(node.text or '')
        if t in ('br','cr'): return '<br>'
        if t == 'tab': return '<span class="tab"></span>'
        if t in ('instrText','del','rPr','pPr','tblPr','tcPr','trPr','sectPr'): return ''
        if t=='tbl':
            rows=[]; active={}
            for tr in node.findall('w:tr',NS):
                row=[]; column=0; current={}
                for cell in tr.findall('w:tc',NS):
                    span=cell.find('w:tcPr/w:gridSpan',NS)
                    width=int(span.get('{'+NS['w']+'}val')) if span is not None else 1
                    merge=cell.find('w:tcPr/w:vMerge',NS)
                    continuation=merge is not None and merge.get('{'+NS['w']+'}val')!='restart'
                    if continuation and column in active:
                        entry=active[column];entry['rows']+=1;current[column]=entry
                    else:
                        entry={'html':''.join(self.render(c) for c in cell),'cols':width,'rows':1}
                        row.append(entry)
                        if merge is not None: current[column]=entry
                    column+=width
                rows.append(row);active=current
            return '<table>'+''.join('<tr>'+''.join(f'<td colspan="{c["cols"]}" rowspan="{c["rows"]}">{c["html"]}</td>' for c in row)+'</tr>' for row in rows)+'</table>'
        value = ''.join(self.render(c) for c in node)
        if t == 'r':
            prop = node.find('w:rPr',NS)
            if prop is not None:
                if prop.find('w:b',NS) is not None: value=f'<b>{value}</b>'
                if prop.find('w:u',NS) is not None: value=f'<u>{value}</u>'
                if prop.find('w:em',NS) is not None: value=f'<span class="emphasis">{value}</span>'
                v=prop.find('w:vertAlign',NS)
                if v is not None:
                    wrap='sup' if v.get('{'+NS['w']+'}val')=='superscript' else 'sub'
                    value=f'<{wrap}>{value}</{wrap}>'
        if t=='p': return f'<p>{value}</p>' if value.strip() else ''
        if t=='tr': return f'<tr>{value}</tr>'
        if t=='tc':
            span=node.find('w:tcPr/w:gridSpan',NS)
            return f'<td colspan="{span.get("{"+NS["w"]+"}val") if span is not None else 1}">{value}</td>'
        return value

    def ranges(self, ranges):
        return ''.join(self.render(self.body[i]) for lo,hi in ranges for i in range(lo,hi+1))

    def question_range(self, n):
        start=self.questions[n]
        end=min([i for k,i in self.questions.items() if k>n and i>start] or [len(self.body)])-1
        return [start,end]

def save_html(path, title, body):
    path.parent.mkdir(exist_ok=True)
    path.write_text(f'<!doctype html><html lang="zh"><meta charset="utf-8"><title>{html.escape(title)}</title><style>{STYLE}</style><article><h1>{html.escape(title)}</h1>{body}</article></html>',encoding='utf-8')

def build():
    selections=json.loads((ROOT/'tools/daily_study_selections.json').read_text(encoding='utf-8'))
    selections=[s for s in selections if s['id']!='chinese']
    prepare_vectors(selections)
    subjects=[]; questions={}; sources=[]
    for subject in selections:
        sid=subject['id']; year=subject['year']; name=subject['name']
        paper=Paper(subject.get('folder',name),year)
        answer=Paper(subject.get('folder',name),year,True)
        sources.append({'subject':sid,'year':year,'paper':paper.file.name,'paperSha256':paper.hash,
                        'answers':answer.file.name,'answersSha256':answer.hash})
        groups={}
        for kind in ('short','focus'):
            groups[kind]=[]
            for row in subject[kind]:
                n,topic,knowledge=row[:3]
                ranges=row[3] if len(row)>3 else [paper.question_range(n)]
                key=f'{sid}-{year}-{n}-{kind}'
                numbers=row[4] if len(row)>4 else [n]
                number_label=str(n) if len(numbers)==1 else f'{numbers[0]}—{numbers[-1]}'
                source=f'{year}年北京中考{name} 第{number_label}题'
                body=paper.ranges(ranges)
                assert body and ('<p>' in body or '<table>' in body), key
                save_html(OUT/'questions'/f'{key}.html',source,body)
                # Keep the supplied solution, including any original shared material.
                # Some supplied solutions answer a whole reading/diagram group
                # after its final question, rather than after each question.
                last=max(numbers)
                if sid=='geography' and n<=25:
                    for group in [[1,2],[3,4],[5,6,7],[8,9,10],[11,12,13],[14,15,16],[17,18,19],[20,21,22],[23,24,25]]:
                        if n in group: last=max(group)
                if sid=='chemistry' and n in (22,23,24): last=24
                start=answer.questions[n]
                end=min([i for k,i in answer.questions.items() if k>last and i>start] or [len(answer.body)])-1
                aranges=[[start,end]]
                assert '【答案】' in ''.join(plain(answer.body[i]) for i in range(start,end+1)), (key,'Missing answer')
                save_html(OUT/'answers'/f'{key}.html',source+' 解析',answer.ranges(aranges))
                questions[key]={'id':key,'subject':sid,'topic':topic,'knowledge':knowledge,'source':source,
                    'number':n,'numbers':numbers,'year':year,'kind':kind,'ranges':ranges,
                    'question':f'questions/{key}.html','answer':f'answers/{key}.html'}
                groups[kind].append(key)
        subjects.append({'id':sid,'name':name,**groups})
        print(name,len(groups['short']),len(groups['focus']),flush=True)
    days=make_days(subjects)
    bank={'version':'eight-subjects-20261010','minutes':60,'subjects':subjects,'questions':questions,'days':days,'sources':sources}
    attach_teaching(bank)
    save_bank(bank)

def save_bank(bank):
    subjects=bank['subjects']; questions=bank['questions']; days=bank['days']
    (OUT/'bank.json').write_text(json.dumps(bank,ensure_ascii=False,indent=2),encoding='utf-8')
    lines=['八科每日复习整体规划','45个学习日；每天八科短题各3分钟、轮换两科重点题各15分钟、检查保存6分钟。','语文阅读单独在阅读页面完成，不进入PPT；与雅思、阿语、古诗词一样另计时间。',
           '每个题组依次学习概念讲解、方法、原创例子与易错点，再独立完成真题；讲解与例子为本项目编写，非中考原题。',
           '短题3分钟建议讲解1分钟、检查2分钟；重点15分钟建议讲解3分钟、检查12分钟；均包含在60分钟内。',
           '检查题目及解析来自家庭提供的原卷与解析文件，保留原题号、材料、公式和图表。',
           '按实际开始日期推进；缺勤不跳课。同一天再次下载不重置60分钟计时。',
           '这是主要知识点的练习轮换，不是所有考点逐项穷尽的保证。作文整篇写作、英语听说和实物实验须另做专项。',
           '短题用时是练习预算；综合题超时可继续完成并记录实际用时。完成打卡由本人确认，不等于自动批改或邮件发送核验。',
           '题量采用间隔重做：重复题明确标记，不把重复练习计作新增真题。旧数学45课保留为专项加练。',
           f'共{len(questions)}个选题条目、{len(set((q["subject"],q["year"],n) for q in questions.values() for n in q["numbers"]))}道不同原题；45天共450次练习。','']
    names={s['id']:s['name'] for s in subjects}
    for d in days:
        lines.append(f'第{d["day"]:02}天｜重点：'+ '、'.join(names[s] for s in d['focus']))
        for t in d['tasks']:
            q=questions[t['id']]
            lines.append(f'  {names[q["subject"]]}｜{q["topic"]}｜{q["source"]}｜{t["minutes"]}分钟'+('｜间隔重做' if t['repeat'] else ''))
        lines.append('')
    (OUT/'overall-plan.txt').write_text('\n'.join(lines),encoding='utf-8')
    print('Total',len(questions),'selections; 45 days; 450 assignments')

def make_days(subjects):
    # Two rotating focus subjects among the eight PPT subjects.
    focus_counts={s['id']:0 for s in subjects}; days=[]
    seen=set()
    for day in range(45):
        focus=[subjects[(2*day+i)%len(subjects)]['id'] for i in range(2)]
        tasks=[]
        for s in subjects:
            q=s['short'][day%len(s['short'])]
            tasks.append({'id':q,'repeat':q in seen,'minutes':3});seen.add(q)
            if s['id'] in focus:
                q=s['focus'][focus_counts[s['id']]%len(s['focus'])]
                tasks.append({'id':q,'repeat':q in seen,'minutes':15});seen.add(q)
                focus_counts[s['id']]+=1
        days.append({'day':day+1,'focus':focus,'tasks':tasks,'checkMinutes':6})
    assert max(focus_counts.values())-min(focus_counts.values())<=1
    return days

if __name__=='__main__': build()
