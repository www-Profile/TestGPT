import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

const dataDirectory = process.env.COMUNI_DATA_DIR || new URL('./data/', import.meta.url).pathname;
mkdirSync(dataDirectory, { recursive: true, mode: 0o700 });
const db = new DatabaseSync(dataDirectory + '/comuni.sqlite');
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY, name TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY, room TEXT NOT NULL REFERENCES rooms(id),
    author TEXT NOT NULL, body TEXT NOT NULL, sent INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS messages_by_room ON messages(room, id);
  INSERT OR IGNORE INTO rooms VALUES ('general', 'Общий чат');
`);

const roomQuery = db.prepare('SELECT id, name FROM rooms WHERE id = ?');
const historyQuery = db.prepare(`
  SELECT * FROM (SELECT id, author, body, sent FROM messages
  WHERE room = ? ORDER BY id DESC LIMIT 100) ORDER BY id
`);
const subscribers = new Map();
const staticFiles = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8']
};

function json(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(data));
}

function validText(value, limit) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= limit;
}

async function payload(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size <= 16000) chunks.push(chunk);
  }
  if (size > 16000) return null;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return null;
  }
}

function subscribe(room, response) {
  response.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no'
  });
  const listeners = subscribers.get(room) || new Set();
  subscribers.set(room, listeners);
  listeners.add(response);
  response.write('event: history\ndata: ' + JSON.stringify(historyQuery.all(room)) + '\n\n');
  const heartbeat = setInterval(() => response.write(': heartbeat\n\n'), 15000);
  response.on('close', () => {
    clearInterval(heartbeat);
    listeners.delete(response);
    if (!listeners.size) subscribers.delete(room);
  });
}

const server = createServer(async (request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Content-Security-Policy', "default-src 'self'; base-uri 'none'; frame-ancestors 'none'");
  try {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (request.method === 'GET' && Object.hasOwn(staticFiles, path)) {
      const [file, type] = staticFiles[path];
      const content = await readFile(new URL('./public/' + file, import.meta.url));
      response.writeHead(200, { 'Content-Type': type });
      return response.end(content);
    }
    if (path === '/api/rooms' && request.method === 'POST') {
      const data = await payload(request);
      if (!validText(data?.name, 48)) return json(response, 400, { error: 'Укажи название длиной до 48 символов.' });
      const room = { id: randomUUID(), name: data.name.trim() };
      db.prepare('INSERT INTO rooms VALUES (?, ?)').run(room.id, room.name);
      return json(response, 201, room);
    }
    const route = /^\/api\/rooms\/([a-z0-9-]{1,36})(?:\/(events|messages))?$/.exec(path);
    const room = route && roomQuery.get(route[1]);
    if (room && request.method === 'GET' && !route[2]) return json(response, 200, room);
    if (room && request.method === 'GET' && route[2] === 'events') return subscribe(room.id, response);
    if (room && request.method === 'POST' && route[2] === 'messages') {
      const data = await payload(request);
      if (!validText(data?.author, 32) || !validText(data?.body, 2000)) {
        return json(response, 400, { error: 'Проверь имя и длину сообщения (до 2000 символов).' });
      }
      const message = { author: data.author.trim(), body: data.body.trim(), sent: Date.now() };
      message.id = Number(db.prepare('INSERT INTO messages (room, author, body, sent) VALUES (?, ?, ?, ?)')
        .run(room.id, message.author, message.body, message.sent).lastInsertRowid);
      for (const listener of subscribers.get(room.id) || []) {
        if (!listener.write('data: ' + JSON.stringify(message) + '\n\n') && listener.writableLength > 65536) {
          listener.destroy();
        }
      }
      return json(response, 201, message);
    }
    return json(response, 404, { error: 'Комната или страница не найдена.' });
  } catch (error) {
    console.error(error);
    if (response.headersSent) response.destroy();
    else json(response, 500, { error: 'Сервер не смог обработать запрос.' });
  }
});

const port = Number(process.env.PORT || 3000);
server.listen(port, '0.0.0.0', () => console.log('Comuni запущен на порту ' + server.address().port));
