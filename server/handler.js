// Host-neutral entry point: handle(request, platform) -> Response. Platform adapters
// (server/platform/*.js) call this; nothing in here knows which host it runs on.
import { createRouter } from './core/router.js';
import { json } from './core/http.js';
import * as pub from './handlers/public.js';
import { assistant } from './handlers/assistant.js';
import * as cron from './handlers/cron.js';
import { registerStorePublic } from './handlers/store-public.js';
import { registerCheckout } from './handlers/checkout.js';
import { registerLegal } from './handlers/legal.js';
import { registerLicense } from './handlers/license.js';

import { registerAuth, requireAdmin } from './admin/auth.js';
import { registerTeam } from './admin/team.js';
import { registerCatalog } from './admin/catalog.js';
import { registerSales } from './admin/sales.js';
import { registerContent } from './admin/content.js';
import { registerMessages } from './admin/messages.js';
import { registerSystem } from './admin/system.js';
import { registerVisitors } from './admin/visitors.js';
import { registerVisits } from './visitors/track.js';
import { registerAssistantAdmin } from './admin/assistant.js';
import { registerUsage } from './admin/usage.js';
import { registerSocial } from './admin/social.js';

export const router = createRouter();
const { route } = router;
registerStorePublic(route);
registerCheckout(route);
registerLegal(route);
registerLicense(route);

// ---- creator portal: every /api/admin/* route below the auth endpoints runs requireAdmin first
router.setGuard('admin', requireAdmin);
router.setGuard('afterAdminWrite', pub.bumpLiveVersion);
registerAuth(route);
registerTeam(route);
registerCatalog(route);
registerSales(route);
registerContent(route);
registerMessages(route);
registerSystem(route);
registerVisitors(route);
registerVisits(route);
registerAssistantAdmin(route);
registerSocial(route);
registerUsage(route);

// ---- public site
route('GET', '/api/public-config', pub.publicConfig);
route('GET', '/api/portfolio', pub.portfolio);
route('GET', '/api/intro', pub.intro);
route('GET', '/api/live', pub.liveVersion);
route('POST', '/api/contact', pub.contact);
route('POST', '/api/notify', pub.notify);
route('POST', '/api/assistant', assistant);
route('GET', '/api/health', async () => json({ ok: true }));

// ---- scheduled jobs
route('GET', '/api/cron/daily', cron.daily, { access: 'cron' });
route('GET', '/api/cron/weekly', cron.weekly, { access: 'cron' });
route('GET', '/api/cron/social', cron.social, { access: 'cron' });

// Extension point for later phases: each module registers its own routes.
export function register(fn){ fn(route); }

export async function handle(request, platform){
  return router.dispatch(request, platform);
}
