"""Validate the standalone Chinese reading bank (standard library only)."""
import hashlib
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BANK = ROOT / 'data/chinese-reading/bank.json'


def han(text):
    return ''.join(re.findall(r'[\u3400-\u9fff\U00020000-\U0002ffff]', text))


def validate(bank, reference_catalog=None):
    errors = []
    readings = bank['readings']
    expected = {'modern': 60, 'classical_prose': 20, 'classical_poetry': 20}
    if Counter(r['category'] for r in readings) != expected:
        errors.append('Expected 60 modern, 20 classical prose, 20 poetry.')
    ids, titles, answers = set(), set(), Counter()
    for r in readings:
        rid = r['id']
        key = (r['author'], r['title'])
        if rid in ids or key in titles:
            errors.append(f'{rid}: duplicate reading')
        ids.add(rid)
        titles.add(key)
        text = r['text']
        if not text.strip() or r['characterCount'] != len(han(text)):
            errors.append(f'{rid}: empty text or incorrect character count')
        if hashlib.sha256(text.encode('utf-8')).hexdigest() != r['textSha256']:
            errors.append(f'{rid}: text hash mismatch')
        if any(marker in text for marker in ['Template:', 'TODO', '\ufffd', '\n注释\n']):
            errors.append(f'{rid}: editorial debris in text')
        if not (r['source'].get('url') or r['source'].get('localFile')):
            errors.append(f'{rid}: missing source')
        if r['rights']['status'] != 'public_domain' or r['rights']['jurisdiction'] != 'CN':
            errors.append(f'{rid}: missing rights scope')
        if r['category'] == 'modern':
            year = r['rights']['authorDeathYear']
            if r['rights']['publicDomainFrom'] != f'{year + 51}-01-01':
                errors.append(f'{rid}: inconsistent rights date')
        if r['questionOrigin'] != 'original_practice' or r['examProvenance'] is not None:
            errors.append(f'{rid}: incorrect question provenance')
        if len(r['questions']) != 5:
            errors.append(f'{rid}: expected five questions')
        prompts = set()
        for q in r['questions']:
            qid = q['id']
            if qid in ids or q['prompt'] in prompts:
                errors.append(f'{qid}: duplicate question')
            ids.add(qid)
            prompts.add(q['prompt'])
            options = q['options']
            if (q['type'] != 'single_choice' or
                    [o['id'] for o in options] != list('ABCD') or
                    len({o['text'] for o in options}) != 4 or
                    q['answer'] not in 'ABCD' or len(q['answer']) != 1):
                errors.append(f'{qid}: invalid single-choice options/answer')
            for field in ['skill', 'prompt', 'explanation', 'evidence']:
                if not q[field].strip():
                    errors.append(f'{qid}: empty {field}')
            if not han(q['evidence']) or han(q['evidence']) not in han(text):
                errors.append(f'{qid}: evidence absent from reading: {q["evidence"]}')
            answers[q['answer']] += 1
            if bank.get('questionReferencesFile'):
                mode = 'incorrect' if any(s in q['prompt'] for s in ['不恰当的一项', '不正确的一项']) else 'correct'
                if q.get('selectionMode') != mode:
                    errors.append(f'{qid}: selection direction mismatch')
                if q.get('revisionType') not in ['regenerated', 'distractors_rewritten']:
                    errors.append(f'{qid}: missing revision type')
                if not q.get('referencePatterns'):
                    errors.append(f'{qid}: missing question-design reference')
                if reference_catalog:
                    for ref in q.get('referencePatterns', []):
                        if ref not in reference_catalog['patterns']:
                            errors.append(f'{qid}: unknown reference {ref}')
    if sum(answers.values()) != 500:
        errors.append('Expected 500 questions.')
    if bank['counts'] != dict(expected, readings=100, questions=500):
        errors.append('Root counts do not match expected counts.')
    if bank.get('questionReferencesFile'):
        revisions = Counter(q.get('revisionType') for r in readings for q in r['questions'])
        if revisions != {'regenerated': 100, 'distractors_rewritten': 400}:
            errors.append('Expected 100 regenerated questions and 400 distractor revisions.')
        for r in readings:
            if sum(q.get('revisionType') == 'regenerated' for q in r['questions']) != 1:
                errors.append(f'{r["id"]}: expected one regenerated question')
        if reference_catalog:
            for ref, item in reference_catalog['patterns'].items():
                if item['sourceId'] not in reference_catalog['sources']:
                    errors.append(f'{ref}: unknown source document')
    return errors, answers


if __name__ == '__main__':
    bank = json.loads(BANK.read_text(encoding='utf-8'))
    references = None
    if bank.get('questionReferencesFile'):
        references = json.loads((BANK.parent / bank['questionReferencesFile']).read_text(encoding='utf-8'))
    errors, answers = validate(bank, references)
    if errors:
        print('\n'.join(errors))
        raise SystemExit(1)
    print('PASS: 100 readings; 500 single-choice questions; counts, IDs, sources,')
    print('rights metadata, text hashes, options and evidence substrings checked.')
    print('Answer distribution:', dict(sorted(answers.items())))
    if references:
        print('PASS: reference links, revision coverage and correct/incorrect selection direction.')
    print('This validates data integrity, not independent literary/editorial approval.')
