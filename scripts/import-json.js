import { resolve, join } from 'node:path';
import { createPool, importJsonFile, rootDir } from '../src/database.js';

const sourceFile = process.argv[2] ? resolve(process.cwd(), process.argv[2]) : join(rootDir, 'data', 'database.json');
const pool = createPool();
try {
  const result = await importJsonFile(pool, sourceFile);
  if (!result.imported) {
    console.log(`This JSON snapshot was already imported (${result.fingerprint}); no rows were changed.`);
  } else {
    console.log(`Imported ${result.source || sourceFile} (${result.fingerprint}).`);
    console.log('Row counts:', result.counts);
  }
} catch (error) {
  console.error('JSON import failed:', error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
