import { config } from 'dotenv';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword, randomToken } from '../server/core/crypto.js';
import { openPglite } from '../server/dev/pglite.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
config({ path: resolve(root, '.env') });

if (process.env.DATABASE_URL) {
  throw new Error('Refusing to reset a remote database. This script is for local development only.');
}

const dataDir = resolve(root, process.env.KA_DATA_DIR || '.data', 'pglite');
const db = await openPglite(dataDir);

try {
  const owners = (await db.query('select id, email from admin_users order by created_at')).rows;
  if (owners.length !== 1) {
    throw new Error(`Expected exactly one local owner account; found ${owners.length}. No credentials were changed.`);
  }

  const owner = owners[0];
  const password = randomToken(24);
  const passwordHash = await hashPassword(password);

  await db.transaction(async (tx) => {
    await tx.query('update admin_users set password_hash = $2, failed_attempts = 0, locked_until = null, password_changed_at = now() where id = $1', [owner.id, passwordHash]);
    await tx.query('update admin_sessions set revoked_at = now() where user_id = $1 and revoked_at is null', [owner.id]);
  });

  console.log(`Portal email: ${owner.email}`);
  console.log(`New password: ${password}`);
  console.log('Existing two-factor authentication, if enabled, is unchanged.');
} finally {
  await db.close();
}