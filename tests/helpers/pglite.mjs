// Test database: a fresh in-memory SQLite with every migration applied (see server/dev/sqlite.js).
export { migrate } from '../../server/dev/sqlite.js';
import { openSqlite } from '../../server/dev/sqlite.js';

export function createTestDatabase(file){ return openSqlite(file); }
