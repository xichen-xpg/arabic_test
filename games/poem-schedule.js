(function (root) {
  const rotationStart = '2026-05-20';
  function today() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  }
  function indexForDate(date, count) {
    const days = Math.floor((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${rotationStart}T00:00:00Z`)) / 86400000);
    return ((days % count) + count) % count;
  }
  const schedule = { rotationStart, today, indexForDate };
  root.PoemSchedule = schedule;
  if (typeof module !== 'undefined') module.exports = schedule;
})(typeof window === 'undefined' ? globalThis : window);
