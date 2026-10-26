// Studio: the site's look. Every change streams into a live preview of the real homepage (in desktop,
// tablet or phone frames) before anything is published. In "Arrange" mode, elements can be dragged
// and scaled right in the preview; positions are stored per screen size.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PassCard, SIGNATURE_INK, SIGNATURE_DEFAULT_FONT, type SignatureTone } from '../../../src/store/checkout/PassCard';
import type { Product } from '../../../src/store/api';
import storeCss from '../../../src/store/store.css?inline';
import checkoutCss from '../../../src/store/checkout/checkout.css?inline';
import type { AppProps } from './registry';
import { Badge, ErrorState, Field, Segmented, SkeletonRows, Switch, useConfirm, useToast } from '../ui';
import { Icon } from '../icons';
import { WinTools } from '../shell/Window';
import { useWinShown } from '../shell/desk';
import { DateTimeInput, Uploader, useSaveKey } from './common';
import { SiteSaveBar } from './Content';
import SettingFinder from './SettingFinder';
import { loadSite, saveSite, savedIntro, thumb, updateSite, useSite, PASS_DRAFT_DEFAULTS } from './siteDoc';
import type { SiteDoc, PassDraft, Announcement, AnnouncementItem, IntroBubbles, IntroWorld } from './siteDoc';
import { BUBBLE_TYPES, INTRO_VERSIONS, WORLD_DEFAULT, introVersion } from '../../../../shared/intros.js';
import { FONT_GROUPS, FONT_LIBRARY, FONT_NAMES, fontStack, googleFontsUrl } from '../../../../shared/fonts.js';

const FONTS = FONT_NAMES;
const ACCENTS = ['#FF9438', '#E0303E', '#F5C451', '#4FD08A', '#6AA8FF', '#B98CFF', '#FF6FAE', '#EDEBE8'];
const ELEMENTS: [string, string][] = [['portfolio-title', 'Portfolio heading'], ['portfolio-intro', 'Portfolio intro'], ['contact-title', 'Contact heading'], ['contact-intro', 'Contact intro'], ['site-notice', 'Notice banner'], ['assistant-launcher', 'Assistant button'], ['about-headline', 'About name'], ['about-tagline', 'About tagline'], ['about-caption', 'About caption line'], ['about-journey', 'About timeline'], ['about-bio-text', 'About bio'], ['about-stats', 'About number tiles']];
// elements whose words can be typed straight into the Studio: where each one is stored (details.<key>, or the About bio)
const TEXT_FIELDS: Record<string, { key: string; about?: boolean; max: number; rows: number }> = {
  'portfolio-title': { key: 'portfolioTitle', max: 100, rows: 1 }, 'portfolio-intro': { key: 'portfolioIntro', max: 500, rows: 3 },
  'contact-title': { key: 'contactTitle', max: 100, rows: 1 }, 'contact-intro': { key: 'contactIntro', max: 1000, rows: 3 },
  'about-headline': { key: 'creatorName', max: 80, rows: 1 }, 'about-tagline': { key: 'tagline', max: 160, rows: 2 }, 'about-caption': { key: 'aboutCaption', max: 80, rows: 1 },
  'about-bio-text': { key: 'bio', about: true, max: 1600, rows: 8 },
};
const WEIGHTS = [300, 400, 500, 600, 700, 800];
const ICONS = ['behance', 'instagram', 'x', 'linkedin', 'youtube', 'website', 'email'];
const ANIMS = ['', 'fade', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 'scale-in', 'pop'];
const DEVICES = { desktop: { w: 1440, h: 900, label: 'Desktop' }, tablet: { w: 820, h: 1180, label: 'Tablet' }, mobile: { w: 390, h: 844, label: 'Phone' } } as const;
type Device = keyof typeof DEVICES;
type Section = 'identity' | 'type' | 'notice' | 'nav' | 'social' | 'elements' | 'arrange' | 'pass' | 'intro';

const SECTIONS: Section[] = ['identity', 'type', 'notice', 'nav', 'social', 'elements', 'arrange', 'pass', 'intro'];
export default function Studio({ active, route, only, open }: AppProps & { only?: Section }){
  const site = useSite();
  const toast = useToast();
  // #studio/pass (e.g. from a product's "Design the checkout pass" button) opens that section
  const [section, setSection] = useState<Section>(() => only || (SECTIONS.includes(route as Section) ? route as Section : 'identity'));
  useEffect(() => { if (!only && SECTIONS.includes(route as Section)) setSection(route as Section); }, [route, only]);
  const [device, setDevice] = useState<Device>('desktop');
  const [selected, setSelected] = useState<string>('portfolio-title');
  useEffect(() => { void loadSite(); }, []);
  useSaveKey(active, () => { if (site.dirty) saveSite().then(() => toast.show('Site updated', { tone: 'success' })).catch(toast.error); });
  if (site.error && !site.doc) return <ErrorState message={site.error} retry={() => loadSite(true)} />;
  if (!site.doc) return <div className="pad"><SkeletonRows rows={10} /></div>;
  const d = site.doc;
  const det = (k: string, v: unknown) => updateSite(x => ({ ...x, details: { ...x.details, [k]: v } }));
  return (
    <div className="app">
      <WinTools><SiteSaveBar /></WinTools>
      <div className="studio">
        <div className="studio-panel">
          {!only && <SettingFinder open={(app, r) => app === 'studio' && r ? setSection(r as Section) : open(app, r)} />}
          {!only && <div className="studio-nav" role="tablist" aria-label="Studio sections">
            {([['identity', 'Colours & logo'], ['type', 'Fonts'], ['notice', 'Announcements'], ['nav', 'Menu & features'], ['social', 'Social links'], ['elements', 'Text styles'], ['arrange', 'Layout'], ['pass', 'Checkout pass'], ['intro', 'Intro']] as [Section, string][]).map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={section === k} className={section === k ? 'on' : ''} onClick={() => setSection(k)}>{l}</button>
            ))}
          </div>}
          <div className="studio-body stack-lg">
            {section === 'identity' && <>
              <Field label="Accent colour" hint="Buttons, highlights and the nav pill">
                <div className="row">{ACCENTS.map(c => <button key={c} type="button" className={'swatch' + (d.details.accentColor?.toLowerCase() === c.toLowerCase() ? ' on' : '')} style={{ background: c }} aria-label={`Accent ${c}`} aria-pressed={d.details.accentColor?.toLowerCase() === c.toLowerCase()} onClick={() => det('accentColor', c)} />)}
                  <input type="color" aria-label="Custom accent colour" value={d.details.accentColor || '#FF9438'} onChange={e => det('accentColor', e.target.value.toUpperCase())} /></div>
              </Field>
              <Field label={`Glass blur · ${Math.round(d.details.glassBlur ?? 18)}px`} hint="How frosted the floating panels look"><input type="range" min={0} max={40} value={d.details.glassBlur ?? 18} onChange={e => det('glassBlur', Number(e.target.value))} /></Field>
              <div className="field"><span className="field-label">Favicon</span>
                <div className="row">{d.details.faviconUrl ? <img src={d.details.faviconUrl} alt="" width={32} height={32} style={{ borderRadius: 6 }} /> : <Badge>default KA icon</Badge>}
                  {d.details.faviconUrl && <button type="button" className="btn sm ghost" onClick={() => det('faviconUrl', '')}>Use default</button>}</div>
                <Uploader kind="image" accept="image/png,image/webp" label="Upload a favicon" onUploaded={u => det('faviconUrl', u.publicUrl)}>Square PNG, 256×256 or larger</Uploader>
              </div>
            </>}

            {section === 'type' && <>
              <div className="form-grid">
                <Field label="Headings"><select value={d.details.headingFont} onChange={e => det('headingFont', e.target.value)} style={{ fontFamily: fam(d.details.headingFont) }}><FontOptions doc={d} /></select></Field>
                <Field label="Body text"><select value={d.details.bodyFont} onChange={e => det('bodyFont', e.target.value)} style={{ fontFamily: fam(d.details.bodyFont) }}><FontOptions doc={d} /></select></Field>
              </div>
              <Field label={`Text size · ${Math.round((d.details.textScale ?? 1) * 100)}%`}><input type="range" min={0.85} max={1.2} step={0.01} value={d.details.textScale ?? 1} onChange={e => det('textScale', Number(e.target.value))} /></Field>
              <CustomFonts doc={d} />
            </>}

            {section === 'intro' && <IntroVersions doc={d} />}

            {section === 'notice' && <AnnouncementForm />}
            {section === 'nav' && <>
              <FeatureSwitches doc={d} />
              <div className="stack"><div className="eyebrow">Image protection</div>
                <Switch checked={d.visibility.protectImages !== false} onChange={v => updateSite(x => ({ ...x, visibility: { ...x.visibility, protectImages: v } }))} label="Protect my images" />
                <p className="field-hint">Covers the gallery, portfolio, store and poster viewer only; the rest of the site records and screenshots normally.
                  On: no right-click, “Save image”, dragging or long-press saving there; save, print and view-source shortcuts are blocked; those images blur
                  the moment the page loses focus (screenshot and recording tools, switching apps, developer tools) or a screenshot key is pressed, and they never print.
                  Your own Download buttons keep working. No website can fully stop a phone’s own screenshot or screen recorder, or a camera.</p>
              </div>
              <div className="stack"><div className="eyebrow">Image downloads</div>
                <Segmented label="Download format" value={d.visibility.downloadFormat === 'jpeg' ? 'jpeg' : 'png'} onChange={v => updateSite(x => ({ ...x, visibility: { ...x.visibility, downloadFormat: v } }))} options={[{ value: 'png', label: 'PNG (lossless)' }, { value: 'jpeg', label: 'JPEG (smaller)' }]} />
                <p className="field-hint">Every gallery image visitors download is saved in this format, never WebP.</p>
              </div>
            </>}

            {section === 'social' && <Social doc={d} />}

            {section === 'elements' && <Elements doc={d} selected={selected} setSelected={setSelected} />}

            {section === 'pass' && <PassSettingsForm doc={d} />}

            {section === 'arrange' && <>
              <p className="muted">Click an element in the preview to select it, drag to move it, drag the orange dot to resize. Switch to Elements to change its words, font, weight, alignment and spacing; everything shows in the preview as you go. Positions are saved separately for desktop, tablet and phone.</p>
              <Field label="Screen size"><Segmented label="Screen size" value={device} onChange={setDevice} options={Object.entries(DEVICES).map(([k, v]) => ({ value: k as Device, label: v.label }))} /></Field>
              <ul className="list">{ELEMENTS.map(([id, label]) => {
                const pos = d.layoutOverrides[device]?.[id];
                return <li key={id}><span className="grow">{label}</span>{pos ? <span className="faint num" style={{ fontSize: 12 }}>{Math.round(pos.x)}, {Math.round(pos.y)} · {Math.round(pos.scale * 100)}%</span> : <span className="faint" style={{ fontSize: 12 }}>default</span>}
                  {pos && <button type="button" className="btn sm ghost" onClick={() => updateSite(x => { const bp = { ...(x.layoutOverrides[device] || {}) }; delete bp[id]; return { ...x, layoutOverrides: { ...x.layoutOverrides, [device]: bp } }; })}>Reset</button>}</li>;
              })}</ul>
              {TEXT_FIELDS[selected] && (() => {
                const pos = d.layoutOverrides[device]?.[selected];
                const setW = (w: number | null) => updateSite(x => {
                  const cur = x.layoutOverrides[device]?.[selected] || { x: 0, y: 0, scale: 1 };
                  const next: { x: number; y: number; scale: number; width?: number } = { x: cur.x, y: cur.y, scale: cur.scale };
                  if (w) next.width = w;
                  return { ...x, layoutOverrides: { ...x.layoutOverrides, [device]: { ...(x.layoutOverrides[device] || {}), [selected]: next } } };
                });
                return <Field label={`Text width (${DEVICES[device].label} only) · ${pos?.width ? pos.width + ' px' : 'auto'}`} hint="Wider gives the words more room; narrower wraps them sooner. You can also drag the white handle on the right edge in the preview. This is separate from the size dot.">
                  <div className="row"><input type="range" min={120} max={1600} step={10} value={pos?.width || 600} onChange={e => setW(Number(e.target.value))} />{pos?.width && <button type="button" className="btn sm ghost" onClick={() => setW(null)}>Auto</button>}</div>
                </Field>;
              })()}
              <div className="eyebrow">Selected element</div>
              <Elements doc={d} selected={selected} setSelected={setSelected} />
            </>}
          </div>
        </div>
        {section === 'pass' ? <PassPreview doc={d} /> : <Preview doc={d} device={device} setDevice={setDevice} arrange={section === 'arrange'} onSelect={id => { setSelected(id); }} />}
      </div>
    </div>
  );
}

const fam = (f: string) => fontStack(f);
// The whole library's stylesheet, added once: only the fonts actually drawn (the picked ones, and options as they show) download.
let libraryLinked = false;
// Announcements: as many as you like, each switched on or off and optionally only between two dates. On the site
// they share one small megaphone tab on the side of the screen: it slides open by itself, shows the live ones one
// after another, then tucks away; visitors can open it again or pin it open.
const annLocal = (iso?: string) => iso ? new Date(new Date(iso).getTime() + 330 * 60e3).toISOString().slice(0, 16) : '';
const annIso = (v: string) => v ? new Date(v + ':00+05:30').toISOString() : '';
function annStatus(a: AnnouncementItem): [string, 'success' | 'info' | 'neutral' | 'warning']{
  const now = Date.now();
  if (!a.enabled) return ['Off', 'neutral'];
  if (!a.text.trim()) return ['Needs text', 'warning'];
  if (a.startsAt && Date.parse(a.startsAt) > now) return ['Scheduled', 'info'];
  if (a.endsAt && Date.parse(a.endsAt) <= now) return ['Ended', 'neutral'];
  return ['Live', 'success'];
}
// Studio > Menu & features: every page in the top bar, every item in the ☰ menu, and the panda, each a simple switch
function FeatureSwitches({ doc }: { doc: SiteDoc }){
  const v = doc.visibility as Record<string, unknown>;
  const sw = (key: string, label: string, hint?: string) => <Switch key={key} checked={v[key] !== false} onChange={on => updateSite(x => ({ ...x, visibility: { ...x.visibility, [key]: on } }))} label={hint ? <>{label} <span className="faint">· {hint}</span></> : label} />;
  return <>
    <div className="stack"><div className="eyebrow">Pages in the top bar</div>
      <div className="feature-grid">{sw('navAbout', 'About', 'with the Portfolio')}{sw('navContact', 'Contact')}{sw('navStore', 'Store')}{sw('navTypography', 'Typography studio')}</div>
    </div>
    <div className="stack"><div className="eyebrow">Items in the ☰ menu</div>
      <div className="feature-grid">{sw('menuPortfolio', 'Portfolio')}{sw('menuTips', 'Tips')}{sw('menuUpscaler', 'Image Upscaler')}{sw('menuDemix', 'Demix Pro')}{sw('menuFullscreen', 'Full screen')}{sw('menuSound', 'Sound on / off')}</div>
    </div>
    <div className="stack"><div className="eyebrow">The panda</div>
      {sw('panda', 'Show the 3D panda by the chat button', 'it also naps on the board while the store is closed')}
      <p className="field-hint" style={{ margin: 0 }}>The chat itself is switched on or off in KA Assistant › Rules & settings.</p>
    </div>
  </>;
}

function AnnouncementForm(){
  const { doc } = useSite();
  const [open, setOpen] = useState<string | null>(null);
  if (!doc) return null;
  const n = doc.notice;
  // a site saved before the list existed: its single notice becomes the first announcement
  const list: AnnouncementItem[] = doc.announcements ?? (n.text ? [{ id: 'legacy', enabled: n.enabled, title: n.title, text: n.text, tone: n.tone, linkLabel: n.linkLabel, linkUrl: n.linkUrl, startsAt: '', endsAt: '' }] : []);
  const setN = <K extends keyof Announcement>(k: K, v: Announcement[K]) => updateSite(x => ({ ...x, notice: { ...x.notice, [k]: v } }));
  const setList = (fn: (l: AnnouncementItem[]) => AnnouncementItem[]) => updateSite(x => ({ ...x, announcements: fn(x.announcements ?? list), notice: { ...x.notice, enabled: false } }));
  const setItem = (id: string, patch: Partial<AnnouncementItem>) => setList(l => l.map(a => a.id === id ? { ...a, ...patch } : a));
  const add = () => { const id = 'a' + Date.now().toString(36); setList(l => [...l, { id, enabled: true, title: 'Announcement', text: '', tone: 'info', linkLabel: '', linkUrl: '', startsAt: '', endsAt: '' }]); setOpen(id); };
  const move = (i: number, by: -1 | 1) => setList(l => { const c = l.slice(), j = i + by; if (j < 0 || j >= c.length) return l; [c[i], c[j]] = [c[j], c[i]]; return c; });
  const live = list.filter(a => annStatus(a)[0] === 'Live').length;
  return <>
    <div className="row between"><div><div className="eyebrow">Announcements</div><p className="field-hint" style={{ margin: 0 }}>{live ? `${live} live on the site now` : 'None live right now'} · {list.length} in all</p></div>
      <button type="button" className="btn primary sm" onClick={add} disabled={list.length >= 12}><Icon name="plus" /> New announcement</button></div>
    {!list.length && <p className="muted">No announcements yet. Add one: it appears as a small megaphone tab on the side of the site.</p>}
    <ul className="ann-list">{list.map((a, i) => { const [st, tone] = annStatus(a), isOpen = open === a.id; return (
      <li key={a.id} className={'ann-item' + (isOpen ? ' open' : '')} data-tone={a.tone}>
        <div className="ann-row">
          <Switch checked={a.enabled} onChange={v => setItem(a.id, { enabled: v })} label="" />
          <button type="button" className="ann-sum grow" onClick={() => setOpen(isOpen ? null : a.id)} aria-expanded={isOpen}>
            <b className="truncate">{a.title || 'Announcement'}</b><span className="truncate faint">{a.text || 'No text yet'}</span></button>
          <Badge tone={tone}>{st}</Badge>
          <button type="button" className="icon-btn sm" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
          <button type="button" className="icon-btn sm" aria-label="Move down" disabled={i === list.length - 1} onClick={() => move(i, 1)}>↓</button>
          <button type="button" className="icon-btn sm" aria-label={`Delete ${a.title || 'announcement'}`} onClick={() => setList(l => l.filter(x => x.id !== a.id))}><Icon name="trash" size={13} /></button>
        </div>
        {isOpen && <div className="ann-edit stack">
          <div className="form-grid">
            <Field label="Title" hint="Shown at the top of the panel"><input value={a.title} maxLength={40} onChange={e => setItem(a.id, { title: e.target.value })} /></Field>
            <Field label="Tone"><select value={a.tone} onChange={e => setItem(a.id, { tone: e.target.value as AnnouncementItem['tone'] })}><option value="info">Info</option><option value="success">Good news</option><option value="offer">Offer</option><option value="warning">Warning</option></select></Field>
          </div>
          <Field label="Text" hint={`${a.text.length}/220 · plain text`}><textarea rows={3} maxLength={220} value={a.text} onChange={e => setItem(a.id, { text: e.target.value })} placeholder="e.g. New poster packs are out. 20% off this week with code LAUNCH20." /></Field>
          <div className="form-grid">
            <Field label="Button label" hint="Optional"><input value={a.linkLabel} maxLength={30} onChange={e => setItem(a.id, { linkLabel: e.target.value })} placeholder="Shop now" /></Field>
            <Field label="Button link" hint="https://… or /?page=store"><input value={a.linkUrl} maxLength={300} onChange={e => setItem(a.id, { linkUrl: e.target.value })} placeholder="/?page=store" /></Field>
            <Field label="Starts" hint="Optional, India time"><DateTimeInput label="Starts" value={annLocal(a.startsAt)} onChange={v => setItem(a.id, { startsAt: annIso(v) })} /></Field>
            <Field label="Ends" hint="Optional"><DateTimeInput label="Ends" value={annLocal(a.endsAt)} min={annLocal(a.startsAt) || undefined} onChange={v => setItem(a.id, { endsAt: annIso(v) })} /></Field>
          </div>
        </div>}
      </li>); })}</ul>
    <div className="stack"><div className="eyebrow">The tab</div>
      <div className="form-grid">
        <Field label="Side of the screen"><Segmented label="Side" value={n.side} onChange={v => setN('side', v)} options={[{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }]} /></Field>
        <Field label={n.autoClose ? `Tucks away after ${n.autoClose} s` : 'Stays open until closed'} hint="0 keeps it open"><input type="range" min={0} max={30} step={1} value={n.autoClose} onChange={e => setN('autoClose', Number(e.target.value))} /></Field>
      </div>
      <p className="field-hint">Each visitor sees it slide open once for every new set of announcements; after that it waits in the tab. With several live, they change every few seconds and visitors can switch with the dots.</p>
    </div>
  </>;
}

function linkLibraryFonts(){
  if (libraryLinked || typeof document === 'undefined') return; libraryLinked = true;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = googleFontsUrl(FONT_LIBRARY.map(f => f.name)); document.head.appendChild(l);
}
/** every font, grouped (your uploads first), each option shown in its own face */
function FontOptions({ doc }: { doc: SiteDoc }){
  linkLibraryFonts();
  return <>
    {doc.details.customFonts.length > 0 && <optgroup label="Your fonts">{doc.details.customFonts.map(f => <option key={f.family} value={f.family} style={{ fontFamily: fam(f.family) }}>{f.family}</option>)}</optgroup>}
    {FONT_GROUPS.map(g => <optgroup key={g.id} label={g.label}>{FONT_LIBRARY.filter(f => f.group === g.id).map(f => <option key={f.name} value={f.name} style={{ fontFamily: fam(f.name) }}>{f.name}</option>)}</optgroup>)}
    <optgroup label="System"><option value="system-ui">system-ui</option></optgroup>
  </>;
}
const fontList = (d: SiteDoc) => [...FONTS, ...d.details.customFonts.map(f => f.family)];

// Uploaded fonts are registered with the browser once, so every select, sample and the pass preview
// (in its own shadow root; fonts are document-wide) can draw them.
const loadedFonts = new Map<string, { url: string; face: FontFace }>();
function useCustomFontFaces(doc: SiteDoc){
  useEffect(() => {
    for (const f of doc.details.customFonts){
      const have = loadedFonts.get(f.family);
      if (have && have.url === f.url) continue;
      if (have) document.fonts.delete(have.face);          // the same name now points at a new file: drop the old one so the new one shows
      const face = new FontFace(f.family, `url(${JSON.stringify(f.url)})`);
      loadedFonts.set(f.family, { url: f.url, face });
      face.load().then(x => document.fonts.add(x)).catch(() => { if (loadedFonts.get(f.family)?.face === face) loadedFonts.delete(f.family); });
    }
  }, [doc.details.customFonts]);
}
// A font name from a file name: "Kethan-Signature_v2.ttf" -> "Kethan Signature v2"; a number is added when the name is taken.
function fontNameFromFile(name: string, taken: string[]){
  const base = (name.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9 _-]+/g, ' ').replace(/[ _-]{2,}/g, ' ').trim().slice(0, 52)) || 'My signature';
  let out = base, n = 2;
  while (taken.includes(out)) out = `${base} ${n++}`;
  return out;
}
// Where a font is in use, in words, so removing it is never a surprise.
function fontUses(doc: SiteDoc, family: string){
  const out: string[] = [];
  if (doc.details.headingFont === family) out.push('Headings');
  if (doc.details.bodyFont === family) out.push('Body text');
  if (doc.passCard.titleFont === family) out.push('Pass title');
  if (doc.passCard.priceFont === family) out.push('Pass price');
  if (doc.passCard.signatureFont === family) out.push('Signature');
  const els = Object.entries(doc.elementStyles || {}).filter(([, st]) => (st as { font?: string })?.font === family).length;
  if (els) out.push(els === 1 ? '1 element' : `${els} elements`);
  return out;
}
function CustomFonts({ doc, sample: initialSample = '', onAdded }: { doc: SiteDoc; sample?: string; onAdded?: (family: string) => void }){
  const [family, setFamily] = useState('');
  const [sample, setSample] = useState(initialSample);
  const toast = useToast();
  const confirm = useConfirm();
  useCustomFontFaces(doc);
  const valid = /^[A-Za-z0-9 _-]{1,60}$/.test(family.trim()) && !fontList(doc).includes(family.trim());
  const remove = async (name: string) => {
    const uses = fontUses(doc, name);
    if (uses.length && !await confirm({ title: `Remove “${name}”?`, body: `It is used by: ${uses.join(', ')}. Those go back to their default font.`, confirm: 'Remove font', danger: true })) return;
    updateSite(x => ({ ...x,
      details: { ...x.details, customFonts: x.details.customFonts.filter(c => c.family !== name),
        headingFont: x.details.headingFont === name ? 'Fraunces' : x.details.headingFont, bodyFont: x.details.bodyFont === name ? 'Manrope' : x.details.bodyFont },
      passCard: { ...x.passCard, titleFont: x.passCard.titleFont === name ? '' : x.passCard.titleFont, priceFont: x.passCard.priceFont === name ? '' : x.passCard.priceFont,
        signatureFont: x.passCard.signatureFont === name ? '' : x.passCard.signatureFont },
      elementStyles: Object.fromEntries(Object.entries(x.elementStyles || {}).map(([id, st]) => [id, (st as { font?: string })?.font === name ? { ...(st as object), font: undefined } : st])) }));
    toast.show(`Removed “${name}”. Publish to make it final.`, { tone: 'success' });
  };
  return (
    <section className="stack"><div className="eyebrow">Your fonts</div>
      {doc.details.customFonts.length > 0 && <Field label="Preview text"><input value={sample} maxLength={60} onChange={e => setSample(e.target.value)} placeholder="Aa Bb 123 · type your name" /></Field>}
      {doc.details.customFonts.length ? <ul className="list font-list">{doc.details.customFonts.map(f => {
        const uses = fontUses(doc, f.family);
        return <li key={f.family}>
          <span className="grow font-row"><span className="font-sample" style={{ fontFamily: `'${f.family}', system-ui` }}>{sample || `${f.family} · Aa Bb 123`}</span>
            <span className="faint" style={{ fontSize: 12 }}>{f.family}{uses.length ? ` · used by ${uses.join(', ')}` : ' · not used yet'}</span></span>
          <button type="button" className="icon-btn sm" aria-label={`Remove ${f.family}`} title="Remove" onClick={() => void remove(f.family)}><Icon name="trash" size={13} /></button></li>;
      })}</ul> : <p className="faint">No custom fonts yet. Upload your own (a signature font, for example) and it appears in every font menu.</p>}
      <Field label="New font name" hint="Letters, numbers, spaces, - and _. Upload the file after naming it."><input id="font-new-name" value={family} onChange={e => setFamily(e.target.value)} maxLength={60} placeholder="e.g. Kethan Signature" /></Field>
      {valid ? <Uploader kind="font" accept=".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf" label={`Upload “${family.trim()}”`} onUploaded={u => {
        updateSite(x => ({ ...x, details: { ...x.details, customFonts: [...x.details.customFonts, { family: family.trim(), url: u.publicUrl! }] } }));
        if (onAdded) onAdded(family.trim());
        setFamily(''); toast.show(onAdded ? 'Font added and chosen for the signature. Publish to make it live.' : 'Font added. Pick it in any font menu, then publish.', { tone: 'success' });
      }}>WOFF2 is smallest · up to 50 MB · make sure your font license allows web use</Uploader> : family && <p className="field-error">Use a new name with letters, numbers, spaces, - or _.</p>}
    </section>
  );
}

const linkOk = (l: { url: string; icon: string }) => l.icon === 'email' ? /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(l.url) : /^https?:\/\/[^\s/]+\.[^\s]+/i.test(l.url);
function Social({ doc }: { doc: SiteDoc }){
  const links = doc.socialLinks;
  const set = (next: SiteDoc['socialLinks']) => updateSite(x => ({ ...x, socialLinks: next }));
  return (
    <div className="stack">
      <p className="muted">Shown in the footer and contact section, in this order. On desktop, names appear when you focus or hover over an icon; on touch screens they stay visible.</p>
      {links.map((l, i) => (
        <div key={i} className="social-row">
          <select aria-label="Icon" value={l.icon} onChange={e => set(links.map((x, j) => j === i ? { ...x, icon: e.target.value } : x))}>{ICONS.map(ic => <option key={ic}>{ic}</option>)}</select>
          <input aria-label="Label" value={l.label} onChange={e => set(links.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} maxLength={60} placeholder="Label" />
          <input aria-label="Link" value={l.url} onChange={e => set(links.map((x, j) => j === i ? { ...x, url: e.target.value } : x))} maxLength={300} placeholder={l.icon === 'email' ? 'mailto:you@example.com' : 'https://'}
            aria-invalid={!!l.url && !linkOk(l) || undefined} className={l.url && !linkOk(l) ? 'invalid' : ''} title={l.url && !linkOk(l) ? (l.icon === 'email' ? 'Use mailto:you@example.com' : 'Use a full address starting with https://') : undefined} />
          <div className="row" style={{ gap: 0 }}>
            <button type="button" className="icon-btn sm" aria-label="Move up" disabled={i === 0} onClick={() => { const n = [...links]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; set(n); }}><Icon name="chevronDown" size={13} style={{ transform: 'rotate(180deg)' }} /></button>
            <button type="button" className="icon-btn sm" aria-label="Move down" disabled={i === links.length - 1} onClick={() => { const n = [...links]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; set(n); }}><Icon name="chevronDown" size={13} /></button>
            <button type="button" className="icon-btn sm" aria-label="Remove link" onClick={() => set(links.filter((_, j) => j !== i))}><Icon name="trash" size={13} /></button>
          </div>
        </div>
      ))}
      {links.some(l => l.url && !linkOk(l)) && <p className="field-error" role="alert">Links must be full addresses: https://… (or mailto:you@example.com for email).</p>}
      {links.some(l => !l.label.trim() || !l.url.trim()) && <p className="field-hint">Each link needs a label and an address before you can publish.</p>}
      <div><button type="button" className="btn sm" disabled={links.length >= 8} onClick={() => set([...links, { label: '', url: '', icon: 'website' }])}><Icon name="plus" /> Add link</button></div>
    </div>
  );
}

function Elements({ doc, selected, setSelected }: { doc: SiteDoc; selected: string; setSelected: (s: string) => void }){
  const st = doc.elementStyles[selected] || {};
  const set = (patch: Record<string, unknown>) => updateSite(x => {
    const next = { ...(x.elementStyles[selected] || {}), ...patch };
    for (const k of Object.keys(next)) if (next[k] === '' || next[k] === null || next[k] === undefined) delete next[k];
    const all = { ...x.elementStyles }; if (Object.keys(next).length) all[selected] = next; else delete all[selected];
    return { ...x, elementStyles: all };
  });
  const anim = st.animation || null;
  return (
    <div className="stack">
      <Field label="Element" hint="Tip: in Arrange, clicking an element in the preview selects it here">
        <select value={selected} onChange={e => setSelected(e.target.value)}>{ELEMENTS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select></Field>
      {TEXT_FIELDS[selected] && (() => {
        const tf = TEXT_FIELDS[selected];
        const value: string = tf.about ? (doc.about as any).bio || '' : doc.details[tf.key] || '';
        const onText = (v: string) => updateSite(x => tf.about ? { ...x, about: { ...x.about, bio: v } } : { ...x, details: { ...x.details, [tf.key]: v } });
        return <Field label="Text" hint={`${value.length}/${tf.max} · appears in the preview as you type`}>
          {tf.rows > 1 ? <textarea rows={tf.rows} maxLength={tf.max} value={value} onChange={e => onText(e.target.value)} /> : <input type="text" maxLength={tf.max} value={value} placeholder={tf.key === 'aboutCaption' ? 'IMAGINE · CREATE · EVOLVE' : ''} onChange={e => onText(e.target.value)} />}
        </Field>;
      })()}
      <div className="form-grid">
        <Field label="Weight"><select value={st.weight || ''} onChange={e => set({ weight: e.target.value ? Number(e.target.value) : '' })}><option value="">Default</option>{WEIGHTS.map(w => <option key={w} value={w}>{w}</option>)}</select></Field>
        <Field label="Align"><Segmented label="Align" value={st.align || ''} onChange={v => set({ align: v })} options={[{ value: '', label: 'Default' }, { value: 'left', label: 'Left' }, { value: 'center', label: 'Centre' }, { value: 'right', label: 'Right' }]} /></Field>
        <Field label={`Letter spacing · ${typeof st.spacing === 'number' ? st.spacing.toFixed(2) + ' em' : 'default'}`}><div className="row"><input type="range" min={-0.05} max={0.4} step={0.01} value={st.spacing ?? 0} onChange={e => set({ spacing: Number(e.target.value) })} />{typeof st.spacing === 'number' && <button type="button" className="btn sm ghost" onClick={() => set({ spacing: '' })}>Default</button>}</div></Field>
        <Field label={`First-line indent · ${typeof st.indent === 'number' && st.indent > 0 ? st.indent.toFixed(1) + ' em' : 'none'}`} hint="Space before the first line of a paragraph, like a printed book. Works best on the bio and intros."><div className="row"><input type="range" min={0} max={6} step={0.5} value={st.indent ?? 0} onChange={e => set({ indent: Number(e.target.value) })} />{typeof st.indent === 'number' && <button type="button" className="btn sm ghost" onClick={() => set({ indent: '' })}>None</button>}</div></Field>
        <Field label={`Line height · ${typeof st.lineHeight === 'number' ? st.lineHeight.toFixed(2) : 'default'}`}><div className="row"><input type="range" min={0.9} max={2.6} step={0.05} value={st.lineHeight ?? 1.4} onChange={e => set({ lineHeight: Number(e.target.value) })} />{typeof st.lineHeight === 'number' && <button type="button" className="btn sm ghost" onClick={() => set({ lineHeight: '' })}>Default</button>}</div></Field>
      </div>
      <div className="form-grid">
        <Field label="Font"><select value={st.font || ''} onChange={e => set({ font: e.target.value })}><option value="">Site default</option><FontOptions doc={doc} /></select></Field>
        <Field label="Colour"><div className="row"><input type="color" aria-label="Colour" value={st.color || '#EDEBE8'} onChange={e => set({ color: e.target.value.toUpperCase() })} />{st.color && <button type="button" className="btn sm ghost" onClick={() => set({ color: '' })}>Default</button>}</div></Field>
      </div>
      <div className="eyebrow">Entrance animation</div>
      <Field label="Style"><select value={anim?.preset || ''} onChange={e => set({ animation: e.target.value ? { duration: 600, delay: 0, easing: 'ease-out', trigger: 'scroll', ...anim, preset: e.target.value } : '' })}>
        {ANIMS.map(a => <option key={a} value={a}>{a || 'None'}</option>)}</select></Field>
      {anim && <div className="form-grid">
        <Field label={`Duration · ${anim.duration} ms`}><input type="range" min={100} max={3000} step={50} value={anim.duration} onChange={e => set({ animation: { ...anim, duration: Number(e.target.value) } })} /></Field>
        <Field label={`Delay · ${anim.delay} ms`}><input type="range" min={0} max={3000} step={50} value={anim.delay} onChange={e => set({ animation: { ...anim, delay: Number(e.target.value) } })} /></Field>
        <Field label="Easing"><select value={anim.easing} onChange={e => set({ animation: { ...anim, easing: e.target.value } })}>{['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'bounce'].map(x => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Plays"><Segmented label="Plays" value={anim.trigger} onChange={v => set({ animation: { ...anim, trigger: v } })} options={[{ value: 'load', label: 'On load' }, { value: 'scroll', label: 'On scroll' }]} /></Field>
      </div>}
    </div>
  );
}

// The real homepage in an iframe, fed the draft over postMessage (same origin only).
function Preview({ doc, device, setDevice, arrange, onSelect }: { doc: SiteDoc; device: Device; setDevice: (d: Device) => void; arrange: boolean; onSelect: (id: string) => void }){
  const frame = useRef<HTMLIFrameElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [scale, setScale] = useState(0.5);
  const [nonce, setNonce] = useState(0);
  const dev = DEVICES[device];
  const introId = introVersion(doc.intro?.version);   // a new version reloads the preview with that intro
  const shown = useWinShown();   // minimised: the preview unloads (it runs the full site) and reloads on return
  const send = (msg: unknown) => frame.current?.contentWindow?.postMessage(msg, location.origin);
  const selectRef = useRef(onSelect); selectRef.current = onSelect;
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.source !== frame.current?.contentWindow || !e.data || typeof e.data !== 'object') return;
      if (e.data.type === 'ka-preview-ready') setReady(true);
      else if (e.data.type === 'ka-preview-selected' && typeof e.data.id === 'string') selectRef.current(e.data.id);
      else if (e.data.type === 'ka-preview-moved' && typeof e.data.id === 'string'){
        const { id, breakpoint, x, y, scale: sc, width } = e.data;
        if (!['mobile', 'tablet', 'desktop'].includes(breakpoint) || ![x, y, sc].every(Number.isFinite)) return;
        updateSite(dd => ({ ...dd, layoutOverrides: { ...dd.layoutOverrides, [breakpoint]: { ...(dd.layoutOverrides[breakpoint] || {}), [id]: { x: Math.round(x), y: Math.round(y), scale: Math.round(sc * 100) / 100, ...(Number.isFinite(width) && width > 0 ? { width: Math.round(width) } : {}) } } } }));
      }
    };
    addEventListener('message', on);
    return () => removeEventListener('message', on);
  }, []);
  useEffect(() => setReady(false), [device, introId, shown]);   // a new frame must announce itself again
  // stream the draft (debounced)
  useEffect(() => { if (!ready) return; const t = setTimeout(() => send({ type: 'ka-preview-data', data: doc }), 120); return () => clearTimeout(t); }, [doc, ready]);
  useEffect(() => { if (ready) send({ type: 'ka-preview-edit-mode', enabled: arrange }); }, [arrange, ready]);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setScale(Math.min(1, (el.clientWidth - 24) / dev.w, (el.clientHeight - 24) / dev.h)));
    ro.observe(el); return () => ro.disconnect();
  }, [dev.w, dev.h]);
  return (
    <div className="studio-preview">
      <div className="row between" style={{ padding: '8px 12px' }}>
        <Segmented label="Preview size" value={device} onChange={setDevice} options={Object.entries(DEVICES).map(([k, v]) => ({ value: k as Device, label: v.label }))} />
        <div className="row"><span className="faint" style={{ fontSize: 12 }}>{ready ? 'Live draft preview' : 'Loading preview…'}</span>
          <button type="button" className="icon-btn sm" aria-label="Reload preview" onClick={() => { setReady(false); setNonce(n => n + 1); }}><Icon name="refresh" size={13} /></button></div>
      </div>
      <div ref={box} className="preview-stage">
        <div className="device" style={{ width: dev.w * scale, height: dev.h * scale }}>
          {shown && <iframe key={`${device}-${nonce}-${introId}`} ref={frame} src={`/?preview=1&intro=${introId}`} title="Live preview of the homepage" style={{ width: dev.w, height: dev.h, transform: `scale(${scale})` }} />}
        </div>
      </div>
    </div>
  );
}

// ---- Checkout pass: the ticket buyers see at checkout -------------------------------------------
const SAMPLE_CODE = 'KA-SAMP1-E0000';   // the preview's seal (a sample: it opens a “not found” license page)
function PassSettingsForm({ doc }: { doc: SiteDoc }){
  const p = doc.passCard;
  const toast = useToast();
  useCustomFontFaces(doc);
  const set = (patch: Partial<PassDraft>) => updateSite(x => ({ ...x, passCard: { ...x.passCard, ...patch } }));
  return <>
    <p className="muted">The pass buyers see while they check out. Changes show in the preview straight away and go live when you publish.</p>
    <Field label="Label next to the logo" hint={`${p.label.length}/24`}><input value={p.label} maxLength={24} onChange={e => set({ label: e.target.value })} placeholder="KA PASS" /></Field>
    <div className="field"><span className="field-label">Logo</span>
      <div className="row"><img src={p.logoUrl || '/images/ka-logo.png'} alt="" width={40} height={40} style={{ borderRadius: 8, objectFit: 'contain', background: '#0e0c10' }} />
        {p.logoUrl ? <button type="button" className="btn sm ghost" onClick={() => set({ logoUrl: '' })}>Use the KA logo</button> : <Badge>KA logo</Badge>}</div>
      <Uploader kind="image" accept="image/png,image/webp,image/avif" label="Upload your own logo" onUploaded={u => set({ logoUrl: u.publicUrl || '' })}>Square PNG or WebP with a transparent background, 256×256 or larger, stays sharp</Uploader>
    </div>
    <Field label={`Logo size · ${p.logoSize}px`}><input type="range" min={16} max={44} value={p.logoSize} onChange={e => set({ logoSize: Number(e.target.value) })} /></Field>
    <div className="stack"><Switch checked={p.showTag} onChange={v => set({ showTag: v })} label="Show the tag in the top corner" />
      {p.showTag && <Field label="Tag text" hint="Empty = “Instant download” (or “Free download” for free items)"><input value={p.tagText} maxLength={30} onChange={e => set({ tagText: e.target.value })} placeholder="Instant download" /></Field>}</div>
    <div className="form-grid">
      <Field label="Title font"><select value={p.titleFont} onChange={e => set({ titleFont: e.target.value })}><option value="">Site heading font</option><FontOptions doc={doc} /></select></Field>
      <Field label="Price font"><select value={p.priceFont} onChange={e => set({ priceFont: e.target.value })}><option value="">Monospace (default)</option><FontOptions doc={doc} /></select></Field>
    </div>
    <Field label="Title and price sit at the"><Segmented label="Text position" value={p.textPosition} onChange={v => set({ textPosition: v })} options={[{ value: 'top', label: 'Top' }, { value: 'center', label: 'Middle' }, { value: 'bottom', label: 'Bottom' }]} /></Field>
    <Field label="Price goes"><Segmented label="Price position" value={p.pricePosition} onChange={v => set({ pricePosition: v })} options={[{ value: 'right', label: 'Right' }, { value: 'left', label: 'Left' }, { value: 'below', label: 'Below the title' }]} /></Field>
    <div className="form-grid">
      <Field label="Stamp after payment" hint={`${p.stampText.length}/12`}><input value={p.stampText} maxLength={12} onChange={e => set({ stampText: e.target.value })} placeholder="PAID" /></Field>
      <Field label={`Darken the artwork · ${p.dim}%`} hint="More keeps text readable on bright art"><input type="range" min={0} max={90} value={p.dim} onChange={e => set({ dim: Number(e.target.value) })} /></Field>
    </div>
    <Switch checked={p.foil} onChange={v => set({ foil: v })} label="Holographic shimmer that follows the tilt" />

    <div className="stack"><div className="eyebrow">Signature (back of the pass)</div>
      <p className="field-hint" style={{ margin: 0 }}>Shown on the license side of the pass and on the license check page that the seal opens. Upload a signature font below and pick it here.</p>
      <Field label="Signature text" hint={`${p.signatureText.length}/40`}><input value={p.signatureText} maxLength={40} onChange={e => set({ signatureText: e.target.value })} placeholder="Kethan Artzz" /></Field>
      <Field label="Signature font"><select value={p.signatureFont} onChange={e => set({ signatureFont: e.target.value })} style={{ fontFamily: p.signatureFont ? fam(p.signatureFont) : SIGNATURE_DEFAULT_FONT }}>
        <option value="">Handwriting (default)</option>
        <FontOptions doc={doc} />
      </select>
        <div style={{ marginTop: 8 }}><Uploader kind="font" accept=".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf" label="Upload a signature font"
          onUploaded={u => {
            const family = fontNameFromFile(u.file.name, fontList(doc));
            updateSite(x => ({ ...x, details: { ...x.details, customFonts: [...x.details.customFonts, { family, url: u.publicUrl! }] }, passCard: { ...x.passCard, signatureFont: family } }));
            toast.show(`“${family}” added and chosen for the signature. Publish to make it live.`, { tone: 'success' });
          }}>.ttf, .otf, .woff or .woff2 · it is named from the file and picked at once</Uploader></div>
        </Field>
      <div className="sig-sample" style={{ fontFamily: p.signatureFont ? fam(p.signatureFont) : SIGNATURE_DEFAULT_FONT, fontSize: p.signatureSize,
        color: SIGNATURE_INK[p.signatureTone].startsWith('var') ? '#ff9438' : SIGNATURE_INK[p.signatureTone], transform: `rotate(${p.signatureAngle}deg)` }} aria-hidden="true">{p.signatureText || 'Kethan Artzz'}</div>
      <div className="form-grid">
        <Field label={`Size · ${p.signatureSize}px`}><input type="range" min={16} max={60} value={p.signatureSize} onChange={e => set({ signatureSize: Number(e.target.value) })} /></Field>
        <Field label={`Slant · ${p.signatureAngle}°`}><input type="range" min={-12} max={12} value={p.signatureAngle} onChange={e => set({ signatureAngle: Number(e.target.value) })} /></Field>
      </div>
      <Field label="Ink"><Segmented label="Signature ink" value={p.signatureTone} onChange={(v: SignatureTone) => set({ signatureTone: v })}
        options={[{ value: 'gold', label: 'Gold' }, { value: 'white', label: 'White' }, { value: 'ink', label: 'Soft' }, { value: 'accent', label: 'Accent' }]} /></Field>
    </div>

    <div className="stack"><div className="eyebrow">Words on the back of the pass</div>
      <div className="form-grid">
        <Field label="Heading" hint="Small label above the license name"><input value={p.backEyebrow} maxLength={24} onChange={e => set({ backEyebrow: e.target.value })} placeholder="License" /></Field>
        <Field label="Holder label" hint="Above the buyer's name"><input value={p.licensedLabel} maxLength={24} onChange={e => set({ licensedLabel: e.target.value })} placeholder="Licensed to" /></Field>
        <Field label="Signature label" hint="Under the signature"><input value={p.signLabel} maxLength={32} onChange={e => set({ signLabel: e.target.value })} placeholder="Authorised signature" /></Field>
      </div>
      <Field label="Extra line (optional)" hint={`${p.backNote.length}/100 · for example “Commercial use allowed. No resale.”`}><input value={p.backNote} maxLength={100} onChange={e => set({ backNote: e.target.value })} placeholder="A short line of your own" /></Field>
      <Switch checked={p.showTerms} onChange={v => set({ showTerms: v })} label="Show the delivery line (link time and download count)" />
    </div>

    <div className="stack"><div className="eyebrow">License seal</div>
      <Switch checked={p.showSeal} onChange={v => set({ showSeal: v })} label="Show the scannable license seal on the back" />
      <p className="field-hint" style={{ margin: 0 }}>Every purchase gets its own code (like KA-7F3QX-9MK2D). Scanning the seal with any phone camera, or typing the code at /license, shows the item, the license, who holds it and whether it is still valid. Refunds revoke it automatically.</p>
    </div>

    <CustomFonts doc={doc} sample={p.signatureText} onAdded={family => set({ signatureFont: family })} />
    <div><button type="button" className="btn sm ghost" onClick={() => set({ ...PASS_DRAFT_DEFAULTS })}>Reset the pass to defaults</button></div>
  </>;
}

// The real pass component (the same code and styles the store uses), drawn in its own shadow root so
// the store's styles can't touch the portal's.
function PassPreview({ doc }: { doc: SiteDoc }){
  const host = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [paid, setPaid] = useState(false);
  const [back, setBack] = useState(false);
  useCustomFontFaces(doc);
  useEffect(() => {
    const h = host.current; if (!h) return;
    const root = h.shadowRoot || h.attachShadow({ mode: 'open' });
    const style = document.createElement('style'); style.textContent = storeCss + '\n' + checkoutCss + '\n:host{display:block}.kpp{display:grid;place-items:center;width:100%;box-sizing:border-box;padding:36px 20px;min-height:100%}.kpp .kco-card-wrap{width:420px;max-width:100%}';
    const t = document.createElement('div'); t.style.width = '100%'; root.replaceChildren(style, t); setTarget(t);   // the card sizes from this width
  }, []);
  const img = doc.images.find(i => i.src || i.widths.length) || doc.images[0];
  const product = { id: 'preview', slug: 'preview', kind: 'artzz', title: img?.title || 'All Hail the Tiger', summary: '', description: '', category: null, tags: [], techTags: [], version: '',
    sellable: true, free: false, prices: {} as Product['prices'], license: { key: 'personal', name: 'Personal', summary: '' }, demoUrl: '', previewUrl: '',
    media: img ? [{ url: thumb(img, 1024), alt: '', width: null, height: null }] : [], delivery: { linkHours: 48, maxDownloads: 5 } } as Product;
  return (
    <div className="studio-preview">
      <div className="row between" style={{ padding: '8px 12px' }}>
        <span className="row" style={{ gap: 8 }}>
          <Segmented label="Preview state" value={paid ? 'paid' : 'before'} onChange={v => setPaid(v === 'paid')} options={[{ value: 'before', label: 'Before payment' }, { value: 'paid', label: 'Paid' }]} />
          <Segmented label="Side" value={back ? 'back' : 'front'} onChange={v => setBack(v === 'back')} options={[{ value: 'front', label: 'Front' }, { value: 'back', label: 'Back' }]} />
        </span>
        <span className="faint" style={{ fontSize: 12 }}>Live preview · click the card to flip{paid ? ' · sample seal' : ''}</span>
      </div>
      <div className="preview-stage" ref={host} style={{ background: 'radial-gradient(80% 60% at 50% 40%, #241a1c, #0c0a0d)' }} />
      {target && createPortal(<div className="kpp"><PassCard product={product} currency="INR" amount={49900} free={false} email="buyer@example.com" orderId="KA-8H2KQ4ZP"
        phase={paid ? 'success' : 'idle'} method={paid ? { type: 'card', network: 'Visa', last4: '4242' } : null} flipped={back} onFlip={() => setBack(b => !b)} reduced={false}
        cardRef={cardRef} settings={doc.passCard} holder="Buyer Name"
        license={paid ? { code: SAMPLE_CODE, url: `${location.origin}/license/${SAMPLE_CODE}` } : null} /></div>, target)}
    </div>
  );
}

// Studio > Intro: which homepage intro runs. V1 (the KA crystal) is locked: it can always be chosen again, never edited.
function IntroVersions({ doc }: { doc: SiteDoc }){
  const current = introVersion((doc as SiteDoc & { intro?: { version?: string } }).intro?.version);
  const live = introVersion(savedIntro(useSite().saved)?.version);
  // switching versions keeps the bubbles and the green world the owner already set up
  const pick = (id: string) => updateSite(x => ({ ...x, intro: { ...(x.intro || {}), version: id } } as SiteDoc));
  return <div className="stack">
    <p className="field-hint" style={{ margin: 0 }}>The intro that plays when someone opens the homepage. Choose a version: its own settings open right under it, and the preview plays your choice straight away. Press <b>Publish changes</b> to put it on the live site. Version 1 is locked, so it is always there to return to.</p>
    <ul className="list intro-versions" role="radiogroup" aria-label="Homepage intro">
      {INTRO_VERSIONS.map(v => <li key={v.id} className={current === v.id ? 'is-current' : ''}>
        <label className="intro-version">
          <input type="radio" name="intro-version" checked={current === v.id} onChange={() => pick(v.id)} />
          <span className="grow"><b>{v.label} · {v.name}</b><span className="faint" style={{ display: 'block', fontSize: 12.5, marginTop: 2 }}>{v.description}</span></span>
          {v.locked && <Badge tone="info">Locked</Badge>}
          {live === v.id && <Badge tone="success">Live</Badge>}
          {current === v.id && live !== v.id && <Badge tone="warning">Not published yet</Badge>}
        </label>
        {current === v.id && v.id === 'v3' && <div className="intro-version-settings stack"><GreenWorldCard doc={doc} /><IntroBubblesCard doc={doc} /></div>}
        {current === v.id && v.id === 'v2' && <div className="intro-version-settings stack"><IntroBubblesCard doc={doc} /></div>}
      </li>)}
    </ul>
  </div>;
}

// Version 3's green world: after the logo is revealed, its green-and-black atmosphere slowly spreads from the logo over the
// whole homepage (the background behind every section, the accents, drifting smoke). Off unless the owner switches it on.
function GreenWorldCard({ doc }: { doc: SiteDoc }){
  const w: IntroWorld = { ...WORLD_DEFAULT, ...(doc.intro?.world || {}) };
  const savedOn = savedIntro(useSite().saved)?.world?.enabled === true;
  const set = (p: Partial<IntroWorld>) => updateSite(x => ({ ...x, intro: { ...(x.intro || { version: 'v3' }), world: { ...WORLD_DEFAULT, ...(x.intro?.world || {}), ...p } } } as SiteDoc));
  return <section className="card stack" aria-labelledby="world-h">
    <div className="row" style={{ justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <div className="grow" style={{ minWidth: 220 }}><h3 id="world-h" style={{ margin: 0 }}>Green world over the homepage</h3>
        <p className="field-hint" style={{ margin: '4px 0 0' }}>Once the logo is revealed, its green light spreads slowly outward and fills the whole homepage: the background behind every section turns green and black, the accents turn green, and soft smoke drifts behind the content. Turning it on or off shows in the preview at once; Publish changes puts it on the live site (open pages switch within a few seconds).</p></div>
      <span className="row" style={{ gap: 8 }}>
        <Switch checked={w.enabled} onChange={v => set({ enabled: v })} label={w.enabled ? 'Green: on' : 'Green: off'} />
        {w.enabled !== savedOn && <Badge tone="warning">Publish to apply</Badge>}
      </span>
    </div>
    <div className="stack" style={{ opacity: w.enabled ? 1 : 0.5 }}>
      <Field label={`How green: ${w.strength}%`} hint="Low keeps more of the original background showing through; high is a deep green-and-black world.">
        <input type="range" min={10} max={100} step={5} value={w.strength} disabled={!w.enabled} onChange={e => set({ strength: Number(e.target.value) })} /></Field>
      <Field label={`How slowly it spreads: ${w.spread} s`} hint="The time the green takes to grow from the logo to the edges of the screen.">
        <input type="range" min={2} max={30} step={1} value={w.spread} disabled={!w.enabled} onChange={e => set({ spread: Number(e.target.value) })} /></Field>
      <Switch checked={w.smoke} disabled={!w.enabled} onChange={v => set({ smoke: v })} label="Drifting green smoke behind the content" />
    </div>
  </section>;
}

// The skill bubbles that orbit the finished KA logo (Version 2): all on or off, which ones, their order and their words.
function IntroBubblesCard({ doc }: { doc: SiteDoc }){
  const saved = (doc as SiteDoc & { intro?: { version?: string; bubbles?: IntroBubbles } }).intro?.bubbles;
  const b: IntroBubbles = saved || { enabled: true, items: BUBBLE_TYPES.map(x => ({ type: x.type, label: x.label, on: true })) };
  const set = (next: IntroBubbles) => updateSite(x => ({ ...x, intro: { ...(x.intro || { version: 'v1' }), bubbles: next } } as SiteDoc));
  const edit = (i: number, p: Partial<IntroBubbles['items'][number]>) => set({ ...b, items: b.items.map((it, j) => j === i ? { ...it, ...p } : it) });
  const move = (i: number, d: number) => { const items = b.items.slice(), j = i + d; if (j < 0 || j >= items.length) return; [items[i], items[j]] = [items[j], items[i]]; set({ ...b, items }); };
  const shown = b.enabled ? b.items.filter(i => i.on).length : 0;
  return <section className="card stack" aria-labelledby="bubbles-h">
    <div className="row" style={{ justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <div><h3 id="bubbles-h" style={{ margin: 0 }}>Skill bubbles around the logo</h3>
        <p className="field-hint" style={{ margin: '4px 0 0' }}>The small round icons with their words that appear around the KA logo. {shown === 0 ? 'None will show.' : shown + ' will show.'} Press Publish changes to apply.</p></div>
      <Switch checked={b.enabled} onChange={v => set({ ...b, enabled: v })} label="Show the bubbles" />
    </div>
    <ul className="list bubble-list" aria-label="Skill bubbles" style={{ opacity: b.enabled ? 1 : 0.5 }}>
      {b.items.map((it, i) => <li key={it.type} className="row" style={{ gap: 8, alignItems: 'center' }}>
        <Switch checked={it.on} onChange={v => edit(i, { on: v })} label={<span className="sr-only">{'Show ' + it.label}</span>} />
        <input className="grow" value={it.label} maxLength={24} aria-label={'Words for the ' + it.type + ' bubble'} placeholder={BUBBLE_TYPES.find(x => x.type === it.type)?.label}
          onChange={e => edit(i, { label: e.target.value })} />
        <button type="button" className="icon-btn sm" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
        <button type="button" className="icon-btn sm" aria-label="Move down" disabled={i === b.items.length - 1} onClick={() => move(i, 1)}>↓</button>
      </li>)}
    </ul>
    <div className="row" style={{ gap: 8 }}>
      <button type="button" className="btn sm" onClick={() => set({ enabled: true, items: b.items.map(i => ({ ...i, on: true })) })}>Show all</button>
      <button type="button" className="btn sm" onClick={() => set({ enabled: true, items: BUBBLE_TYPES.map(x => ({ type: x.type, label: x.label, on: true })) })}>Reset to the original eight</button>
    </div>
  </section>;
}
