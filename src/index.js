import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';

const port = Number(process.env.PORT) || 3000;
const rootDir = dirname(fileURLToPath(import.meta.url));
const dataFile = join(rootDir, '..', 'data', 'database.json');
const publicDir = join(rootDir, '..', 'public');
const sessions = new Map();

const initialData = {
  users: [{ id: 'user-admin', username: 'admin', passwordHash: hashPassword('admin123'), name: 'Администратор' }],
  projects: [
    { id: 'project-alpha', name: 'Платформа аналитики', code: 'ANL' },
    { id: 'project-beta', name: 'Мобильное приложение', code: 'MOB' }
  ],
  requirements: [
    { id: 'req-1', number: 'ANL-001', description: 'Пользователь может экспортировать отчет в PDF', type: 'Функциональное', priority: 'Высокая', complexity: 'Средняя', status: 'В работе', release: '2.1', projectId: 'project-alpha' },
    { id: 'req-2', number: 'ANL-002', description: 'Система сохраняет историю изменений отчета', type: 'Функциональное', priority: 'Средняя', complexity: 'Высокая', status: 'Запланировано', release: '2.2', projectId: 'project-alpha' },
    { id: 'req-3', number: 'MOB-001', description: 'Приложение поддерживает вход по биометрии', type: 'Безопасность', priority: 'Критическая', complexity: 'Высокая', status: 'Готово', release: '1.4', projectId: 'project-beta' }
  ]
};

function hashPassword(password) {
  return createHash('sha256').update(password).digest('hex');
}

function loadData() {
  if (!existsSync(dataFile)) {
    mkdirSync(dirname(dataFile), { recursive: true });
    writeFileSync(dataFile, JSON.stringify(initialData, null, 2));
  }
  return JSON.parse(readFileSync(dataFile, 'utf8'));
}

let data = loadData();

function saveData() {
  writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

function sendJson(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

function parseCookies(request) {
  return Object.fromEntries((request.headers.cookie || '').split(';').filter(Boolean).map((cookie) => {
    const [key, ...value] = cookie.trim().split('=');
    return [key, decodeURIComponent(value.join('='))];
  }));
}

function currentUser(request) {
  return sessions.get(parseCookies(request).session);
}

function requireAuth(request, response) {
  const user = currentUser(request);
  if (!user) sendJson(response, 401, { error: 'Требуется авторизация' });
  return user;
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error('Некорректный JSON')); }
    });
    request.on('error', reject);
  });
}

function serveStatic(request, response) {
  const requested = request.url === '/' ? '/index.html' : request.url;
  const filePath = normalize(join(publicDir, requested.split('?')[0]));
  if (!filePath.startsWith(publicDir)) return sendJson(response, 404, { error: 'Файл не найден' });
  try {
    const content = readFileSync(filePath);
    const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };
    response.writeHead(200, { 'Content-Type': types[extname(filePath)] || 'application/octet-stream' });
    response.end(content);
  } catch { sendJson(response, 404, { error: 'Файл не найден' }); }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const path = url.pathname;
  try {
    if (path === '/api/auth/login' && request.method === 'POST') {
      const { username, password } = await readBody(request);
      const user = data.users.find((item) => item.username === username);
      const supplied = Buffer.from(hashPassword(password || ''));
      const expected = Buffer.from(user?.passwordHash || hashPassword(randomBytes(16).toString('hex')));
      if (!user || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return sendJson(response, 401, { error: 'Неверный логин или пароль' });
      const token = randomBytes(32).toString('hex');
      sessions.set(token, { id: user.id, username: user.username, name: user.name });
      response.writeHead(200, { 'Set-Cookie': `session=${token}; HttpOnly; Path=/; SameSite=Lax`, 'Content-Type': 'application/json; charset=utf-8' });
      return response.end(JSON.stringify({ user: sessions.get(token) }));
    }
    if (path === '/api/auth/logout' && request.method === 'POST') {
      sessions.delete(parseCookies(request).session);
      response.writeHead(204, { 'Set-Cookie': 'session=; HttpOnly; Path=/; Max-Age=0' });
      return response.end();
    }
    if (path === '/api/auth/me' && request.method === 'GET') return sendJson(response, 200, { user: currentUser(request) || null });
    if (!path.startsWith('/api/')) return serveStatic(request, response);
    if (!requireAuth(request, response)) return;

    if (path === '/api/projects' && request.method === 'GET') return sendJson(response, 200, { projects: data.projects });
    if (path === '/api/requirements' && request.method === 'GET') {
      const projectId = url.searchParams.get('projectId');
      const search = (url.searchParams.get('search') || '').toLowerCase();
      const filters = ['type', 'priority', 'status', 'complexity', 'release'].reduce((result, key) => {
        result[key] = url.searchParams.getAll(key);
        return result;
      }, {});
      const projectRequirements = data.requirements.filter((item) => !projectId || item.projectId === projectId);
      const requirements = projectRequirements.filter((item) => Object.entries(filters).every(([key, values]) => !values.length || values.includes(item[key])) && (!search || `${item.number} ${item.description} ${item.type}`.toLowerCase().includes(search)));
      const releases = [...new Set(projectRequirements.map((item) => item.release).filter(Boolean))].sort((first, second) => first.localeCompare(second, 'ru', { numeric: true }));
      return sendJson(response, 200, { requirements, releases });
    }
    const requirementMatch = path.match(/^\/api\/requirements\/([^/]+)$/);
    if (path === '/api/requirements' && request.method === 'POST') {
      const input = await readBody(request);
      const project = data.projects.find((item) => item.id === input.projectId);
      if (!project || !input.description || !input.type || !input.priority || !input.status) return sendJson(response, 400, { error: 'Заполните все обязательные поля' });
      const requirement = { id: randomUUID(), number: input.number || `${project.code}-${String(data.requirements.filter((item) => item.projectId === project.id).length + 1).padStart(3, '0')}`, description: input.description, detailsMarkdown: input.detailsMarkdown || '', type: input.type, priority: input.priority, complexity: input.complexity, status: input.status, release: input.release, projectId: project.id };
      data.requirements.push(requirement); saveData(); return sendJson(response, 201, { requirement });
    }
    if (requirementMatch && ['PUT', 'DELETE'].includes(request.method)) {
      const index = data.requirements.findIndex((item) => item.id === requirementMatch[1]);
      if (index < 0) return sendJson(response, 404, { error: 'Требование не найдено' });
      if (request.method === 'DELETE') { data.requirements.splice(index, 1); saveData(); return sendJson(response, 200, { ok: true }); }
      const input = await readBody(request);
      const old = data.requirements[index];
      const updated = { ...old, ...input, id: old.id };
      if (!updated.description || !updated.type || !updated.priority || !updated.status || !data.projects.some((item) => item.id === updated.projectId)) return sendJson(response, 400, { error: 'Заполните все обязательные поля' });
      data.requirements[index] = updated; saveData(); return sendJson(response, 200, { requirement: updated });
    }
    return sendJson(response, 404, { error: 'Маршрут не найден' });
  } catch (error) {
    return sendJson(response, error.message === 'Некорректный JSON' ? 400 : 500, { error: error.message });
  }
});

server.listen(port, () => console.log(`Server is running at http://localhost:${port}`));
