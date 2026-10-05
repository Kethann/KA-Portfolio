// Content: portfolio images and folders, the site's words, the Image Upscaler notice + notify list,
// and every email the site sends.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppProps } from './registry';
import { useDraft, useLoad, useUnsavedGuard } from '../hooks';
import { del, get, post, put, upload } from '../api';
import { AsyncButton, Badge, Empty, ErrorState, Field, Modal, SkeletonRows, Switch, useConfirm, useToast } from '../ui';
import { Icon } from '../icons';
import { WinTools } from '../shell/Window';
import { TagInput, Uploader, useSaveKey } from './common';
import { discardSite, keepMineOverTheirs, loadSite, saveSite, thumb, updateSite, useSite } from './siteDoc';
import { SKILL_ICONS, SKILL_LIMITS } from './siteDoc';
import type { SkillsDraft } from './siteDoc';
import type { SiteImage, StatItem, SkillCategory, SkillItem, AboutDraft, JourneyStep, ReelVideo } from './siteDoc';
import { ABOUT_LIMITS, aboutDefaults } from './siteDoc';
import { ago, dateTime } from '../format';
import { SKILL_LOGO_LIST, skillLogoFor, type SkillLogo } from '../../../../shared/skill-logos.js';

type Tab = 'portfolio' | 'text' | 'upscaler' | 'emails';
const TEXT_FIELDS: [string, string, number, boolean?][] = [
  ['creatorName', 'Your name', 80], ['tagline', 'Tagline', 160], ['portfolioTitle', 'Portfolio heading', 100], ['portfolioIntro', 'Portfolio intro', 500, true],
  ['contactTitle', 'Contact heading', 100], ['contactIntro', 'Contact intro', 1000, true], ['openLabel', '“Open” button', 60], ['closeLabel', '“Close” button', 60],
  ['projectLabel', '“Project” label', 60], ['contactButton', 'Contact button', 60]
];

export function SiteSaveBar(){
  const site = useSite();
  const toast = useToast();
  const confirm = useConfirm();
  useUnsavedGuard(site.dirty, { window: false });   // the draft is shared with Studio and survives closing
  if (!site.doc) return null;
  return <>
    {site.dirty && <span className="faint" style={{ fontSize: 12 }}>Unsaved site changes</span>}
    {site.dirty && <button type="button" className="btn sm ghost" onClick={async () => { if (await confirm({ title: 'Discard site changes?', body: 'This affects both Studio and Content.', confirm: 'Discard', danger: true })) discardSite(); }}>Discard</button>}
    <button type="button" className="btn primary sm" disabled={!site.dirty || site.saving} onClick={() => saveSite().then(() => toast.show('Site updated: live within a few seconds', { tone: 'success' })).catch(async (e) => {
      if (e.code !== 'stale') return toast.error(e);
      // published from another device or tab meanwhile: never throw these edits away without asking
      const mine = await confirm({ title: 'The site was changed somewhere else', body: 'Someone published the site from another device or tab after you started editing. Publish your version over theirs, or load theirs and drop your unsaved changes?', confirm: 'Publish mine' });
      if (mine){ try { await keepMineOverTheirs(); await saveSite(); toast.show('Site updated: live within a few seconds', { tone: 'success' }); } catch (e2){ toast.error(e2); } }
      else { discardSite(); await loadSite(true); toast.show('Loaded the latest version'); }
    })}>
      {site.saving ? 'Saving…' : 'Publish changes'}</button>
  </>;
}

export default function Content({ route, go, active }: AppProps){
  const tab: Tab = (['portfolio', 'text', 'upscaler', 'emails'] as Tab[]).includes(route.split('/')[0] as Tab) ? route.split('/')[0] as Tab : route === 'notify' ? 'upscaler' : 'portfolio';
  const site = useSite();
  const toast = useToast();
  useEffect(() => { void loadSite(); }, []);
  useSaveKey(active && (tab === 'portfolio' || tab === 'text'), () => { if (site.dirty) saveSite().then(() => toast.show('Site updated', { tone: 'success' })).catch(toast.error); });
  return (
    <div className="app">
      <WinTools>{(tab === 'portfolio' || tab === 'text') && <SiteSaveBar />}</WinTools>
      <div className="tabs" role="tablist" aria-label="Content sections">
        {([['portfolio', 'Portfolio'], ['text', 'Site text'], ['upscaler', 'Upscaler & list'], ['emails', 'Emails']] as [Tab, string][]).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => go(k)}>{l}</button>
        ))}
      </div>
      {tab === 'emails' ? <Emails /> : tab === 'upscaler' ? <Upscaler /> : site.error && !site.doc ? <ErrorState message={site.error} retry={() => loadSite(true)} /> : !site.doc ? <div className="pad"><SkeletonRows rows={8} /></div> : tab === 'text' ? <SiteText /> : <Portfolio />}
    </div>
  );
}

function SiteText(){
  const { doc } = useSite();
  return (
    <div className="app-main" style={{ maxWidth: 820, margin: '0 auto', width: '100%' }}>
      <p className="muted">The words on the homepage. Changes go live when you press <b>Publish changes</b>.</p>
      <div className="form-grid">
        {TEXT_FIELDS.map(([k, label, max, long]) => (
          <Field key={k} label={label} hint={`${(doc!.details[k] || '').length}/${max}`}>
            {long ? <textarea rows={3} maxLength={max} value={doc!.details[k] || ''} onChange={e => updateSite(d => ({ ...d, details: { ...d.details, [k]: e.target.value } }))} />
              : <input maxLength={max} value={doc!.details[k] || ''} onChange={e => updateSite(d => ({ ...d, details: { ...d.details, [k]: e.target.value } }))} />}
          </Field>
        ))}
      </div>
      <AboutStory />
      <AboutStats />
      <AboutSkills />
    </div>
  );
}

// About > story: the bio, the journey (points on a line, counting up from a year) and the promo-cut clips from YouTube.
function ytId(v: string){
  const t = v.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(t)) return t;
  try {
    const u = new URL(t);
    if (/(^|\.)youtu\.be$/.test(u.hostname)) return u.pathname.slice(1, 12);
    if (/(^|\.)youtube\.com$/.test(u.hostname)) return u.searchParams.get('v') || (/^\/(shorts|embed|live)\/([A-Za-z0-9_-]{11})/.exec(u.pathname) || [])[2] || '';
  } catch { /* not a link */ }
  return '';
}
function AboutStory(){
  const { doc } = useSite();
  const a = doc!.about;
  const confirm = useConfirm();
  const setA = (patch: Partial<AboutDraft>) => updateSite(d => ({ ...d, about: { ...d.about, ...patch } }));
  const setJ = (patch: Partial<AboutDraft['journey']>) => setA({ journey: { ...a.journey, ...patch } });
  const setR = (patch: Partial<AboutDraft['reel']>) => setA({ reel: { ...a.reel, ...patch } });
  const setStep = (i: number, patch: Partial<JourneyStep>) => setJ({ steps: a.journey.steps.map((x, j) => j === i ? { ...x, ...patch } : x) });
  const setVid = (i: number, patch: Partial<ReelVideo>) => setR({ videos: a.reel.videos.map((x, j) => j === i ? { ...x, ...patch } : x) });
  const reset = async () => { if (await confirm({ title: 'Use the suggested About story?', body: 'This replaces the bio, the journey and the clips with the suggested set. Nothing is saved until you press Publish changes.', confirm: 'Use the suggested set' })) setA(aboutDefaults()); };
  return (
    <section className="card stack" aria-labelledby="about-story-h" style={{ marginTop: 'var(--sp-5)' }}>
      <div className="row between"><h3 id="about-story-h">About story</h3>
        <button type="button" className="btn sm ghost" onClick={() => void reset()}>Use the suggested set</button></div>
      <p className="field-hint" style={{ margin: 0 }}>The bio under the About title, the journey line and the promo cuts. Publish changes to put them live.</p>
      <Field label="Bio" hint={`${a.bio.length}/1600`}><textarea rows={8} maxLength={1600} value={a.bio} onChange={e => setA({ bio: e.target.value })} /></Field>

      <div className="row between" style={{ marginTop: 8 }}><h4 style={{ margin: 0 }}>Journey</h4>
        <Switch checked={a.journey.enabled} onChange={v => setJ({ enabled: v })} label="Show on the About page" /></div>
      <div className="form-grid">
        <Field label="Since (year)" hint="The badge counts up to this year"><input type="number" min={1990} max={2100} value={a.journey.since} onChange={e => setJ({ since: Number(e.target.value) || 2021 })} style={{ width: 120 }} /></Field>
      </div>
      {a.journey.steps.map((x, i) => (
        <div className="row" key={i} style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input aria-label={`Step ${i + 1} title`} value={x.title} maxLength={40} placeholder="Point title" onChange={e => setStep(i, { title: e.target.value })} style={{ flex: '1 1 160px', minWidth: 120 }} />
          <input aria-label={`Step ${i + 1} text`} value={x.text} maxLength={90} placeholder="One line (optional)" onChange={e => setStep(i, { text: e.target.value })} style={{ flex: '2 1 220px', minWidth: 160 }} />
          <button type="button" className="icon-btn sm" title="Move up" aria-label="Move step up" disabled={i === 0} onClick={() => setJ({ steps: moveIn(a.journey.steps, i, -1) })}>↑</button>
          <button type="button" className="icon-btn sm" title="Move down" aria-label="Move step down" disabled={i === a.journey.steps.length - 1} onClick={() => setJ({ steps: moveIn(a.journey.steps, i, 1) })}>↓</button>
          <button type="button" className="icon-btn sm" title="Remove" aria-label={`Remove step ${i + 1}`} onClick={() => setJ({ steps: a.journey.steps.filter((_, j) => j !== i) })}><Icon name="trash" size={14} /></button>
        </div>
      ))}
      <div><button type="button" className="btn sm" disabled={a.journey.steps.length >= ABOUT_LIMITS.steps} onClick={() => setJ({ steps: [...a.journey.steps, { title: '', text: '' }] })}><Icon name="plus" /> Add a point</button></div>

      <div className="row between" style={{ marginTop: 8 }}><h4 style={{ margin: 0 }}>Promo cuts (YouTube)</h4>
        <Switch checked={a.reel.enabled} onChange={v => setR({ enabled: v })} label="Show on the About page" /></div>
      <p className="field-hint" style={{ margin: 0 }}>A stack of videos that plays a few random seconds of each, muted, then moves to another. Visitors can open the full video on YouTube.</p>
      <div className="form-grid">
        <Field label="Heading" hint={`${a.reel.title.length}/60`}><input maxLength={60} value={a.reel.title} onChange={e => setR({ title: e.target.value })} /></Field>
        <Field label="Intro" hint={`${a.reel.intro.length}/200`}><input maxLength={200} value={a.reel.intro} onChange={e => setR({ intro: e.target.value })} /></Field>
        <Field label="Small label" hint="Above the video title"><input maxLength={30} value={a.reel.panelLabel} onChange={e => setR({ panelLabel: e.target.value })} /></Field>
        <Field label="Side text" hint={`${a.reel.panelText.length}/220`}><textarea rows={2} maxLength={220} value={a.reel.panelText} onChange={e => setR({ panelText: e.target.value })} /></Field>
        <Field label="Watch button"><input maxLength={40} value={a.reel.buttonLabel} onChange={e => setR({ buttonLabel: e.target.value })} /></Field>
        <Field label="Channel button"><input maxLength={40} value={a.reel.channelLabel} onChange={e => setR({ channelLabel: e.target.value })} /></Field>
        <Field label="Channel link" hint="youtube.com link"><input type="url" maxLength={300} value={a.reel.channelUrl} onChange={e => setR({ channelUrl: e.target.value })} /></Field>
        <Field label="Clip length (seconds)" hint="Each clip is random between these">
          <span className="row" style={{ gap: 8 }}>
            <input type="number" aria-label="Shortest clip" min={2} max={30} value={a.reel.clipMin} onChange={e => setR({ clipMin: Number(e.target.value) || 5 })} style={{ width: 80 }} />
            <span className="faint">to</span>
            <input type="number" aria-label="Longest clip" min={2} max={30} value={a.reel.clipMax} onChange={e => setR({ clipMax: Number(e.target.value) || 8 })} style={{ width: 80 }} />
          </span></Field>
      </div>
      {a.reel.videos.map((v, i) => (
        <div className="row" key={i} style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {ytId(v.id) ? <img src={`https://i.ytimg.com/vi/${ytId(v.id)}/default.jpg`} alt="" width={56} height={32} style={{ borderRadius: 6, objectFit: 'cover' }} /> : <span style={{ width: 56, height: 32, borderRadius: 6, background: 'rgba(255,255,255,.06)' }} aria-hidden="true" />}
          <input aria-label={`Video ${i + 1} link`} value={v.id} maxLength={300} placeholder="YouTube link or video ID" onChange={e => setVid(i, { id: e.target.value })} style={{ flex: '2 1 240px', minWidth: 180 }} />
          <input aria-label={`Video ${i + 1} title`} value={v.title} maxLength={120} placeholder="Title shown beside the clip" onChange={e => setVid(i, { title: e.target.value })} style={{ flex: '2 1 200px', minWidth: 160 }} />
          <input aria-label={`Video ${i + 1} length in seconds`} type="number" min={0} max={86400} value={v.len || ''} placeholder="Length s" title="Optional. Leave empty and the page reads it from YouTube" onChange={e => setVid(i, { len: Number(e.target.value) || 0 })} style={{ width: 92 }} />
          <button type="button" className="icon-btn sm" title="Move up" aria-label="Move video up" disabled={i === 0} onClick={() => setR({ videos: moveIn(a.reel.videos, i, -1) })}>↑</button>
          <button type="button" className="icon-btn sm" title="Move down" aria-label="Move video down" disabled={i === a.reel.videos.length - 1} onClick={() => setR({ videos: moveIn(a.reel.videos, i, 1) })}>↓</button>
          <button type="button" className="icon-btn sm" title="Remove" aria-label={`Remove video ${i + 1}`} onClick={() => setR({ videos: a.reel.videos.filter((_, j) => j !== i) })}><Icon name="trash" size={14} /></button>
        </div>
      ))}
      <div><button type="button" className="btn sm" disabled={a.reel.videos.length >= ABOUT_LIMITS.videos} onClick={() => setR({ videos: [...a.reel.videos, { id: '', len: 0, title: '' }] })}><Icon name="plus" /> Add a video</button></div>
    </section>
  );
}

// About > the numbers that count up (Projects, Delivered, ...): up to 6.
function AboutStats(){
  const { doc } = useSite();
  const st = doc!.stats;
  const setItems = (items: StatItem[]) => updateSite(d => ({ ...d, stats: { ...d.stats, items } }));
  const change = (i: number, patch: Partial<StatItem>) => setItems(st.items.map((x, j) => j === i ? { ...x, ...patch } : x));
  const move = (i: number, by: number) => { const a = [...st.items]; const [x] = a.splice(i, 1); a.splice(Math.max(0, Math.min(a.length, i + by)), 0, x); setItems(a); };
  return (
    <section className="card stack" aria-labelledby="about-stats-h" style={{ marginTop: 'var(--sp-5)' }}>
      <div className="row between"><h3 id="about-stats-h">About numbers</h3>
        <Switch checked={st.enabled} onChange={v => updateSite(d => ({ ...d, stats: { ...d.stats, enabled: v } }))} label="Show on the About page" /></div>
      <p className="field-hint" style={{ margin: 0 }}>The Projects total is calculated from the portfolio items. Other numbers count up when a visitor scrolls to them. Up to 6.</p>
      {st.items.map((x, i) => (
        (() => { const isProjects = /^projects?$/i.test(x.label.trim()); return (
        <div className="row" key={i} style={{ gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <Field label={i === 0 ? 'Label' : ''}><input aria-label={`Label ${i + 1}`} value={x.label} maxLength={40} placeholder="Projects" onChange={e => change(i, { label: e.target.value })} /></Field>
          <Field label={i === 0 ? 'Number' : ''} hint={isProjects ? 'Auto-counted from portfolio items' : undefined}><input aria-label={`Number ${i + 1}`} type="number" min={0} max={1000000000} value={isProjects ? doc!.images.length : x.value} disabled={isProjects} onChange={e => change(i, { value: Math.max(0, Math.round(Number(e.target.value) || 0)) })} style={{ width: 120 }} /></Field>
          <Field label={i === 0 ? 'After it' : ''}><input aria-label={`Suffix ${i + 1}`} value={isProjects ? '' : x.suffix} maxLength={4} placeholder="+" disabled={isProjects} onChange={e => change(i, { suffix: e.target.value })} style={{ width: 70 }} /></Field>
          <button type="button" className="icon-btn sm" title="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
          <button type="button" className="icon-btn sm" title="Move down" disabled={i === st.items.length - 1} onClick={() => move(i, 1)}>↓</button>
          <button type="button" className="icon-btn sm" title="Remove" onClick={() => setItems(st.items.filter((_, j) => j !== i))}><Icon name="trash" size={14} /></button>
        </div>
        ); })()
      ))}
      <div><button type="button" className="btn sm" disabled={st.items.length >= 6} onClick={() => setItems([...st.items, { label: '', value: 0, suffix: '+' }])}><Icon name="plus" /> Add a number</button></div>
    </section>
  );
}

// About > Skills: categories of skills, each with a logo tile (short code on a colour), a 0-5 level and a note.
const SKILL_LEVELS = ['No meter', 'Learning', 'Familiar', 'Proficient', 'Advanced', 'Expert'];
const ICON_LABEL: Record<string, string> = { design: 'Design', arts: 'Arts', motion: 'Motion', video: 'Video', ai: 'AI', languages: 'Code', frontend: 'Frontend', backend: 'Backend', database: 'Database', apis: 'APIs', tools: 'Tools', star: 'Star' };
const skillCode = (x: SkillItem) => x.code || x.name.split(/[\s.\-/]+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
// dark or light text, whichever reads better on the tile colour
function inkOn(hex: string){
  const m = /^#([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return '#fff';
  const n = parseInt(m[1], 16), lin = (c: number) => { c /= 255; return c <= .04045 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4); };
  const L = .2126 * lin(n >> 16) + .7152 * lin((n >> 8) & 255) + .0722 * lin(n & 255);
  return L > .4 ? '#14110f' : '#fff';
}
function moveIn<T>(list: T[], i: number, by: number){ const a = [...list]; const [x] = a.splice(i, 1); a.splice(Math.max(0, Math.min(a.length, i + by)), 0, x); return a; }
function AboutSkills(){
  const { doc } = useSite();
  const sk = doc!.skills;
  const [openCat, setOpenCat] = useState(0);
  const setSk = (patch: Partial<typeof sk>) => updateSite(d => ({ ...d, skills: { ...d.skills, ...patch } }));
  const setCats = (categories: SkillCategory[]) => setSk({ categories });
  const setCat = (i: number, patch: Partial<SkillCategory>) => setCats(sk.categories.map((c, j) => j === i ? { ...c, ...patch } : c));
  const setItem = (ci: number, ii: number, patch: Partial<SkillItem>) => setCat(ci, { items: sk.categories[ci].items.map((x, j) => j === ii ? { ...x, ...patch } : x) });
  const total = sk.categories.reduce((n, c) => n + c.items.length, 0);
  return (
    <section className="card stack" aria-labelledby="about-skills-h" style={{ marginTop: 'var(--sp-5)' }}>
      <div className="row between"><h3 id="about-skills-h">Skills</h3>
        <Switch checked={sk.enabled} onChange={v => setSk({ enabled: v })} label="Show on the About page" /></div>
      <p className="field-hint" style={{ margin: 0 }}>A resume-style board with one card per category. The logo tiles also float through the space beside it. {sk.categories.length} categories, {total} skills (up to {SKILL_LIMITS.categories} categories, {SKILL_LIMITS.items} skills each). Click a logo tile to upload a real logo.</p>
      <div className="form-grid">
        <Field label="Heading" hint={`${sk.title.length}/60`}><input maxLength={60} value={sk.title} onChange={e => setSk({ title: e.target.value })} placeholder="Skills" /></Field>
        <Field label="Intro" hint={`${sk.intro.length}/200`}><input maxLength={200} value={sk.intro} onChange={e => setSk({ intro: e.target.value })} placeholder="The tools, languages and crafts behind every frame" /></Field>
      </div>
      {sk.categories.map((c, ci) => (
        <div className={'skill-cat' + (openCat === ci ? ' is-open' : '')} key={ci}>
          <div className="row skill-cat-head">
            <button type="button" className="icon-btn sm" aria-expanded={openCat === ci} aria-label={`${openCat === ci ? 'Collapse' : 'Expand'} ${c.name || 'category'}`} onClick={() => setOpenCat(openCat === ci ? -1 : ci)}>
              <Icon name={openCat === ci ? 'chevronDown' : 'chevronRight'} size={14} /></button>
            <input aria-label={`Category ${ci + 1} name`} value={c.name} maxLength={40} placeholder="Category name" onChange={e => setCat(ci, { name: e.target.value })} style={{ flex: 1, minWidth: 120 }} />
            <select aria-label={`Category ${ci + 1} icon`} value={c.icon} onChange={e => setCat(ci, { icon: e.target.value })} style={{ width: 'auto' }}>
              {SKILL_ICONS.map(k => <option key={k} value={k}>{ICON_LABEL[k]} icon</option>)}
            </select>
            <span className="faint num" style={{ fontSize: 12 }}>{c.items.length}</span>
            <button type="button" className="icon-btn sm" title="Move up" aria-label="Move category up" disabled={ci === 0} onClick={() => { setCats(moveIn(sk.categories, ci, -1)); setOpenCat(ci - 1); }}>↑</button>
            <button type="button" className="icon-btn sm" title="Move down" aria-label="Move category down" disabled={ci === sk.categories.length - 1} onClick={() => { setCats(moveIn(sk.categories, ci, 1)); setOpenCat(ci + 1); }}>↓</button>
            <button type="button" className="icon-btn sm" title="Remove category" aria-label={`Remove ${c.name || 'category'}`} onClick={() => { setCats(sk.categories.filter((_, j) => j !== ci)); setOpenCat(-1); }}><Icon name="trash" size={14} /></button>
          </div>
          {openCat === ci && <div className="stack" style={{ gap: 8 }}>
            {c.items.map((x, ii) => (
              <div className="skill-row" key={ii}>
                <LogoTile item={x} onChange={logoUrl => setItem(ci, ii, { logoUrl })} />
                <input aria-label="Skill name" value={x.name} maxLength={40} placeholder="Skill" onChange={e => setItem(ci, ii, { name: e.target.value })} className="sr-name" />
                <input aria-label="Logo letters" value={x.code} maxLength={3} placeholder={skillCode({ ...x, code: '' })} onChange={e => setItem(ci, ii, { code: e.target.value })} className="sr-code mono" title="1 to 3 letters on the logo tile (blank uses the initials)" />
                <input aria-label="Logo colour" type="color" value={/^#[0-9a-f]{6}$/i.test(x.color) ? x.color : '#3A3340'} onChange={e => setItem(ci, ii, { color: e.target.value.toUpperCase() })} className="sr-color" title="Logo tile colour" />
                <select aria-label="Logo" value={x.logo || ''} onChange={e => setItem(ci, ii, { logo: e.target.value })} className="sr-logo" title="Which logo to show. Auto picks one that matches the skill's name.">
                  <option value="">Logo: auto{skillLogoFor({ name: x.name }) ? ` (${skillLogoFor({ name: x.name })!.n})` : ''}</option>
                  <option value="none">Letters only</option>
                  <optgroup label="Tools and brands">{SKILL_LOGO_LIST.filter(l => l.kind === 'b' || l.kind === 't' || l.kind === 'f').map(l => <option key={l.slug} value={l.slug}>{l.name}</option>)}</optgroup>
                  <optgroup label="Icons">{SKILL_LOGO_LIST.filter(l => l.kind === 'g').map(l => <option key={l.slug} value={l.slug}>{l.name}</option>)}</optgroup>
                </select>
                <select aria-label="Level" value={x.level} onChange={e => setItem(ci, ii, { level: Number(e.target.value) })} className="sr-level">
                  {SKILL_LEVELS.map((l, n) => <option key={n} value={n}>{n ? `${n} · ${l}` : l}</option>)}
                </select>
                <input aria-label="Note" value={x.note} maxLength={140} placeholder="One line about how you use it (optional)" onChange={e => setItem(ci, ii, { note: e.target.value })} className="sr-note" />
                <span className="row sr-actions" style={{ gap: 2 }}>
                  <button type="button" className="icon-btn sm" title="Move up" aria-label="Move skill up" disabled={ii === 0} onClick={() => setCat(ci, { items: moveIn(c.items, ii, -1) })}>↑</button>
                  <button type="button" className="icon-btn sm" title="Move down" aria-label="Move skill down" disabled={ii === c.items.length - 1} onClick={() => setCat(ci, { items: moveIn(c.items, ii, 1) })}>↓</button>
                  <button type="button" className="icon-btn sm" title="Remove" aria-label={`Remove ${x.name || 'skill'}`} onClick={() => setCat(ci, { items: c.items.filter((_, j) => j !== ii) })}><Icon name="trash" size={14} /></button>
                </span>
              </div>
            ))}
            <div><button type="button" className="btn sm" disabled={c.items.length >= SKILL_LIMITS.items} onClick={() => setCat(ci, { items: [...c.items, { name: '', code: '', color: '#FF9438', level: 3, note: '', logo: '', logoUrl: '' }] })}><Icon name="plus" /> Add a skill</button></div>
          </div>}
        </div>
      ))}
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}><SuggestedSkills onUse={d => setSk({ categories: d.categories, intro: sk.intro || d.intro })} />
        <button type="button" className="btn sm" disabled={sk.categories.length >= SKILL_LIMITS.categories} onClick={() => { setCats([...sk.categories, { name: '', icon: 'star', items: [] }]); setOpenCat(sk.categories.length); }}><Icon name="plus" /> Add a category</button></div>
    </section>
  );
}

// A library logo drawn at tile size (the homepage draws the same data).
function LogoMark({ logo, color }: { logo: SkillLogo; color: string }){
  if (logo.k === 't') return <span style={{ font: '700 13px/1 ui-sans-serif, system-ui', letterSpacing: '-.03em' }}>{logo.t}</span>;
  const stroke = logo.k === 'g';
  return <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none">
    {logo.k === 'f' && <defs><linearGradient id="ka-pk-fg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={logo.g[0]} /><stop offset="1" stopColor={logo.g[1]} /></linearGradient></defs>}
    <path d={logo.p} fill={logo.k === 'b' ? logo.c : logo.k === 'f' ? 'url(#ka-pk-fg)' : 'none'} stroke={stroke ? (color || '#FF9438') : 'none'} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

// The logo tile in the editor: the letters on their colour, or an uploaded logo image. Click to upload one.
function LogoTile({ item, onChange }: { item: SkillItem; onChange: (logoUrl: string) => void }){
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const logo = item.logoUrl ? null : skillLogoFor(item);
  const pick = async (file: File) => {
    setBusy(true);
    try { const r = await upload(file, 'image'); if (r.publicUrl) onChange(r.publicUrl); }
    catch (e){ toast.error(e); }
    finally { setBusy(false); }
  };
  return <span className="skill-logo-pick">
    <button type="button" className="skill-tile" title={item.logoUrl ? 'Replace the logo image' : 'Upload a logo image (PNG, WebP or AVIF)'} aria-label={`Logo for ${item.name || 'this skill'}: upload an image`}
      style={item.logoUrl || (logo && logo.k !== 't') ? { background: '#17130f' } : logo ? { background: logo.bg, color: logo.fg, boxShadow: `inset 0 0 0 2px ${logo.fg}` } : { background: item.color || '#3A3340', color: inkOn(item.color || '#3A3340') }} onClick={() => input.current?.click()} disabled={busy}>
      {busy ? '…' : item.logoUrl ? <img src={item.logoUrl} alt="" /> : logo ? <LogoMark logo={logo} color={item.color} /> : skillCode(item)}
    </button>
    {item.logoUrl && <button type="button" className="skill-logo-clear" aria-label="Use letters instead of the image" title="Use letters instead" onClick={() => onChange('')}>×</button>}
    <input ref={input} type="file" accept="image/png,image/webp,image/avif,image/jpeg" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void pick(f); }} />
  </span>;
}

// Replaces the categories with the suggested board (design, motion, video, AI, arts and code), after a confirm.
function SuggestedSkills({ onUse }: { onUse: (d: SkillsDraft) => void }){
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return <button type="button" className="btn sm ghost" disabled={busy} onClick={async () => {
    if (!await confirm({ title: 'Use the suggested skills?', body: 'Your current categories and skills are replaced with the suggested board (Design, Motion design, Video, AI & generative, Arts and the code groups). Nothing goes live until you publish.', confirm: 'Replace' })) return;
    setBusy(true);
    try { onUse(await get<SkillsDraft>('/site/skills-defaults')); toast.show('Suggested skills loaded. Edit them, then publish.', { tone: 'success' }); }
    catch (e){ toast.error(e); }
    finally { setBusy(false); }
  }}><Icon name="sparkle" /> Use the suggested set</button>;
}

function Portfolio(){
  const { doc } = useSite();
  const toast = useToast();
  const confirm = useConfirm();
  const [folder, setFolder] = useState<string>(doc!.folders[0] || '');
  const [editing, setEditing] = useState<string | null>(null);
  const [newFolder, setNewFolder] = useState('');
  const [dragSlug, setDragSlug] = useState<string | null>(null);
  useEffect(() => { if (!doc!.folders.includes(folder)) setFolder(doc!.folders[0] || ''); }, [doc, folder]);
  const images = useMemo(() => doc!.images.filter(i => i.cat === folder), [doc, folder]);
  const cover = doc!.stacks.covers[folder];
  const moveImage = (slug: string, toSlug: string) => updateSite(d => {
    const list = [...d.images], from = list.findIndex(i => i.slug === slug), to = list.findIndex(i => i.slug === toSlug);
    if (from < 0 || to < 0) return d;
    const [x] = list.splice(from, 1); list.splice(to, 0, x); return { ...d, images: list };
  });
  const addFolder = () => {
    const name = newFolder.trim();
    if (!name) return;
    if (doc!.folders.includes(name)) return toast.show('That folder already exists.', { tone: 'error' });
    updateSite(d => ({ ...d, folders: [...d.folders, name] })); setFolder(name); setNewFolder('');
  };
  const [renaming, setRenaming] = useState<string | null>(null);
  const renameFolder = () => {
    const name = (renaming || '').trim();
    setRenaming(null);
    if (!name || name === folder) return;
    if (doc!.folders.includes(name)) return toast.show('That folder already exists.', { tone: 'error' });
    updateSite(d => ({ ...d, folders: d.folders.map(f => f === folder ? name : f), images: d.images.map(i => i.cat === folder ? { ...i, cat: name } : i),
      stacks: { ...d.stacks, covers: Object.fromEntries(Object.entries(d.stacks.covers).map(([k, v]) => [k === folder ? name : k, v])) } }));
    setFolder(name);
  };
  const removeFolder = async () => {
    if (images.length){ toast.show('Move or remove this folder’s images first.', { tone: 'error' }); return; }
    if (doc!.folders.length <= 1) return toast.show('Keep at least one folder.', { tone: 'error' });
    if (await confirm({ title: `Remove the “${folder}” folder?`, confirm: 'Remove', danger: true })) updateSite(d => ({ ...d, folders: d.folders.filter(f => f !== folder) }));
  };
  const uploaded = (u: { publicUrl: string | null; file: File; width?: number; height?: number }) => {
    const base = u.file.name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'image';
    updateSite(d => {
      let slug = base, n = 2;
      while (d.images.some(i => i.slug === slug)) slug = `${base}-${n++}`;
      const img: SiteImage = { id: slug, slug, title: u.file.name.replace(/\.[^.]+$/, '').slice(0, 160), cat: folder, description: '', technologies: [], link: '', downloadable: true, src: u.publicUrl!, widths: [], full: 0, width: u.width, height: u.height };
      return { ...d, images: [...d.images, img] };
    });
  };
  return (
    <div className="content-split">
      <nav className="folder-nav" aria-label="Folders">
        <div className="eyebrow" style={{ padding: '0 8px 6px' }}>Folders</div>
        {doc!.folders.map(f => (
          <button key={f} type="button" className={'folder-btn' + (f === folder ? ' on' : '')} aria-current={f === folder || undefined} onClick={() => setFolder(f)}>
            <Icon name="archive" size={14} /><span className="truncate grow">{f}</span><span className="faint num">{doc!.images.filter(i => i.cat === f).length}</span>
          </button>
        ))}
        <div className="row" style={{ padding: 8, gap: 4 }}><input placeholder="New folder" value={newFolder} onChange={e => setNewFolder(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addFolder(); }} maxLength={70} aria-label="New folder name" />
          <button type="button" className="icon-btn" aria-label="Add folder" onClick={addFolder}><Icon name="plus" /></button></div>
      </nav>
      <div className="app-main">
        <div className="row between">
          <div>{renaming !== null
            ? <input autoFocus aria-label="Folder name" value={renaming} maxLength={70} onChange={e => setRenaming(e.target.value)} onBlur={renameFolder} onKeyDown={e => { if (e.key === 'Enter') renameFolder(); if (e.key === 'Escape') setRenaming(null); }} />
            : <h2 className="section-title">{folder || 'No folder'}</h2>}<p className="faint">{images.length} image{images.length === 1 ? '' : 's'} · drag to reorder · the star picks the stack cover</p></div>
          <div className="row"><button type="button" className="btn sm ghost" onClick={() => setRenaming(folder)}>Rename</button><button type="button" className="btn sm ghost" onClick={removeFolder}>Remove</button></div>
        </div>
        <Uploader kind="image" accept="image/png,image/jpeg,image/webp,image/avif" label={`Add images to “${folder}”`} multiple onUploaded={uploaded}>PNG, JPG, WebP or AVIF, up to 10 MB. Large images are shown sharp on 4K screens.</Uploader>
        {!images.length ? <Empty icon="image" title="This folder is empty">Upload images above; they appear on the site after you publish.</Empty> : (
          <ul className="pf-grid">
            {images.map(i => (
              <li key={i.slug} draggable onDragStart={() => setDragSlug(i.slug)} onDragEnd={() => setDragSlug(null)} onDragOver={e => e.preventDefault()}
                onDrop={() => { if (dragSlug && dragSlug !== i.slug) moveImage(dragSlug, i.slug); }} className={dragSlug === i.slug ? 'dragging' : ''}>
                <button type="button" className="pf-thumb" onClick={() => setEditing(i.slug)} aria-label={`Edit ${i.title}`}><img src={thumb(i)} alt="" loading="lazy" decoding="async" /></button>
                <div className="pf-meta"><span className="truncate">{i.title}</span>
                  <button type="button" className={'icon-btn sm' + (cover === i.slug ? ' star-on' : '')} aria-pressed={cover === i.slug} aria-label={cover === i.slug ? 'Stack cover' : 'Use as stack cover'} title="Stack cover"
                    onClick={() => updateSite(d => ({ ...d, stacks: { ...d.stacks, covers: { ...d.stacks.covers, [folder]: cover === i.slug ? '' : i.slug } } }))}><Icon name="star" size={13} /></button></div>
              </li>
            ))}
          </ul>
        )}
        <Switch checked={doc!.stacks.loop} onChange={v => updateSite(d => ({ ...d, stacks: { ...d.stacks, loop: v } }))} label="Work stacks loop around (coverflow)" />
      </div>
      {editing && <ImageEditor slug={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ImageEditor({ slug, onClose }: { slug: string; onClose: () => void }){
  const { doc } = useSite();
  const confirm = useConfirm();
  const img = doc!.images.find(i => i.slug === slug);
  const [f, setF] = useState<SiteImage | null>(img ? { ...img } : null);
  const [start] = useState(() => JSON.stringify(img || null));
  if (!f) return null;
  const dirty = JSON.stringify(f) !== start;
  const close = async () => { if (!dirty || await confirm({ title: 'Discard changes to this image?', confirm: 'Discard', danger: true })) onClose(); };
  const apply = () => { updateSite(d => ({ ...d, images: d.images.map(i => i.slug === slug ? { ...f, id: f.slug } : i) })); onClose(); };
  return (
    <Modal wide title="Edit image" onClose={() => void close()} footer={<>
      <button type="button" className="btn ghost" style={{ marginRight: 'auto', color: 'var(--danger)' }} onClick={async () => { if (await confirm({ title: `Remove “${f.title}” from the site?`, body: 'It disappears when you publish. The file stays in storage.', confirm: 'Remove', danger: true })){ updateSite(d => ({ ...d, images: d.images.filter(i => i.slug !== slug),
        stacks: { ...d.stacks, covers: Object.fromEntries(Object.entries(d.stacks.covers).map(([k, v]) => [k, v === slug ? '' : v])) } })); onClose(); } }}><Icon name="trash" /> Remove</button>
      <button type="button" className="btn" onClick={() => void close()}>Cancel</button>
      <button type="button" className="btn primary" onClick={apply}>Done</button>
    </>}>
      <div className="img-edit">
        <img src={thumb(f, 768)} alt="" />
        <div className="stack">
          <Field label="Title"><input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} maxLength={160} /></Field>
          <Field label="Folder"><select value={f.cat} onChange={e => setF({ ...f, cat: e.target.value })}>{doc!.folders.map(x => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Link" hint="Optional, e.g. Behance"><input type="url" value={f.link} onChange={e => setF({ ...f, link: e.target.value })} placeholder="https://" /></Field>
          <Switch checked={f.downloadable !== false} onChange={v => setF({ ...f, downloadable: v })} label="Visitors may download this image" />
        </div>
      </div>
      <Field label="Description"><textarea rows={4} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} maxLength={4000} /></Field>
      <Field label="Tools"><TagInput label="Tools" value={f.technologies} onChange={v => setF({ ...f, technologies: v })} placeholder="Photoshop, Blender…" /></Field>
    </Modal>
  );
}

function Upscaler(){
  const s = useLoad<{ value: any; revision: number }>('/settings/upscaler');
  const n = useLoad<{ topics: { key: string; name: string; total: number; waiting: number }[]; signups: any[] }>('/notify');
  const toast = useToast();
  const confirm = useConfirm();
  const [v, setV] = useDraft<any>(s.data?.value);
  const [link, setLink] = useState('');
  const [message, setMessage] = useState('');
  const dirty = !!v && !!s.data && JSON.stringify(v) !== JSON.stringify(s.data.value);
  useUnsavedGuard(dirty);
  if ((s.error && !s.data) || (n.error && !n.data)) return <ErrorState message={s.error || n.error!} retry={() => { s.reload(); n.reload(); }} />;
  if (!v || !n.data) return <div className="pad"><SkeletonRows rows={8} /></div>;
  const topic = n.data.topics.find(t => t.key === 'upscaler');
  const signups = n.data.signups.filter(x => x.topic === 'upscaler');
  return (
    <div className="app-main" style={{ maxWidth: 880, margin: '0 auto', width: '100%' }}>
      <section className="card stack" aria-labelledby="up-h"><h3 id="up-h">“Coming soon” window</h3>
        <Switch checked={v.comingSoon} onChange={x => setV({ ...v, comingSoon: x })} label="Show as coming soon (the tool isn’t available yet)" />
        <div className="form-grid">
          <Field label="Title"><input value={v.title} onChange={e => setV({ ...v, title: e.target.value })} maxLength={80} /></Field>
          <Field label="Badge"><input value={v.badge} onChange={e => setV({ ...v, badge: e.target.value })} maxLength={40} /></Field>
        </div>
        <Field label="Text"><textarea rows={3} value={v.text} onChange={e => setV({ ...v, text: e.target.value })} maxLength={600} /></Field>
        <Switch checked={v.notifyEnabled} onChange={x => setV({ ...v, notifyEnabled: x })} label="Let visitors join the notify-me list" />
        <div className="row"><AsyncButton className="btn primary" disabled={!dirty} onClick={async () => {
          try { const r = await put<{ value: any; revision: number }>('/settings/upscaler', { value: v, revision: s.data!.revision }); s.setData(r); setV(r.value); toast.show('Saved: live on the site', { tone: 'success' }); }
          catch (e: any){ if (e.code === 'stale'){ await s.reload(); throw new Error('This was changed on another device. Your edits are still here: save again to keep them.'); } throw e; }
        }}>Save</AsyncButton>{dirty && <span className="faint" style={{ fontSize: 12 }}>Unsaved changes</span>}</div>
      </section>
      <section className="card stack" aria-labelledby="nl-h"><h3 id="nl-h"><span className="grow">Notify-me list</span><Badge tone="accent">{topic?.waiting || 0} waiting</Badge><Badge>{topic?.total || 0} total</Badge></h3>
        {!signups.length ? <Empty icon="mail" title="No signups yet" /> : (
          <ul className="list" style={{ maxHeight: 260, overflow: 'auto' }}>{signups.map(x => (
            <li key={x.id}><span className="grow truncate mono">{x.email}</span>{x.notified_at ? <Badge tone="success">emailed {ago(x.notified_at)}</Badge> : <Badge>waiting</Badge>}<span className="faint" style={{ fontSize: 12 }}>{dateTime(x.created_at)}</span>
              <AsyncButton className="icon-btn sm" title="Remove" onClick={async () => { n.setData(await del(`/notify/${x.id}`)); }}><Icon name="close" size={13} /></AsyncButton></li>
          ))}</ul>
        )}
        <div className="launch-box stack">
          <div className="eyebrow">Launch announcement</div>
          <Field label="Link to the tool"><input type="url" value={link} onChange={e => setLink(e.target.value)} placeholder="https://…" /></Field>
          <Field label="Extra message" hint="Optional"><textarea rows={2} value={message} onChange={e => setMessage(e.target.value)} maxLength={2000} /></Field>
          <div><AsyncButton className="btn primary" disabled={!topic?.waiting || !link} onClick={async () => {
            if (!(await confirm({ title: `Email ${topic!.waiting} people now?`, body: 'Each person gets one email, once. You can’t unsend it.', confirm: 'Send launch email' }))) return;
            const r = await post<{ sent: number; failed: number; remaining: number }>('/notify/upscaler/launch', { link, message });
            toast.show(`Sent ${r.sent}${r.failed ? `, ${r.failed} failed (will retry next time)` : ''}${r.remaining ? `, ${r.remaining} left: press again` : ''}`, { tone: r.failed ? 'error' : 'success', ms: 8000 }); n.reload();
          }}><Icon name="send" /> Send to {topic?.waiting || 0}</AsyncButton></div>
        </div>
      </section>
    </div>
  );
}

function Emails(){
  const s = useLoad<{ templates: { key: string; label: string; subject: string; body: string; customised: boolean; updatedAt: string | null; placeholders: string[] }[] }>('/email-templates');
  const [key, setKey] = useState<string | null>(null);
  const toast = useToast();
  const confirm = useConfirm();
  const t = s.data?.templates.find(x => x.key === key) || null;
  const server = useMemo(() => (t ? { subject: t.subject, body: t.body } : null), [t]);
  const [draft, setDraft] = useDraft(server, { resetKey: key });
  const dirty = !!draft && !!server && (draft.subject !== server.subject || draft.body !== server.body);
  useUnsavedGuard(dirty);
  const body = useRef<HTMLTextAreaElement>(null);
  const choose = async (k: string) => {
    if (k === key) return;
    if (dirty && !(await confirm({ title: 'Leave this email unsaved?', body: 'Your changes to it will be lost.', confirm: 'Discard changes', danger: true }))) return;
    setKey(k);
  };
  // placeholders go where the cursor is, not always at the end
  const insert = (p: string) => {
    if (!draft) return;
    const el = body.current, tag = `{{${p}}}`;
    const at = el ? el.selectionStart : draft.body.length, end = el ? el.selectionEnd : at;
    setDraft({ ...draft, body: draft.body.slice(0, at) + tag + draft.body.slice(end) });
    requestAnimationFrame(() => { if (el){ el.focus(); el.setSelectionRange(at + tag.length, at + tag.length); } });
  };
  if (s.error && !s.data) return <ErrorState message={s.error} retry={s.reload} />;
  if (!s.data) return <div className="pad"><SkeletonRows rows={8} /></div>;
  return (
    <div className="content-split">
      <nav className="folder-nav" aria-label="Emails">
        {s.data.templates.map(x => (
          <button key={x.key} type="button" className={'folder-btn' + (x.key === key ? ' on' : '')} onClick={() => void choose(x.key)} aria-current={x.key === key || undefined}>
            <Icon name="mail" size={14} /><span className="truncate grow">{x.label}</span>{x.customised && <Badge tone="accent">edited</Badge>}
          </button>
        ))}
      </nav>
      <div className="app-main">
        {!t || !draft ? <Empty icon="mail" title="Choose an email">Edit the words of any email the site sends. Placeholders like {'{{name}}'} are filled in automatically.</Empty> : <>
          <h2 className="section-title">{t.label}</h2>
          <Field label="Subject"><input value={draft.subject} onChange={e => setDraft({ ...draft, subject: e.target.value })} maxLength={200} /></Field>
          <Field label="Message" hint="Plain text. Links become clickable."><textarea ref={body} rows={14} value={draft.body} onChange={e => setDraft({ ...draft, body: e.target.value })} /></Field>
          <div className="row" style={{ gap: 6 }}><span className="faint" style={{ fontSize: 12 }}>Insert:</span>{t.placeholders.map(p => (
            <button key={p} type="button" className="chip-btn mono" onClick={() => insert(p)}>{`{{${p}}}`}</button>))}</div>
          <div className="row">
            <AsyncButton className="btn primary" disabled={!dirty} onClick={async () => { s.setData(await put(`/email-templates/${t.key}`, draft)); toast.show('Saved: new emails use this wording', { tone: 'success' }); }}>Save</AsyncButton>
            <AsyncButton className="btn" onClick={async () => { const r = await post<{ to: string }>(`/email-templates/${t.key}/test`, draft); toast.show(`Test sent to ${r.to}`, { tone: 'success' }); }}><Icon name="send" /> Send me a test</AsyncButton>
            {t.customised && <AsyncButton className="btn ghost" onClick={async () => { if (await confirm({ title: 'Go back to the original wording?', confirm: 'Reset', danger: true })){ s.setData(await del(`/email-templates/${t.key}`)); toast.show('Reset to the original', { tone: 'success' }); } }}>Reset to original</AsyncButton>}
          </div>
        </>}
      </div>
    </div>
  );
}
