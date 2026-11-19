import { AsyncLocalStorage } from 'node:async_hooks';

// This lock keeps request-scoped snapshots current across application instances.
const advisoryLockKey = 731904211;

const collectionNames = [
  'users',
  'projects',
  'requirements',
  'groups',
  'requirementPrefixes',
  'requirementLinkTypes',
  'requirementLinks',
  'types',
  'statuses',
  'priorities',
  'complexities'
];

function emptyData(initialData = {}) {
  return Object.fromEntries(collectionNames.map((name) => [
    name,
    Array.isArray(initialData[name]) ? initialData[name] : []
  ]));
}

function normalizeUsers(users) {
  const defaultPermissions = { create: true, read: true, update: true, delete: true };
  return users.map((user) => {
    const projectIds = Array.isArray(user.projectIds) ? [...new Set(user.projectIds)] : [];
    const legacyPermissions = user.permissions !== undefined
      ? { ...defaultPermissions, ...user.permissions }
      : { create: false, read: false, update: false, delete: false };
    const storedPermissions = user.projectPermissions && typeof user.projectPermissions === 'object'
      ? user.projectPermissions
      : null;
    const projectPermissions = Object.fromEntries(projectIds.map((projectId) => [
      projectId,
      { ...defaultPermissions, ...(storedPermissions?.[projectId] || legacyPermissions) }
    ]));
    return {
      ...user,
      role: user.role || 'Администратор',
      projectIds,
      projectPermissions,
      permissions: undefined
    };
  });
}

function normalizeData(data) {
  const normalized = emptyData(data);
  normalized.users = normalizeUsers(normalized.users);
  normalized.requirements = normalized.requirements.map((requirement) => ({
    ...requirement,
    version: requirement.version ?? 1,
    groupId: requirement.groupId || null,
    detailsMarkdown: requirement.detailsMarkdown || '',
    complexity: requirement.complexity || '',
    release: requirement.release || ''
  }));
  return normalized;
}

async function loadData(client) {
  const users = await client.query('SELECT id, username, password_hash AS "passwordHash", name, role FROM users ORDER BY sort_order, id');
  const projects = await client.query('SELECT id, name, code FROM projects ORDER BY sort_order, id');
  const requirements = await client.query(`SELECT id, number, description, details_markdown AS "detailsMarkdown",
    type_id AS type, priority, complexity, status, release, project_id AS "projectId",
    group_id AS "groupId", version FROM requirements ORDER BY sort_order, id`);
  const groups = await client.query('SELECT id, name, project_id AS "projectId", parent_id AS "parentId" FROM requirement_groups ORDER BY sort_order, id');
  const prefixes = await client.query('SELECT project_id AS "projectId", type_id AS type, prefix FROM requirement_prefixes ORDER BY project_id, type_id');
  const linkTypes = await client.query('SELECT id, name, directed FROM requirement_link_types ORDER BY sort_order, id');
  const links = await client.query(`SELECT id, project_id AS "projectId", requirement_a_id AS "requirementAId",
    requirement_b_id AS "requirementBId", type_id AS "typeId" FROM requirement_links ORDER BY sort_order, id`);
  const types = await client.query('SELECT id, name FROM requirement_types ORDER BY sort_order, id');
  const statuses = await client.query('SELECT id, name FROM requirement_statuses ORDER BY sort_order, id');
  const priorities = await client.query('SELECT id, name FROM requirement_priorities ORDER BY sort_order, id');
  const complexities = await client.query('SELECT id, name FROM requirement_complexities ORDER BY sort_order, id');
  const memberships = await client.query(`SELECT user_id AS "userId", project_id AS "projectId", can_create AS "canCreate",
    can_read AS "canRead", can_update AS "canUpdate", can_delete AS "canDelete"
    FROM user_project_permissions ORDER BY user_id, sort_order`);
  const result = {
    users: users.rows.map((user) => ({ ...user, projectIds: [], projectPermissions: {} })),
    projects: projects.rows,
    requirements: requirements.rows,
    groups: groups.rows,
    requirementPrefixes: prefixes.rows,
    requirementLinkTypes: linkTypes.rows,
    requirementLinks: links.rows,
    types: types.rows,
    statuses: statuses.rows,
    priorities: priorities.rows,
    complexities: complexities.rows
  };
  const usersById = new Map(result.users.map((user) => [user.id, user]));
  for (const membership of memberships.rows) {
    const user = usersById.get(membership.userId);
    if (!user) continue;
    user.projectIds.push(membership.projectId);
    user.projectPermissions[membership.projectId] = {
      create: membership.canCreate,
      read: membership.canRead,
      update: membership.canUpdate,
      delete: membership.canDelete
    };
  }
  return normalizeData(result);
}

function entityRows(data) {
  return {
    projects: data.projects.map(({ id, name, code }, sort_order) => ({ id, name, code, sort_order })),
    requirement_types: data.types.map(({ id, name }, sort_order) => ({ id, name, sort_order })),
    users: data.users.map(({ id, username, passwordHash, name, role }, sort_order) => ({
      id,
      username,
      password_hash: passwordHash,
      name,
      role: role || 'Администратор',
      sort_order
    })),
    requirement_groups: data.groups.map(({ id, name, projectId, parentId }, sort_order) => ({
      id,
      name,
      project_id: projectId,
      parent_id: parentId || null,
      sort_order
    })),
    requirements: data.requirements.map((item, sort_order) => ({
      id: item.id,
      number: item.number,
      description: item.description,
      details_markdown: item.detailsMarkdown || '',
      type_id: item.type,
      priority: item.priority,
      complexity: item.complexity || null,
      status: item.status,
      release: item.release || '',
      project_id: item.projectId,
      group_id: item.groupId || null,
      version: item.version ?? 1,
      sort_order
    })),
    requirement_link_types: data.requirementLinkTypes.map(({ id, name, directed }, sort_order) => ({ id, name, directed, sort_order })),
    requirement_links: data.requirementLinks.map((item, sort_order) => ({
      id: item.id,
      project_id: item.projectId,
      requirement_a_id: item.requirementAId,
      requirement_b_id: item.requirementBId,
      type_id: item.typeId,
      sort_order
    }))
  };
}

async function upsertRows(client, table, rows) {
  if (!rows.length) return;
  const columns = Object.keys(rows[0]);
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
  const updates = columns.filter((column) => column !== 'id')
    .map((column) => `${column} = EXCLUDED.${column}`)
    .join(', ');
  const statement = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})
    ON CONFLICT (id) DO UPDATE SET ${updates}`;
  for (const row of rows) {
    await client.query(statement, columns.map((column) => row[column]));
  }
}

async function deleteMissingRows(client, table, ids) {
  if (ids.length) {
    await client.query(`DELETE FROM ${table} WHERE id <> ALL($1::text[])`, [ids]);
  } else {
    await client.query(`DELETE FROM ${table}`);
  }
}

async function replaceRelationRows(client, data) {
  await client.query('DELETE FROM user_project_permissions');
  for (const user of data.users) {
    for (const [sort_order, projectId] of (user.projectIds || []).entries()) {
      const permissions = user.projectPermissions?.[projectId] || {};
      await client.query(`INSERT INTO user_project_permissions
        (user_id, project_id, can_create, can_read, can_update, can_delete, sort_order)
        VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
        user.id,
        projectId,
        Boolean(permissions.create),
        Boolean(permissions.read),
        Boolean(permissions.update),
        Boolean(permissions.delete),
        sort_order
      ]);
    }
  }

  await client.query('DELETE FROM requirement_prefixes');
  for (const prefix of data.requirementPrefixes) {
    await client.query(`INSERT INTO requirement_prefixes (project_id, type_id, prefix)
      VALUES ($1, $2, $3)`, [prefix.projectId, prefix.type, prefix.prefix]);
  }

  await client.query('DELETE FROM requirement_links');
  const entities = entityRows(data);
  await upsertRows(client, 'requirement_links', entities.requirement_links);
}

async function persistData(client, data) {
  const entities = entityRows(normalizeData(data));

  await upsertRows(client, 'projects', entities.projects);
  await upsertRows(client, 'requirement_types', entities.requirement_types);
  await upsertRows(client, 'requirement_link_types', entities.requirement_link_types);
  await upsertRows(client, 'users', entities.users);
  await upsertRows(client, 'requirement_groups', entities.requirement_groups);
  await upsertRows(client, 'requirements', entities.requirements);
  await replaceRelationRows(client, normalizeData(data));

  await deleteMissingRows(client, 'requirement_links', entities.requirement_links.map((row) => row.id));
  await client.query(`DELETE FROM requirement_prefixes p
    WHERE NOT EXISTS (
      SELECT 1 FROM unnest($1::text[], $2::text[]) AS expected(project_id, type_id)
      WHERE expected.project_id = p.project_id AND expected.type_id = p.type_id
    )`, [
    data.requirementPrefixes.map((item) => item.projectId),
    data.requirementPrefixes.map((item) => item.type)
  ]);
  await deleteMissingRows(client, 'requirements', entities.requirements.map((row) => row.id));
  await deleteMissingRows(client, 'requirement_groups', entities.requirement_groups.map((row) => row.id));
  await deleteMissingRows(client, 'requirement_link_types', entities.requirement_link_types.map((row) => row.id));
  await deleteMissingRows(client, 'requirement_types', entities.requirement_types.map((row) => row.id));
  await deleteMissingRows(client, 'users', entities.users.map((row) => row.id));
  await deleteMissingRows(client, 'projects', entities.projects.map((row) => row.id));
}

export function createPostgresStore(pool, initialData = {}) {
  const requestContext = new AsyncLocalStorage();
  let data = normalizeData(initialData);

  async function withTransaction(callback) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [advisoryLockKey]);
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async function initialize() {
    data = await withTransaction(async (client) => {
      const loaded = await loadData(client);
      if (loaded.users.length === 0 && initialData.users?.length) {
        loaded.users = normalizeUsers(initialData.users);
        await persistData(client, loaded);
      }
      return loaded;
    });
  }

  async function save() {
    const context = requestContext.getStore();
    if (context) {
      if (context.failed) throw new Error('Транзакция хранилища уже завершена с ошибкой');
      try {
        await persistData(context.client, context.data);
      } catch (error) {
        context.failed = true;
        throw error;
      }
      return;
    }
    await withTransaction(async (client) => {
      await persistData(client, data);
    });
  }

  async function withRequest(callback, { readOnly = false } = {}) {
    const context = { client: null, data: null, failed: false };
    return requestContext.run(context, async () => {
      context.client = await pool.connect();
      try {
        await context.client.query('BEGIN');
        const lockFunction = readOnly ? 'pg_advisory_xact_lock_shared' : 'pg_advisory_xact_lock';
        await context.client.query(`SELECT ${lockFunction}($1)`, [advisoryLockKey]);
        context.data = await loadData(context.client);
        const result = await callback();
        if (context.failed) {
          await context.client.query('ROLLBACK');
        } else {
          await context.client.query('COMMIT');
          data = context.data;
        }
        return result;
      } catch (error) {
        if (context.client) {
          try {
            await context.client.query('ROLLBACK');
          } catch (rollbackError) {
            error.rollbackError = rollbackError;
          }
        }
        throw error;
      } finally {
        context.client.release();
      }
    });
  }

  return {
    get data() {
      return requestContext.getStore()?.data || data;
    },
    set data(value) {
      const context = requestContext.getStore();
      if (context) context.data = value;
      else data = value;
    },
    initialize,
    save,
    withRequest,
    close: () => pool.end()
  };
}

export { loadData, normalizeData, persistData };
