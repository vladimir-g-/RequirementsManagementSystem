import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

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
  data.users = data.users.map((user) => ({
    ...user,
    role: user.role || 'Администратор',
    projectIds: user.projectIds || [],
    permissions: { ...defaultPermissions, ...user.permissions }
  }));
  data.requirementPrefixes = Array.isArray(data.requirementPrefixes) ? data.requirementPrefixes : [];
  data.groups = Array.isArray(data.groups) ? data.groups : [];
  data.requirements = data.requirements.map((requirement) => ({ ...requirement, groupId: requirement.groupId || null }));

  function save() {
    writeFileSync(dataFile, JSON.stringify(data, null, 2));
  }
  if (migrated) save();

  return {
    get data() { return data; },
    save,
    defaultPermissions
  };
}
