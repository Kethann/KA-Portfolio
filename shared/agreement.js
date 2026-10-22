// The project agreement: one pure function that turns the owner's defaults (portal: Agreements > Default terms) and one
// project's details into the full agreement, clause by clause. The portal previews it with this same code and the server
// freezes its output when the agreement is sent, so what the owner previews is exactly what the client signs.
//
// Written for a freelance creative practice in India (Indian Contract Act, 1872; Information Technology Act, 2000).
// It is a carefully drafted template, not legal advice: have a lawyer review it once for your own practice.

export const AGREEMENT_DEFAULTS = {
  legalName: '',             // the owner's legal name (shown as "Creator"), e.g. "Voleti Kethan, trading as Kethan Artzz"
  tradingName: 'Kethan Artzz',
  address: '',               // postal address for notices (optional)
  city: '',                  // courts with jurisdiction, e.g. "Hyderabad, Telangana"
  email: '',                 // where notices go (falls back to the site's owner email)
  advancePercent: 10,        // paid before work starts
  cancelStartedPercent: 30,  // minimum fee if the client stops after work has started
  cancelDraftPercent: 50,    // minimum fee if the client stops after the first drafts are delivered
  revisions: 2,              // rounds of changes included
  revisionFee: '',           // e.g. "₹1,500 per extra round"
  paymentDays: 7,            // invoices are due within this many days
  inactivityDays: 30,        // silence after which the project may be treated as cancelled by the client
  paymentDetails: '',        // UPI ID / bank details shown under the advance
  portfolioUse: true,        // the Creator may show the finished work in their portfolio
  extraTerms: ''             // the owner's own additional clauses (plain text)
};
export const AGREEMENT_RANGES = { advancePercent: [0, 100], cancelStartedPercent: [0, 100], cancelDraftPercent: [0, 100], revisions: [0, 50], paymentDays: [1, 90], inactivityDays: [7, 365] };

/** a project's details: what the owner fills in for one client */
export const PROJECT_DEFAULTS = {
  clientCompany: '', clientAddress: '', clientPhone: '',
  scope: '', deliverables: '', timeline: '', startDate: '',
  fee: 0, currency: 'INR', taxNote: 'plus GST, if applicable',
  balanceTerms: 'on completion, before the final files are delivered',
  rights: 'full',            // 'full' = ownership of the final deliverables passes on full payment; 'license' = a usage licence
  usage: '',                 // for 'license': what the client may use the work for
  confidential: false,       // true: the Creator keeps the project private (no portfolio use)
  paymentLink: '',
  notes: ''
};

const clamp = (n, lo, hi, d) => { const x = Number(n); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, Math.round(x))) : d; };
const s = (v, max = 4000) => typeof v === 'string' ? v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max) : '';

/** defaults made safe (the server stores this; the portal edits it) */
export function cleanDefaults(input = {}){
  const o = { ...AGREEMENT_DEFAULTS };
  for (const k of Object.keys(AGREEMENT_DEFAULTS)){
    const d = AGREEMENT_DEFAULTS[k], v = input[k];
    if (typeof d === 'number'){ const [lo, hi] = AGREEMENT_RANGES[k] || [0, 1e6]; o[k] = clamp(v, lo, hi, d); }
    else if (typeof d === 'boolean') o[k] = v === undefined ? d : v === true;
    else o[k] = v === undefined ? d : s(v, k === 'extraTerms' ? 6000 : 400);
  }
  return o;
}
/** a project's details made safe; the per-project percentages override the defaults when given */
export function cleanProject(input = {}, defaults = AGREEMENT_DEFAULTS){
  const p = { ...PROJECT_DEFAULTS };
  for (const k of Object.keys(PROJECT_DEFAULTS)){
    const d = PROJECT_DEFAULTS[k], v = input[k];
    if (k === 'fee') p.fee = Math.max(0, Math.min(1e9, Math.round(Number(v) * 100) / 100 || 0));
    else if (k === 'currency') p.currency = v === 'USD' ? 'USD' : 'INR';
    else if (k === 'rights') p.rights = v === 'license' ? 'license' : 'full';
    else if (typeof d === 'boolean') p[k] = v === true;
    else p[k] = v === undefined ? d : s(v, ['scope', 'deliverables', 'notes', 'usage'].includes(k) ? 4000 : 300);
  }
  for (const k of ['advancePercent', 'cancelStartedPercent', 'cancelDraftPercent', 'revisions']){
    const [lo, hi] = AGREEMENT_RANGES[k];
    p[k] = input[k] === undefined || input[k] === '' || input[k] === null ? defaults[k] : clamp(input[k], lo, hi, defaults[k]);
  }
  if (p.cancelStartedPercent < p.advancePercent) p.cancelStartedPercent = p.advancePercent;
  if (p.cancelDraftPercent < p.cancelStartedPercent) p.cancelDraftPercent = p.cancelStartedPercent;
  return p;
}

export function money(amount, currency){
  try { return new Intl.NumberFormat(currency === 'USD' ? 'en-US' : 'en-IN', { style: 'currency', currency, maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount); }
  catch { return `${currency} ${amount}`; }
}
const pct = (fee, p) => Math.round(fee * p) / 100;
const lines = (t) => s(t).split('\n').map(x => x.trim()).filter(Boolean);

/**
 * The whole agreement.
 * @returns {{ number, title, date, parties: {creator, client}, summary: [label, value][], sections: {heading, paras: string[]}[] }}
 */
export function buildAgreement({ number, title, clientName, clientEmail, date, project, defaults, ownerEmail = '' }){
  const D = cleanDefaults(defaults), P = cleanProject(project, D);
  const cur = P.currency, fee = P.fee, M = (n) => money(n, cur);
  const adv = pct(fee, P.advancePercent), started = pct(fee, P.cancelStartedPercent), draft = pct(fee, P.cancelDraftPercent);
  const creatorName = D.legalName || D.tradingName || 'the Creator';
  const creator = [creatorName + (D.legalName && D.tradingName && !D.legalName.includes(D.tradingName) ? ` (trading as ${D.tradingName})` : ''), D.address, D.email || ownerEmail].filter(Boolean);
  const client = [clientName + (P.clientCompany ? `, ${P.clientCompany}` : ''), P.clientAddress, clientEmail, P.clientPhone].filter(Boolean);
  const court = D.city ? `the courts at ${D.city}` : 'the courts having jurisdiction where the Creator ordinarily resides';
  const sections = [];
  const add = (heading, ...paras) => sections.push({ heading, paras: paras.flat().filter(Boolean) });

  add('Parties and purpose',
    `This Project Agreement ("Agreement") is made between ${creator[0]} ("Creator") and ${client[0]} ("Client"), together "the Parties".`,
    `It sets out the terms on which the Creator will carry out the project "${title}" for the Client. It takes effect when the Client signs it electronically (the "Effective Date").`);
  add('Scope of work and deliverables',
    P.scope ? `Scope: ${P.scope}` : 'Scope: as described in the project brief agreed by email.',
    P.deliverables ? `Deliverables: ${P.deliverables}` : '',
    P.timeline ? `Timeline: ${P.timeline}${P.startDate ? ` (planned start: ${P.startDate})` : ''}. Timelines depend on the Client paying on time and giving materials and feedback promptly (Clause 9).` : (P.startDate ? `Planned start: ${P.startDate}.` : ''),
    'Anything not listed above, or a change to the agreed direction after work has started, is a change request. The Creator will quote it separately before doing it, and it is done only once the Client agrees in writing (email is enough).');
  add('Fees',
    `The total fee for the project is ${M(fee)} (${P.taxNote || 'taxes as applicable'}).`,
    'The fee covers only the scope in Clause 2 and the revisions in Clause 8. Third-party costs the Client asks for (stock images, fonts, printing, paid tools) are billed separately at cost, with the Client’s approval first.');
  add('Advance payment',
    `Before any work begins, the Client pays an advance of ${P.advancePercent}% of the total fee: ${M(adv)}. The project is booked, and the schedule starts, only when the advance has been received.`,
    `The advance reserves the Creator’s time and covers the initial research, planning and set-up. It is non-refundable once work has started, except as set out in Clause 7. It counts towards the total fee.`,
    D.paymentDetails ? `Payment details: ${D.paymentDetails}` : '',
    P.paymentLink ? `Pay online: ${P.paymentLink}` : '');
  add('Balance and payment terms',
    `The remaining ${M(Math.max(0, fee - adv))} is due ${P.balanceTerms}.`,
    `Every invoice is due within ${D.paymentDays} days of its date. The final, full-resolution files and source files are delivered once the fee has been paid in full; until then, any previews may be watermarked or in reduced quality.`,
    'If a payment is late, the Creator may pause the work until it is made, and the timeline moves by the length of the pause. Bank and transfer charges are paid by the Client.');
  add('Cancellation or discontinuation by the Client',
    'The Client may cancel or stop the project at any time by telling the Creator in writing (email is enough). Because the Creator reserves time for the project and turns down other work, the following minimum fees apply for the time and effort already given:',
    `(a) After signing, before work has started: the advance (${M(adv)}) is kept as a booking fee, and nothing more is due.`,
    `(b) After work has started: the greater of the value of the work done so far and ${P.cancelStartedPercent}% of the total fee (${M(started)}).`,
    `(c) After the first drafts, concepts or designs have been shared: the greater of the value of the work done so far and ${P.cancelDraftPercent}% of the total fee (${M(draft)}).`,
    '(d) After the final work has been delivered or approved: 100% of the total fee.',
    `Amounts already paid count towards the fee due. Any balance must be paid within ${D.paymentDays} days of cancellation. Once it is paid, the Client may use the work delivered up to that point under Clause 10; unpaid work may not be used.`,
    `If the Client does not reply, approve, or send materials the project needs for ${D.inactivityDays} days, the Creator will send one written reminder. If there is still no reply ${Math.min(14, D.inactivityDays)} days after it, the Creator may treat the project as cancelled by the Client, and this Clause applies.`);
  add('Cancellation by the Creator',
    'If the Creator has to end the project for reasons that are not caused by the Client, the Creator will refund every amount paid for work that has not been delivered, and will hand over the work completed so far. That is the Creator’s whole responsibility for ending the project early.',
    'Either Party may end this Agreement at once if the other seriously breaks it and does not put it right within 7 days of being told in writing.');
  add('Revisions and approval',
    `The fee includes ${P.revisions === 0 ? 'no rounds' : P.revisions === 1 ? 'one round' : P.revisions + ' rounds'} of revisions on the agreed direction.${D.revisionFee ? ` Further revisions are charged at ${D.revisionFee}.` : ' Further revisions are quoted and charged separately.'}`,
    'Approval of a draft or of the final work by email or message counts as written approval. Once a stage is approved, changes to it are new revisions.');
  add('The Client’s responsibilities',
    'The Client will give accurate information, the materials the project needs (texts, logos, photos, brand guides, access) and clear, timely feedback, and will pay on time.',
    'The Client confirms that they own, or have permission to use, everything they give the Creator to use in the work, and that using it as asked does not break anyone’s rights or any law.',
    'The Client is responsible for how the work is used once it is delivered: checking names, facts, claims and spellings before approval, getting any registrations (such as trademarks), and making sure the use complies with the law. The Client will cover the Creator for any claims, losses or costs that arise from the materials or instructions the Client gave, or from how the Client uses the work.');
  add('Ownership and use of the work',
    P.rights === 'license'
      ? `When the fee has been paid in full, the Client receives a licence to use the final deliverables for: ${P.usage || 'the purposes described in Clause 2'}. Copyright stays with the Creator, and other uses need the Creator’s written consent.`
      : 'When the fee has been paid in full, the copyright in the final, approved deliverables passes to the Client. Until then it stays with the Creator, and the Client may not use the work.',
    'Drafts, unused concepts, working files and the Creator’s own tools, methods and styles remain the Creator’s property, unless the Parties agree otherwise in writing.',
    P.confidential || !D.portfolioUse
      ? 'The Creator will not show the work publicly without the Client’s written permission.'
      : 'The Creator may show the finished work in their portfolio, on their website and on social media once the Client has made it public (or earlier with the Client’s permission), and may name the Client as a client.');
  add('Confidentiality',
    `Each Party will keep private any confidential information the other shares for the project, and use it only for the project. This does not cover information that is already public or must be disclosed by law.${P.confidential ? ' The project itself, and its details, are confidential.' : ''}`);
  add('Limitation of liability',
    'The Creator will do the work with reasonable skill and care. The Creator does not guarantee any particular commercial result (such as sales, reach or approval by a third party).',
    'Neither Party is responsible to the other for indirect losses, such as lost profits or lost opportunities. The Creator’s total responsibility under this Agreement is limited to the fees the Client has actually paid for the project.');
  add('Delays beyond control',
    'Neither Party is responsible for a delay or failure caused by events beyond their reasonable control (such as illness, natural disasters, power or internet outages, or government action). The affected Party will tell the other promptly, and the timeline moves accordingly. If such an event lasts more than 30 days, either Party may end the project under Clause 6(b) or 7, whichever applies.');
  add('Independent work',
    'The Creator works as an independent professional, not as the Client’s employee, and may work for other clients, without using the Client’s confidential information.');
  add('Electronic signature and records',
    'The Parties agree that this Agreement may be accepted and signed electronically, and that an electronic signature has the same effect as a handwritten one. Under section 10A of the Information Technology Act, 2000, a contract formed by electronic means is valid and enforceable.',
    'The Client confirms they open this Agreement through a private link sent to their email address. The record of signing (the name typed, the signature drawn, the date and time, the internet address and device used, and a fingerprint of this exact text) is kept as evidence of the agreement, and each Party receives a copy.');
  add('General',
    'This Agreement, with any written change requests the Parties accept, is the whole agreement about the project and replaces earlier discussions. Changes to it must be agreed in writing (email is enough).',
    'If any part of this Agreement is found invalid, the rest stays in force. Notices are sent by email to the addresses in this Agreement.',
    `This Agreement is governed by the laws of India. The Parties will first try in good faith to settle any dispute by talking for 30 days. If that does not work, ${court} have exclusive jurisdiction.`);
  if (lines(D.extraTerms).length || lines(P.notes).length) add('Additional terms', lines(D.extraTerms), lines(P.notes));

  const summary = [
    ['Project', title], ['Total fee', `${M(fee)}${P.taxNote ? ` (${P.taxNote})` : ''}`],
    [`Advance (${P.advancePercent}%)`, `${M(adv)}, before work starts`], ['Balance', `${M(Math.max(0, fee - adv))}, ${P.balanceTerms}`],
    ['If cancelled after work starts', `at least ${M(started)} (${P.cancelStartedPercent}%)`], ['After first drafts', `at least ${M(draft)} (${P.cancelDraftPercent}%)`],
    ['Revisions included', String(P.revisions)], ...(P.timeline ? [['Timeline', P.timeline]] : [])
  ];
  return { number, title, date, parties: { creator, client }, summary, sections, figures: { fee, currency: cur, advance: adv, advancePercent: P.advancePercent, started, draft } };
}

/** the agreement as plain text: what is frozen, hashed and attached to the emails */
export function agreementText(a){
  const out = [`PROJECT AGREEMENT  ${a.number}`, a.title, `Date: ${a.date}`, '', 'CREATOR', ...a.parties.creator, '', 'CLIENT', ...a.parties.client, '', 'AT A GLANCE', ...a.summary.map(([k, v]) => `${k}: ${v}`), ''];
  a.sections.forEach((sec, i) => { out.push(`${i + 1}. ${sec.heading.toUpperCase()}`); sec.paras.forEach(p => out.push(p)); out.push(''); });
  return out.join('\n').trim() + '\n';
}
