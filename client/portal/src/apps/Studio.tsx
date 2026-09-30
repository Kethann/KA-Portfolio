// Studio: the site's look. Every change streams into a live preview of the real homepage (in desktop,
// tablet or phone frames) before anything is published. In "Arrange" mode, elements can be dragged
// and scaled right in the preview; positions are stored per screen size.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PassCard } from '../../../src/store/checkout/PassCard';
import type { Product } from '../../../src/store/api';
import storeCss from '../../../src/store/store.css?inline';
import checkoutCss from '../../../src/store/checkout/checkout.css?inline';
import type { AppProps } from './registry';
import { Badge, ErrorState, Field, Segmented, SkeletonRows, Switch, useToast } from '../ui';
import { Icon } from '../icons';
import { WinTools } from '../shell/Window';
import { Uploader, useSaveKey } from './common';
import { SiteSaveBar } from './Content';
import { loadSite, saveSite, thumb, updateSite, useSite, PASS_DRAFT_DEFAULTS } from './siteDoc';
import type { SiteDoc, PassDraft } from './siteDoc';

const FONTS = ['Fraunces', 'Manrope', 'Sora', 'Poppins', 'Playfair Display', 'Space Grotesk', 'system-ui'];
const ACCENTS = ['#FF9438', '#E0303E', '#F5C451', '#4FD08A', '#6AA8FF', '#B98CFF', '#FF6FAE', '#EDEBE8'];
const ELEMENTS: [string, string][] = [['portfolio-title', 'Portfolio heading'], ['portfolio-intro', 'Portfolio intro'], ['contact-title', 'Contact heading'], ['contact-intro', 'Contact intro'], ['site-notice', 'Notice banner'], ['assistant-launcher', 'Assistant button']];
const ICONS = ['behance', 'instagram', 'x', 'linkedin', 'youtube', 'website', 'email'];
const ANIMS = ['', 'fade', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 'scale-in', 'pop'];
const DEVICES = { desktop: { w: 1440, h: 900, label: 'Desktop' }, tablet: { w: 820, h: 1180, label: 'Tablet' }, mobile: { w: 390, h: 844, label: 'Phone' } } as const;
type Device = keyof typeof DEVICES;
type Section = 'identity' | 'type' | 'notice' | 'social' | 'elements' | 'arrange' | 'pass';

const SECTIONS: Section[] = ['identity', 'type', 'notice', 'social', 'elements', 'arrange', 'pass'];
export default function Studio({ active, route }: AppProps){
  const site = useSite();
  const toast = useToast();
  // #studio/pass (e.g. from a product's "Design the checkout pass" button) opens that section
  const [section, setSection] = useState<Section>(() => SECTIONS.includes(route as Section) ? route as Section : 'identity');
  useEffect(() => { if (SECTIONS.includes(route as Section)) setSection(route as Section); }, [route]);
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
          <div className="studio-nav" role="tablist" aria-label="Studio sections">
            {([['identity', 'Colour'], ['type', 'Type'], ['notice', 'Banner & nav'], ['social', 'Links'], ['elements', 'Elements'], ['arrange', 'Arrange'], ['pass', 'Checkout pass']] as [Section, string][]).map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={section === k} className={section === k ? 'on' : ''} onClick={() => setSection(k)}>{l}</button>
            ))}
          </div>
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
                <Field label="Headings"><select value={d.details.headingFont} onChange={e => det('headingFont', e.target.value)} style={{ fontFamily: fam(d.details.headingFont) }}>{fontList(d).map(f => <option key={f} value={f} style={{ fontFamily: fam(f) }}>{f}</option>)}</select></Field>
                <Field label="Body text"><select value={d.details.bodyFont} onChange={e => det('bodyFont', e.target.value)} style={{ fontFamily: fam(d.details.bodyFont) }}>{fontList(d).map(f => <option key={f} value={f} style={{ fontFamily: fam(f) }}>{f}</option>)}</select></Field>
              </div>
              <Field label={`Text size · ${Math.round((d.details.textScale ?? 1) * 100)}%`}><input type="range" min={0.85} max={1.2} step={0.01} value={d.details.textScale ?? 1} onChange={e => det('textScale', Number(e.target.value))} /></Field>
              <CustomFonts doc={d} />
            </>}

            {section === 'notice' && <>
              <Switch checked={d.notice.enabled} onChange={v => updateSite(x => ({ ...x, notice: { ...x.notice, enabled: v } }))} label="Show a banner at the top of the site" />
              <Field label="Banner text" hint={`${d.notice.text.length}/220 · plain text`}><textarea rows={2} maxLength={220} value={d.notice.text} onChange={e => updateSite(x => ({ ...x, notice: { ...x.notice, text: e.target.value } }))} /></Field>
              <Field label="Tone"><Segmented label="Tone" value={d.notice.tone} onChange={v => updateSite(x => ({ ...x, notice: { ...x.notice, tone: v } }))} options={[{ value: 'info', label: 'Info' }, { value: 'warning', label: 'Warning' }]} /></Field>
              <div className="stack"><div className="eyebrow">Navigation</div>
                <Switch checked={d.visibility.navGallery} onChange={v => updateSite(x => ({ ...x, visibility: { ...x.visibility, navGallery: v } }))} label="Show the gallery in the nav" />
                <Switch checked={d.visibility.navAbout} onChange={v => updateSite(x => ({ ...x, visibility: { ...x.visibility, navAbout: v } }))} label="Show About in the nav" />
              </div>
              <div className="stack"><div className="eyebrow">Full screen</div>
                <Switch checked={d.visibility.autoFullscreen !== false} onChange={v => updateSite(x => ({ ...x, visibility: { ...x.visibility, autoFullscreen: v } }))} label="Go full screen on a visitor’s first tap or click" />
                <p className="field-hint">Browsers only allow full screen after the visitor interacts, so it starts on their first tap, click or key press. If they leave full screen it isn’t forced again during that visit. iPhone Safari never allows it: there the ☰ menu offers Add to Home Screen instead.</p>
              </div>
            </>}

            {section === 'social' && <Social doc={d} />}

            {section === 'elements' && <Elements doc={d} selected={selected} setSelected={setSelected} />}

            {section === 'pass' && <PassSettingsForm doc={d} />}

            {section === 'arrange' && <>
              <p className="muted">Drag elements in the preview to move them; drag the orange dot to resize. Positions are saved separately for desktop, tablet and phone.</p>
              <Field label="Screen size"><Segmented label="Screen size" value={device} onChange={setDevice} options={Object.entries(DEVICES).map(([k, v]) => ({ value: k as Device, label: v.label }))} /></Field>
              <ul className="list">{ELEMENTS.map(([id, label]) => {
                const pos = d.layoutOverrides[device]?.[id];
                return <li key={id}><span className="grow">{label}</span>{pos ? <span className="faint num" style={{ fontSize: 12 }}>{Math.round(pos.x)}, {Math.round(pos.y)} · {Math.round(pos.scale * 100)}%</span> : <span className="faint" style={{ fontSize: 12 }}>default</span>}
                  {pos && <button type="button" className="btn sm ghost" onClick={() => updateSite(x => { const bp = { ...(x.layoutOverrides[device] || {}) }; delete bp[id]; return { ...x, layoutOverrides: { ...x.layoutOverrides, [device]: bp } }; })}>Reset</button>}</li>;
              })}</ul>
            </>}
          </div>
        </div>
        {section === 'pass' ? <PassPreview doc={d} /> : <Preview doc={d} device={device} setDevice={setDevice} arrange={section === 'arrange'} onSelect={id => { setSelected(id); }} />}
      </div>
    </div>
  );
}

const fam = (f: string) => f === 'system-ui' ? 'system-ui' : `'${f}', system-ui`;
const fontList = (d: SiteDoc) => [...FONTS, ...d.details.customFonts.map(f => f.family)];

function CustomFonts({ doc }: { doc: SiteDoc }){
  const [family, setFamily] = useState('');
  const toast = useToast();
  // show uploaded fonts in their own face here in the portal
  useEffect(() => {
    for (const f of doc.details.customFonts){
      if ([...document.fonts].some(x => x.family.replace(/"/g, '') === f.family)) continue;
      const face = new FontFace(f.family, `url(${JSON.stringify(f.url)})`);
      face.load().then(x => document.fonts.add(x)).catch(() => {});
    }
  }, [doc.details.customFonts]);
  const valid = /^[A-Za-z0-9 _-]{1,60}$/.test(family.trim()) && !fontList(doc).includes(family.trim());
  return (
    <section className="stack"><div className="eyebrow">Your fonts</div>
      {doc.details.customFonts.length ? <ul className="list">{doc.details.customFonts.map(f => (
        <li key={f.family}><span className="grow" style={{ fontFamily: `'${f.family}', system-ui`, fontSize: 18 }}>{f.family} · Aa Bb 123</span>
          <button type="button" className="icon-btn sm" aria-label={`Remove ${f.family}`} onClick={() => updateSite(x => ({ ...x, details: { ...x.details, customFonts: x.details.customFonts.filter(c => c.family !== f.family),
            headingFont: x.details.headingFont === f.family ? 'Fraunces' : x.details.headingFont, bodyFont: x.details.bodyFont === f.family ? 'Manrope' : x.details.bodyFont } }))}><Icon name="trash" size={13} /></button></li>
      ))}</ul> : <p className="faint">No custom fonts yet.</p>}
      <Field label="Font name" hint="Letters, numbers, spaces, - and _. Upload the file after naming it."><input value={family} onChange={e => setFamily(e.target.value)} maxLength={60} placeholder="e.g. Kethan Display" /></Field>
      {valid ? <Uploader kind="font" accept=".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf" label={`Upload “${family.trim()}”`} onUploaded={u => {
        updateSite(x => ({ ...x, details: { ...x.details, customFonts: [...x.details.customFonts, { family: family.trim(), url: u.publicUrl! }] } }));
        setFamily(''); toast.show('Font added. Pick it above, then publish.', { tone: 'success' });
      }}>WOFF2 is smallest · up to 6 MB · make sure your font license allows web use</Uploader> : family && <p className="field-error">Use a new name with letters, numbers, spaces, - or _.</p>}
    </section>
  );
}

const linkOk = (l: { url: string; icon: string }) => l.icon === 'email' ? /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(l.url) : /^https?:\/\/[^\s/]+\.[^\s]+/i.test(l.url);
function Social({ doc }: { doc: SiteDoc }){
  const links = doc.socialLinks;
  const set = (next: SiteDoc['socialLinks']) => updateSite(x => ({ ...x, socialLinks: next }));
  return (
    <div className="stack">
      <p className="muted">Shown in the footer and contact section, in this order.</p>
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
      <div className="form-grid">
        <Field label="Font"><select value={st.font || ''} onChange={e => set({ font: e.target.value })}><option value="">Site default</option>{fontList(doc).map(f => <option key={f}>{f}</option>)}</select></Field>
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
  const send = (msg: unknown) => frame.current?.contentWindow?.postMessage(msg, location.origin);
  const selectRef = useRef(onSelect); selectRef.current = onSelect;
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.source !== frame.current?.contentWindow || !e.data || typeof e.data !== 'object') return;
      if (e.data.type === 'ka-preview-ready') setReady(true);
      else if (e.data.type === 'ka-preview-selected' && typeof e.data.id === 'string') selectRef.current(e.data.id);
      else if (e.data.type === 'ka-preview-moved' && typeof e.data.id === 'string'){
        const { id, breakpoint, x, y, scale: sc } = e.data;
        if (!['mobile', 'tablet', 'desktop'].includes(breakpoint) || ![x, y, sc].every(Number.isFinite)) return;
        updateSite(dd => ({ ...dd, layoutOverrides: { ...dd.layoutOverrides, [breakpoint]: { ...(dd.layoutOverrides[breakpoint] || {}), [id]: { x: Math.round(x), y: Math.round(y), scale: Math.round(sc * 100) / 100 } } } }));
      }
    };
    addEventListener('message', on);
    return () => removeEventListener('message', on);
  }, []);
  useEffect(() => setReady(false), [device]);   // a new frame must announce itself again
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
          <iframe key={`${device}-${nonce}`} ref={frame} src="/?preview=1" title="Live preview of the homepage" style={{ width: dev.w, height: dev.h, transform: `scale(${scale})` }} />
        </div>
      </div>
    </div>
  );
}

// ---- Checkout pass: the ticket buyers see at checkout -------------------------------------------
function PassSettingsForm({ doc }: { doc: SiteDoc }){
  const p = doc.passCard;
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
      <Field label="Title font"><select value={p.titleFont} onChange={e => set({ titleFont: e.target.value })}><option value="">Site heading font</option>{fontList(doc).map(f => <option key={f} value={f}>{f}</option>)}</select></Field>
      <Field label="Price font"><select value={p.priceFont} onChange={e => set({ priceFont: e.target.value })}><option value="">Monospace (default)</option>{fontList(doc).map(f => <option key={f} value={f}>{f}</option>)}</select></Field>
    </div>
    <Field label="Title and price sit at the"><Segmented label="Text position" value={p.textPosition} onChange={v => set({ textPosition: v })} options={[{ value: 'top', label: 'Top' }, { value: 'center', label: 'Middle' }, { value: 'bottom', label: 'Bottom' }]} /></Field>
    <Field label="Price goes"><Segmented label="Price position" value={p.pricePosition} onChange={v => set({ pricePosition: v })} options={[{ value: 'right', label: 'Right' }, { value: 'left', label: 'Left' }, { value: 'below', label: 'Below the title' }]} /></Field>
    <div className="form-grid">
      <Field label="Stamp after payment" hint={`${p.stampText.length}/12`}><input value={p.stampText} maxLength={12} onChange={e => set({ stampText: e.target.value })} placeholder="PAID" /></Field>
      <Field label={`Darken the artwork · ${p.dim}%`} hint="More keeps text readable on bright art"><input type="range" min={0} max={90} value={p.dim} onChange={e => set({ dim: Number(e.target.value) })} /></Field>
    </div>
    <Switch checked={p.foil} onChange={v => set({ foil: v })} label="Holographic shimmer that follows the tilt" />
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
        <Segmented label="Preview state" value={paid ? 'paid' : 'before'} onChange={v => setPaid(v === 'paid')} options={[{ value: 'before', label: 'Before payment' }, { value: 'paid', label: 'Paid' }]} />
        <span className="faint" style={{ fontSize: 12 }}>Live preview · move the pointer over the card</span>
      </div>
      <div className="preview-stage" ref={host} style={{ background: 'radial-gradient(80% 60% at 50% 40%, #241a1c, #0c0a0d)' }} />
      {target && createPortal(<div className="kpp"><PassCard product={product} currency="INR" amount={49900} free={false} email="buyer@example.com" orderId="KA-8H2KQ4ZP"
        phase={paid ? 'success' : 'idle'} method={paid ? { type: 'card', network: 'Visa', last4: '4242' } : null} flipped={false} onFlip={() => {}} reduced={false}
        cardRef={cardRef} settings={doc.passCard} /></div>, target)}
    </div>
  );
}
