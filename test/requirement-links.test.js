import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createAuth } from '../src/auth.js';
import { createApp } from '../src/server.js';
import { createStore } from '../src/store.js';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = join(rootDir, 'public');
const projects = [
  { id: 'project-one', code: 'ONE', name: 'Project One' },
  { id: 'project-two', code: 'TWO', name: 'Project Two' }
];
const config = {
  load: () => ({
    projects,
    types: [{ id: 'functional', name: 'Функциональное' }],
    statuses: ['Новая'],
    priorities: ['Средняя'],
    complexities: []
  })
};
const requirements = [
  { id: 'requirement-a', number: 'ONE-001', description: 'First requirement', type: 'functional', projectId: 'project-one' },
  { id: 'requirement-b', number: 'ONE-002', description: 'Second requirement', type: 'functional', projectId: 'project-one' },
  { id: 'requirement-c', number: 'TWO-001', description: 'Other project requirement', type: 'functional', projectId: 'project-two' }
];

async function createTestServer(t) {
  const directory = mkdtempSync(join(tmpdir(), 'rms-requirement-links-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const passwordHash = createHash('sha256').update('test-password').digest('hex');
  const store = createStore(join(directory, 'database.json'), {
    users: [
      { id: 'admin', username: 'admin', passwordHash, name: 'Admin', role: 'Администратор', projectIds: [], permissions: { create: true, read: true, update: true, delete: true } }
    ],
    requirements
  });
  const auth = createAuth(store);
  store.data.users.push(
    { id: 'editor', username: 'editor', passwordHash, name: 'Editor', role: 'Пользователь', projectIds: ['project-one'], permissions: { create: true, read: true, update: true, delete: false } },
    { id: 'reader', username: 'reader', passwordHash, name: 'Reader', role: 'Пользователь', projectIds: ['project-one'], permissions: { create: false, read: true, update: false, delete: false } },
    { id: 'updater', username: 'updater', passwordHash, name: 'Updater', role: 'Пользователь', projectIds: ['project-one'], permissions: { create: false, read: false, update: true, delete: false } }
  );
  store.save();
  const app = createApp({ port: 0, publicDir, store, config, auth });
  await new Promise((resolve) => app.listen(resolve));
  t.after(() => new Promise((resolve, reject) => app.close((error) => error ? reject(error) : resolve())));
  const address = app.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

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

  return { store, request, login };
}

test('creates, displays, and deletes requirement links with project access checks', async (t) => {
  const server = await createTestServer(t);
  const editor = await server.login('editor');
  const reader = await server.login('reader');
  const updater = await server.login('updater');

  const created = await server.request(editor, '/api/requirement-links', {
    method: 'POST',
    body: { requirementAId: 'requirement-a', requirementBId: 'requirement-b', typeId: 'link-clarifies' }
  });
  assert.equal(created.status, 201);
  assert.equal(created.payload.link.requirementAId, 'requirement-a');
  assert.equal(created.payload.link.requirementBId, 'requirement-b');

  const viewFromB = await server.request(reader, '/api/requirements/requirement-b/links');
  assert.equal(viewFromB.status, 200);
  assert.equal(viewFromB.payload.links[0].requirementA.number, 'ONE-001');
  assert.equal(viewFromB.payload.links[0].requirementB.number, 'ONE-002');
  assert.equal(viewFromB.payload.links[0].type.directed, true);
  assert.equal((await server.request(updater, '/api/requirements/requirement-a/links')).status, 403);
  const options = await server.request(editor, '/api/requirements/requirement-a/link-options');
  assert.equal(options.status, 200);
  assert.equal(options.payload.types.length, 6);
  const search = await server.request(editor, '/api/requirements/search?projectId=project-one&excludeId=requirement-a&search=second');
  assert.deepEqual(search.payload.requirements.map((item) => item.id), ['requirement-b']);

  const duplicate = await server.request(editor, '/api/requirement-links', {
    method: 'POST',
    body: { requirementAId: 'requirement-b', requirementBId: 'requirement-a', typeId: 'link-based-on' }
  });
  assert.equal(duplicate.status, 409);

  const selfLink = await server.request(editor, '/api/requirement-links', {
    method: 'POST',
    body: { requirementAId: 'requirement-a', requirementBId: 'requirement-a', typeId: 'link-clarifies' }
  });
  assert.equal(selfLink.status, 400);

  const crossProjectLink = await server.request(editor, '/api/requirement-links', {
    method: 'POST',
    body: { requirementAId: 'requirement-a', requirementBId: 'requirement-c', typeId: 'link-clarifies' }
  });
  assert.equal(crossProjectLink.status, 400);

  assert.equal((await server.request(reader, '/api/requirements/requirement-a/link-options')).status, 403);
  assert.equal((await server.request(reader, '/api/requirement-links', {
    method: 'POST',
    body: { requirementAId: 'requirement-a', requirementBId: 'requirement-c', typeId: 'link-clarifies' }
  })).status, 403);
  assert.equal((await server.request(updater, '/api/requirements/search?projectId=project-one&excludeId=requirement-a&search=second')).status, 403);

  const linkId = created.payload.link.id;
  assert.equal((await server.request(reader, `/api/requirement-links/${linkId}`, { method: 'DELETE' })).status, 403);
  assert.equal((await server.request(editor, `/api/requirement-links/${linkId}`, { method: 'DELETE' })).status, 200);
  assert.deepEqual((await server.request(reader, '/api/requirements/requirement-a/links')).payload.links, []);
});

test('restricts catalog management to administrators and removes links with their type', async (t) => {
  const server = await createTestServer(t);
  const admin = await server.login('admin');
  const editor = await server.login('editor');

  const catalog = await server.request(admin, '/api/requirement-link-types');
  assert.equal(catalog.status, 200);
  assert.equal(catalog.payload.types.length, 6);
  assert.equal((await server.request(editor, '/api/requirement-link-types')).status, 403);

  const createdType = await server.request(admin, '/api/requirement-link-types', {
    method: 'POST',
    body: { name: 'Покрывает', directed: true }
  });
  assert.equal(createdType.status, 201);
  const typeId = createdType.payload.type.id;

  const createdLink = await server.request(editor, '/api/requirement-links', {
    method: 'POST',
    body: { requirementAId: 'requirement-a', requirementBId: 'requirement-b', typeId }
  });
  assert.equal(createdLink.status, 201);

  const updatedType = await server.request(admin, `/api/requirement-link-types/${typeId}`, {
    method: 'PUT',
    body: { name: 'Покрывает изменённое', directed: false }
  });
  assert.equal(updatedType.status, 200);
  const displayedLink = await server.request(editor, '/api/requirements/requirement-a/links');
  assert.equal(displayedLink.payload.links[0].type.name, 'Покрывает изменённое');
  assert.equal(displayedLink.payload.links[0].type.directed, false);

  const deletedType = await server.request(admin, `/api/requirement-link-types/${typeId}`, { method: 'DELETE' });
  assert.equal(deletedType.status, 200);
  assert.equal(deletedType.payload.removedLinks, 1);
  assert.deepEqual((await server.request(editor, '/api/requirements/requirement-a/links')).payload.links, []);
});

test('removes links when a requirement is deleted and preserves the related requirement', async (t) => {
  const server = await createTestServer(t);
  const editor = await server.login('editor');
  await server.request(editor, '/api/requirement-links', {
    method: 'POST',
    body: { requirementAId: 'requirement-a', requirementBId: 'requirement-b', typeId: 'link-clarifies' }
  });

  const deleted = await server.request(editor, '/api/requirements/requirement-a', { method: 'DELETE' });
  assert.equal(deleted.status, 403);

  const admin = await server.login('admin');
  assert.equal((await server.request(admin, '/api/requirements/requirement-a', { method: 'DELETE' })).status, 200);
  assert.equal(server.store.data.requirements.some((item) => item.id === 'requirement-b'), true);
  assert.deepEqual(server.store.data.requirementLinks, []);
});
