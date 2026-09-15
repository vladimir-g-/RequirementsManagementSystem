import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAuth } from './auth.js';
import { createConfig } from './config.js';
import { createApp } from './server.js';
import { createStore } from './store.js';

const port = Number(process.env.PORT) || 3000;
const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataFile = join(rootDir, 'data', 'database.json');
const publicDir = join(rootDir, 'public');
const initialData = {
  users: [{ id: 'user-admin', username: 'admin', passwordHash: '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', name: 'Администратор', role: 'Администратор', projectIds: [], permissions: { create: true, read: true, update: true, delete: true } }],
  requirements: []
};

const store = createStore(dataFile, initialData);
const config = createConfig(rootDir);
const auth = createAuth(store);
const server = createApp({ port, publicDir, store, config, auth });

server.listen(() => console.log(`Server is running at http://localhost:${port}`));
