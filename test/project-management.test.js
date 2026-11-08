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
  { id: 'project-two', code: 'TWO', name: 'Project Two' },
  { id: 'project-empty', code: 'EMPTY', name: 'Empty Project' }
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

async function createTestServer(t) {
  const directory = mkdtempSync(join(tmpdir(), 'rms-project-management-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const dataFile = join(directory, 'database.json');
  const passwordHash = createHash('sha256').update('test-password').digest('hex');
  const store = createStore(dataFile, {
    users: [
      { id: 'admin', username: 'admin', passwordHash, name: 'Admin', role: 'Администратор', projectIds: [], projectPermissions: {} },
      {
        id: 'member',
        username: 'member',
        passwordHash,
        name: 'Member',
        role: 'Пользователь',
        projectIds: ['project-one', 'project-empty'],
        projectPermissions: {
          'project-one': { create: true, read: true, update: true, delete: true },
          'project-empty': { create: true, read: true, update: true, delete: true }
        }
      }
    ],
    requirements: [
      { id: 'requirement-one', number: 'ONE-001', description: 'Requirement', type: 'functional', priority: 'Средняя', status: 'Новая', projectId: 'project-one', version: 1 }
    ],
    groups: [
      { id: 'group-two', name: 'Group', projectId: 'project-two', parentId: null }
    ],
    requirementPrefixes: [
      { projectId: 'project-one', type: 'functional', prefix: 'ONE-F' },
      { projectId: 'project-empty', type: 'functional', prefix: 'EMPTY-F' }
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

test('creates projects and validates name and code', async (t) => {
  const server = await createTestServer(t);
  const admin = await server.login('admin');
  const member = await server.login('member');

  const created = await server.request(admin, '/api/projects', {
    method: 'POST',
    body: { name: 'New Project', code: 'New_Project-1' }
  });
  assert.equal(created.status, 201);
  assert.equal(created.payload.project.name, 'New Project');
  assert.equal(created.payload.project.code, 'New_Project-1');

  const duplicateName = await server.request(admin, '/api/projects', {
    method: 'POST',
    body: { name: 'new project', code: 'OTHER' }
  });
  assert.equal(duplicateName.status, 400);

  const duplicateCode = await server.request(admin, '/api/projects', {
    method: 'POST',
    body: { name: 'Other Project', code: 'new_project-1' }
  });
  assert.equal(duplicateCode.status, 400);

  for (const code of ['bad code', 'A'.repeat(21), 'код!']) {
    const invalidCode = await server.request(admin, '/api/projects', {
      method: 'POST',
      body: { name: `Project ${code}`, code }
    });
    assert.equal(invalidCode.status, 400, `code ${code} must be rejected`);
  }

  for (const name of ['', 'N'.repeat(201), 'Bad\nName']) {
    const invalidName = await server.request(admin, '/api/projects', {
      method: 'POST',
      body: { name, code: 'VALID' }
    });
    assert.equal(invalidName.status, 400, `name ${JSON.stringify(name)} must be rejected`);
  }

  const forbidden = await server.request(member, '/api/projects', {
    method: 'POST',
    body: { name: 'Member Project', code: 'MEMBER' }
  });
  assert.equal(forbidden.status, 403);
});

test('renames projects regardless of content and changes codes only for empty projects', async (t) => {
  const server = await createTestServer(t);
  const admin = await server.login('admin');
  const member = await server.login('member');

  const renamed = await server.request(admin, '/api/projects/project-one', {
    method: 'PUT',
    body: { name: 'Renamed One', code: 'ONE' }
  });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.payload.project.name, 'Renamed One');
  assert.equal(renamed.payload.project.code, 'ONE');

  const codeWithRequirements = await server.request(admin, '/api/projects/project-one', {
    method: 'PUT',
    body: { name: 'Another Name', code: 'NEW' }
  });
  assert.equal(codeWithRequirements.status, 409);
  assert.equal(server.store.data.projects.find((project) => project.id === 'project-one').name, 'Renamed One');

  const codeWithGroups = await server.request(admin, '/api/projects/project-two', {
    method: 'PUT',
    body: { name: 'Project Two', code: 'NEW' }
  });
  assert.equal(codeWithGroups.status, 409);

  const changedCode = await server.request(admin, '/api/projects/project-empty', {
    method: 'PUT',
    body: { name: 'Still Empty', code: 'EMP2' }
  });
  assert.equal(changedCode.status, 200);
  assert.equal(changedCode.payload.project.code, 'EMP2');

  const invalidCode = await server.request(admin, '/api/projects/project-empty', {
    method: 'PUT',
    body: { name: 'Still Empty', code: 'bad code' }
  });
  assert.equal(invalidCode.status, 400);
  assert.equal(server.store.data.projects.find((project) => project.id === 'project-empty').code, 'EMP2');

  const duplicateCode = await server.request(admin, '/api/projects/project-empty', {
    method: 'PUT',
    body: { name: 'Still Empty', code: 'one' }
  });
  assert.equal(duplicateCode.status, 400);

  const duplicateName = await server.request(admin, '/api/projects/project-empty', {
    method: 'PUT',
    body: { name: 'renamed one', code: 'EMP2' }
  });
  assert.equal(duplicateName.status, 400);

  const forbidden = await server.request(member, '/api/projects/project-empty', {
    method: 'PUT',
    body: { name: 'Member Rename', code: 'EMP2' }
  });
  assert.equal(forbidden.status, 403);
});

test('deletes only empty projects and removes access, permissions, and prefixes', async (t) => {
  const server = await createTestServer(t);
  const admin = await server.login('admin');
  const member = await server.login('member');

  assert.equal((await server.request(admin, '/api/projects/project-one', { method: 'DELETE' })).status, 409);
  assert.equal((await server.request(admin, '/api/projects/project-two', { method: 'DELETE' })).status, 409);
  assert.equal((await server.request(member, '/api/projects/project-empty', { method: 'DELETE' })).status, 403);

  const deleted = await server.request(admin, '/api/projects/project-empty', { method: 'DELETE' });
  assert.equal(deleted.status, 200);
  assert.equal(server.store.data.projects.some((project) => project.id === 'project-empty'), false);

  const storedMember = server.store.data.users.find((user) => user.id === 'member');
  assert.deepEqual(storedMember.projectIds, ['project-one']);
  assert.deepEqual(Object.keys(storedMember.projectPermissions), ['project-one']);
  assert.deepEqual(server.store.data.requirementPrefixes.map((item) => item.projectId), ['project-one']);

  const listed = await server.request(admin, '/api/projects');
  assert.deepEqual(listed.payload.projects.map((project) => project.id), ['project-one', 'project-two']);

  assert.equal((await server.request(admin, '/api/projects/unknown', { method: 'DELETE' })).status, 404);
});
