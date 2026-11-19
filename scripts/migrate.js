import { createPool, runMigrations } from '../src/database.js';

const pool = createPool();
try {
  const applied = await runMigrations(pool);
  console.log(`Database schema is current (${applied.length} migration file(s) checked).`);
} catch (error) {
  console.error('Database migration failed:', error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
