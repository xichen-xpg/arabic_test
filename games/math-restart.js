// A one-time restart of the revised course; retain old records for reference.
(function () {
  const marker = 'math:restart:topics-20261010';
  if (localStorage.getItem(marker)) return;
  const reports = localStorage.getItem('math:reports');
  if (reports) localStorage.setItem('math:reports:before-topics-20261010', reports);
  const checkins = JSON.parse(localStorage.getItem('arabic-test:daily-checkins') || '{}');
  Object.keys(checkins).forEach(date => {
    if (Array.isArray(checkins[date])) checkins[date] = checkins[date].filter(source => source !== 'daily-math');
  });
  localStorage.setItem('arabic-test:daily-checkins', JSON.stringify(checkins));
  localStorage.removeItem('math:reports');
  sessionStorage.removeItem('math:active');
  localStorage.setItem(marker, 'done');
})();
