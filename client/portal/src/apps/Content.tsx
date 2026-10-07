// Content: portfolio images and folders, the site's words, the Image Upscaler notice + notify list,
// and every email the site sends.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppProps } from './registry';
import { useDraft, useLoad, usePref, useUnsavedGuard } from '../hooks';
import { del, get, post, put, upload } from '../api';
import { AsyncButton, Badge, Empty, ErrorState, Field, Modal, Segmented, SkeletonRows, Switch, useConfirm, useToast } from '../ui';
import { Icon } from '../icons';
import { WinTools } from '../shell/Window';
import { MoneyInput, TagInput, Uploader, useSaveKey } from './common';
import { useDesk } from '../shell/desk';
import { discardSite, keepMineOverTheirs, loadSite, saveSite, thumb, updateSite, useSite } from './siteDoc';
import { SKILL_ICONS, SKILL_LIMITS } from './siteDoc';
import type { SkillsDraft } from './siteDoc';
import type { SiteImage, StatItem, SkillCategory, SkillItem, AboutDraft, JourneyStep, ReelVideo } from './siteDoc';
import { ABOUT_LIMITS, aboutDefaults, updateSiteLive } from './siteDoc';
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
      <p className="field-hint" style={{ margin: 0 }}>The Projects number follows your portfolio items; switch that off under it to type your own. All numbers count up when a visitor scrolls to them. Up to 6.</p>
      {st.items.map((x, i) => (
        (() => { const isProjects = /^projects?$/i.test(x.label.trim()) && x.auto !== false; const canAuto = /^projects?$/i.test(x.label.trim()); return (
        <div className="row" key={i} style={{ gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <Field label={i === 0 ? 'Label' : ''}><input aria-label={`Label ${i + 1}`} value={x.label} maxLength={40} placeholder="Projects" onChange={e => change(i, { label: e.target.value })} /></Field>
          <Field label={i === 0 ? 'Number' : ''} hint={isProjects ? 'Counted from the portfolio items' : undefined}><input aria-label={`Number ${i + 1}`} type="number" min={0} max={1000000000} value={isProjects ? doc!.images.length : x.value} disabled={isProjects} onChange={e => change(i, { value: Math.max(0, Math.round(Number(e.target.value) || 0)) })} style={{ width: 120 }} /></Field>
          <Field label={i === 0 ? 'After it' : ''}><input aria-label={`Suffix ${i + 1}`} value={isProjects ? '' : x.suffix} maxLength={4} placeholder="+" disabled={isProjects} onChange={e => change(i, { suffix: e.target.value })} style={{ width: 70 }} /></Field>
          <button type="button" className="icon-btn sm" title="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
          <button type="button" className="icon-btn sm" title="Move down" disabled={i === st.items.length - 1} onClick={() => move(i, 1)}>↓</button>
          <button type="button" className="icon-btn sm" title="Remove" onClick={() => setItems(st.items.filter((_, j) => j !== i))}><Icon name="trash" size={14} /></button>
          {canAuto && <div style={{ flexBasis: '100%' }}><Switch checked={isProjects} onChange={v => change(i, v ? { auto: true } : { auto: false, value: doc!.images.length, suffix: x.suffix || '+' })} label="Count automatically from the portfolio items" /></div>}
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
  const [showArchived, setShowArchived] = useState(false);
  const [moving, setMoving] = useState<string | null>(null);
  const [size, setSize] = usePref<'s' | 'm' | 'l'>('portfolio.tileSize', 'm');       // how big each preview is
  const [whole, setWhole] = usePref<boolean>('portfolio.tileWhole', false);       // show the whole picture (landscape ones too) instead of filling the tile
  const inStore = useLoad<{ products: { id: string; tags: string[]; status: string }[] }>('/products?kind=artzz');
  const listed = useMemo(() => new Set((inStore.data?.products || []).flatMap(p => p.tags.filter(t => t.startsWith('from-gallery:')).map(t => t.slice(13)))), [inStore.data]);
  const setDownloads = (slugs: string[], on: boolean) => void updateSiteLive(d => ({ ...d, images: d.images.map(x => slugs.includes(x.slug) ? { ...x, downloadable: on } : x) }))
    .then(live => toast.show(live ? (on ? 'Downloads allowed: live now' : 'Downloads turned off: live now') : 'Changed. Press Publish changes to put it live.', { tone: 'success' })).catch(toast.error);
  const images = useMemo(() => doc!.images.filter(i => i.cat === folder && !i.archived), [doc, folder]);
  const archivedImages = useMemo(() => doc!.images.filter(i => i.cat === folder && i.archived), [doc, folder]);
  const setArchived = (slug: string, on: boolean) => void updateSiteLive(d => ({ ...d, images: d.images.map(x => x.slug === slug ? (on ? { ...x, archived: true, hidden: true } : { ...x, archived: false, hidden: false }) : x) }))
    .then(live => toast.show(live ? (on ? 'Archived: off the site now' : 'Republished: back on the site now') : (on ? 'Archived. Press Publish changes to put it live.' : 'Republished. Press Publish changes to put it live.'), { tone: 'success' })).catch(toast.error);
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
      stacks: { ...d.stacks, featured: (d.stacks.featured || []).map(k => k === folder ? name : k), covers: Object.fromEntries(Object.entries(d.stacks.covers).map(([k, v]) => [k === folder ? name : k, v])), loops: Object.fromEntries(Object.entries(d.stacks.loops || {}).map(([k, v]) => [k === folder ? name : k, v])) } }));
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
            <Icon name="archive" size={14} /><span className="truncate grow">{f}</span>{doc!.stacks.featured?.includes(f) && <span className="badge" title="Shown in About > Featured Work">★</span>}<span className="faint num">{doc!.images.filter(i => i.cat === f).length}</span>
          </button>
        ))}
        <div className="row" style={{ padding: 8, gap: 4 }}><input placeholder="New folder" value={newFolder} onChange={e => setNewFolder(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addFolder(); }} maxLength={70} aria-label="New folder name" />
          <button type="button" className="icon-btn" aria-label="Add folder" onClick={addFolder}><Icon name="plus" /></button></div>
      </nav>
      <div className="app-main">
        <div className="row between">
          <div>{renaming !== null
            ? <input autoFocus aria-label="Folder name" value={renaming} maxLength={70} onChange={e => setRenaming(e.target.value)} onBlur={renameFolder} onKeyDown={e => { if (e.key === 'Enter') renameFolder(); if (e.key === 'Escape') setRenaming(null); }} />
            : <h2 className="section-title">{folder || 'No folder'}</h2>}<p className="faint">{images.length} image{images.length === 1 ? '' : 's'}{images.some(i => i.hidden) ? ` (${images.filter(i => i.hidden).length} hidden)` : ''} · drag to reorder · the star picks the stack cover · the eye hides an image · the box archives it (kept here, off the site) · the grip moves it · the arrow-down icon turns its download on or off · the editor can sell it in the store</p></div>
          <div className="row"><button type="button" className="btn sm ghost" title="Let visitors download every image in this stack" onClick={() => setDownloads(images.map(x => x.slug), true)}>Allow all downloads</button>
            <button type="button" className="btn sm ghost" title="Turn downloads off for every image in this stack" onClick={() => setDownloads(images.map(x => x.slug), false)}>No downloads</button>
            <button type="button" className="btn sm ghost" onClick={() => setRenaming(folder)}>Rename</button><button type="button" className="btn sm ghost" onClick={removeFolder}>Remove</button></div>
        </div>
        <Uploader kind="image" accept="image/png,image/jpeg,image/webp,image/avif" label={`Add images to “${folder}”`} multiple onUploaded={uploaded}>PNG, JPG, WebP or AVIF, up to 10 MB. Large images are shown sharp on 4K screens.</Uploader>
        {images.length > 0 && <div className="row" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <Segmented label="Preview size" value={size} onChange={setSize} options={[{ value: 's', label: 'Small' }, { value: 'm', label: 'Medium' }, { value: 'l', label: 'Large' }]} />
          <Switch checked={whole} onChange={setWhole} label="Show each whole picture" />
        </div>}
        {!images.length ? <Empty icon="image" title="This folder is empty">Upload images above; they appear on the site after you publish.</Empty> : (
          <ul className={'pf-grid size-' + size + (whole ? ' fit-whole' : '')}>
            {images.map(i => (
              <li key={i.slug} draggable onDragStart={() => setDragSlug(i.slug)} onDragEnd={() => setDragSlug(null)} onDragOver={e => e.preventDefault()}
                onDrop={() => { if (dragSlug && dragSlug !== i.slug) moveImage(dragSlug, i.slug); }} className={(dragSlug === i.slug ? 'dragging' : '') + (i.hidden ? ' is-hidden' : '')}>
                <button type="button" className="pf-thumb" onClick={() => setEditing(i.slug)} aria-label={`Edit ${i.title}`}><img src={thumb(i)} alt="" loading="lazy" decoding="async" style={!whole && (i.focusX !== undefined || i.focusY !== undefined || i.zoom) ? { objectPosition: `${i.focusX ?? 50}% ${i.focusY ?? 50}%`, transformOrigin: `${i.focusX ?? 50}% ${i.focusY ?? 50}%`, ...(i.zoom && i.zoom > 1 ? { transform: `scale(${i.zoom})` } : {}) } : undefined} /></button>
                <span className="pf-badges">{i.hidden && <Badge>Hidden</Badge>}{i.downloadable === false && <Badge>No download</Badge>}{listed.has(i.slug) && <Badge tone="accent">In store</Badge>}</span>
                <div className="pf-meta"><span className="truncate">{i.title}</span>
                  <button type="button" className="icon-btn sm" aria-pressed={!!i.hidden} aria-label={i.hidden ? 'Show on the site' : 'Hide from the site'} title={i.hidden ? 'Hidden: show on the site' : 'Hide from the site'}
                    onClick={() => void updateSiteLive(d => ({ ...d, images: d.images.map(x => x.slug === i.slug ? { ...x, hidden: !x.hidden } : x) })).then(live => toast.show(live ? (i.hidden ? 'Shown on the site now' : 'Hidden from the site now') : 'Changed. Press Publish changes to put it live.', { tone: 'success' })).catch(toast.error)}><Icon name={i.hidden ? 'eyeOff' : 'eye'} size={13} /></button>
                  <button type="button" className={'icon-btn sm' + (cover === i.slug ? ' star-on' : '')} aria-pressed={cover === i.slug} aria-label={cover === i.slug ? 'Stack cover' : 'Use as stack cover'} title="Stack cover"
                    onClick={() => updateSite(d => ({ ...d, stacks: { ...d.stacks, covers: { ...d.stacks.covers, [folder]: cover === i.slug ? '' : i.slug } } }))}><Icon name="star" size={13} /></button>
                  <button type="button" className="icon-btn sm" aria-pressed={i.downloadable !== false} aria-label={i.downloadable === false ? 'Allow downloads of this image' : 'Turn off downloads of this image'} title={i.downloadable === false ? 'Downloads are off: click to allow' : 'Visitors can download it: click to turn off'}
                    style={{ opacity: i.downloadable === false ? 0.45 : 1 }} onClick={() => setDownloads([i.slug], i.downloadable === false)}><Icon name="downloads" size={13} /></button>
                  <button type="button" className="icon-btn sm" aria-label={`Archive ${i.title}`} title="Archive: take it off the site, keep it here" onClick={() => setArchived(i.slug, true)}><Icon name="archive" size={13} /></button>
                  <button type="button" className="icon-btn sm" aria-label={`Move ${i.title}`} title="Move: to another place in this stack, or to another stack" onClick={() => setMoving(i.slug)}><Icon name="drag" size={13} /></button></div>
              </li>
            ))}
          </ul>
        )}
        {archivedImages.length > 0 && <section className="card stack" aria-label="Archived images">
          <div className="row between"><b>Archived ({archivedImages.length})</b>
            <button type="button" className="btn sm ghost" aria-expanded={showArchived} onClick={() => setShowArchived(v => !v)}>{showArchived ? 'Hide list' : 'Show list'}</button></div>
          {showArchived && <ul className={'pf-grid size-' + size + (whole ? ' fit-whole' : '')}>{archivedImages.map(i => (
            <li key={i.slug} className="is-hidden">
              <button type="button" className="pf-thumb" onClick={() => setEditing(i.slug)} aria-label={`Edit ${i.title}`}><img src={thumb(i)} alt="" loading="lazy" decoding="async" /></button>
              <Badge>Archived</Badge>
              <div className="pf-meta"><span className="truncate">{i.title}</span>
                <button type="button" className="btn sm primary" onClick={() => setArchived(i.slug, false)}>Republish</button></div>
            </li>))}</ul>}
        </section>}
        <Switch checked={!!doc!.stacks.featured?.includes(folder)} onChange={v => void updateSiteLive(d => { const cur = (d.stacks.featured || []).filter(x => d.folders.includes(x)); return { ...d, stacks: { ...d.stacks, featured: v ? [...cur.filter(x => x !== folder), folder] : cur.filter(x => x !== folder) } }; })
          .then(live => toast.show(live ? 'Featured Work updated on the site' : 'Changed. Press Publish changes to put it live.', { tone: 'success' })).catch(toast.error)} label={`Show “${folder}” in About › Featured Work (it then leaves the Portfolio, so it never appears twice)`} />
        <Switch checked={doc!.stacks.loops?.[folder] ?? doc!.stacks.loop} onChange={v => updateSite(d => ({ ...d, stacks: { ...d.stacks, loops: { ...(d.stacks.loops || {}), [folder]: v } } }))} label={`“${folder}” loops around (coverflow)`} />
        <p className="field-hint" style={{ margin: 0 }}>This choice belongs to this stack only; every other stack keeps its own.</p>
      </div>
      {editing && <ImageEditor slug={editing} onClose={() => setEditing(null)} />}
      {moving && <MoveImage slug={moving} onClose={() => setMoving(null)} />}
    </div>
  );
}

function ImageEditor({ slug, onClose }: { slug: string; onClose: () => void }){
  const { doc } = useSite();
  const confirm = useConfirm();
  const toast = useToast();
  const img = doc!.images.find(i => i.slug === slug);
  const [f, setF] = useState<SiteImage | null>(img ? { ...img } : null);
  const [start] = useState(() => JSON.stringify(img || null));
  if (!f) return null;
  const dirty = JSON.stringify(f) !== start;
  const close = async () => { if (!dirty || await confirm({ title: 'Discard changes to this image?', confirm: 'Discard', danger: true })) onClose(); };
  const apply = () => { updateSite(d => ({ ...d, images: d.images.map(i => i.slug === slug ? { ...f, id: f.slug } : i) })); onClose(); };
  return (
    <Modal wide title="Edit image" onClose={() => void close()} footer={<>
      <button type="button" className="btn ghost" style={{ marginRight: 'auto', color: 'var(--danger)' }} onClick={async () => { if (await confirm({ title: `Remove “${f.title}” from the site?`, body: 'It disappears from the site right away. The file stays in storage.', confirm: 'Remove', danger: true })){ onClose(); try {
        const live = await updateSiteLive(d => ({ ...d, images: d.images.filter(i => i.slug !== slug),
          stacks: { ...d.stacks, covers: Object.fromEntries(Object.entries(d.stacks.covers).map(([k, v]) => [k, v === slug ? '' : v])) } }));
        toast.show(live ? 'Removed from the site now' : 'Removed. Press Publish changes to put it live.', { tone: 'success' }); } catch (e){ toast.error(e); } } }}><Icon name="trash" /> Remove</button>
      <AsyncButton className="btn ghost" onClick={async () => {
        const on = !f.archived; onClose();
        try { const live = await updateSiteLive(d => ({ ...d, images: d.images.map(i => i.slug === slug ? (on ? { ...f, id: f.slug, archived: true, hidden: true } : { ...f, id: f.slug, archived: false, hidden: false }) : i) }));
          toast.show(live ? (on ? 'Archived: off the site now' : 'Republished: back on the site now') : (on ? 'Archived. Press Publish changes to put it live.' : 'Republished. Press Publish changes to put it live.'), { tone: 'success' }); } catch (e){ toast.error(e); }
      }}><Icon name="archive" /> {f.archived ? 'Republish' : 'Archive'}</AsyncButton>
      <button type="button" className="btn" onClick={() => void close()}>Cancel</button>
      <button type="button" className="btn primary" onClick={apply}>Done</button>
    </>}>
      <div className="img-edit">
        <img src={thumb(f, 768)} alt="" />
        <div className="stack">
          <Field label="Title"><input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} maxLength={160} /></Field>
          <Field label="Folder"><select value={f.cat} onChange={e => setF({ ...f, cat: e.target.value })}>{doc!.folders.map(x => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Link" hint="Optional, e.g. Behance"><input type="url" value={f.link} onChange={e => setF({ ...f, link: e.target.value })} placeholder="https://" /></Field>
          {f.archived ? <p className="field-hint" style={{ margin: 0 }}>Archived: kept here, not on the site. Use Republish to bring it back.</p> : <Switch checked={!f.hidden} onChange={v => setF({ ...f, hidden: !v })} label="Show on the site" />}
          <Switch checked={f.downloadable !== false} onChange={v => setF({ ...f, downloadable: v })} label="Visitors may download this image" />
        </div>
      </div>
      <SellImage f={f} setF={setF} />
      <StackFraming f={f} setF={setF} />
      <Field label="Description"><textarea rows={4} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} maxLength={4000} /></Field>
      <Field label="Tools"><TagInput label="Tools" value={f.technologies} onChange={v => setF({ ...f, technologies: v })} placeholder="Photoshop, Blender…" /></Field>
    </Modal>
  );
}

// The picture as a PNG or JPEG file (the format chosen for downloads), made in the browser from the full-size original.
async function pictureFile(f: SiteImage, fmt: 'png' | 'jpeg'): Promise<File | null>{
  try {
    const url = f.src || `/images/${f.slug}-${f.full ? 'full' : Math.max(...(f.widths?.length ? f.widths : [1600]))}.webp`;
    const res = await fetch(url); if (!res.ok) return null;
    const bmp = await createImageBitmap(await res.blob());
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
    const x = c.getContext('2d')!; if (fmt === 'jpeg'){ x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); }
    x.drawImage(bmp, 0, 0);
    const blob: Blob | null = await new Promise(r => c.toBlob(r, fmt === 'jpeg' ? 'image/jpeg' : 'image/png', fmt === 'jpeg' ? 0.95 : undefined));
    if (!blob) return null;
    const base = (f.title || f.slug).trim().replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-').slice(0, 80) || 'image';
    return new File([blob], `${base}.${fmt === 'jpeg' ? 'jpg' : 'png'}`, { type: blob.type });
  } catch { return null; }
}

// Sell a gallery image as a product without leaving the gallery; optionally take it off the gallery at the same time.
function SellImage({ f, setF }: { f: SiteImage; setF: (v: SiteImage) => void }){
  const toast = useToast();
  const site = useSite();
  const desk = useDesk();
  const found = useLoad<{ products: { id: string; title: string; status: string; tags: string[] }[] }>('/products?kind=artzz');
  const product = found.data?.products.find(p => p.tags.includes(`from-gallery:${f.slug}`));
  const [inr, setInr] = useState<number | null>(null);
  const [usd, setUsd] = useState<number | null>(null);
  const [publish, setPublish] = useState(false);
  const [hide, setHide] = useState(false);
  const ready = inr !== null && usd !== null && inr > 0 && usd > 0;
  const go = async () => {
    try {
      // buyers get a PNG or JPEG, never WebP: make it here and upload it as the product's file
      const file = await pictureFile(f, site.doc?.visibility?.downloadFormat === 'jpeg' ? 'jpeg' : 'png');
      const sig = file ? await upload(file, 'deliverable') : null;
      const r = await post<{ product: { id: string; status: string; file: unknown } }>(`/gallery/${encodeURIComponent(f.slug)}/sell`, { priceInr: inr, priceUsd: usd, publish, ...(sig && file ? { path: sig.path, filename: file.name, bytes: file.size } : {}) });
      if (hide){ await updateSiteLive(d => ({ ...d, images: d.images.map(x => x.slug === f.slug ? { ...x, hidden: true } : x) })); setF({ ...f, hidden: true }); }
      toast.show(r.product.status === 'published' ? 'In the store and live' : r.product.file ? 'Added to the store as a draft. Publish it from Products.' : 'Added to the store as a draft. Upload its file in Products before publishing.', { tone: 'success' });
      await found.reload();
    } catch (e: any){
      if (e.code === 'exists') await found.reload();
      toast.error(e);
    }
  };
  return (
    <section className="stack card" aria-label="Sell this image">
      <b>Sell this image</b>
      {!found.data ? <p className="field-hint" style={{ margin: 0 }}>Checking the store…</p> : product ? (
        <div className="row between" style={{ gap: 8, flexWrap: 'wrap' }}>
          <span>It is in the store <Badge>{product.status}</Badge></span>
          <button type="button" className="btn sm" onClick={() => desk.open('products', product.id)}>Open the product</button>
        </div>
      ) : <>
        <p className="field-hint" style={{ margin: 0 }}>Makes a product from this picture, and the picture is what buyers download. You set the price here; everything else can be changed later in Products.</p>
        <div className="form-grid">
          <Field label="Price in India"><MoneyInput currency="INR" label="INR price" value={inr} onChange={setInr} placeholder="499.00" /></Field>
          <Field label="Price elsewhere"><MoneyInput currency="USD" label="USD price" value={usd} onChange={setUsd} placeholder="9.00" /></Field>
        </div>
        <Switch checked={publish} onChange={setPublish} label="Put it on sale right away (needs both prices)" disabled={!ready} />
        <Switch checked={hide} onChange={setHide} label="Take it off the gallery (it stays in the store)" />
        <div><AsyncButton className="btn primary" disabled={!ready && publish} onClick={go}>Add to the store</AsyncButton></div>
      </>}
    </section>
  );
}

// Move one image to any position in its stack, or into another stack: first / earlier / later / last buttons, or type the place.
function MoveImage({ slug, onClose }: { slug: string; onClose: () => void }){
  const { doc } = useSite();
  const toast = useToast();
  const img = doc!.images.find(i => i.slug === slug);
  const [folder, setFolder] = useState(img?.cat || '');
  const inFolder = (f: string) => doc!.images.filter(i => i.cat === f && !i.archived && i.slug !== slug);
  const here = img && !img.archived ? doc!.images.filter(i => i.cat === img.cat && !i.archived).findIndex(i => i.slug === slug) + 1 : 0;
  const [pos, setPos] = useState(here || inFolder(img?.cat || '').length + 1);
  if (!img) return null;
  const max = inFolder(folder).length + 1;   // the image itself is counted once in its own stack
  const p = Math.min(max, Math.max(1, pos));
  const apply = async () => {
    onClose();
    try {
      const live = await updateSiteLive(d => {
        const me = d.images.find(i => i.slug === slug); if (!me) return d;
        const rest = d.images.filter(i => i.slug !== slug), peers = rest.filter(i => i.cat === folder && !i.archived);
        const idx = p - 1 < peers.length ? rest.indexOf(peers[p - 1]) : peers.length ? rest.indexOf(peers[peers.length - 1]) + 1 : rest.length;
        rest.splice(idx, 0, { ...me, cat: folder });
        const covers = { ...d.stacks.covers }; if (folder !== me.cat && covers[me.cat] === slug) covers[me.cat] = '';
        return { ...d, images: rest, stacks: { ...d.stacks, covers } };
      });
      toast.show(live ? `Moved to place ${p} in “${folder}”: live now` : `Moved to place ${p} in “${folder}”. Press Publish changes to put it live.`, { tone: 'success' });
    } catch (e){ toast.error(e); }
  };
  const changed = folder !== img.cat || p !== here;
  return (
    <Modal title={`Move “${img.title}”`} onClose={onClose} footer={<><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><AsyncButton className="btn primary" disabled={!changed} onClick={apply}>Move</AsyncButton></>}>
      <div className="stack">
        <Field label="Stack"><select value={folder} onChange={e => { setFolder(e.target.value); setPos(inFolder(e.target.value).length + 1); }}>{doc!.folders.map(f => <option key={f} value={f}>{f}</option>)}</select></Field>
        <Field label={`Place in the stack (1 to ${max})`} hint={folder === img.cat ? `Now at ${here}` : 'Another stack: choose where it goes'}>
          <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <button type="button" className="btn sm" disabled={p <= 1} onClick={() => setPos(1)}>First</button>
            <button type="button" className="btn sm" disabled={p <= 1} onClick={() => setPos(p - 1)}>Earlier</button>
            <input type="number" min={1} max={max} value={p} aria-label="Place in the stack" onChange={e => setPos(Math.round(Number(e.target.value) || 1))} style={{ width: 80 }} />
            <button type="button" className="btn sm" disabled={p >= max} onClick={() => setPos(p + 1)}>Later</button>
            <button type="button" className="btn sm" disabled={p >= max} onClick={() => setPos(max)}>Last</button>
          </span></Field>
      </div>
    </Modal>
  );
}

// Frame the picture on its card in the stack: drag it any way you like, nudge it with the arrows, zoom with the slider or the wheel.
// The card is drawn exactly as the site draws it, so what you see is what visitors get.
function StackFraming({ f, setF }: { f: SiteImage; setF: (v: SiteImage) => void }){
  const card = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const drag = useRef<{ x: number; y: number; fx: number; fy: number } | null>(null);
  const fx = f.focusX ?? 50, fy = f.focusY ?? 50, zoom = f.zoom ?? 1;
  const put = (x: number, y: number, z = zoom) => setF({ ...f, focusX: Math.round(Math.min(100, Math.max(0, x)) * 10) / 10, focusY: Math.round(Math.min(100, Math.max(0, y)) * 10) / 10, zoom: Math.round(Math.min(3, Math.max(1, z)) * 100) / 100 });
  // how many screen pixels the picture travels for one percent of focus: what overflows the card, plus what zooming adds
  const perPercent = () => {
    const c = card.current, i = img.current; if (!c || !i || !i.naturalWidth) return { x: 2, y: 2 };
    const cw = c.clientWidth, ch = c.clientHeight, k = Math.max(cw / i.naturalWidth, ch / i.naturalHeight);
    return { x: Math.max(1.5, (i.naturalWidth * k - cw + (zoom - 1) * cw) / 100), y: Math.max(1.5, (i.naturalHeight * k - ch + (zoom - 1) * ch) / 100) };
  };
  const step = 4;
  const nudge = (dx: number, dy: number) => put(fx + dx * step, fy + dy * step);
  useEffect(() => {
    const c = card.current; if (!c) return;
    const wheel = (e: WheelEvent) => { e.preventDefault(); put(fx, fy, zoom + (e.deltaY < 0 ? 0.1 : -0.1)); };
    c.addEventListener('wheel', wheel, { passive: false });
    return () => c.removeEventListener('wheel', wheel);
  });
  const style: React.CSSProperties = { objectPosition: `${fx}% ${fy}%`, transformOrigin: `${fx}% ${fy}%`, transform: `scale(${zoom})` };
  const dirty = fx !== 50 || fy !== 50 || zoom !== 1;
  return (
    <section className="stack" aria-label="Stack preview">
      <b>Stack preview</b>
      <p className="field-hint" style={{ margin: 0 }}>Drag the picture inside the card to move it in any direction, or use the arrows. Zoom with the slider or the mouse wheel. This card is how it looks in the stack.</p>
      <div className="focus-row">
        <div ref={card} className="focus-card is-drag" role="img" aria-label="Stack card: drag to move the picture"
          onPointerDown={e => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, fx, fy }; }}
          onPointerMove={e => { const d = drag.current; if (!d) return; const pp = perPercent(); put(d.fx - (e.clientX - d.x) / pp.x, d.fy - (e.clientY - d.y) / pp.y); }}
          onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
          <img ref={img} src={thumb(f, 768)} alt="" draggable={false} style={style} />
        </div>
        <div className="stack" style={{ flex: '1 1 180px', minWidth: 160 }}>
          <div className="pan-pad" role="group" aria-label="Move the picture">
            <button type="button" className="icon-btn" aria-label="Move the picture up" onClick={() => nudge(0, -1)}>↑</button>
            <button type="button" className="icon-btn" aria-label="Move the picture left" onClick={() => nudge(-1, 0)}>←</button>
            <button type="button" className="icon-btn" aria-label="Centre the picture" title="Centre" onClick={() => put(50, 50)}>●</button>
            <button type="button" className="icon-btn" aria-label="Move the picture right" onClick={() => nudge(1, 0)}>→</button>
            <button type="button" className="icon-btn" aria-label="Move the picture down" onClick={() => nudge(0, 1)}>↓</button>
          </div>
          <Field label={`Zoom ${zoom.toFixed(1)}×`}><input type="range" min={1} max={3} step={0.1} value={zoom} aria-label="Zoom" onChange={e => put(fx, fy, Number(e.target.value))} /></Field>
          <span className="faint num" style={{ fontSize: 12 }}>Across {Math.round(fx)}% · down {Math.round(fy)}%</span>
          {zoom === 1 && <span className="field-hint" style={{ margin: 0 }}>A picture that already fills the card has nothing to slide: zoom in a little to move it.</span>}
          <button type="button" className="btn sm ghost" disabled={!dirty} onClick={() => setF({ ...f, focusX: undefined, focusY: undefined, zoom: undefined })}>Reset</button>
        </div>
      </div>
    </section>
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
