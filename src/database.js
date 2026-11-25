import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createConfig } from './config.js';
import { normalizeData, persistData } from './postgres-store.js';

const { Pool } = pg;
const advisoryLockKey = 731904211;
const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const defaultRequirementLinkTypes = [
  { id: 'link-clarifies', name: 'Уточняет', directed: true },
  { id: 'link-based-on', name: 'Основано на', directed: true },
  { id: 'link-depends-on', name: 'Зависит от', directed: true },
  { id: 'link-conflicts-with', name: 'Конфликтует с', directed: false },
  { id: 'link-duplicates', name: 'Дублирует', directed: false },
  { id: 'link-related-to', name: 'Связано с', directed: false }
];

export function createPool(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) {
    throw new Error('DATABASE_URL is required; set it to the PostgreSQL connection URI before running database commands or the server');
  }
  return new Pool({ connectionString });
}

export async function runMigrations(pool, migrationsDir = join(rootDir, 'database', 'migrations')) {
  const client = await pool.connect();
  let locked = false;
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    await client.query('SELECT pg_advisory_lock($1)', [advisoryLockKey]);
    locked = true;
    const migrationFiles = (await readdir(migrationsDir))
      .filter((name) => /^\d+_.+\.sql$/.test(name))
      .sort();
    for (const filename of migrationFiles) {
      const alreadyApplied = await client.query('SELECT 1 FROM schema_migrations WHERE version = $1', [filename]);
      if (alreadyApplied.rowCount) continue;

      const sql = await readFile(join(migrationsDir, filename), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(version) VALUES ($1)', [filename]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Failed to apply ${filename}: ${error.message}`, { cause: error });
      }
    }
    return migrationFiles;
  } finally {
    if (locked) await client.query('SELECT pg_advisory_unlock($1)', [advisoryLockKey]);
    client.release();
  }
}

function mapLegacyValue(value, records) {
  return records.find((item) => item.name === value)?.id || value;
}

function normalizeImport(source, configs) {
  const defaults = {
    users: [],
    projects: configs.projects,
    requirements: [],
    groups: [],
    requirementPrefixes: [],
    requirementLinkTypes: defaultRequirementLinkTypes,
    requirementLinks: [],
    types: configs.types
  };
  const rawData = Object.fromEntries(Object.keys(defaults).map((key) => [
    key,
    Array.isArray(source[key]) ? source[key] : defaults[key]
  ]));
  const normalized = normalizeData(rawData);
  const properties = { statuses: 'status', priorities: 'priority', complexities: 'complexity' };
  for (const [configName, property] of Object.entries(properties)) {
    for (const requirement of normalized.requirements) {
      if (requirement[property] !== undefined && requirement[property] !== '') {
        requirement[property] = mapLegacyValue(requirement[property], configs[configName]);
      }
    }
  }
  const typeNames = configs.types;
  for (const item of [...normalized.requirements, ...normalized.requirementPrefixes]) {
    item.type = mapLegacyValue(item.type, typeNames);
  }
  return normalized;
}

export async function importJsonFile(pool, jsonFile, configs = createConfig(rootDir).load()) {
  const sourcePath = resolve(jsonFile);
  const sourceText = await readFile(sourcePath, 'utf8');
  const sourceHash = createHash('sha256').update(sourceText).digest('hex');
  let source;
  try {
    source = JSON.parse(sourceText);
  } catch (error) {
    throw new Error(`Cannot parse JSON source ${sourcePath}: ${error.message}`, { cause: error });
  }
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error(`JSON source ${sourcePath} must contain an object`);
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [advisoryLockKey]);
    const alreadyImported = await client.query('SELECT source FROM data_imports WHERE fingerprint = $1', [sourceHash]);
    if (alreadyImported.rowCount) {
      await client.query('ROLLBACK');
      return { imported: false, fingerprint: sourceHash, source: alreadyImported.rows[0].source };
    }
    const databaseConfigs = { ...configs };
    for (const [configName, table] of Object.entries({
      statuses: 'requirement_statuses',
      priorities: 'requirement_priorities',
      complexities: 'requirement_complexities'
    })) {
      const result = await client.query(`SELECT id, name FROM ${table} ORDER BY sort_order, id`);
      databaseConfigs[configName] = result.rows;
    }
    const data = normalizeImport(source, databaseConfigs);
    const previousImport = await client.query('SELECT fingerprint FROM data_imports LIMIT 1');
    if (previousImport.rowCount) {
      throw new Error('A different JSON source has already been imported; refusing to merge unrelated snapshots');
    }
    const existing = await client.query(`SELECT
      (SELECT count(*) FROM users) AS users,
      (SELECT count(*) FROM requirements) AS requirements,
      (SELECT count(*) FROM requirement_groups) AS groups,
      (SELECT count(*) FROM requirement_links) AS links,
      (SELECT count(*) FROM requirement_prefixes) AS prefixes`);
    const counts = Object.values(existing.rows[0]).map(Number);
    if (counts.some((count) => count > 0)) {
      throw new Error('Target database contains application data; refusing to overwrite or merge it');
    }
    await persistData(client, data);
    const storedCountsResult = await client.query(`SELECT
      (SELECT count(*) FROM users) AS users,
      (SELECT count(*) FROM projects) AS projects,
      (SELECT count(*) FROM requirements) AS requirements,
      (SELECT count(*) FROM requirement_groups) AS groups,
      (SELECT count(*) FROM requirement_prefixes) AS "requirementPrefixes",
      (SELECT count(*) FROM requirement_link_types) AS "requirementLinkTypes",
      (SELECT count(*) FROM requirement_links) AS "requirementLinks",
      (SELECT count(*) FROM requirement_types) AS types,
      (SELECT count(*) FROM user_project_permissions) AS "userProjectPermissions"`);
    const storedCounts = Object.fromEntries(Object.entries(storedCountsResult.rows[0]).map(([key, value]) => [key, Number(value)]));
    const expectedCounts = {
      users: data.users.length,
      projects: data.projects.length,
      requirements: data.requirements.length,
      groups: data.groups.length,
      requirementPrefixes: data.requirementPrefixes.length,
      requirementLinkTypes: data.requirementLinkTypes.length,
      requirementLinks: data.requirementLinks.length,
      types: data.types.length,
      userProjectPermissions: data.users.reduce((total, user) => total + user.projectIds.length, 0)
    };
    for (const [collection, expected] of Object.entries(expectedCounts)) {
      if (storedCounts[collection] !== expected) {
        throw new Error(`Imported ${collection} count mismatch: expected ${expected}, found ${storedCounts[collection]}`);
      }
    }
    await client.query('INSERT INTO data_imports(fingerprint, source) VALUES ($1, $2)', [sourceHash, sourcePath]);
    await client.query('COMMIT');
    return {
      imported: true,
      fingerprint: sourceHash,
      counts: storedCounts
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export { rootDir };
