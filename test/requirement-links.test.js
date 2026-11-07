import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
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
  const dataFile = join(directory, 'database.json');
  const passwordHash = createHash('sha256').update('test-password').digest('hex');
  const store = createStore(dataFile, {
    users: [
      { id: 'admin', username: 'admin', passwordHash, name: 'Admin', role: 'Администратор', projectIds: [], permissions: { create: true, read: true, update: true, delete: true } }
    ],
    requirements
  });
  const auth = createAuth(store);
  store.data.users.push(
    { id: 'editor', username: 'editor', passwordHash, name: 'Editor', role: 'Пользователь', projectIds: ['project-one'], projectPermissions: { 'project-one': { create: true, read: true, update: true, delete: false } } },
    { id: 'creator', username: 'creator', passwordHash, name: 'Creator', role: 'Пользователь', projectIds: ['project-one'], projectPermissions: { 'project-one': { create: true, read: true, update: false, delete: false } } },
    { id: 'create-only', username: 'create-only', passwordHash, name: 'Create Only', role: 'Пользователь', projectIds: ['project-one'], projectPermissions: { 'project-one': { create: true, read: false, update: false, delete: false } } },
    { id: 'reader', username: 'reader', passwordHash, name: 'Reader', role: 'Пользователь', projectIds: ['project-one'], projectPermissions: { 'project-one': { create: false, read: true, update: false, delete: false } } },
    { id: 'updater', username: 'updater', passwordHash, name: 'Updater', role: 'Пользователь', projectIds: ['project-one'], projectPermissions: { 'project-one': { create: false, read: false, update: true, delete: false } } },
    { id: 'deleter', username: 'deleter', passwordHash, name: 'Deleter', role: 'Пользователь', projectIds: ['project-one'], projectPermissions: { 'project-one': { create: false, read: false, update: false, delete: true } } },
    { id: 'remover', username: 'remover', passwordHash, name: 'Remover', role: 'Пользователь', projectIds: ['project-one'], projectPermissions: { 'project-one': { create: false, read: true, update: false, delete: true } } }
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

  return { store, dataFile, request, login };
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

test('creates a requirement and its selected links atomically with create and read permissions', async (t) => {
  const server = await createTestServer(t);
  const creator = await server.login('creator');
  const createOnly = await server.login('create-only');

  const options = await server.request(creator, '/api/requirement-link-options?projectId=project-one');
  assert.equal(options.status, 200);
  assert.equal(options.payload.types.length, 6);
  assert.equal((await server.request(createOnly, '/api/requirement-link-options?projectId=project-one')).status, 403);

  const search = await server.request(creator, '/api/requirements/search?projectId=project-one&search=second');
  assert.deepEqual(search.payload.requirements.map((item) => item.id), ['requirement-b']);
  assert.equal((await server.request(createOnly, '/api/requirements/search?projectId=project-one&search=second')).status, 403);

  const created = await server.request(creator, '/api/requirements', {
    method: 'POST',
    body: {
      projectId: 'project-one',
      description: 'New requirement',
      type: 'functional',
      priority: 'Средняя',
      status: 'Новая',
      links: [
        { requirementId: 'requirement-a', typeId: 'link-based-on' },
        { requirementId: 'requirement-b', typeId: 'link-clarifies' }
      ]
    }
  });
  assert.equal(created.status, 201);
  const newRequirement = created.payload.requirement;
  assert.equal(created.payload.links.length, 2);
  assert.deepEqual(created.payload.links.map((link) => [link.requirementAId, link.requirementBId, link.typeId]), [
    [newRequirement.id, 'requirement-a', 'link-based-on'],
    [newRequirement.id, 'requirement-b', 'link-clarifies']
  ]);
  const savedLink = server.store.data.requirementLinks[server.store.data.requirementLinks.length - 1];
  assert.equal(savedLink.requirementAId, newRequirement.id);
  assert.equal(savedLink.requirementBId, 'requirement-b');

  const deniedLink = await server.request(createOnly, '/api/requirements', {
    method: 'POST',
    body: {
      projectId: 'project-one',
      description: 'Must not be created',
      type: 'functional',
      priority: 'Средняя',
      status: 'Новая',
      links: [{ requirementId: 'requirement-b', typeId: 'link-clarifies' }]
    }
  });
  assert.equal(deniedLink.status, 403);
  assert.equal(server.store.data.requirements.some((item) => item.description === 'Must not be created'), false);

  const createdWithoutLinks = await server.request(createOnly, '/api/requirements', {
    method: 'POST',
    body: {
      projectId: 'project-one',
      description: 'Creation without read access',
      type: 'functional',
      priority: 'Средняя',
      status: 'Новая'
    }
  });
  assert.equal(createdWithoutLinks.status, 201);
  assert.equal(createdWithoutLinks.payload.links.length, 0);

  const requirementCount = server.store.data.requirements.length;
  const linkCount = server.store.data.requirementLinks.length;
  const invalidLink = await server.request(creator, '/api/requirements', {
    method: 'POST',
    body: {
      projectId: 'project-one',
      description: 'Must not be partially created',
      type: 'functional',
      priority: 'Средняя',
      status: 'Новая',
      links: [{ requirementId: 'requirement-c', typeId: 'link-clarifies' }]
    }
  });
  assert.equal(invalidLink.status, 400);
  assert.equal(server.store.data.requirements.length, requirementCount);
  assert.equal(server.store.data.requirementLinks.length, linkCount);

  const duplicateLink = await server.request(creator, '/api/requirements', {
    method: 'POST',
    body: {
      projectId: 'project-one',
      description: 'Duplicate links must be rejected',
      type: 'functional',
      priority: 'Средняя',
      status: 'Новая',
      links: [
        { requirementId: 'requirement-b', typeId: 'link-clarifies' },
        { requirementId: 'requirement-b', typeId: 'link-based-on' }
      ]
    }
  });
  assert.equal(duplicateLink.status, 400);
  assert.equal(server.store.data.requirements.length, requirementCount);
  assert.equal(server.store.data.requirementLinks.length, linkCount);

  const originalSave = server.store.save;
  server.store.save = () => { throw new Error('Simulated storage failure'); };
  const failedSave = await server.request(creator, '/api/requirements', {
    method: 'POST',
    body: {
      projectId: 'project-one',
      description: 'Must be rolled back',
      type: 'functional',
      priority: 'Средняя',
      status: 'Новая',
      links: [{ requirementId: 'requirement-b', typeId: 'link-clarifies' }]
    }
  });
  server.store.save = originalSave;
  assert.equal(failedSave.status, 500);
  assert.equal(server.store.data.requirements.length, requirementCount);
  assert.equal(server.store.data.requirementLinks.length, linkCount);
  const persistedData = JSON.parse(readFileSync(server.dataFile, 'utf8'));
  assert.equal(persistedData.requirements.some((item) => item.id === newRequirement.id), true);
  assert.equal(persistedData.requirementLinks.filter((item) => item.requirementAId === newRequirement.id).length, 2);
  assert.equal(persistedData.requirements.some((item) => item.description === 'Must be rolled back'), false);
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

  const deleter = await server.login('deleter');
  assert.equal((await server.request(deleter, '/api/requirements/requirement-a', { method: 'DELETE' })).status, 403);

  const admin = await server.login('admin');
  assert.equal((await server.request(admin, '/api/requirements/requirement-a', { method: 'DELETE' })).status, 200);
  assert.equal(server.store.data.requirements.some((item) => item.id === 'requirement-b'), true);
  assert.deepEqual(server.store.data.requirementLinks, []);
});

test('requires read together with update and rejects stale requirement updates', async (t) => {
  const server = await createTestServer(t);
  const editor = await server.login('editor');
  const updater = await server.login('updater');

  const forbidden = await server.request(updater, '/api/requirements/requirement-a', {
    method: 'PUT',
    body: { version: 1, description: 'Unauthorized update', type: 'functional', priority: 'Средняя', status: 'Новая' }
  });
  assert.equal(forbidden.status, 403);

  const listed = await server.request(editor, '/api/requirements?projectId=project-one');
  assert.equal(listed.status, 200);
  assert.equal(listed.payload.requirements[0].version, 1);

  const missingVersion = await server.request(editor, '/api/requirements/requirement-a', {
    method: 'PUT',
    body: { description: 'Unversioned update', type: 'functional', priority: 'Средняя', status: 'Новая' }
  });
  assert.equal(missingVersion.status, 400);

  const firstUpdate = await server.request(editor, '/api/requirements/requirement-a', {
    method: 'PUT',
    body: { version: listed.payload.requirements.find((item) => item.id === 'requirement-a').version, description: 'First update', type: 'functional', priority: 'Средняя', status: 'Новая' }
  });
  assert.equal(firstUpdate.status, 200);
  assert.equal(firstUpdate.payload.requirement.version, 2);

  const staleUpdate = await server.request(editor, '/api/requirements/requirement-a', {
    method: 'PUT',
    body: { version: listed.payload.requirements.find((item) => item.id === 'requirement-a').version, description: 'Stale update', type: 'functional', priority: 'Средняя', status: 'Новая' }
  });
  assert.equal(staleUpdate.status, 409);
  assert.equal(server.store.data.requirements.find((item) => item.id === 'requirement-a').description, 'First update');
});

test('allows requirement deletion only with read and delete permissions', async (t) => {
  const server = await createTestServer(t);
  const remover = await server.login('remover');

  const deleted = await server.request(remover, '/api/requirements/requirement-a', { method: 'DELETE' });
  assert.equal(deleted.status, 200);
  assert.equal(server.store.data.requirements.some((item) => item.id === 'requirement-a'), false);
});

test('restores a requirement when persistence fails during update or delete', async (t) => {
  const server = await createTestServer(t);
  const editor = await server.login('editor');
  const remover = await server.login('remover');
  const originalRequirement = server.store.data.requirements.find((item) => item.id === 'requirement-a');

  server.store.data.requirementLinks.push({
    id: 'link-a-b',
    projectId: 'project-one',
    requirementAId: 'requirement-a',
    requirementBId: 'requirement-b',
    typeId: 'link-related-to'
  });
  const savedLinks = server.store.data.requirementLinks;
  server.store.save = () => { throw new Error('Simulated storage failure'); };

  const update = await server.request(editor, '/api/requirements/requirement-a', {
    method: 'PUT',
    body: { version: 1, description: 'Unsaved update', type: 'functional', priority: 'Средняя', status: 'Новая' }
  });
  assert.equal(update.status, 500);
  assert.equal(server.store.data.requirements.find((item) => item.id === 'requirement-a'), originalRequirement);
  assert.equal(originalRequirement.description, 'First requirement');

  const deletion = await server.request(remover, '/api/requirements/requirement-a', { method: 'DELETE' });
  assert.equal(deletion.status, 500);
  assert.equal(server.store.data.requirements.find((item) => item.id === 'requirement-a'), originalRequirement);
  assert.equal(server.store.data.requirementLinks, savedLinks);
  assert.deepEqual(server.store.data.requirementLinks, [{
    id: 'link-a-b',
    projectId: 'project-one',
    requirementAId: 'requirement-a',
    requirementBId: 'requirement-b',
    typeId: 'link-related-to'
  }]);
});
