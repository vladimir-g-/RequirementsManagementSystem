import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAuth } from './auth.js';
import { createConfig } from './config.js';
import { createPool } from './database.js';
import { createPostgresStore } from './postgres-store.js';
import { createApp } from './server.js';

const port = Number(process.env.PORT) || 3000;
const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = join(rootDir, 'public');
const initialData = {
  users: [{ id: 'user-admin', username: 'admin', passwordHash: '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', name: 'Администратор', role: 'Администратор', projectIds: [], projectPermissions: {} }],
  requirements: []
};

const config = createConfig(rootDir);
const pool = createPool();
try {
  const store = createPostgresStore(pool, initialData);
  await store.initialize();
  const legacyTypeIds = new Map(config.load().types.map(({ id, name }) => [name, id]));
  let migratedRequirementTypes = false;
  for (const item of [...store.data.requirements, ...store.data.requirementPrefixes]) {
    const typeId = legacyTypeIds.get(item.type);
    if (typeId) {
      item.type = typeId;
      migratedRequirementTypes = true;
    }
  }
  if (migratedRequirementTypes) await store.save();
  const auth = createAuth(store);
  const server = await createApp({ port, publicDir, store, config, auth });
  server.listen(() => console.log(`Server is running at http://localhost:${port}`));
} catch (error) {
  console.error('Failed to start the application. Check DATABASE_URL and run the database migrations:', error);
  await pool.end();
  process.exitCode = 1;
}
