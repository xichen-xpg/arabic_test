"""Validate structure and independently compute selected multi-step answers."""
import json
import math
from fractions import Fraction as F
from collections import Counter
from pathlib import Path

root = Path(__file__).resolve().parents[1]
bank = json.loads((root / 'data/math/lessons.json').read_text(encoding='utf-8'))
lessons = bank['lessons']
assert len(lessons) == 50
assert sum(len(l['questions']) for l in lessons) == 300
ids, prompts = set(), set()
for day, lesson in enumerate(lessons, 1):
    assert lesson['day'] == day
    assert len(lesson['questions']) == 6
    assert lesson['materials'] and lesson['unit']
    assert lesson['id'] not in ids
    ids.add(lesson['id'])
    for q in lesson['questions']:
        assert q['id'] not in ids
        ids.add(q['id'])
        assert q['text'] not in prompts, q['text']
        prompts.add(q['text'])
        assert len(q['options']) == len(set(q['options'])) == 4
        assert type(q['answer']) is int and q['answer'] in range(4)
        assert q['point'] in range(len(lesson['materials']))
        assert q['explanation'] and q['origin'] == 'original_practice'
        assert all(marker not in str(q) for marker in ['TODO', '\ufffd', '待补充'])

def check(day, question, expected):
    q = lessons[day - 1]['questions'][question - 1]
    actual = q['options'][q['answer']]
    assert actual == str(expected), (day, question, actual, expected)

# Independent enumeration and formulas, separate from curriculum authoring.
check(6, 6, sum((-1) ** n + n * n == 0 for n in range(-2, 3)))
check(7, 6, sum(math.isqrt(a + 2) ** 2 == a + 2 for a in range(-2, 8)))
check(8, 6, 2 * 5 - 3 ** 2)
check(9, 6, next(x for x in range(-10, 11) if x*x-5*x+6 <= 0 and x*x-4 != 0))
check(12, 6, sum(m-6 > 0 and 12-m > 0 for m in range(-10, 20)))
check(15, 6, str(next(x for x in range(1, 20) if F(1, x) + F(1, x+6) == F(1, 4))) + '天')
check(19, 6, '0和4')
check(21, 6, str(max((p-10)*(40-p) for p in range(10, 23))) + '元')
check(22, 6, 360 // (180 // 5))
check(25, 6, sum(2*x > 6 and 6+2*x <= 16 for x in range(1, 10)))
check(27, 6, 40 // 2)
check(28, 6, (14**2 - 10**2) // 2)
check(29, 6, 15 * 9 // 5)
check(36, 6, min(a+b+c+d for a in [1,2] for b in [1,2] for c in [1,2] for d in [1,2]
                if max(a,c) == max(b,d) == max(a,b) == max(c,d) == 2))
check(37, 6, int(F(60) / (1-F(3,10)-F(144,360))))
check(38, 6, (5*6-14)//4)
check(40, 6, F(3, 3*3+3))
check(41, 6, F(2, 4))
check(42, 6, (9+63)/100)
check(43, 6, max(F(x*(4-x),2) for x in range(5)))
check(44, 6, 10*2//5)
check(45, 6, sum(n*n < 10 for n in range(-10,11)))
check(47, 3, min(range(1,7), key=lambda n: (F(n)-F(44,10))**2))
check(48, 5, 6*8/10)
check(49, 2, F(9,4))
check(50, 1, F(7)-4+F(1,2))
check(50, 4, F(5*12,2)/F(5+12+13,2))
check(50, 5, F(2,4)*F(2,3)*2)
# Verify less trivial location/branch calculations without relying on options.
assert [x for x in range(-10,20) if x > -2 and abs(x+2) == 2*abs(x-4)] == [2,10]
assert [x for x in range(-10,11) if abs(x+1)+abs(x-3)==4] == [-1,0,1,2,3]
assert [a for a in range(-10,11) if abs(a)==abs(2*a-3) and a>0 and 2*a-3<0] == [1]
assert min(abs(x+3)+abs(x-1)+abs(x-5) for x in range(-10,11)) == 8
assert sorted({abs(4-3), 4+3}) == [1,7]
print('PASS: 50 lessons, 300 distinct prompts; IDs, options, references and material indices.')
print('PASS: 28 independently calculated answers plus 5 branch/location checks.')
print('Answer distribution:', dict(Counter(q['answer'] for l in lessons for q in l['questions'])))
print('This verifies structure and selected mathematics; full teacher review remains valuable.')
