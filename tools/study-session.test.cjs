const assert=require('node:assert/strict');
const S=require('../games/study-session.js');
const storage=()=>{const data=new Map();return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};};
const st=storage(),ids=['chinese','math','english','physics','chemistry','biology','politics','history','geography'];
st.setItem('math:reports','original');st.setItem('arabic-test:daily-checkins','old');
assert.deepEqual(S.plan(st,'2026-10-10'),{day:1,state:null});
const first=S.start(st,'2026-10-10',1000);
assert.equal(first.deadline-first.startedAt,3600000);
assert.deepEqual(S.start(st,'2026-10-10',5000),first);
assert.deepEqual(S.start(st,'2026-10-11',6000),first); // Overnight resumption, not a reset.
S.save(st,first.date,ids,['math'],2,100000);
assert.equal(S.plan(st,'2026-10-11').day,1);
assert.equal(S.plan(st,'2026-10-11').state.finishedAt,undefined);
let done=S.save(st,first.date,ids,ids,2,3601000);
assert.equal(done.onTime,true); // Inclusive deadline.
assert.equal(S.plan(st,'2026-10-10').day,1);
assert.equal(S.plan(st,'2026-10-13').day,2); // Missing days do not skip lessons.
assert.equal(S.save(st,first.date,ids,ids,3,5000000).finishedAt,3601000);
const second=S.start(st,'2026-10-13',6000000);
done=S.save(st,second.date,ids,ids,0,9600001);
assert.equal(done.onTime,false);
assert.equal(Object.keys(done.completed).length,9);
assert.throws(()=>S.save(st,second.date,ids,ids,-1));
assert.equal(st.getItem('math:reports'),'original');assert.equal(st.getItem('arabic-test:daily-checkins'),'old');
const eight=ids.filter(id=>id!=='chinese');
const current=S.start(st,'2026-10-14',10000000);
const finished=S.save(st,current.date,eight,eight,0,10000100);
assert.equal(finished.finishedAt,10000100);
assert.equal(Object.keys(finished.completed).length,8);
assert.equal(finished.completed.chinese,undefined);
assert.equal(S.read(st)['2026-10-10'].completed.chinese,3601000);
console.log('Session checks passed: start, resume, deadline, partial completion, overtime, progression, legacy preservation, eight-subject completion.');
