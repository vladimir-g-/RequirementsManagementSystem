import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createAuth } from '../src/auth.js';
import { createApp } from '../src/server.js';
import { createStore } from '../src/store.js';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));

async function createTestServer(t) {
  const directory = mkdtempSync(join(tmpdir(), 'rms-password-change-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const dataFile = join(directory, 'database.json');
  const passwordHash = createHash('sha256').update('old-password').digest('hex');
  const store = createStore(dataFile, {
    users: [
      { id: 'user-1', username: 'user', passwordHash, name: 'User', role: 'Пользователь', projectIds: [], permissions: { create: false, read: false, update: false, delete: false } },
      { id: 'user-2', username: 'other', passwordHash, name: 'Other', role: 'Пользователь', projectIds: [], permissions: { create: false, read: false, update: false, delete: false } }
    ],
    groups: [],
    requirements: [],
    requirementPrefixes: [],
    requirementLinks: [],
    requirementLinkTypes: []
  });
  const auth = createAuth(store);
  const app = createApp({
    port: 0,
    publicDir,
    store,
    config: { load: () => ({ projects: [], types: [], statuses: [], priorities: [], complexities: [] }) },
    auth
  });
  await new Promise((resolve) => app.listen(resolve));
  t.after(() => new Promise((resolve, reject) => app.close((error) => error ? reject(error) : resolve())));
  const baseUrl = `http://127.0.0.1:${app.address().port}`;

  async function login(username, password = 'old-password') {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const payload = await response.json();
    return { status: response.status, payload, cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }

  async function request(cookie, path, body) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    return {
      status: response.status,
      payload: response.status === 204 ? {} : await response.json(),
      setCookie: response.headers.get('set-cookie')
    };
  }

  async function currentUser(cookie) {
    const response = await fetch(`${baseUrl}/api/auth/me`, { headers: { cookie } });
    return (await response.json()).user;
  }

  return { store, dataFile, login, request, currentUser };
}

test('changes password, revokes all user sessions and keeps other users signed in', async (t) => {
  const server = await createTestServer(t);
  const currentSession = await server.login('user');
  const secondSession = await server.login('user');
  const otherUserSession = await server.login('other');

  const response = await server.request(currentSession.cookie, '/api/auth/password', {
    newPassword: '!',
    confirmPassword: '!'
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.payload, { currentSessionTerminated: true, failedSessionCount: 0 });
  assert.match(response.setCookie, /Max-Age=0/);
  assert.equal(await server.currentUser(currentSession.cookie), null);
  assert.equal(await server.currentUser(secondSession.cookie), null);
  assert.equal((await server.currentUser(otherUserSession.cookie)).id, 'user-2');

  assert.equal((await server.login('user', 'old-password')).status, 401);
  assert.equal((await server.login('user', '!')).status, 200);
  const persistedData = JSON.parse(readFileSync(server.dataFile, 'utf8'));
  assert.match(persistedData.users.find((user) => user.id === 'user-1').passwordHash, /^scrypt\$/);
});

test('rejects empty or mismatched passwords without changing the existing password or sessions', async (t) => {
  const server = await createTestServer(t);
  const session = await server.login('user');

  for (const body of [
    { newPassword: '', confirmPassword: '' },
    { newPassword: 'new-password', confirmPassword: '' },
    { newPassword: 'new-password', confirmPassword: 'different-password' }
  ]) {
    const response = await server.request(session.cookie, '/api/auth/password', body);
    assert.equal(response.status, 400);
    assert.ok(response.payload.error);
  }

  assert.equal((await server.currentUser(session.cookie)).id, 'user-1');
  assert.equal((await server.login('user', 'old-password')).status, 200);
  assert.equal((await server.login('user', 'new-password')).status, 401);
});

test('requires authentication to change a password', async (t) => {
  const server = await createTestServer(t);
  const response = await server.request(null, '/api/auth/password', {
    newPassword: 'new-password',
    confirmPassword: 'new-password'
  });

  assert.equal(response.status, 401);
});

test('rolls back the password change if persistence fails', async (t) => {
  const server = await createTestServer(t);
  const session = await server.login('user');
  const originalHash = server.store.data.users[0].passwordHash;
  const save = server.store.save;
  server.store.save = () => { throw new Error('simulated persistence failure'); };

  const response = await server.request(session.cookie, '/api/auth/password', {
    newPassword: 'new-password',
    confirmPassword: 'new-password'
  });
  server.store.save = save;

  assert.equal(response.status, 500);
  assert.equal(server.store.data.users[0].passwordHash, originalHash);
  assert.equal((await server.currentUser(session.cookie)).id, 'user-1');
  assert.equal((await server.login('user', 'old-password')).status, 200);
  assert.equal((await server.login('user', 'new-password')).status, 401);
});
