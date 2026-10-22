// Project agreements: the text (amounts, clauses, limits), and the whole flow: draft from a contact message → send →
// the client's private page → sign with consents and a drawn signature → both copies emailed → evidence kept.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from './helpers/app.mjs';
import { buildAgreement, agreementText, cleanProject, cleanDefaults } from '../shared/agreement.js';

test('the agreement text: advance, cancellation minimums, revisions, rights and the e-signature clause', () => {
  const doc = buildAgreement({ number: 'KA-AG-2026-0001', title: 'Poster series', clientName: 'Priya Sharma', clientEmail: 'priya@example.com', date: '22 October 2026',
    project: { fee: 50000, currency: 'INR', scope: 'Three film posters', revisions: 3 }, defaults: { legalName: 'Voleti Kethan', city: 'Hyderabad, Telangana', advancePercent: 10, cancelStartedPercent: 30, cancelDraftPercent: 50 } });
  const text = agreementText(doc);
  assert.match(text, /advance of 10% of the total fee: ₹5,000/);
  assert.match(text, /30% of the total fee \(₹15,000\)/);
  assert.match(text, /50% of the total fee \(₹25,000\)/);
  assert.match(text, /The remaining ₹45,000 is due/);
  assert.match(text, /3 rounds of revisions/);
  assert.match(text, /section 10A of the Information Technology Act, 2000/);
  assert.match(text, /courts at Hyderabad, Telangana/);
  assert.match(text, /Voleti Kethan \(trading as Kethan Artzz\)/);
  assert.equal(doc.figures.advance, 5000);
});

test('limits: minimums never fall below the advance, percentages are clamped, text is cleaned', () => {
  const p = cleanProject({ fee: '1000.555', advancePercent: 40, cancelStartedPercent: 10, cancelDraftPercent: 5, currency: 'XYZ', scope: 'a\u0000b' }, cleanDefaults({}));
  assert.equal(p.fee, 1000.56); assert.equal(p.currency, 'INR'); assert.equal(p.scope, 'ab');
  assert.equal(p.cancelStartedPercent, 40, 'the cancellation minimum is at least the advance');
  assert.equal(p.cancelDraftPercent, 40);
  assert.equal(cleanDefaults({ advancePercent: 500 }).advancePercent, 100);
});

test('the full flow: draft from a message, send, open, sign, copies emailed, record kept', async () => {
  const app = await createTestApp({ ADMIN_SETUP_TOKEN: 'setup-code-123', ADMIN_ENCRYPTION_KEY: 'k' });
  try {
    const setup = await app.call('POST', '/api/admin/setup', { body: { email: 'owner@example.com', password: 'a long owner passphrase', token: 'setup-code-123' }, ip: '198.51.100.99' });
    assert.ok(setup.status < 300, setup.text);
    const login = await app.call('POST', '/api/admin/login', { body: { email: 'owner@example.com', password: 'a long owner passphrase' }, ip: '198.51.100.98' });
    const headers = { cookie: login.headers.get('set-cookie').split(';')[0], 'x-csrf-token': login.json.csrf };
    const admin = (method, path, body) => app.call(method, '/api/admin' + path, { body, headers, ip: '198.51.100.98' });

    const msg = await app.call('POST', '/api/contact', { body: { name: 'Priya Sharma', email: 'priya@example.com', subject: 'A new project', message: 'Three posters for our film, please.' }, ip: '198.51.100.50' });
    assert.equal(msg.status, 201);
    const messageId = msg.json.thread.split('.')[0];

    const draft = await admin('POST', '/agreements', { clientName: 'Priya Sharma', clientEmail: 'priya@example.com', title: 'Film poster series', messageId, project: { fee: 60000, scope: 'Three film posters', deliverables: 'Print-ready PDFs and social sizes' } });
    assert.equal(draft.status, 200, draft.text);
    const a = draft.json.agreement;
    assert.match(a.number, /^KA-AG-\d{4}-0001$/); assert.equal(a.status, 'draft'); assert.equal(a.link, null);

    const noName = await admin('POST', `/agreements/${a.id}/send`);
    assert.equal(noName.status, 400, 'the owner’s legal name is required first');
    const saved = await admin('PUT', '/agreements/defaults', { value: { legalName: 'Voleti Kethan', city: 'Hyderabad', paymentDetails: 'UPI: kethan@bank' }, revision: 0 });
    assert.equal(saved.status, 200, saved.text);

    const sent = await admin('POST', `/agreements/${a.id}/send`);
    assert.equal(sent.status, 200, sent.text);
    const link = sent.json.agreement.link;
    assert.match(link, /\/agreement\/[0-9a-f-]{36}\?t=[0-9a-f]{32}$/);
    const req = app.mail.sent.find(m => m.subject === 'Your project agreement: Film poster series');
    assert.ok(req && req.to === 'priya@example.com' && req.text.includes(link));
    const reply = (await app.pg.query('select body from message_replies where message_id = $1', [messageId])).rows;
    assert.equal(reply.length, 1, 'it also shows in the conversation on their device');
    assert.equal((await admin('PUT', `/agreements/${a.id}`, { clientName: 'X Y', clientEmail: 'x@example.com', title: 'Changed' })).status, 409, 'a sent agreement is frozen');

    const path = new URL(link).pathname + new URL(link).search;
    assert.equal((await app.call('GET', path.replace(/t=[0-9a-f]+/, 't=' + '0'.repeat(32)))).status, 404, 'a forged token sees nothing');
    const pageRes = await app.call('GET', path, { ip: '198.51.100.50' });
    assert.equal(pageRes.status, 200);
    assert.match(pageRes.text, /Sign this agreement/); assert.match(pageRes.text, /₹6,000/);
    assert.match(pageRes.headers.get('content-security-policy'), /script-src 'nonce-/);
    const hash = /data-hash="([0-9a-f]{64})"/.exec(pageRes.text)[1];
    const t = new URL(link).searchParams.get('t');
    const sig = 'data:image/png;base64,' + 'A'.repeat(400);
    const consents = { read: true, advance: true, cancellation: true, esign: true };

    assert.equal((await app.call('POST', `/api/agreements/${a.id}/sign`, { body: { t, hash, name: 'Priya Sharma', signature: sig, consents: { ...consents, cancellation: false } } })).status, 400, 'every box must be ticked');
    assert.equal((await app.call('POST', `/api/agreements/${a.id}/sign`, { body: { t, hash: 'f'.repeat(64), name: 'Priya Sharma', signature: sig, consents } })).status, 409, 'a changed text can’t be signed');
    assert.equal((await app.call('POST', `/api/agreements/${a.id}/sign`, { body: { t, hash, name: 'Priya Sharma', signature: 'nope', consents } })).status, 400, 'a signature is required');
    const signed = await app.call('POST', `/api/agreements/${a.id}/sign`, { body: { t, hash, name: 'Priya Sharma', signature: sig, consents }, ip: '198.51.100.50', country: 'IN', headers: { 'user-agent': 'TestBrowser/1.0' } });
    assert.equal(signed.status, 200, signed.text);
    assert.equal((await app.call('POST', `/api/agreements/${a.id}/sign`, { body: { t, hash, name: 'Priya Sharma', signature: sig, consents } })).status, 409, 'signed once only');

    const row = (await app.pg.query('select status, signer_name, signer_ip, signer_country, signer_ua, document_hash, meta from agreements where id = $1', [a.id])).rows[0];
    assert.equal(row.status, 'signed'); assert.equal(row.signer_ip, '198.51.100.50'); assert.equal(row.signer_country, 'IN'); assert.equal(row.signer_ua, 'TestBrowser/1.0'); assert.equal(row.document_hash, hash);
    assert.deepEqual(row.meta.log.map(l => l.event), ['sent', 'viewed', 'signed']);
    const copy = app.mail.sent.find(m => m.to === 'priya@example.com' && m.subject.startsWith('Signed:'));
    assert.ok(copy, 'the client gets a signed copy'); assert.equal(copy.attachments.length, 1); assert.match(copy.attachments[0].content, /SHA-256/); assert.match(copy.text, /UPI: kethan@bank/);
    assert.ok(app.mail.sent.find(m => m.to === 'owner@example.com' && m.subject.startsWith('Signed:')), 'the owner is told');

    const after = await app.call('GET', path);
    assert.match(after.text, /Signing record/); assert.doesNotMatch(after.text, /Sign this agreement/);
    const adv = await admin('POST', `/agreements/${a.id}/advance`, { paid: true, note: 'UPI ref 123' });
    assert.ok(adv.json.agreement.advance_paid_at);
    assert.equal((await admin('DELETE', `/agreements/${a.id}`)).status, 409, 'a signed agreement can’t be deleted');
  } finally { await app.close(); }
});
