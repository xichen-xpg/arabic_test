"""Inventory source documents and extract outlines for selection review."""
import hashlib
import json
import re
from pathlib import Path
from zipfile import ZipFile
from lxml import etree as ET

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / '.math-test/all-exams'
NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}

def inventory():
    CACHE.mkdir(parents=True, exist_ok=True)
    records = []
    for path in sorted((ROOT / '北京中考').rglob('*')):
        if path.name.startswith('~$') or path.suffix.lower() not in ('.doc', '.docx'):
            continue
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        docx = path if path.suffix.lower() == '.docx' else CACHE / 'docx' / (digest + '.docx')
        records.append(dict(source=str(path), docx=str(docx), sha256=digest, subject=path.parent.name))
    (CACHE / 'documents.json').write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding='utf-8')
    return records

def inspect(records):
    for record in records:
        path = Path(record['docx'])
        if not path.exists() or any(s in record['source'] for s in ('解析', '答案')):
            continue
        with ZipFile(path) as archive:
            body = list(ET.fromstring(archive.read('word/document.xml')).find('w:body', NS))
        texts = [''.join(node.xpath('.//w:t/text()', namespaces=NS)) for node in body]
        outline = [(i, t[:180]) for i, t in enumerate(texts) if re.match(r'^\s*(?:[一二三四五六七八九十]+[、．.]|[IVX]+[．.]|\d+[．.、])', t)]
        data = dict(name=Path(record['source']).name, subject=record['subject'], texts=texts, outline=outline)
        (CACHE / (record['sha256'] + '.json')).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
        print(data['name'], len(outline), flush=True)

if __name__ == '__main__':
    CACHE.mkdir(parents=True, exist_ok=True)
    inspect(inventory())
