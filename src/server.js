import { createServer } from 'node:http';
import { extname, normalize, join, relative } from 'node:path';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const maxBodySize = 2 * 1024 * 1024;
const roles = ['Администратор', 'Пользователь'];
const permissionNames = ['create', 'read', 'update', 'delete'];

export function createApp({ port, publicDir, store, config, auth }) {
  function sendJson(response, status, payload) {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(payload));
  }

  function readBody(request) {
    return new Promise((resolve, reject) => {
      let body = '';
      request.on('data', (chunk) => {
        body += chunk;
        if (Buffer.byteLength(body) > maxBodySize) {
          reject(Object.assign(new Error('Размер запроса превышает 2 МБ'), { status: 413 }));
          request.destroy();
        }
      });
      request.on('end', () => {
        try { resolve(body ? JSON.parse(body) : {}); } catch { reject(Object.assign(new Error('Некорректный JSON'), { status: 400 })); }
      });
      request.on('error', reject);
    });
  }

  function serveStatic(request, response) {
    const requested = request.url === '/' ? '/index.html' : request.url.split('?')[0];
    const filePath = normalize(join(publicDir, requested));
    const relativePath = relative(publicDir, filePath);
    if (relativePath.startsWith('..') || relativePath.includes('..\\')) return sendJson(response, 404, { error: 'Файл не найден' });
    try {
      const content = readFileSync(filePath);
      const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };
      response.writeHead(200, { 'Content-Type': types[extname(filePath)] || 'application/octet-stream' });
      response.end(content);
    } catch { sendJson(response, 404, { error: 'Файл не найден' }); }
  }

  function requireUser(request, response) {
    const user = auth.userFromRequest(request);
    if (!user) { sendJson(response, 401, { error: 'Требуется авторизация' }); return null; }
    return user;
  }

  function requireAdmin(user, response) {
    if (user.role !== 'Администратор') { sendJson(response, 403, { error: 'Требуются права администратора' }); return false; }
    return true;
  }

  function validValue(name, value, configs) {
    return configs[name].includes(value);
  }

  function visibleProjects(user, projects) {
    return user.role === 'Администратор' ? projects : projects.filter((project) => user.projectIds.includes(project.id));
  }

  function visibleRequirements(user, requirements) {
    return user.role === 'Администратор' ? requirements : user.permissions.read ? requirements.filter((item) => user.projectIds.includes(item.projectId)) : [];
  }

  function normalizeUser(input, existing = {}) {
    const permissions = Object.fromEntries(permissionNames.map((name) => [name, Boolean(input.permissions?.[name])]));
    return { ...existing, username: String(input.username || existing.username || '').trim(), name: String(input.name || existing.name || '').trim(), role: roles.includes(input.role) ? input.role : existing.role || 'Пользователь', projectIds: Array.isArray(input.projectIds) ? input.projectIds : existing.projectIds || [], permissions };
  }

  function prefixFor(projectId, type, configs) {
    return store.data.requirementPrefixes.find((item) => item.projectId === projectId && item.type === type)?.prefix || configs.projects.find((project) => project.id === projectId)?.code || 'REQ';
  }

  function nextRequirementNumber(projectId, type, configs) {
    const prefix = prefixFor(projectId, type, configs);
    const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`^${escapedPrefix}-(\\d+)$`, 'i');
    const nextSequence = store.data.requirements.reduce((maximum, requirement) => {
      if (requirement.projectId !== projectId || requirement.type !== type) return maximum;
      const match = requirement.number?.match(pattern);
      return match ? Math.max(maximum, Number(match[1])) : maximum;
    }, 0) + 1;
    return `${prefix}-${String(nextSequence).padStart(3, '0')}`;
  }

  const server = createServer(async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const path = url.pathname;
    try {
      if (path === '/api/auth/login' && request.method === 'POST') {
        const input = await readBody(request);
        const result = auth.login(input.username, input.password);
        if (!result) return sendJson(response, 401, { error: 'Неверный логин или пароль' });
        response.writeHead(200, { 'Set-Cookie': `session=${result.token}; HttpOnly; Path=/; SameSite=Lax`, 'Content-Type': 'application/json; charset=utf-8' });
        return response.end(JSON.stringify({ user: result.user }));
      }
      if (path === '/api/auth/logout' && request.method === 'POST') {
        auth.logout(request);
        response.writeHead(204, { 'Set-Cookie': 'session=; HttpOnly; Path=/; Max-Age=0' });
        return response.end();
      }
      if (path === '/api/auth/me' && request.method === 'GET') return sendJson(response, 200, { user: auth.publicUser(auth.userFromRequest(request)) });
      if (!path.startsWith('/api/')) return serveStatic(request, response);
      const user = requireUser(request, response);
      if (!user) return;
      const configs = config.load();

      if (path === '/api/config' && request.method === 'GET') return sendJson(response, 200, configs);
      if (path === '/api/projects' && request.method === 'GET') return sendJson(response, 200, { projects: visibleProjects(user, configs.projects) });
      if (path === '/api/requirement-prefixes' && request.method === 'GET') {
        if (!requireAdmin(user, response)) return;
        const prefixes = configs.projects.flatMap((project) => configs.types.map((type) => ({ projectId: project.id, type, prefix: prefixFor(project.id, type, configs) })));
        return sendJson(response, 200, { prefixes });
      }
      if (path === '/api/requirement-prefixes' && request.method === 'PUT') {
        if (!requireAdmin(user, response)) return;
        const input = await readBody(request);
        if (!Array.isArray(input.prefixes)) return sendJson(response, 400, { error: 'Ожидается список префиксов' });
        const prefixes = input.prefixes.map((item) => ({ projectId: item.projectId, type: item.type, prefix: String(item.prefix || '').trim() })).filter((item) => item.prefix);
        const valid = prefixes.every((item) => configs.projects.some((project) => project.id === item.projectId) && configs.types.includes(item.type) && /^[A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё0-9_-]{0,19}$/.test(item.prefix));
        const unique = new Set(prefixes.map((item) => `${item.projectId}:${item.type}`)).size === prefixes.length;
        if (!valid || !unique) return sendJson(response, 400, { error: 'Проверьте проекты, типы и формат префиксов' });
        store.data.requirementPrefixes = prefixes; store.save(); return sendJson(response, 200, { prefixes });
      }

      if (path === '/api/users' && request.method === 'GET') {
        if (!requireAdmin(user, response)) return;
        return sendJson(response, 200, { users: store.data.users.map(auth.publicUser) });
      }
      if (path === '/api/users' && request.method === 'POST') {
        if (!requireAdmin(user, response)) return;
        const input = await readBody(request);
        const normalized = normalizeUser(input);
        if (!normalized.username || !normalized.name || !input.password || store.data.users.some((item) => item.username === normalized.username)) return sendJson(response, 400, { error: 'Заполните данные и используйте уникальный логин' });
        if (normalized.projectIds.some((id) => !configs.projects.some((project) => project.id === id))) return sendJson(response, 400, { error: 'Указан неизвестный проект' });
        const created = { id: randomUUID(), ...normalized, passwordHash: auth.hashPassword(input.password) };
        store.data.users.push(created); store.save(); return sendJson(response, 201, { user: auth.publicUser(created) });
      }
      const userMatch = path.match(/^\/api\/users\/([^/]+)$/);
      if (userMatch && ['PUT', 'DELETE'].includes(request.method)) {
        if (!requireAdmin(user, response)) return;
        const index = store.data.users.findIndex((item) => item.id === userMatch[1]);
        if (index < 0) return sendJson(response, 404, { error: 'Пользователь не найден' });
        if (request.method === 'DELETE') {
          if (store.data.users[index].id === user.id) return sendJson(response, 400, { error: 'Нельзя удалить текущего пользователя' });
          store.data.users.splice(index, 1); store.save(); return sendJson(response, 200, { ok: true });
        }
        const input = await readBody(request);
        const normalized = normalizeUser(input, store.data.users[index]);
        if (!normalized.username || !normalized.name || store.data.users.some((item, itemIndex) => itemIndex !== index && item.username === normalized.username)) return sendJson(response, 400, { error: 'Заполните данные и используйте уникальный логин' });
        if (normalized.projectIds.some((id) => !configs.projects.some((project) => project.id === id))) return sendJson(response, 400, { error: 'Указан неизвестный проект' });
        const updated = { ...store.data.users[index], ...normalized, ...(input.password ? { passwordHash: auth.hashPassword(input.password) } : {}) };
        store.data.users[index] = updated; store.save(); return sendJson(response, 200, { user: auth.publicUser(updated) });
      }

      if (path === '/api/requirements' && request.method === 'GET') {
        if (!user.permissions.read) return sendJson(response, 403, { error: 'Нет права просматривать требования' });
        const projectId = url.searchParams.get('projectId');
        const search = (url.searchParams.get('search') || '').toLowerCase();
        const filters = ['type', 'priority', 'status', 'complexity', 'release'].reduce((result, key) => { result[key] = url.searchParams.getAll(key); return result; }, {});
        const projectRequirements = visibleRequirements(user, store.data.requirements).filter((item) => !projectId || item.projectId === projectId);
        const requirements = projectRequirements.filter((item) => Object.entries(filters).every(([key, values]) => !values.length || values.includes(item[key])) && (!search || `${item.number} ${item.description} ${item.type}`.toLowerCase().includes(search)));
        const releases = [...new Set(projectRequirements.map((item) => item.release).filter(Boolean))].sort((first, second) => first.localeCompare(second, 'ru', { numeric: true }));
        return sendJson(response, 200, { requirements, releases });
      }
      const requirementMatch = path.match(/^\/api\/requirements\/([^/]+)$/);
      if (path === '/api/requirements' && request.method === 'POST') {
        const input = await readBody(request);
        if (!auth.can(user, 'create', input.projectId)) return sendJson(response, 403, { error: 'Нет права создавать требования в этом проекте' });
        if (!input.description || !validValue('types', input.type, configs) || !validValue('priorities', input.priority, configs) || !validValue('statuses', input.status, configs)) return sendJson(response, 400, { error: 'Заполните обязательные поля корректными значениями' });
        const project = configs.projects.find((item) => item.id === input.projectId);
        const requirement = { id: randomUUID(), number: nextRequirementNumber(project.id, input.type, configs), description: input.description, detailsMarkdown: input.detailsMarkdown || '', type: input.type, priority: input.priority, complexity: input.complexity || '', status: input.status, release: input.release || '', projectId: project.id };
        store.data.requirements.push(requirement); store.save(); return sendJson(response, 201, { requirement });
      }
      if (requirementMatch && ['PUT', 'DELETE'].includes(request.method)) {
        const index = store.data.requirements.findIndex((item) => item.id === requirementMatch[1]);
        if (index < 0) return sendJson(response, 404, { error: 'Требование не найдено' });
        const requirement = store.data.requirements[index];
        if (!auth.can(user, request.method === 'DELETE' ? 'delete' : 'update', requirement.projectId)) return sendJson(response, 403, { error: 'Недостаточно прав для этой операции' });
        if (request.method === 'DELETE') { store.data.requirements.splice(index, 1); store.save(); return sendJson(response, 200, { ok: true }); }
        const input = await readBody(request);
        const updated = { ...requirement, ...input, id: requirement.id, number: requirement.number, projectId: requirement.projectId };
        if (!input.description || !validValue('types', input.type, configs) || !validValue('priorities', input.priority, configs) || !validValue('statuses', input.status, configs)) return sendJson(response, 400, { error: 'Заполните обязательные поля корректными значениями' });
        store.data.requirements[index] = updated; store.save(); return sendJson(response, 200, { requirement: updated });
      }
      return sendJson(response, 404, { error: 'Маршрут не найден' });
    } catch (error) {
      return sendJson(response, error.status || 500, { error: error.status ? error.message : 'Внутренняя ошибка сервера' });
    }
  });

  return { listen: (callback) => server.listen(port, callback) };
}
