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
    types: [
      { id: 'functional', name: 'Функциональное' },
      { id: 'security', name: 'Безопасность' }
    ],
    statuses: ['Новая'],
    priorities: ['Средняя'],
    complexities: []
  })
};

async function createTestServer(t) {
  const directory = mkdtempSync(join(tmpdir(), 'rms-requirement-types-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const dataFile = join(directory, 'database.json');
  const passwordHash = createHash('sha256').update('test-password').digest('hex');
  const store = createStore(dataFile, {
    users: [
      { id: 'admin', username: 'admin', passwordHash, name: 'Admin', role: 'Администратор', projectIds: [], projectPermissions: {} },
      { id: 'member', username: 'member', passwordHash, name: 'Member', role: 'Пользователь', projectIds: ['project-one'], projectPermissions: { 'project-one': { create: true, read: true, update: true, delete: true } } }
    ],
    requirements: [
      { id: 'requirement-one', number: 'ONE-001', description: 'Requirement', type: 'functional', priority: 'Средняя', status: 'Новая', projectId: 'project-one', version: 1 }
    ],
    requirementPrefixes: [
      { projectId: 'project-one', type: 'functional', prefix: 'ONE-F' },
      { projectId: 'project-one', type: 'security', prefix: 'ONE-S' },
      { projectId: 'project-two', type: 'security', prefix: 'TWO-S' }
    ]
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

test('creates requirement types and validates names', async (t) => {
  const server = await createTestServer(t);
  const admin = await server.login('admin');
  const member = await server.login('member');

  const config = await server.request(member, '/api/config');
  assert.equal(config.status, 200);
  assert.deepEqual(Object.keys(config.payload).sort(), ['complexities', 'priorities', 'statuses']);

  const listed = await server.request(admin, '/api/requirement-types');
  assert.equal(listed.status, 200);
  assert.deepEqual(listed.payload.types.map((type) => type.id), ['functional', 'security']);
  const memberTypes = await server.request(member, '/api/requirement-types');
  assert.equal(memberTypes.status, 200);
  assert.deepEqual(memberTypes.payload, listed.payload);

  const created = await server.request(admin, '/api/requirement-types', {
    method: 'POST',
    body: { name: 'Новый тип' }
  });
  assert.equal(created.status, 201);
  assert.equal(created.payload.type.name, 'Новый тип');

  const duplicate = await server.request(admin, '/api/requirement-types', {
    method: 'POST',
    body: { name: 'новый ТИП' }
  });
  assert.equal(duplicate.status, 400);

  for (const name of ['', 'Т'.repeat(51)]) {
    const invalid = await server.request(admin, '/api/requirement-types', {
      method: 'POST',
      body: { name }
    });
    assert.equal(invalid.status, 400, `name ${JSON.stringify(name)} must be rejected`);
  }

  assert.equal((await server.request(member, '/api/requirement-types', { method: 'POST', body: { name: 'Member Type' } })).status, 403);
  assert.equal((await server.request(member, '/api/requirement-types/functional', { method: 'PUT', body: { name: 'Member Edit' } })).status, 403);
});

test('renames types in use without changing numbering or prefixes', async (t) => {
  const server = await createTestServer(t);
  const admin = await server.login('admin');

  const renamed = await server.request(admin, '/api/requirement-types/functional', {
    method: 'PUT',
    body: { name: 'Функциональное требование' }
  });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.payload.type.id, 'functional');
  assert.equal(renamed.payload.type.name, 'Функциональное требование');

  const requirement = server.store.data.requirements.find((item) => item.id === 'requirement-one');
  assert.equal(requirement.type, 'functional');
  assert.equal(requirement.number, 'ONE-001');
  assert.deepEqual(server.store.data.requirementPrefixes.find((item) => item.type === 'functional'), {
    projectId: 'project-one',
    type: 'functional',
    prefix: 'ONE-F'
  });

  const duplicate = await server.request(admin, '/api/requirement-types/functional', {
    method: 'PUT',
    body: { name: 'безопасность' }
  });
  assert.equal(duplicate.status, 400);

  const invalid = await server.request(admin, '/api/requirement-types/functional', {
    method: 'PUT',
    body: { name: 'Т'.repeat(51) }
  });
  assert.equal(invalid.status, 400);
  assert.equal(server.store.data.types.find((type) => type.id === 'functional').name, 'Функциональное требование');
});

test('deletes only unused types and removes their prefix settings', async (t) => {
  const server = await createTestServer(t);
  const admin = await server.login('admin');
  const member = await server.login('member');

  assert.equal((await server.request(admin, '/api/requirement-types/functional', { method: 'DELETE' })).status, 409);
  assert.equal((await server.request(member, '/api/requirement-types/security', { method: 'DELETE' })).status, 403);

  const deleted = await server.request(admin, '/api/requirement-types/security', { method: 'DELETE' });
  assert.equal(deleted.status, 200);
  assert.equal(server.store.data.types.some((type) => type.id === 'security'), false);
  assert.deepEqual(server.store.data.requirementPrefixes, [
    { projectId: 'project-one', type: 'functional', prefix: 'ONE-F' }
  ]);
  assert.equal(server.store.data.requirements.length, 1);

  assert.equal((await server.request(admin, '/api/requirement-types/unknown', { method: 'DELETE' })).status, 404);
});
