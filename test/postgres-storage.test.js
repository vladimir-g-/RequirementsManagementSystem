import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import test from 'node:test';
import { createAuth } from '../src/auth.js';
import { importJsonFile, runMigrations } from '../src/database.js';
import { createPostgresStore } from '../src/postgres-store.js';
import { createApp } from '../src/server.js';

const { Pool } = pg;
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const migrationsDir = fileURLToPath(new URL('../database/migrations/', import.meta.url));

test('imports JSON once and persists transactional changes in PostgreSQL', { skip: !testDatabaseUrl }, async (t) => {
  const schema = `rms_test_${randomUUID().replace(/-/g, '')}`;
  const adminPool = new Pool({ connectionString: testDatabaseUrl });
  await adminPool.query(`CREATE SCHEMA "${schema}"`);
  const pool = new Pool({
    connectionString: testDatabaseUrl,
    options: `-c search_path=${schema}`
  });
  const directory = mkdtempSync(join(tmpdir(), 'rms-postgres-import-'));
  t.after(async () => {
    await pool.end();
    await adminPool.query(`DROP SCHEMA "${schema}" CASCADE`);
    await adminPool.end();
    rmSync(directory, { recursive: true, force: true });
  });

  await runMigrations(pool);
  await runMigrations(pool);
  const seededTypes = await pool.query('SELECT id FROM requirement_types ORDER BY sort_order');
  assert.deepEqual(seededTypes.rows.map((item) => item.id), [
    'functional',
    'non-functional',
    'security',
    'integration',
    'use-case',
    'user-story',
    'business-requirement'
  ]);
  const seededStatuses = await pool.query('SELECT id, name FROM requirement_statuses ORDER BY sort_order');
  assert.deepEqual(seededStatuses.rows.map((item) => item.id), [
    'draft',
    'in-progress',
    'under-review',
    'pending-approval',
    'approved',
    'canceled',
    'done',
    'planned'
  ]);
  const seededPriorities = await pool.query('SELECT id FROM requirement_priorities ORDER BY sort_order');
  assert.deepEqual(seededPriorities.rows.map((item) => item.id), ['critical', 'high', 'medium', 'low']);
  const seededComplexities = await pool.query('SELECT id FROM requirement_complexities ORDER BY sort_order');
  assert.deepEqual(seededComplexities.rows.map((item) => item.id), ['low', 'medium', 'high']);
  const passwordHash = createHash('sha256').update('test-password').digest('hex');
  const sourceFile = join(directory, 'database.json');
  const source = {
    users: [{
      id: 'test-admin',
      username: 'admin',
      passwordHash,
      name: 'Test Admin',
      role: 'Администратор',
      projectIds: ['test-project'],
      projectPermissions: { 'test-project': { create: true, read: true, update: true, delete: true } }
    }],
    projects: [{ id: 'test-project', name: 'Test Project', code: 'TEST' }],
    types: [{ id: 'functional', name: 'Functional' }],
    requirements: [
      { id: 'req-a', number: 'TEST-001', description: 'First', type: 'functional', priority: 'Средняя', complexity: 'Низкая', status: 'Черновик', release: '', projectId: 'test-project', groupId: 'test-group', version: 1 },
      { id: 'req-b', number: 'TEST-002', description: 'Second', type: 'functional', priority: 'medium', complexity: '', status: 'draft', release: '', projectId: 'test-project', groupId: null, version: 1 }
    ],
    groups: [{ id: 'test-group', name: 'Group', projectId: 'test-project', parentId: null }],
    requirementPrefixes: [{ projectId: 'test-project', type: 'functional', prefix: 'TEST' }],
    requirementLinks: [{
      id: 'link-a',
      projectId: 'test-project',
      requirementAId: 'req-a',
      requirementBId: 'req-b',
      typeId: 'link-related-to'
    }]
  };
  writeFileSync(sourceFile, JSON.stringify(source));
  const configs = {
    projects: [],
    types: [{ id: 'functional', name: 'Functional' }],
    statuses: [{ id: 'draft', name: 'Draft' }],
    priorities: [{ id: 'medium', name: 'Medium' }],
    complexities: []
  };

  const imported = await importJsonFile(pool, sourceFile, configs);
  assert.equal(imported.imported, true);
  assert.equal(imported.counts.requirements, 2);
  assert.equal(imported.counts.userProjectPermissions, 1);
  assert.equal((await importJsonFile(pool, sourceFile, configs)).imported, false);
  writeFileSync(sourceFile, `${JSON.stringify(source)} `);
  await assert.rejects(importJsonFile(pool, sourceFile, configs), /different JSON source/);
  assert.equal(existsSync(sourceFile), true);

  const store = createPostgresStore(pool);
  await store.initialize();
  assert.deepEqual(store.data.users[0].projectPermissions['test-project'], {
    create: true,
    read: true,
    update: true,
    delete: true
  });
  assert.equal(store.data.requirements.find((item) => item.id === 'req-a').groupId, 'test-group');
  assert.equal(store.data.requirements.find((item) => item.id === 'req-a').status, 'draft');
  assert.equal(store.data.requirements.find((item) => item.id === 'req-a').priority, 'medium');
  assert.equal(store.data.requirements.find((item) => item.id === 'req-a').complexity, 'low');
  assert.deepEqual(store.data.requirements.map((item) => item.id), ['req-a', 'req-b']);
  assert.equal(store.data.requirementLinks[0].typeId, 'link-related-to');

  await store.withRequest(async () => {
    store.data.projects[0].name = 'Updated Project';
    await store.save();
  });
  const reloadedStore = createPostgresStore(pool);
  await reloadedStore.initialize();
  assert.equal(reloadedStore.data.projects.find((item) => item.id === 'test-project').name, 'Updated Project');

  const secondWriter = createPostgresStore(pool);
  const addProject = (store, id) => store.withRequest(async () => {
    store.data.projects.push({ id, name: id, code: id.toUpperCase() });
    await store.save();
  });
  await Promise.all([
    addProject(reloadedStore, 'parallel-one'),
    addProject(secondWriter, 'parallel-two')
  ]);
  const concurrentStore = createPostgresStore(pool);
  await concurrentStore.initialize();
  assert.equal(concurrentStore.data.projects.some((item) => item.id === 'parallel-one'), true);
  assert.equal(concurrentStore.data.projects.some((item) => item.id === 'parallel-two'), true);

  await assert.rejects(reloadedStore.withRequest(async () => {
    reloadedStore.data.projects[0].name = 'Rolled Back';
    await reloadedStore.save();
    throw new Error('force rollback');
  }), /force rollback/);
  const finalStore = createPostgresStore(pool);
  await finalStore.initialize();
  assert.equal(finalStore.data.projects.find((item) => item.id === 'test-project').name, 'Updated Project');

  const config = {
    load: () => ({
      projects: [],
      types: [{ id: 'functional', name: 'Functional' }],
      statuses: [{ id: 'json-only-status', name: 'JSON-only status' }],
      priorities: [{ id: 'json-only-priority', name: 'JSON-only priority' }],
      complexities: [{ id: 'json-only-complexity', name: 'JSON-only complexity' }]
    })
  };
  const app = await createApp({
    port: 0,
    publicDir,
    store: finalStore,
    config,
    auth: createAuth(finalStore)
  });
  await new Promise((resolve) => app.listen(resolve));
  t.after(() => new Promise((resolve, reject) => app.close((error) => error ? reject(error) : resolve())));
  const baseUrl = `http://127.0.0.1:${app.address().port}`;
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'test-password' })
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const referenceData = await fetch(`${baseUrl}/api/config`, { headers: { cookie } });
  assert.equal(referenceData.status, 200);
  const references = await referenceData.json();
  assert.deepEqual(references.statuses, seededStatuses.rows);
  assert.deepEqual(references.priorities, (await pool.query('SELECT id, name FROM requirement_priorities ORDER BY sort_order, id')).rows);
  assert.deepEqual(references.complexities, (await pool.query('SELECT id, name FROM requirement_complexities ORDER BY sort_order, id')).rows);
  const created = await fetch(`${baseUrl}/api/requirements`, {
    method: 'POST',
    headers: { cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId: 'test-project',
      description: 'Created through the API',
      type: 'functional',
      priority: 'medium',
      status: 'draft'
    })
  });
  assert.equal(created.status, 201);
  assert.equal((await created.json()).requirement.number, 'TEST-003');
  const apiStore = createPostgresStore(pool);
  await apiStore.initialize();
  assert.equal(apiStore.data.requirements.some((item) => item.description === 'Created through the API'), true);
});

test('adds reference tables to an existing database with unset complexities', { skip: !testDatabaseUrl }, async (t) => {
  const schema = `rms_upgrade_${randomUUID().replace(/-/g, '')}`;
  const adminPool = new Pool({ connectionString: testDatabaseUrl });
  await adminPool.query(`CREATE SCHEMA "${schema}"`);
  const pool = new Pool({
    connectionString: testDatabaseUrl,
    options: `-c search_path=${schema}`
  });
  const directory = mkdtempSync(join(tmpdir(), 'rms-postgres-upgrade-'));
  const previousMigrationsDir = join(directory, 'migrations');
  mkdirSync(previousMigrationsDir);
  for (const filename of ['001_schema.sql', '002_initial_data.sql']) {
    copyFileSync(join(migrationsDir, filename), join(previousMigrationsDir, filename));
  }
  t.after(async () => {
    await pool.end();
    await adminPool.query(`DROP SCHEMA "${schema}" CASCADE`);
    await adminPool.end();
    rmSync(directory, { recursive: true, force: true });
  });

  await runMigrations(pool, previousMigrationsDir);
  await pool.query(`INSERT INTO requirements
    (id, number, description, type_id, priority, complexity, status, project_id)
    VALUES ('legacy-requirement', 'ANL-001', 'Existing requirement', 'functional', 'high', '', 'planned', 'project-alpha')`);

  await runMigrations(pool);

  const migrated = await pool.query('SELECT complexity FROM requirements WHERE id = $1', ['legacy-requirement']);
  assert.equal(migrated.rows[0].complexity, null);
  assert.equal((await pool.query('SELECT id FROM requirement_complexities WHERE id = $1', ['low'])).rowCount, 1);
});

test('bootstraps the initial administrator only once for a fresh database', { skip: !testDatabaseUrl }, async (t) => {
  const schema = `rms_bootstrap_${randomUUID().replace(/-/g, '')}`;
  const adminPool = new Pool({ connectionString: testDatabaseUrl });
  await adminPool.query(`CREATE SCHEMA "${schema}"`);
  const pool = new Pool({
    connectionString: testDatabaseUrl,
    options: `-c search_path=${schema}`
  });
  t.after(async () => {
    await pool.end();
    await adminPool.query(`DROP SCHEMA "${schema}" CASCADE`);
    await adminPool.end();
  });

  await runMigrations(pool);
  const initialAdmin = {
    id: 'initial-admin',
    username: 'admin',
    passwordHash: 'password-hash',
    name: 'Administrator',
    role: 'Администратор',
    projectIds: [],
    projectPermissions: {}
  };
  const store = createPostgresStore(pool, { users: [initialAdmin] });
  await store.initialize();
  const secondStore = createPostgresStore(pool, { users: [initialAdmin] });
  await secondStore.initialize();
  assert.equal(secondStore.data.users.length, 1);
  assert.equal(secondStore.data.users[0].id, 'initial-admin');
});
