import http from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { timingSafeEqual, randomUUID, createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';

export const LIMIT_MS = 30 * 60 * 1000;
export const MAX_FILE = 10 * 1024 * 1024;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const curriculum = JSON.parse(readFileSync(path.join(root, 'data/math/lessons.json'), 'utf8'));
export function dayKey(time) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(time));
}
function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }

// Inspect the ZIP directory and bounded XML, never extract user files to disk.
export function validatePptx(buffer, title) {
  if (buffer.length < 22 || buffer.length > MAX_FILE) fail('请上传不超过10MB的PPTX文件。');
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50 && i + 22 + buffer.readUInt16LE(i + 20) === buffer.length) { end = i; break; }
  }
  if (end < 0) fail('文件不是有效的PPTX。');
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  const names = new Set();
  let core = '';
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || buffer.readUInt32LE(offset) !== 0x02014b50) fail('PPTX目录损坏。');
    const size = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extra = buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString();
    if (names.has(name) || /vbaProject/i.test(name)) fail('请上传不含宏的标准PPTX。');
    names.add(name);
    if (name === 'docProps/core.xml') {
      const local = buffer.readUInt32LE(offset + 42);
      if (local + 30 > buffer.length || buffer.readUInt32LE(local) !== 0x04034b50) fail('PPTX内容损坏。');
      const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
      if (start + size > buffer.length) fail('PPTX内容不完整。');
      const compressed = buffer.subarray(start, start + size);
      const method = buffer.readUInt16LE(offset + 10);
      if (method !== 0 && method !== 8) fail('不支持此PPTX压缩方式。');
      core = (method === 8 ? inflateRawSync(compressed, { maxOutputLength: 1024 * 1024 }) : compressed).toString('utf8');
    }
    offset += 46 + nameLength + extra;
  }
  if (!names.has('[Content_Types].xml') || !names.has('ppt/presentation.xml') || !names.has('ppt/slides/slide1.xml')) fail('请上传PowerPoint的.pptx文件。');
  if (!core.includes(`<dc:title>${title}</dc:title>`)) fail('请上传本次下载的作业PPTX，并保留其文档标题。');
}

export function createMathServer({ dbPath, token, origin, from, apiKey, now = Date.now, sendEmail }) {
  if (!token || token.length < 16 || !origin || !from || !apiKey) throw new Error('请配置MATH_ACCESS_TOKEN（至少16字符）、ALLOWED_ORIGIN、MAIL_FROM、RESEND_API_KEY。');
  const db = new DatabaseSync(dbPath);
  db.exec('CREATE TABLE IF NOT EXISTS days (date TEXT PRIMARY KEY, data TEXT NOT NULL)');
  const load = date => { const row = db.prepare('SELECT data FROM days WHERE date=?').get(date); return row ? JSON.parse(row.data) : null; };
  const save = state => db.prepare('INSERT INTO days VALUES (?,?) ON CONFLICT(date) DO UPDATE SET data=excluded.data').run(state.date, JSON.stringify(state));
  const publicState = state => state && ({ date: state.date, id: state.id, lessonIndex: state.lessonIndex, title: state.title, startedAt: state.startedAt, deadline: state.startedAt + LIMIT_MS, sentAt: state.sentAt || null, onTime: !!state.sentAt && state.sentAt - state.startedAt <= LIMIT_MS, emailId: state.emailId || null });
  const history = () => db.prepare('SELECT data FROM days ORDER BY date DESC').all().map(row => publicState(JSON.parse(row.data)));
  const today = () => {
    const date = dayKey(now());
    const state = load(date);
    const last = db.prepare('SELECT data FROM days ORDER BY date DESC LIMIT 1').get();
    const lessonIndex = state?.lessonIndex ?? (last ? JSON.parse(last.data).lessonIndex + 1 : 0);
    return { date, lessonIndex, lesson: curriculum.lessons[lessonIndex] || null, state: publicState(state), history: history(), serverNow: now() };
  };
  const locks = new Set();
  const deliver = sendEmail || (async (body, key) => {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(25000),
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify(body)
    });
    if (!response.ok) fail('邮件服务暂未确认发送成功，请重试。', 502);
    const result = await response.json();
    if (!result.id) fail('邮件服务没有返回发送凭据，请重试。', 502);
    return result;
  });
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'Origin');
    if (req.headers.origin === origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Assignment-Id');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    }
    const reply = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
    try {
      if (req.headers.origin && req.headers.origin !== origin) fail('不允许的网页来源。', 403);
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
      const given = Buffer.from(req.headers.authorization || '');
      const expected = Buffer.from(`Bearer ${token}`);
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) fail('请输入正确的家庭访问码。', 401);
      const route = new URL(req.url, 'http://localhost').pathname;
      if (req.method === 'GET' && route === '/today') { reply(200, today()); return; }
      if (req.method === 'POST' && route === '/start') {
        const plan = today();
        if (!plan.lesson) fail('当前课程已完成，等待补充后续课程。', 409);
        let state = load(plan.date);
        if (!state) {
          state = { date: plan.date, id: randomUUID(), lessonIndex: plan.lessonIndex, title: `${plan.date.replaceAll('-', '')}_${plan.lesson.title}`, startedAt: now() };
          save(state);
        }
        reply(200, { ...publicState(state), serverNow: now() }); return;
      }
      if (req.method === 'POST' && route === '/submit') {
        const id = req.headers['x-assignment-id'];
        const row = db.prepare('SELECT data FROM days WHERE json_extract(data,\'$.id\')=?').get(String(id || ''));
        if (!row) fail('请先下载作业再提交。', 409);
        let state = JSON.parse(row.data);
        if (state.sentAt) { reply(200, { ...publicState(state), serverNow: now() }); return; }
        if (locks.has(id)) fail('正在发送，请稍候刷新状态。', 409);
        locks.add(id);
        try {
          const chunks = []; let size = 0;
          for await (const chunk of req) {
            size += chunk.length;
            if (size > MAX_FILE) fail('文件超过10MB，请压缩图片后重试。', 413);
            chunks.push(chunk);
          }
          const file = Buffer.concat(chunks);
          validatePptx(file, state.title);
          const hash = createHash('sha256').update(file).digest('hex');
          if (state.pending && state.pending.hash !== hash) fail('上次发送结果尚未确认，请使用同一文件重试，以免重复发信。', 409);
          if (state.pending && now() - state.pending.at > 23 * 3600000) fail('上次发送结果未确认且已超过重试时限，请家长查看邮箱后处理。', 409);
          if (!state.pending) {
            const at = now();
            state.pending = { hash, at, body: {
              from, to: ['xichen.app@gmail.com'], subject: state.title,
              text: `数学作业：${state.title}\n开始时间：${new Date(state.startedAt).toISOString()}\n请求发送时间：${new Date(at).toISOString()}\n请求发送时用时：${Math.ceil((at - state.startedAt) / 1000)}秒\n时间为UTC；最终打卡按邮件服务确认时间计算。\n作答过程见附件；本系统不批改、不评分。`,
              attachments: [{ filename: `${state.title}.pptx`, content: file.toString('base64') }]
            }};
            save(state);
          }
          const result = await deliver(state.pending.body, `math-${state.id}`);
          state.sentAt = now(); state.emailId = result.id;
          delete state.pending;
          save(state);
          reply(200, { ...publicState(state), serverNow: now() });
        } finally { locks.delete(id); }
        return;
      }
      fail('接口不存在。', 404);
    } catch (error) {
      reply(error.status || 500, { error: error.status ? error.message : '服务暂不可用，未确认完成，请稍后重试。' });
    }
  });
  server.on('close', () => db.close());
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dataDir = process.env.MATH_DATA_DIR || path.join(root, '.math-server');
  mkdirSync(dataDir, { recursive: true });
  const server = createMathServer({ dbPath: path.join(dataDir, 'math.sqlite'), token: process.env.MATH_ACCESS_TOKEN, origin: process.env.ALLOWED_ORIGIN, from: process.env.MAIL_FROM, apiKey: process.env.RESEND_API_KEY });
  server.listen(Number(process.env.PORT || 8787), process.env.HOST || '127.0.0.1', () => console.log('Math mail API ready.'));
}
