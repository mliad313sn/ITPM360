// Test bootstrap: provisions a clean itpm360_test database, runs migrations,
// and inserts the bootstrap admin (everything else is created through the API).
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';
import bcrypt from 'bcryptjs';

const serverDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://postgres@localhost:5432/itpm360_test';

export const ADMIN = { email: 'admin@test.dev', password: 'TestPassword1!' };

export async function resetTestDatabase() {
  const url = new URL(TEST_DATABASE_URL);
  const dbName = url.pathname.slice(1);

  // ensure the database exists (connect via the maintenance db)
  const adminUrl = new URL(TEST_DATABASE_URL);
  adminUrl.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  const { rows } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
  if (!rows.length) await admin.query(`CREATE DATABASE ${JSON.stringify(dbName).replaceAll('"', '"')}`);
  await admin.end();

  // clean slate + migrations
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await client.end();

  execFileSync(process.execPath, ['src/migrate.js'], {
    cwd: serverDir,
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'pipe',
  });

  // bootstrap admin (the only row not created through the API)
  const seed = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await seed.connect();
  const hash = await bcrypt.hash(ADMIN.password, 4);
  const { rows: [user] } = await seed.query(
    `INSERT INTO users (email, full_name, password_hash) VALUES ($1, 'Test Admin', $2) RETURNING id`,
    [ADMIN.email, hash]
  );
  await seed.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'global_admin')`, [user.id]);
  await seed.end();
}
