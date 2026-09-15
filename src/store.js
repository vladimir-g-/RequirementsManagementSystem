import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const defaultPermissions = { create: true, read: true, update: true, delete: true };

export function createStore(dataFile, initialData) {
  if (!existsSync(dataFile)) {
    mkdirSync(dirname(dataFile), { recursive: true });
    writeFileSync(dataFile, JSON.stringify(initialData, null, 2));
  }

  let data = JSON.parse(readFileSync(dataFile, 'utf8'));
  data.users = data.users.map((user) => ({
    ...user,
    role: user.role || 'Администратор',
    projectIds: user.projectIds || [],
    permissions: { ...defaultPermissions, ...user.permissions }
  }));
  data.requirementPrefixes = Array.isArray(data.requirementPrefixes) ? data.requirementPrefixes : [];

  function save() {
    writeFileSync(dataFile, JSON.stringify(data, null, 2));
  }

  return {
    get data() { return data; },
    save,
    defaultPermissions
  };
}
