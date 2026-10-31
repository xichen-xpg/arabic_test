"""Extract original solutions for exactly the questions on each PPT slide."""
import json
import re
from copy import deepcopy
from difflib import SequenceMatcher
from lxml import html, etree
from inspect_exam_documents import ROOT, inventory
from select_exam_questions import document, question_spans, sections

def normalized(text):
    return re.sub(r'[^\w\u4e00-\u9fff]', '', text)[:180]

def build():
    root=ROOT/'data/exam-study'
    bank=json.loads((root/'bank.json').read_text(encoding='utf-8'))
    records={r['sha256']:r for r in inventory()}
    problems=[]
    for source in bank['sources']:
        groups=[q for q in bank['questions'].values() if q['paper']==source['id']]
        if not groups:continue
        _,texts=document(records[source['sha256']])
        first=min(a for q in groups for a,b in q['ranges'])
        spans=question_spans(texts,first,len(texts))
        doc=html.parse(str(root/'answers'/f'{source["id"]}.html'))
        article=doc.find('.//article');nodes=list(article)
        section_starts=[a for a,b,name in sections([node.text_content() for node in nodes],'english') if name!='其他'] if source['subject']=='english' else []
        candidates={}
        for i,node in enumerate(nodes):
            if node.tag=='a' and re.fullmatch(r'q\d+',node.get('id','')) and i+1<len(nodes):
                candidates.setdefault(int(node.get('id')[1:]),[]).append((i,nodes[i+1].text_content()))
        matches={}
        for n,a,b in spans:
            target=normalized(texts[a])
            options=candidates.get(n,[])
            if not options:continue
            def rank(option):
                i,raw=option;t=normalized(raw)
                answer_only=re.match(r'^\s*\d+\s*[.．、]\s*【(?:答案|分析|解析|解答)】',raw)
                score=1 if answer_only or t.startswith(target) or target.startswith(t) else SequenceMatcher(None,target,t).ratio()
                return score,i
            ranked=sorted(map(rank,options),reverse=True)
            score,index=ranked[0]
            matches[n]=(index,score)
        positions=[index for n,(index,score) in sorted(matches.items())]
        if positions!=sorted(positions):
            raise ValueError('Original solution question order mismatch: '+source['paper'])
        for q in groups:
            for n in q['numbers']:
                if n not in matches or (matches[n][1]<.75 and len(candidates[n])>1):
                    problems.append((q['source'],n,matches.get(n)))
            output=html.Element('html',lang='zh-CN')
            head=etree.SubElement(output,'head')
            etree.SubElement(head,'meta',charset='utf-8')
            etree.SubElement(head,'meta',name='viewport',content='width=device-width, initial-scale=1')
            etree.SubElement(head,'title').text=q['source']+' · 对应解析'
            for style in doc.xpath('//style'):head.append(deepcopy(style))
            body=etree.SubElement(output,'body');content=etree.SubElement(body,'article')
            etree.SubElement(content,'h1').text=q['source']+' · 对应解析'
            for n in q['numbers']:
                if n not in matches:continue
                start=matches[n][0]
                end=min((index for number,(index,score) in matches.items() if index>start),default=len(nodes))
                end=min([end]+[index for index in section_starts if index>start])
                section=etree.SubElement(content,'section',attrib={'data-question':str(n),'id':f'q{n}'})
                for node in nodes[start+1:end]:
                    if node.tag!='a':section.append(deepcopy(node))
            path=f'answers/{q["id"]}.html'
            if q['subject']=='english' and not re.search('答案|解析|分析|考点|解答',''.join(s.text_content() for s in content.findall('section'))):
                note=html.Element('p')
                note.text=f'本地原文件未附这组题的答案与解析。以下仅保留对应的{q["topic"]}题目。'
                content.insert(1,note)
            (root/path).write_text('<!doctype html>\n'+html.tostring(output,encoding='unicode'),encoding='utf-8')
            q['answer']=path
    if problems:raise ValueError('Ambiguous solution boundaries: '+json.dumps(problems,ensure_ascii=False))
    bank['version']='all-exams-20261031-single-reading'
    (root/'bank.json').write_text(json.dumps(bank,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f'Created {len(bank["questions"])} matching question-group solution pages',flush=True)

if __name__=='__main__':build()
