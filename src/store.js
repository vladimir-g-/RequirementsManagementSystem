import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

const defaultPermissions = { create: true, read: true, update: true, delete: true };
const defaultRequirementLinkTypes = [
  { id: 'link-clarifies', name: 'Уточняет', directed: true },
  { id: 'link-based-on', name: 'Основано на', directed: true },
  { id: 'link-depends-on', name: 'Зависит от', directed: true },
  { id: 'link-conflicts-with', name: 'Конфликтует с', directed: false },
  { id: 'link-duplicates', name: 'Дублирует', directed: false },
  { id: 'link-related-to', name: 'Связано с', directed: false }
];

export function createStore(dataFile, initialData) {
  if (!existsSync(dataFile)) {
    mkdirSync(dirname(dataFile), { recursive: true });
    writeFileSync(dataFile, JSON.stringify(initialData, null, 2));
  }

  let data = JSON.parse(readFileSync(dataFile, 'utf8'));
  let migrated = false;
  if (!Array.isArray(data.requirementLinkTypes)) {
    data.requirementLinkTypes = defaultRequirementLinkTypes.map((item) => ({ ...item }));
    migrated = true;
  }
  if (!Array.isArray(data.requirementLinks)) {
    data.requirementLinks = [];
    migrated = true;
  }
  data.users = data.users.map((user) => {
    const projectIds = Array.isArray(user.projectIds) ? [...new Set(user.projectIds)] : [];
    const legacyPermissions = user.permissions !== undefined
      ? { ...defaultPermissions, ...user.permissions }
      : { create: false, read: false, update: false, delete: false };
    const storedPermissions = user.projectPermissions && typeof user.projectPermissions === 'object' ? user.projectPermissions : null;
    const projectPermissions = Object.fromEntries(projectIds.map((projectId) => [
      projectId,
      { ...defaultPermissions, ...(storedPermissions?.[projectId] || legacyPermissions) }
    ]));
    if (!storedPermissions || user.permissions !== undefined || Object.keys(storedPermissions).length !== projectIds.length || projectIds.some((projectId) => !storedPermissions[projectId])) migrated = true;
    return {
      ...user,
      role: user.role || 'Администратор',
      projectIds,
      projectPermissions,
      permissions: undefined
    };
  });
  data.requirementPrefixes = Array.isArray(data.requirementPrefixes) ? data.requirementPrefixes : [];
  data.groups = Array.isArray(data.groups) ? data.groups : [];
  data.requirements = data.requirements.map((requirement) => ({ ...requirement, groupId: requirement.groupId || null }));

  function save() {
    const temporaryFile = `${dataFile}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporaryFile, JSON.stringify(data, null, 2), { flag: 'wx' });
      renameSync(temporaryFile, dataFile);
    } catch (error) {
      try {
        unlinkSync(temporaryFile);
      } catch (cleanupError) {
        if (cleanupError.code !== 'ENOENT') throw new AggregateError([error, cleanupError], 'Не удалось сохранить данные и удалить временный файл');
      }
      throw error;
    }
  }
  if (migrated) save();

  return {
    get data() { return data; },
    save,
    defaultPermissions
  };
}
