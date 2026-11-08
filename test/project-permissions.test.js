import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createAuth } from '../src/auth.js';
import { createApp } from '../src/server.js';
import { createStore } from '../src/store.js';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const projects = [
  { id: 'project-one', code: 'ONE', name: 'Project One' },
  { id: 'project-two', code: 'TWO', name: 'Project Two' }
];
const config = {
  load: () => ({
    projects,
    types: [{ id: 'functional', name: 'Функциональное' }],
    statuses: [{ id: 'new', name: 'Новая' }],
    priorities: [{ id: 'medium', name: 'Средняя' }],
    complexities: []
  })
};
const requirements = [
  { id: 'requirement-one', number: 'ONE-001', description: 'First project requirement', type: 'functional', priority: 'Средняя', status: 'Новая', projectId: 'project-one', version: 1 },
  { id: 'requirement-two', number: 'TWO-001', description: 'Second project requirement', type: 'functional', priority: 'Средняя', status: 'Новая', projectId: 'project-two', version: 1 }
];

async function createTestServer(t, initialUsers = []) {
  const directory = mkdtempSync(join(tmpdir(), 'rms-project-permissions-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const dataFile = join(directory, 'database.json');
  const passwordHash = createHash('sha256').update('test-password').digest('hex');
  const store = createStore(dataFile, {
    users: [
      { id: 'admin', username: 'admin', passwordHash, name: 'Admin', role: 'Администратор', projectIds: [], projectPermissions: {} },
      ...initialUsers.map((user) => ({ passwordHash, ...user }))
    ],
    groups: [],
    requirements
  });
  const auth = createAuth(store);
  const app = createApp({ port: 0, publicDir, store, config, auth });
  await new Promise((resolve) => app.listen(resolve));
  t.after(() => new Promise((resolve, reject) => app.close((error) => error ? reject(error) : resolve())));
  const baseUrl = `http://127.0.0.1:${app.address().port}`;

  async function login(username) {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: 'test-password' })
    });
    assert.equal(response.status, 200);
    return response.headers.get('set-cookie').split(';')[0];
  }

  async function request(cookie, path, { method = 'GET', body } = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const payload = response.status === 204 ? {} : await response.json();
    return { status: response.status, payload };
  }

  return { store, login, request };
}

test('migrates legacy global permissions to each assigned project', async (t) => {
  const server = await createTestServer(t, [
    {
      id: 'legacy',
      username: 'legacy',
      name: 'Legacy',
      role: 'Пользователь',
      projectIds: ['project-one', 'project-two'],
      permissions: { create: false, read: true, update: true, delete: false }
    }
  ]);

  const legacy = server.store.data.users.find((user) => user.id === 'legacy');
  assert.equal(legacy.permissions, undefined);
  assert.deepEqual(legacy.projectPermissions, {
    'project-one': { create: false, read: true, update: true, delete: false },
    'project-two': { create: false, read: true, update: true, delete: false }
  });
});

test('applies permissions independently for each project', async (t) => {
  const server = await createTestServer(t, [
    {
      id: 'limited',
      username: 'limited',
      name: 'Limited',
      role: 'Пользователь',
      projectIds: ['project-one', 'project-two'],
      projectPermissions: {
        'project-one': { create: false, read: true, update: true, delete: false },
        'project-two': { create: false, read: true, update: false, delete: false }
      }
    }
  ]);
  const limited = await server.login('limited');

  const firstProject = await server.request(limited, '/api/requirements?projectId=project-one');
  assert.equal(firstProject.status, 200);
  assert.deepEqual(firstProject.payload.requirements.map((item) => item.id), ['requirement-one']);

  const secondProject = await server.request(limited, '/api/requirements?projectId=project-two');
  assert.equal(secondProject.status, 200);
  assert.deepEqual(secondProject.payload.requirements.map((item) => item.id), ['requirement-two']);

  const updateAllowed = await server.request(limited, '/api/requirements/requirement-one', {
    method: 'PUT',
    body: { version: 1, description: 'Updated', type: 'functional', priority: 'medium', status: 'new' }
  });
  assert.equal(updateAllowed.status, 200);

  const updateDenied = await server.request(limited, '/api/requirements/requirement-two', {
    method: 'PUT',
    body: { version: 1, description: 'Denied', type: 'functional', priority: 'medium', status: 'new' }
  });
  assert.equal(updateDenied.status, 403);
});

test('returns and updates per-project permissions through the users API', async (t) => {
  const server = await createTestServer(t, [
    {
      id: 'limited',
      username: 'limited',
      name: 'Limited',
      role: 'Пользователь',
      projectIds: ['project-one'],
      projectPermissions: { 'project-one': { create: false, read: true, update: false, delete: false } }
    }
  ]);
  const admin = await server.login('admin');
  const limited = await server.login('limited');

  const listed = await server.request(admin, '/api/users');
  const user = listed.payload.users.find((item) => item.id === 'limited');
  assert.equal(user.permissions, undefined);
  assert.deepEqual(user.projectPermissions, { 'project-one': { create: false, read: true, update: false, delete: false } });

  const updated = await server.request(admin, '/api/users/limited', {
    method: 'PUT',
    body: {
      name: 'Limited',
      username: 'limited',
      role: 'Пользователь',
      projectIds: ['project-one', 'project-two'],
      projectPermissions: {
        'project-one': { create: false, read: true, update: false, delete: false },
        'project-two': { create: false, read: true, update: true, delete: false },
        'project-three': { create: true, read: true, update: true, delete: true }
      }
    }
  });
  assert.equal(updated.status, 200);
  assert.deepEqual(updated.payload.user.projectPermissions, {
    'project-one': { create: false, read: true, update: false, delete: false },
    'project-two': { create: false, read: true, update: true, delete: false }
  });

  const updateSecondProject = await server.request(limited, '/api/requirements/requirement-two', {
    method: 'PUT',
    body: { version: 1, description: 'Now allowed', type: 'functional', priority: 'medium', status: 'new' }
  });
  assert.equal(updateSecondProject.status, 200);
});

test('keeps create permission independent from read when listing project requirements', async (t) => {
  const server = await createTestServer(t, [
    {
      id: 'creator',
      username: 'creator',
      name: 'Creator',
      role: 'Пользователь',
      projectIds: ['project-two'],
      projectPermissions: { 'project-two': { create: true, read: false, update: false, delete: false } }
    }
  ]);
  const creator = await server.login('creator');

  const listed = await server.request(creator, '/api/requirements?projectId=project-two');
  assert.equal(listed.status, 200);
  assert.deepEqual(listed.payload.requirements, []);

  const created = await server.request(creator, '/api/requirements', {
    method: 'POST',
    body: { projectId: 'project-two', description: 'Created without read', type: 'functional', priority: 'medium', status: 'new' }
  });
  assert.equal(created.status, 201);
  assert.equal(created.payload.requirement.projectId, 'project-two');
});
