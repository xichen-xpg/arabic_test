"""Export readable review files from the canonical JSON bank."""
import json
from pathlib import Path
from validate_chinese_bank import validate

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'data/chinese-reading'
LABELS = {'modern': '现代文', 'classical_prose': '古文', 'classical_poetry': '古诗词'}


def main():
    bank = json.loads((OUT / 'bank.json').read_text(encoding='utf-8'))
    references = None
    if bank.get('questionReferencesFile'):
        references = json.loads((OUT / bank['questionReferencesFile']).read_text(encoding='utf-8'))
    errors, _ = validate(bank, references)
    if errors:
        raise SystemExit('\n'.join(errors))
    catalog = ['每日中文阅读题库目录', '60篇现代文 + 20篇古文 + 20篇古诗词；每篇5道四选一单选题。',
               '字数仅统计正文汉字，不含标点、空白和题目；时长为阅读加答题粗估。', '']
    review = ['每日中文阅读题库：全文审阅版',
              '原文、选择题、参考答案及解析均在本文件中。答案放在每篇题目之后。',
              '公版判断范围：中国大陆；题目为原创练习，不是历年中考真题。',
              '文学理解题的答案和解析为本题库参考判断，供审阅调整。', '']
    if references:
        review.extend(['本版参考用户提供的2022—2026北京语文卷命题方式修订。',
                       '100篇各重写一道综合题，其余400道重写干扰项；阅读原文保持不变。',
                       '注意：含“选出不恰当的一项”的反向选择题，每题仍只有一个答案。',
                       '命题参考表示考点与方法的类比，不表示该题是北京中考原题或逐题改编。', ''])
    for n, r in enumerate(bank['readings'], 1):
        heading = f'{n:03d} | {r["id"]} | {LABELS[r["category"]]} | {r["title"]} | {r["author"]}'
        info = f'正文{r["characterCount"]}字 | {r["difficulty"]} | 约{r["estimatedMinutes"]}分钟'
        catalog.append(f'{heading} | {info}')
        review.extend(['=' * 72, heading, info, r['textNote'], '', '【原文】', r['text'], '', '【题目】'])
        for i, q in enumerate(r['questions'], 1):
            review.append(f'{i}. [{q["skill"]}] {q["prompt"]}')
            review.extend(f'   {o["id"]}. {o["text"]}' for o in q['options'])
            review.append('')
        review.append('【参考答案与解析】')
        for i, q in enumerate(r['questions'], 1):
            review.extend([f'{i}. {q["answer"]} — {q["explanation"]}', f'   原文依据：{q["evidence"]}'])
            if references:
                for ref in q['referencePatterns']:
                    pattern = references['patterns'][ref]
                    source = references['sources'][pattern['sourceId']]
                    review.append(f'   命题参考：{source["filename"]} 第{pattern["questionNumber"]}题；{pattern["pattern"]}。')
        source = r['source']
        review.extend(['', '【来源与整理】', source['label'], source.get('url', source.get('localFile', '')),
                       '公版范围：' + r['rights']['jurisdiction'] + '；' + r['rights']['basis']])
        if source.get('editorialChanges'):
            review.append('校字记录：' + '；'.join(f'{e["from"]} → {e["to"]}' for e in source['editorialChanges']))
        review.append('')
    (OUT / 'catalog.txt').write_text('\n'.join(catalog) + '\n', encoding='utf-8')
    (OUT / 'review.txt').write_text('\n'.join(review) + '\n', encoding='utf-8')
    print('Exported catalog.txt and review.txt from validated bank.json.')


if __name__ == '__main__':
    main()
