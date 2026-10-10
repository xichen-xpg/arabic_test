(function (root) {
  const key = 'daily-study:sessions:v1';
  const today = () => new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Dubai', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
  function read(storage) { return JSON.parse(storage.getItem(key) || '{}'); }
  function plan(storage, date = today()) {
    const records = read(storage);
    const latest = Object.keys(records).sort().at(-1);
    const active = latest && records[latest];
    if (active && !active.finishedAt) return { day:active.day, state:active };
    if (records[date]) return { day:records[date].day, state:records[date] };
    return { day:active ? active.day + 1 : 1, state:null };
  }
  function start(storage, date = today(), now = Date.now()) {
    const selected = plan(storage,date);
    if (selected.state) return selected.state;
    if (selected.day > 45) throw new Error('45天练习已完成，可从课程目录复习。');
    const record = { day:selected.day, date, startedAt:now, deadline:now+3600000, completed:{}, interruptions:0 };
    const records=read(storage); records[date]=record; storage.setItem(key,JSON.stringify(records));
    return record;
  }
  function save(storage, date, subjects, completed, interruptions, now = Date.now()) {
    const records=read(storage); const record=records[date];
    if (!record) throw new Error('请先开始并下载作业。');
    if (!Number.isInteger(interruptions) || interruptions<0) throw new Error('中断次数请填写非负整数。');
    record.completed=Object.fromEntries(subjects.filter(s=>completed.includes(s)).map(s=>[s,record.completed[s] || now]));
    record.interruptions=interruptions;
    if (subjects.every(s=>record.completed[s])) record.finishedAt ||= now;
    else delete record.finishedAt;
    record.onTime=!!record.finishedAt && record.finishedAt<=record.deadline;
    records[date]=record; storage.setItem(key,JSON.stringify(records));
    return record;
  }
  root.StudySession={ key,today,read,plan,start,save };
  if (typeof module !== 'undefined') module.exports=root.StudySession;
})(typeof window === 'undefined' ? globalThis : window);
