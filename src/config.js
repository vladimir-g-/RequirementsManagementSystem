import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function createConfig(rootDir) {
  const configDir = join(rootDir, 'public', 'config');
  const names = ['types', 'projects'];

  function load() {
    return {
      statuses: [],
      priorities: [],
      complexities: [],
      ...Object.fromEntries(names.map((name) => [name, JSON.parse(readFileSync(join(configDir, `${name}.json`), 'utf8'))]))
    };
  }

  return { load };
}
