// Test database: a fresh in-memory PGlite with every migration applied (see server/dev/pglite.js).
export { migrate } from '../../server/dev/pglite.js';
import { openPglite } from '../../server/dev/pglite.js';

export function createTestDatabase(dataDir){ return openPglite(dataDir); }
