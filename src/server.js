import { createServer } from 'node:http';
import { extname, normalize, join, relative } from 'node:path';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const maxBodySize = 2 * 1024 * 1024;
const roles = ['Администратор', 'Пользователь'];
const permissionNames = ['create', 'read', 'update', 'delete'];
const identifierPattern = /^[A-Za-zА-Яа-яЁё0-9_-]{1,20}$/;
const nonPrintablePattern = /[\u0000-\u001F\u007F-\u009F]/;

export function createApp({ port, publicDir, store, config, auth }) {
  const baseConfigs = config.load();
  let migratedReferences = false;
  for (const [key, property] of Object.entries({ statuses: 'status', priorities: 'priority', complexities: 'complexity' })) {
    const nameToId = new Map(baseConfigs[key].filter((item) => typeof item !== 'string').map((item) => [item.name, item.id]));
    for (const requirement of store.data.requirements) {
      if (nameToId.has(requirement[property])) {
        requirement[property] = nameToId.get(requirement[property]);
        migratedReferences = true;
      }
    }
  }
  if (migratedReferences) store.save();
  let initializedManagedLists = false;
  if (!Array.isArray(store.data.projects)) {
    store.data.projects = baseConfigs.projects.map((project) => ({ ...project }));
    initializedManagedLists = true;
  }
  if (!Array.isArray(store.data.types)) {
    store.data.types = baseConfigs.types.map((type) => ({ ...type }));
    initializedManagedLists = true;
  }
  if (initializedManagedLists) store.save();

  function loadConfigs() {
    const configs = config.load();
    configs.projects = store.data.projects;
    configs.types = store.data.types;
    return configs;
  }

  function referenceConfig(configs) {
    return {
      statuses: configs.statuses,
      priorities: configs.priorities,
      complexities: configs.complexities
    };
  }

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
    return configs[name].some((item) => typeof item === 'string' ? item === value : item.id === value);
  }

  function validOptionalValue(name, value, configs) {
    return value === undefined || value === '' || validValue(name, value, configs);
  }

  function visibleProjects(user, projects) {
    return user.role === 'Администратор' ? projects : projects.filter((project) => user.projectIds.includes(project.id));
  }

  function projectHasContent(projectId) {
    return store.data.requirements.some((requirement) => requirement.projectId === projectId)
      || store.data.groups.some((group) => group.projectId === projectId);
  }

  function projectNameError(name, excludedId = null) {
    if (!name || name.length > 200 || nonPrintablePattern.test(name)) return 'Укажите название проекта длиной до 200 символов без непечатных символов';
    const normalized = name.toLocaleLowerCase('ru');
    if (store.data.projects.some((project) => project.id !== excludedId && project.name.toLocaleLowerCase('ru') === normalized)) return 'Проект с таким названием уже существует';
    return '';
  }

  function projectCodeError(code, excludedId = null) {
    if (!identifierPattern.test(code)) return 'Укажите код проекта длиной до 20 символов, состоящий из букв, цифр, «_» или «-»';
    const normalized = code.toLocaleLowerCase('ru');
    if (store.data.projects.some((project) => project.id !== excludedId && project.code.toLocaleLowerCase('ru') === normalized)) return 'Проект с таким кодом уже существует';
    return '';
  }

  function requirementTypeNameError(name, excludedId = null) {
    if (!name || name.length > 50) return 'Укажите название типа требования длиной до 50 символов';
    const normalized = name.toLocaleLowerCase('ru');
    if (store.data.types.some((type) => type.id !== excludedId && type.name.toLocaleLowerCase('ru') === normalized)) return 'Тип требования с таким названием уже существует';
    return '';
  }

  function visibleRequirements(user, requirements) {
    return requirements.filter((item) => auth.can(user, 'read', item.projectId));
  }

  function visibleGroups(user, groups) {
    return groups.filter((item) => auth.can(user, 'read', item.projectId));
  }

  function hasAnyProjectPermission(user, action) {
    return user.projectIds?.some((projectId) => auth.can(user, action, projectId)) || false;
  }

  function groupForProject(groupId, projectId) {
    if (!groupId) return null;
    return store.data.groups.find((group) => group.id === groupId && group.projectId === projectId) || null;
  }

  function hasGroupDescendant(groupId, candidateParentId) {
    let current = candidateParentId;
    while (current) {
      if (current === groupId) return true;
      current = store.data.groups.find((group) => group.id === current)?.parentId || null;
    }
    return false;
  }

  function normalizeUser(input, existing = {}) {
    const requestedProjectIds = Array.isArray(input.projectIds) ? input.projectIds : existing.projectIds || [];
    const projectIds = [...new Set(requestedProjectIds.map((projectId) => String(projectId)))];
    const sourcePermissions = input.projectPermissions && typeof input.projectPermissions === 'object'
      ? input.projectPermissions
      : existing.projectPermissions || {};
    const projectPermissions = Object.fromEntries(projectIds.map((projectId) => [
      projectId,
      Object.fromEntries(permissionNames.map((name) => [name, Boolean(sourcePermissions[projectId]?.[name])]))
    ]));
    return {
      ...existing,
      username: String(input.username || existing.username || '').trim(),
      name: String(input.name || existing.name || '').trim(),
      role: roles.includes(input.role) ? input.role : existing.role || 'Пользователь',
      projectIds,
      projectPermissions,
      permissions: undefined
    };
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

      if (path === '/api/auth/password' && request.method === 'POST') {
        const input = await readBody(request);
        if (!input || typeof input !== 'object' || typeof input.newPassword !== 'string' || typeof input.confirmPassword !== 'string' || !input.newPassword || !input.confirmPassword) {
          return sendJson(response, 400, { error: 'Заполните оба поля нового пароля' });
        }
        if (input.newPassword !== input.confirmPassword) return sendJson(response, 400, { error: 'Новые пароли не совпадают' });

        let result;
        try {
          result = auth.changePassword(request, user.id, input.newPassword);
        } catch (error) {
          console.error('Не удалось сохранить новый пароль пользователя:', error);
          return sendJson(response, 500, { error: 'Не удалось сохранить новый пароль' });
        }
        if (result.currentSessionTerminated) {
          response.writeHead(200, { 'Set-Cookie': 'session=; HttpOnly; Path=/; Max-Age=0', 'Content-Type': 'application/json; charset=utf-8' });
          return response.end(JSON.stringify(result));
        }
        return sendJson(response, 200, result);
      }

      const configs = loadConfigs();
      if (path === '/api/config' && request.method === 'GET') return sendJson(response, 200, referenceConfig(configs));
      if (path === '/api/projects' && request.method === 'GET') return sendJson(response, 200, { projects: visibleProjects(user, configs.projects) });
      if (path === '/api/projects' && request.method === 'POST') {
        if (!requireAdmin(user, response)) return;
        const input = await readBody(request);
        const name = String(input.name || '').trim();
        const code = String(input.code || '').trim();
        const error = projectNameError(name) || projectCodeError(code);
        if (error) return sendJson(response, 400, { error });
        const project = { id: randomUUID(), name, code };
        store.data.projects.push(project);
        store.save();
        return sendJson(response, 201, { project });
      }
      const projectMatch = path.match(/^\/api\/projects\/([^/]+)$/);
      if (projectMatch && ['PUT', 'DELETE'].includes(request.method)) {
        if (!requireAdmin(user, response)) return;
        const index = store.data.projects.findIndex((project) => project.id === projectMatch[1]);
        if (index < 0) return sendJson(response, 404, { error: 'Проект не найден' });
        const project = store.data.projects[index];
        if (request.method === 'DELETE') {
          if (projectHasContent(project.id)) return sendJson(response, 409, { error: 'Нельзя удалить проект, пока в нём есть требования или группы' });
          const previousProjects = store.data.projects;
          const previousUsers = store.data.users;
          const previousPrefixes = store.data.requirementPrefixes;
          store.data.projects = previousProjects.filter((item) => item.id !== project.id);
          store.data.users = previousUsers.map((item) => {
            const projectPermissions = { ...(item.projectPermissions || {}) };
            delete projectPermissions[project.id];
            return { ...item, projectIds: (item.projectIds || []).filter((projectId) => projectId !== project.id), projectPermissions };
          });
          store.data.requirementPrefixes = previousPrefixes.filter((item) => item.projectId !== project.id);
          try {
            store.save();
          } catch (saveError) {
            store.data.projects = previousProjects;
            store.data.users = previousUsers;
            store.data.requirementPrefixes = previousPrefixes;
            throw saveError;
          }
          return sendJson(response, 200, { ok: true });
        }
        const input = await readBody(request);
        const name = String(input.name || '').trim();
        const nameError = projectNameError(name, project.id);
        if (nameError) return sendJson(response, 400, { error: nameError });
        const code = input.code === undefined ? project.code : String(input.code || '').trim();
        if (code !== project.code) {
          if (projectHasContent(project.id)) return sendJson(response, 409, { error: 'Нельзя изменить код проекта, пока в нём есть требования или группы' });
          const codeError = projectCodeError(code, project.id);
          if (codeError) return sendJson(response, 400, { error: codeError });
        }
        const updated = { ...project, name, code };
        store.data.projects[index] = updated;
        store.save();
        return sendJson(response, 200, { project: updated });
      }
      if (path === '/api/requirement-types' && request.method === 'GET') {
        return sendJson(response, 200, { types: store.data.types });
      }
      if (path === '/api/requirement-types' && request.method === 'POST') {
        if (!requireAdmin(user, response)) return;
        const input = await readBody(request);
        const name = String(input.name || '').trim();
        const error = requirementTypeNameError(name);
        if (error) return sendJson(response, 400, { error });
        const type = { id: randomUUID(), name };
        store.data.types.push(type);
        store.save();
        return sendJson(response, 201, { type });
      }
      const requirementTypeMatch = path.match(/^\/api\/requirement-types\/([^/]+)$/);
      if (requirementTypeMatch && ['PUT', 'DELETE'].includes(request.method)) {
        if (!requireAdmin(user, response)) return;
        const index = store.data.types.findIndex((type) => type.id === requirementTypeMatch[1]);
        if (index < 0) return sendJson(response, 404, { error: 'Тип требования не найден' });
        const type = store.data.types[index];
        if (request.method === 'DELETE') {
          if (store.data.requirements.some((requirement) => requirement.type === type.id)) return sendJson(response, 409, { error: 'Тип требования используется требованиями и не может быть удалён' });
          store.data.types.splice(index, 1);
          store.data.requirementPrefixes = store.data.requirementPrefixes.filter((item) => item.type !== type.id);
          store.save();
          return sendJson(response, 200, { ok: true });
        }
        const input = await readBody(request);
        const name = String(input.name || '').trim();
        const error = requirementTypeNameError(name, type.id);
        if (error) return sendJson(response, 400, { error });
        const updated = { ...type, name };
        store.data.types[index] = updated;
        store.save();
        return sendJson(response, 200, { type: updated });
      }
      if (path === '/api/groups' && request.method === 'GET') {
        const projectId = url.searchParams.get('projectId');
        if (projectId && !auth.can(user, 'read', projectId)) return sendJson(response, 200, { groups: [] });
        if (!projectId && user.role !== 'Администратор' && !hasAnyProjectPermission(user, 'read')) return sendJson(response, 403, { error: 'Нет права просматривать группы' });
        const groups = visibleGroups(user, store.data.groups).filter((group) => !projectId || group.projectId === projectId);
        return sendJson(response, 200, { groups });
      }
      if (path === '/api/groups' && request.method === 'POST') {
        const input = await readBody(request);
        if (!auth.can(user, 'create', input.projectId)) return sendJson(response, 403, { error: 'Нет права создавать группы в этом проекте' });
        if (!configs.projects.some((project) => project.id === input.projectId)) return sendJson(response, 400, { error: 'Указан неизвестный проект' });
        const name = String(input.name || '').trim();
        const parentId = input.parentId || null;
        if (!name || name.length > 200) return sendJson(response, 400, { error: 'Укажите название группы длиной до 200 символов' });
        if (parentId && !groupForProject(parentId, input.projectId)) return sendJson(response, 400, { error: 'Указана неизвестная родительская группа' });
        const group = { id: randomUUID(), name, projectId: input.projectId, parentId };
        store.data.groups.push(group); store.save(); return sendJson(response, 201, { group });
      }
      const groupMatch = path.match(/^\/api\/groups\/([^/]+)$/);
      if (groupMatch) {
        const group = store.data.groups.find((g) => g.id === groupMatch[1]);
        if (!group) return sendJson(response, 404, { error: 'Группа не найдена' });
        if (!auth.can(user, 'read', group.projectId)) return sendJson(response, 403, { error: 'Нет права просматривать группу' });
        if (request.method === 'GET') return sendJson(response, 200, { group });
        if (request.method === 'PUT' || request.method === 'DELETE') {
          if (!auth.can(user, request.method === 'DELETE' ? 'delete' : 'update', group.projectId)) return sendJson(response, 403, { error: 'Недостаточно прав для этой операции' });
          if (request.method === 'DELETE') {
            if (store.data.requirements.some((item) => item.groupId === group.id)) return sendJson(response, 409, { error: 'Нельзя удалить группу, пока в ней есть требования' });
            if (store.data.groups.some((item) => item.parentId === group.id)) return sendJson(response, 409, { error: 'Сначала удалите дочерние группы' });
            store.data.groups.splice(store.data.groups.indexOf(group), 1); store.save(); return sendJson(response, 200, { ok: true });
          }
          const input = await readBody(request);
          const name = String(input.name || '').trim();
          const parentId = input.parentId || null;
          if (!name || name.length > 200) return sendJson(response, 400, { error: 'Укажите название группы длиной до 200 символов' });
          if (parentId && (!groupForProject(parentId, group.projectId) || parentId === group.id || hasGroupDescendant(group.id, parentId))) return sendJson(response, 400, { error: 'Некорректная родительская группа' });
          const updated = { ...group, name, parentId };
          store.data.groups[store.data.groups.indexOf(group)] = updated; store.save(); return sendJson(response, 200, { group: updated });
        }
      }
      if (path === '/api/requirement-prefixes' && request.method === 'GET') {
        if (!requireAdmin(user, response)) return;
        const prefixes = configs.projects.flatMap((project) => configs.types.map(({ id }) => ({ projectId: project.id, type: id, prefix: prefixFor(project.id, id, configs) })));
        return sendJson(response, 200, { prefixes });
      }
      if (path === '/api/requirement-prefixes' && request.method === 'PUT') {
        if (!requireAdmin(user, response)) return;
        const input = await readBody(request);
        if (!Array.isArray(input.prefixes)) return sendJson(response, 400, { error: 'Ожидается список префиксов' });
        const prefixes = input.prefixes.map((item) => ({ projectId: item.projectId, type: item.type, prefix: String(item.prefix || '').trim() })).filter((item) => item.prefix);
        const valid = prefixes.every((item) => configs.projects.some((project) => project.id === item.projectId) && validValue('types', item.type, configs) && identifierPattern.test(item.prefix));
        const unique = new Set(prefixes.map((item) => `${item.projectId}:${item.type}`)).size === prefixes.length;
        if (!valid || !unique) return sendJson(response, 400, { error: 'Проверьте проекты, типы и формат префиксов' });
        store.data.requirementPrefixes = prefixes; store.save(); return sendJson(response, 200, { prefixes });
      }

      if (path === '/api/requirement-link-types' && request.method === 'GET') {
        if (!requireAdmin(user, response)) return;
        return sendJson(response, 200, { types: store.data.requirementLinkTypes });
      }
      if (path === '/api/requirement-link-types' && request.method === 'POST') {
        if (!requireAdmin(user, response)) return;
        const input = await readBody(request);
        const name = String(input.name || '').trim();
        if (!name || typeof input.directed !== 'boolean') return sendJson(response, 400, { error: 'Укажите название и направленность типа связи' });
        if (store.data.requirementLinkTypes.some((item) => item.name.toLocaleLowerCase('ru') === name.toLocaleLowerCase('ru'))) return sendJson(response, 409, { error: 'Тип связи с таким названием уже существует' });
        const type = { id: randomUUID(), name, directed: input.directed };
        store.data.requirementLinkTypes.push(type);
        store.save();
        return sendJson(response, 201, { type });
      }
      const linkTypeMatch = path.match(/^\/api\/requirement-link-types\/([^/]+)$/);
      if (linkTypeMatch && ['PUT', 'DELETE'].includes(request.method)) {
        if (!requireAdmin(user, response)) return;
        const index = store.data.requirementLinkTypes.findIndex((item) => item.id === linkTypeMatch[1]);
        if (index < 0) return sendJson(response, 404, { error: 'Тип связи не найден' });
        if (request.method === 'DELETE') {
          const typeId = store.data.requirementLinkTypes[index].id;
          const removedLinks = store.data.requirementLinks.filter((item) => item.typeId === typeId).length;
          store.data.requirementLinks = store.data.requirementLinks.filter((item) => item.typeId !== typeId);
          store.data.requirementLinkTypes.splice(index, 1);
          store.save();
          return sendJson(response, 200, { ok: true, removedLinks });
        }
        const input = await readBody(request);
        const name = String(input.name || '').trim();
        if (!name || typeof input.directed !== 'boolean') return sendJson(response, 400, { error: 'Укажите название и направленность типа связи' });
        if (store.data.requirementLinkTypes.some((item, itemIndex) => itemIndex !== index && item.name.toLocaleLowerCase('ru') === name.toLocaleLowerCase('ru'))) return sendJson(response, 409, { error: 'Тип связи с таким названием уже существует' });
        const type = { ...store.data.requirementLinkTypes[index], name, directed: input.directed };
        store.data.requirementLinkTypes[index] = type;
        store.save();
        return sendJson(response, 200, { type });
      }

      const requirementLinksMatch = path.match(/^\/api\/requirements\/([^/]+)\/links$/);
      const requirementLinkOptionsMatch = path.match(/^\/api\/requirements\/([^/]+)\/link-options$/);
      if (requirementLinksMatch && request.method === 'GET') {
        const requirement = store.data.requirements.find((item) => item.id === requirementLinksMatch[1]);
        if (!requirement) return sendJson(response, 404, { error: 'Требование не найдено' });
        if (!auth.can(user, 'read', requirement.projectId)) return sendJson(response, 403, { error: 'Нет права просматривать связи требований в этом проекте' });
        const links = store.data.requirementLinks
          .filter((item) => item.requirementAId === requirement.id || item.requirementBId === requirement.id)
          .map((item) => ({
            ...item,
            type: store.data.requirementLinkTypes.find((type) => type.id === item.typeId) || null,
            requirementA: store.data.requirements.find((candidate) => candidate.id === item.requirementAId) || null,
            requirementB: store.data.requirements.find((candidate) => candidate.id === item.requirementBId) || null
          }));
        return sendJson(response, 200, { links });
      }
      if (requirementLinkOptionsMatch && request.method === 'GET') {
        const requirement = store.data.requirements.find((item) => item.id === requirementLinkOptionsMatch[1]);
        if (!requirement) return sendJson(response, 404, { error: 'Требование не найдено' });
        if (!auth.can(user, 'read', requirement.projectId) || !auth.can(user, 'update', requirement.projectId)) return sendJson(response, 403, { error: 'Для создания связей нужны права чтения и изменения в проекте' });
        return sendJson(response, 200, { types: store.data.requirementLinkTypes });
      }
      if (path === '/api/requirement-link-options' && request.method === 'GET') {
        const projectId = url.searchParams.get('projectId');
        if (!configs.projects.some((project) => project.id === projectId)) return sendJson(response, 400, { error: 'Указан неизвестный проект' });
        if (!auth.can(user, 'create', projectId) || !auth.can(user, 'read', projectId)) return sendJson(response, 403, { error: 'Для выбора связанных требований нужны права создания и чтения в проекте' });
        return sendJson(response, 200, { types: store.data.requirementLinkTypes });
      }
      if (path === '/api/requirement-links' && request.method === 'POST') {
        const input = await readBody(request);
        const requirementA = store.data.requirements.find((item) => item.id === input.requirementAId);
        const requirementB = store.data.requirements.find((item) => item.id === input.requirementBId);
        if (!requirementA || !requirementB) return sendJson(response, 404, { error: 'Одно из требований не найдено' });
        if (!auth.can(user, 'read', requirementA.projectId) || !auth.can(user, 'update', requirementA.projectId)) return sendJson(response, 403, { error: 'Для создания связей нужны права чтения и изменения в проекте' });
        if (requirementA.id === requirementB.id) return sendJson(response, 400, { error: 'Нельзя связать требование с самим собой' });
        if (requirementA.projectId !== requirementB.projectId) return sendJson(response, 400, { error: 'Связывать можно только требования одного проекта' });
        const type = store.data.requirementLinkTypes.find((item) => item.id === input.typeId);
        if (!type) return sendJson(response, 400, { error: 'Выберите существующий тип связи' });
        const duplicate = store.data.requirementLinks.some((item) =>
          (item.requirementAId === requirementA.id && item.requirementBId === requirementB.id) ||
          (item.requirementAId === requirementB.id && item.requirementBId === requirementA.id));
        if (duplicate) return sendJson(response, 409, { error: 'Эти требования уже связаны' });
        const link = {
          id: randomUUID(),
          projectId: requirementA.projectId,
          requirementAId: requirementA.id,
          requirementBId: requirementB.id,
          typeId: type.id
        };
        store.data.requirementLinks.push(link);
        store.save();
        return sendJson(response, 201, { link: { ...link, type, requirementA, requirementB } });
      }
      const requirementLinkMatch = path.match(/^\/api\/requirement-links\/([^/]+)$/);
      if (requirementLinkMatch && request.method === 'DELETE') {
        const index = store.data.requirementLinks.findIndex((item) => item.id === requirementLinkMatch[1]);
        if (index < 0) return sendJson(response, 404, { error: 'Связь не найдена' });
        const link = store.data.requirementLinks[index];
        if (!auth.can(user, 'read', link.projectId) || !auth.can(user, 'update', link.projectId)) return sendJson(response, 403, { error: 'Для удаления связей нужны права чтения и изменения в проекте' });
        store.data.requirementLinks.splice(index, 1);
        store.save();
        return sendJson(response, 200, { ok: true });
      }

      if (path === '/api/requirements/search' && request.method === 'GET') {
        const projectId = url.searchParams.get('projectId');
        const sourceId = url.searchParams.get('excludeId');
        if (!configs.projects.some((project) => project.id === projectId)) return sendJson(response, 400, { error: 'Указан неизвестный проект' });
        if (sourceId) {
          const source = store.data.requirements.find((item) => item.id === sourceId);
          if (!source || source.projectId !== projectId) return sendJson(response, 400, { error: 'Указано некорректное требование для поиска' });
          if (!auth.can(user, 'read', projectId) || !auth.can(user, 'update', projectId)) return sendJson(response, 403, { error: 'Для поиска требования для связи нужны права чтения и изменения в проекте' });
        } else if (!auth.can(user, 'create', projectId) || !auth.can(user, 'read', projectId)) {
          return sendJson(response, 403, { error: 'Для поиска требований при создании нужны права создания и чтения в проекте' });
        }
        const search = (url.searchParams.get('search') || '').trim().toLocaleLowerCase('ru');
        if (!search) return sendJson(response, 400, { error: 'Укажите поисковый запрос' });
        const requirements = store.data.requirements
          .filter((item) => item.projectId === projectId && item.id !== sourceId)
          .filter((item) => `${item.number} ${item.description} ${configs.types.find((type) => type.id === item.type)?.name || item.type} ${item.type}`.toLocaleLowerCase('ru').includes(search))
          .slice(0, 20)
          .map(({ id, number, description, type }) => ({ id, number, description, type }));
        return sendJson(response, 200, { requirements });
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
        const projectId = url.searchParams.get('projectId');
        if (projectId && !auth.can(user, 'read', projectId)) return sendJson(response, 200, { requirements: [], releases: [] });
        if (!projectId && user.role !== 'Администратор' && !hasAnyProjectPermission(user, 'read')) return sendJson(response, 403, { error: 'Нет права просматривать требования' });
        const search = (url.searchParams.get('search') || '').toLowerCase();
        const filters = ['type', 'priority', 'status', 'complexity', 'release'].reduce((result, key) => { result[key] = url.searchParams.getAll(key); return result; }, {});
        const projectRequirements = visibleRequirements(user, store.data.requirements).filter((item) => !projectId || item.projectId === projectId);
        const requirements = projectRequirements.filter((item) => Object.entries(filters).every(([key, values]) => !values.length || values.includes(item[key])) && (!search || `${item.number} ${item.description} ${configs.types.find((type) => type.id === item.type)?.name || item.type} ${item.type}`.toLowerCase().includes(search)))
          .map((item) => ({ ...item, version: item.version ?? 1 }));
        const releases = [...new Set(projectRequirements.map((item) => item.release).filter(Boolean))].sort((first, second) => first.localeCompare(second, 'ru', { numeric: true }));
        return sendJson(response, 200, { requirements, releases });
      }
      const requirementMatch = path.match(/^\/api\/requirements\/([^/]+)$/);
      if (path === '/api/requirements' && request.method === 'POST') {
        const input = await readBody(request);
        if (!auth.can(user, 'create', input.projectId)) return sendJson(response, 403, { error: 'Нет права создавать требования в этом проекте' });
        if (!input.description || !validValue('types', input.type, configs) || !validValue('priorities', input.priority, configs) || !validValue('statuses', input.status, configs) || !validOptionalValue('complexities', input.complexity, configs)) return sendJson(response, 400, { error: 'Заполните обязательные поля корректными значениями' });
        const project = configs.projects.find((item) => item.id === input.projectId);
        if (!project) return sendJson(response, 400, { error: 'Указан неизвестный проект' });
        if (input.groupId && !groupForProject(input.groupId, project.id)) return sendJson(response, 400, { error: 'Указана неизвестная группа' });
        const requestedLinks = input.links === undefined ? [] : input.links;
        if (!Array.isArray(requestedLinks)) return sendJson(response, 400, { error: 'Ожидается список связанных требований' });
        if (requestedLinks.length && !auth.can(user, 'read', project.id)) return sendJson(response, 403, { error: 'Для выбора связанных требований требуется право чтения в проекте' });
        const linkedRequirementIds = new Set();
        const linksToCreate = [];
        for (const requestedLink of requestedLinks) {
          if (!requestedLink || typeof requestedLink.requirementId !== 'string' || typeof requestedLink.typeId !== 'string') return sendJson(response, 400, { error: 'Укажите требование и тип для каждой связи' });
          if (linkedRequirementIds.has(requestedLink.requirementId)) return sendJson(response, 400, { error: 'Одно требование нельзя указать для связи более одного раза' });
          linkedRequirementIds.add(requestedLink.requirementId);
          const linkedRequirement = store.data.requirements.find((item) => item.id === requestedLink.requirementId);
          if (!linkedRequirement || linkedRequirement.projectId !== project.id) return sendJson(response, 400, { error: 'Связывать можно только существующие требования активного проекта' });
          const linkType = store.data.requirementLinkTypes.find((item) => item.id === requestedLink.typeId);
          if (!linkType) return sendJson(response, 400, { error: 'Выберите существующий тип связи' });
          linksToCreate.push({
            id: randomUUID(),
            projectId: project.id,
            requirementAId: null,
            requirementBId: linkedRequirement.id,
            typeId: linkType.id
          });
        }
        const requirement = { id: randomUUID(), number: nextRequirementNumber(project.id, input.type, configs), description: input.description, detailsMarkdown: input.detailsMarkdown || '', type: input.type, priority: input.priority, complexity: input.complexity || '', status: input.status, release: input.release || '', projectId: project.id, groupId: input.groupId || null, version: 1 };
        for (const link of linksToCreate) link.requirementAId = requirement.id;
        const previousRequirements = store.data.requirements;
        const previousLinks = store.data.requirementLinks;
        store.data.requirements = [...previousRequirements, requirement];
        store.data.requirementLinks = [...previousLinks, ...linksToCreate];
        try {
          store.save();
        } catch (error) {
          store.data.requirements = previousRequirements;
          store.data.requirementLinks = previousLinks;
          throw error;
        }
        return sendJson(response, 201, { requirement, links: linksToCreate });
      }
      if (requirementMatch && ['PUT', 'DELETE'].includes(request.method)) {
        const index = store.data.requirements.findIndex((item) => item.id === requirementMatch[1]);
        if (index < 0) return sendJson(response, 404, { error: 'Требование не найдено' });
        const requirement = store.data.requirements[index];
        const requiredPermission = request.method === 'DELETE' ? 'delete' : 'update';
        if (!auth.can(user, 'read', requirement.projectId) || !auth.can(user, requiredPermission, requirement.projectId)) {
          return sendJson(response, 403, { error: `Для этой операции нужны права read и ${requiredPermission} в проекте` });
        }
        if (request.method === 'DELETE') {
          const previousRequirements = store.data.requirements;
          const previousLinks = store.data.requirementLinks;
          store.data.requirements = previousRequirements.filter((item) => item.id !== requirement.id);
          store.data.requirementLinks = previousLinks.filter((item) => item.requirementAId !== requirement.id && item.requirementBId !== requirement.id);
          try {
            store.save();
          } catch (error) {
            store.data.requirements = previousRequirements;
            store.data.requirementLinks = previousLinks;
            throw error;
          }
          return sendJson(response, 200, { ok: true });
        }
        const input = await readBody(request);
        if (!Number.isSafeInteger(input.version) || input.version < 1) return sendJson(response, 400, { error: 'Укажите актуальную версию требования' });
        const currentVersion = requirement.version ?? 1;
        if (input.version !== currentVersion) return sendJson(response, 409, { error: 'Требование изменено другим пользователем. Обновите данные и повторите изменение' });
        const updated = { ...requirement, ...input, id: requirement.id, number: requirement.number, projectId: requirement.projectId, version: currentVersion + 1 };
        if (!input.description || !validValue('types', input.type, configs) || !validValue('priorities', input.priority, configs) || !validValue('statuses', input.status, configs) || !validOptionalValue('complexities', input.complexity, configs)) return sendJson(response, 400, { error: 'Заполните обязательные поля корректными значениями' });
        if (input.groupId && !groupForProject(input.groupId, requirement.projectId)) return sendJson(response, 400, { error: 'Указана неизвестная группа' });
        updated.groupId = input.groupId || null;
        store.data.requirements[index] = updated;
        try {
          store.save();
        } catch (error) {
          store.data.requirements[index] = requirement;
          throw error;
        }
        return sendJson(response, 200, { requirement: updated });
      }
      return sendJson(response, 404, { error: 'Маршрут не найден' });
    } catch (error) {
      return sendJson(response, error.status || 500, { error: error.status ? error.message : 'Внутренняя ошибка сервера' });
    }
  });

  return {
    listen: (callback) => server.listen(port, callback),
    close: (callback) => server.close(callback),
    address: () => server.address()
  };
}
