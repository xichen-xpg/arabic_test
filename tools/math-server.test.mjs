import test from 'node:test';
import assert from 'node:assert/strict';
import { createMathServer, dayKey, LIMIT_MS } from '../server/math-server.mjs';
import vm from 'node:vm';
import fs from 'node:fs';

const runtime = { setTimeout, clearTimeout, console, TextEncoder, Uint8Array, ArrayBuffer, Blob };
runtime.window = runtime;
vm.createContext(runtime);
vm.runInContext(fs.readFileSync(new URL('../assets/vendor/pptxgen.bundle.js', import.meta.url), 'utf8'), runtime);
const token = 'test-family-code-123456789';
const origin = 'http://127.0.0.1';
async function fixture(title) {
  const zip = new runtime.JSZip();
  for (const name of ['[Content_Types].xml', 'ppt/presentation.xml', 'ppt/slides/slide1.xml']) zip.file(name, '<xml/>');
  zip.file('docProps/core.xml', `<dc:title>${title}</dc:title>`);
  return Buffer.from(await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));
}
async function setup(t, sendEmail) {
  let clock = Date.parse('2026-10-05T08:00:00Z');
  let calls = 0;
  const server = createMathServer({ dbPath: ':memory:', token, origin, from: 'test@example.com', apiKey: 'fake', now: () => clock, sendEmail: async (...args) => { calls++; return sendEmail ? sendEmail(...args) : { id: 'fake-id' }; } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const request = async (route, options = {}) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${route}`, { ...options, headers: { Authorization: `Bearer ${token}`, Origin: origin, ...options.headers } });
    return { status: response.status, data: await response.json() };
  };
  return { request, advance: ms => { clock += ms; }, calls: () => calls };
}
test('auth, daily sequence, persistent start, fixed recipient, duplicate send', async t => {
  let mail;
  const f = await setup(t, async body => { mail = body; return { id: 'id-1' }; });
  assert.equal((await f.request('/today', { headers: { Authorization: 'Bearer wrong' } })).status, 401);
  assert.equal((await f.request('/today', { headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await f.request('/today')).data.lesson.id, 'review-01');
  const first = (await f.request('/start', { method: 'POST' })).data;
  f.advance(10000);
  assert.equal((await f.request('/start', { method: 'POST' })).data.startedAt, first.startedAt);
  const body = await fixture(first.title);
  const opts = { method: 'POST', headers: { 'X-Assignment-Id': first.id }, body };
  const sent = await f.request('/submit', opts);
  assert.equal(sent.status, 200); assert.equal(sent.data.onTime, true);
  assert.deepEqual(mail.to, ['xichen.app@gmail.com']); assert.equal(mail.subject, first.title);
  await f.request('/submit', opts); assert.equal(f.calls(), 1);
  f.advance(86400000 * 4);
  assert.equal((await f.request('/today')).data.lesson.id, 'review-02');
});
test('invalid file and wrong assignment do not send; exact deadline accepted', async t => {
  const f = await setup(t);
  const state = (await f.request('/start', { method: 'POST' })).data;
  const options = { method: 'POST', headers: { 'X-Assignment-Id': state.id } };
  assert.equal((await f.request('/submit', { ...options, body: 'fake.pptx' })).status, 400);
  assert.equal((await f.request('/submit', { ...options, body: await fixture('another-title') })).status, 400);
  assert.equal(f.calls(), 0);
  f.advance(LIMIT_MS);
  assert.equal((await f.request('/submit', { ...options, body: await fixture(state.title) })).data.onTime, true);
});
test('late acknowledgement does not earn check-in', async t => {
  const f = await setup(t, async () => { f.advance(2000); return { id: 'late' }; });
  const state = (await f.request('/start', { method: 'POST' })).data;
  f.advance(LIMIT_MS - 1000);
  const result = await f.request('/submit', { method: 'POST', headers: { 'X-Assignment-Id': state.id }, body: await fixture(state.title) });
  assert.equal(result.data.onTime, false); assert.ok(result.data.sentAt);
});
test('ambiguous failure retries identical payload with same idempotency key', async t => {
  const calls = [];
  const f = await setup(t, async (body, key) => {
    calls.push({ body, key });
    if (calls.length === 1) throw new Error('timeout');
    return { id: 'recovered' };
  });
  const state = (await f.request('/start', { method: 'POST' })).data;
  const opts = { method: 'POST', headers: { 'X-Assignment-Id': state.id }, body: await fixture(state.title) };
  assert.equal((await f.request('/submit', opts)).status, 500);
  assert.equal((await f.request('/today')).data.state.sentAt, null);
  f.advance(1000);
  assert.equal((await f.request('/submit', opts)).data.emailId, 'recovered');
  assert.deepEqual(calls[0], calls[1]);
});
test('Dubai date boundary', () => {
  assert.equal(dayKey(Date.parse('2026-10-05T19:59:59Z')), '2026-10-05');
  assert.equal(dayKey(Date.parse('2026-10-05T20:00:00Z')), '2026-10-06');
});

test('new course starts at lesson one while preserving the legacy assignment table', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const { fileURLToPath } = await import('node:url');
  fs.mkdirSync(new URL('../.math-test/', import.meta.url), { recursive: true });
  const file = fileURLToPath(new URL(`../.math-test/legacy-${Date.now()}.sqlite`, import.meta.url));
  const old = new DatabaseSync(file);
  old.exec('CREATE TABLE days (date TEXT PRIMARY KEY, data TEXT NOT NULL)');
  old.prepare('INSERT INTO days VALUES (?, ?)').run('2026-10-10', JSON.stringify({ date: '2026-10-10', lessonIndex: 4, id: 'old', sentAt: 1 }));
  old.close();
  const server = createMathServer({ dbPath: file, token, origin, from: 'fake@example.com', apiKey: 'fake', now: () => Date.parse('2026-10-10T08:00:00Z'), sendEmail: async () => ({ id: 'fake' }) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/today`, { headers: { Authorization: `Bearer ${token}` } });
    const plan = await response.json();
    assert.equal(plan.lessonIndex, 0);
    assert.equal(plan.courseRun, 'topics-20261010');
    assert.deepEqual(plan.history, []);
  } finally {
    await new Promise(resolve => server.close(resolve));
    const check = new DatabaseSync(file);
    assert.equal(check.prepare('SELECT COUNT(*) AS n FROM days').get().n, 1);
    check.close();
    fs.unlinkSync(file);
  }
});
test('server restart restores start time from SQLite', async () => {
  const folder = new URL('../.math-test/', import.meta.url);
  fs.mkdirSync(folder, { recursive: true });
  const filename = new URL(`restart-${Date.now()}.sqlite`, folder);
  const { fileURLToPath } = await import('node:url');
  let time = Date.parse('2026-10-05T08:00:00Z');
  const options = { dbPath: fileURLToPath(filename), token, origin, from: 'fake@example.com', apiKey: 'fake', now: () => time, sendEmail: async () => ({ id: 'fake' }) };
  const run = async () => {
    const server = createMathServer(options);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/start`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      return await response.json();
    } finally { await new Promise(resolve => server.close(resolve)); }
  };
  try {
    const first = await run(); time += 100000;
    const restored = await run();
    assert.equal(restored.startedAt, first.startedAt);
    assert.equal(restored.id, first.id);
  } finally { fs.unlinkSync(filename); }
});
