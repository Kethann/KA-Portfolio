// The portal team (owner only): add people with a temporary password (they must choose their own at
// first sign-in), change their role, reset their password, sign them out everywhere, switch their
// access off and on, and delete them. Nobody can remove or lock out the last owner, or themselves.
import { json, readJson, HttpError } from '../core/http.js';
import { getDb } from '../core/db.js';
import { email as vEmail, str } from '../core/validate.js';
import { hashPassword } from '../core/crypto.js';
import { audit, passwordPolicy } from './auth.js';

function ownerOnly(ctx){
  if (ctx.admin.role !== 'owner') throw new HttpError(403, 'Only an owner can manage the team.', { code: 'owner_only' });
}
const ROLES = ['owner', 'admin'];

export async function listTeam(ctx){
  ownerOnly(ctx);
  const db = await getDb();
  const people = await db.query(`select u.id, u.email, u.name, u.role, u.totp_enabled as "twoFactor", u.must_change_password as "mustChangePassword",
      u.disabled_at as "disabledAt", u.created_at as "createdAt", u.locked_until as "lockedUntil",
      (select max(s.last_seen_at) from admin_sessions s where s.user_id = u.id) as "lastSeenAt",
      (select count(*) from admin_sessions s where s.user_id = u.id and s.revoked_at is null and s.expires_at > now()) as "activeSessions"
    from admin_users u order by (u.role = 'owner') desc, u.created_at`);
  return json({ people: people.map(p => ({ ...p, twoFactor: !!p.twoFactor, mustChangePassword: !!p.mustChangePassword, you: p.id === ctx.admin.userId })) });
}

export async function addPerson(ctx){
  ownerOnly(ctx);
  const b = await readJson(ctx.request, 4096);
  const email = vEmail(b.email);
  const name = str(b.name, { name: 'Name', max: 80 });
  const role = ROLES.includes(b.role) ? b.role : 'admin';
  const password = passwordPolicy(b.password);
  const db = await getDb();
  if (await db.maybeOne('select 1 from admin_users where email = $1', [email])) throw new HttpError(409, 'Someone with that email is already on the team.');
  await db.query(`insert into admin_users (email, name, role, password_hash, must_change_password, created_by) values ($1, $2, $3, $4, true, $5)`,
    [email, name, role, await hashPassword(password), ctx.admin.userId]);
  await audit(ctx, 'team_added', email, { role });
  return listTeam(ctx);
}

async function target(ctx, db){
  const u = await db.maybeOne('select * from admin_users where id = $1', [ctx.params.id]);
  if (!u) throw new HttpError(404, 'That person isn’t on the team any more.');
  return u;
}
// the last active owner can't be demoted, switched off or deleted: someone must always be able to manage the team
async function assertNotLastOwner(db, u, action){
  if (u.role !== 'owner') return;
  const owners = (await db.one(`select count(*) as n from admin_users where role = 'owner' and disabled_at is null`)).n;
  if (owners <= 1) throw new HttpError(409, `You can’t ${action} the only owner. Make someone else an owner first.`);
}

export async function updatePerson(ctx){
  ownerOnly(ctx);
  const b = await readJson(ctx.request, 4096);
  const db = await getDb();
  const u = await target(ctx, db);
  const name = b.name === undefined ? u.name : str(b.name, { name: 'Name', max: 80 });
  let role = u.role;
  if (b.role !== undefined && b.role !== u.role){
    if (!ROLES.includes(b.role)) throw new HttpError(400, 'Unknown role.');
    if (u.id === ctx.admin.userId) throw new HttpError(409, 'You can’t change your own role.');
    if (b.role !== 'owner') await assertNotLastOwner(db, u, 'change the role of');
    role = b.role;
  }
  await db.query('update admin_users set name = $2, role = $3 where id = $1', [u.id, name, role]);
  await audit(ctx, 'team_updated', u.email, { role });
  return listTeam(ctx);
}

export async function resetPersonPassword(ctx){
  ownerOnly(ctx);
  const b = await readJson(ctx.request, 4096);
  const db = await getDb();
  const u = await target(ctx, db);
  if (u.id === ctx.admin.userId) throw new HttpError(409, 'Change your own password in Account & security.');
  const password = passwordPolicy(b.password);
  const hash = await hashPassword(password);
  await db.batch([
    [`update admin_users set password_hash = $2, must_change_password = true, password_changed_at = now(), failed_attempts = 0, locked_until = null where id = $1`, [u.id, hash]],
    ['update admin_sessions set revoked_at = now() where user_id = $1 and revoked_at is null', [u.id]],
  ]);
  await audit(ctx, 'team_password_reset', u.email);
  return listTeam(ctx);
}

export async function signOutPerson(ctx){
  ownerOnly(ctx);
  const db = await getDb();
  const u = await target(ctx, db);
  if (u.id === ctx.admin.userId) throw new HttpError(409, 'Use Sign out everywhere in Account & security for yourself.');
  await db.query('update admin_sessions set revoked_at = now() where user_id = $1 and revoked_at is null', [u.id]);
  await audit(ctx, 'team_signed_out', u.email);
  return listTeam(ctx);
}

export async function setPersonAccess(ctx){
  ownerOnly(ctx);
  const b = await readJson(ctx.request, 1024);
  const db = await getDb();
  const u = await target(ctx, db);
  if (u.id === ctx.admin.userId) throw new HttpError(409, 'You can’t switch off your own access.');
  const off = b.enabled === false;
  if (off) await assertNotLastOwner(db, u, 'switch off');
  await db.batch([
    ['update admin_users set disabled_at = $2 where id = $1', [u.id, off ? new Date() : null]],
    off && ['update admin_sessions set revoked_at = now() where user_id = $1 and revoked_at is null', [u.id]],
  ]);
  await audit(ctx, off ? 'team_access_off' : 'team_access_on', u.email);
  return listTeam(ctx);
}

export async function deletePerson(ctx){
  ownerOnly(ctx);
  const db = await getDb();
  const u = await target(ctx, db);
  if (u.id === ctx.admin.userId) throw new HttpError(409, 'You can’t delete yourself. Ask another owner.');
  await assertNotLastOwner(db, u, 'delete');
  await db.query('delete from admin_users where id = $1', [u.id]);   // sessions go with it (on delete cascade)
  await audit(ctx, 'team_deleted', u.email);
  return listTeam(ctx);
}

export function registerTeam(route){
  const a = { access: 'admin' };
  route('GET', '/api/admin/team', listTeam, a);
  route('POST', '/api/admin/team', addPerson, a);
  route('PUT', '/api/admin/team/:id', updatePerson, a);
  route('POST', '/api/admin/team/:id/password', resetPersonPassword, a);
  route('POST', '/api/admin/team/:id/sign-out', signOutPerson, a);
  route('POST', '/api/admin/team/:id/access', setPersonAccess, a);
  route('DELETE', '/api/admin/team/:id', deletePerson, a);
}
