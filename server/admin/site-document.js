// Validation for the portfolio document the homepage renders (settings key 'site'). Ported from the
// old creator server with the same rules; uploads are now checked against our own media bucket
// (isOwnMediaUrl) instead of a local uploads folder. Bad input is refused, never silently dropped,
// so an edit can't quietly disappear.
import { HttpError } from '../core/http.js';
import { isOwnMediaUrl } from './catalog.js';

export const FONT_CHOICES = ['Fraunces', 'Manrope', 'Sora', 'Poppins', 'Playfair Display', 'Space Grotesk', 'system-ui'];
export const SOCIAL_ICONS = ['behance', 'instagram', 'x', 'linkedin', 'youtube', 'website', 'email'];
export const ANIM_PRESETS = ['fade', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 'scale-in', 'pop'];
export const ANIM_EASINGS = ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'bounce'];
export const ANIM_TRIGGERS = ['load', 'scroll'];
export const DRAGGABLE_IDS = ['assistant-launcher', 'site-notice', 'portfolio-title', 'portfolio-intro', 'contact-title', 'contact-intro'];
const TEXT_DRAGGABLE_IDS = ['portfolio-title', 'portfolio-intro', 'contact-title', 'contact-intro'];
export const LAYOUT_BREAKPOINTS = ['mobile', 'tablet', 'desktop'];
export const DETAIL_FIELDS = { creatorName: 80, tagline: 160, portfolioTitle: 100, portfolioIntro: 500, contactTitle: 100, contactIntro: 1000, openLabel: 60, closeLabel: 60, projectLabel: 60, contactButton: 60 };

const text = (v, max) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const bad = (msg) => new HttpError(400, msg);
// About numbers shown until the owner sets their own (Content > Site text)
export const STATS_DEFAULT = { enabled: true, items: [{ label: 'Projects', value: 150, suffix: '+' }, { label: 'Delivered', value: 120, suffix: '+' }, { label: 'Happy clients', value: 60, suffix: '+' }, { label: 'Years', value: 6, suffix: '+' }] };
const isImageUrl = (u) => isOwnMediaUrl(u) && /\.(png|jpe?g|webp|avif)$/i.test(u);
const isFontUrl = (u) => isOwnMediaUrl(u) && /\/fonts\/[A-Za-z0-9_-]+\.(woff2|woff|ttf|otf)$/i.test(u);
function httpUrl(u){ try { return ['https:', 'http:'].includes(new URL(u).protocol); } catch { return false; } }

// `current` is the stored document, `seed` the shipped one: an image without its own upload must be
// one of the site's exported originals (known widths), found in either.
export function validateSiteDocument(input, current, seed){
  if (!input || typeof input !== 'object') throw bad('Send the whole portfolio document.');
  if (!Array.isArray(input.folders) || input.folders.length > 30 || !Array.isArray(input.images) || input.images.length > 300) throw bad('Use up to 30 folders and 300 images.');
  const folders = input.folders.map(f => text(f, 70));
  if (folders.some(f => !f) || new Set(folders).size !== folders.length) throw bad('Folder names must be unique and not empty.');

  const details = {};
  for (const [key, max] of Object.entries(DETAIL_FIELDS)){
    details[key] = text(input.details?.[key], max);
    if (!details[key]) throw bad('Fill in every portfolio text field.');
  }
  const rawFonts = Array.isArray(input.details?.customFonts) ? input.details.customFonts : [];
  if (rawFonts.length > 20) throw bad('Use up to 20 custom fonts.');
  const customFonts = [];
  for (const f of rawFonts){
    if (!f || typeof f !== 'object') throw bad('Invalid custom font.');
    const family = text(f.family, 60);
    if (!family || !/^[A-Za-z0-9 _-]+$/.test(family)) throw bad('Font names may only use letters, numbers, spaces, - and _.');
    if (customFonts.some(x => x.family === family) || FONT_CHOICES.includes(family)) throw bad('Each custom font needs a unique name.');
    const url = text(f.url, 600);
    if (!isFontUrl(url)) throw bad('Upload this font before saving.');
    customFonts.push({ family, url });
  }
  details.customFonts = customFonts;
  const allowedFonts = [...FONT_CHOICES, ...customFonts.map(f => f.family)];
  details.headingFont = allowedFonts.includes(input.details?.headingFont) ? input.details.headingFont : 'Fraunces';
  details.bodyFont = allowedFonts.includes(input.details?.bodyFont) ? input.details.bodyFont : 'Manrope';
  const scale = Number(input.details?.textScale);
  details.textScale = Number.isFinite(scale) ? Math.min(1.2, Math.max(0.85, scale)) : 1;
  const blur = Number(input.details?.glassBlur);
  details.glassBlur = Number.isFinite(blur) ? Math.min(40, Math.max(0, blur)) : 18;
  const accent = text(input.details?.accentColor, 20);
  details.accentColor = /^#[0-9a-fA-F]{6}$/.test(accent) ? accent : '#FF9438';
  const favicon = text(input.details?.faviconUrl, 600);
  if (favicon && !isImageUrl(favicon)) throw bad('Upload the favicon image before saving.');
  details.faviconUrl = favicon;

  const elementStyles = {};
  if (input.elementStyles && typeof input.elementStyles === 'object'){
    for (const [id, style] of Object.entries(input.elementStyles)){
      if (!DRAGGABLE_IDS.includes(id)) throw bad('Unknown styled element: ' + id.slice(0, 40));
      if (!style || typeof style !== 'object') continue;
      const clean = {};
      if (style.font){ if (!allowedFonts.includes(style.font)) throw bad(`Unknown font for ${id}.`); clean.font = style.font; }
      if (style.color){ const c = text(style.color, 20); if (!/^#[0-9a-fA-F]{6}$/.test(c)) throw bad('Colours must be a 6-digit hex value.'); clean.color = c; }
      if (style.animation && typeof style.animation === 'object' && ANIM_PRESETS.includes(style.animation.preset)){
        const d = Number(style.animation.duration), dl = Number(style.animation.delay);
        clean.animation = {
          preset: style.animation.preset,
          duration: Number.isFinite(d) ? Math.min(3000, Math.max(100, Math.round(d))) : 600,
          delay: Number.isFinite(dl) ? Math.min(3000, Math.max(0, Math.round(dl))) : 0,
          easing: ANIM_EASINGS.includes(style.animation.easing) ? style.animation.easing : 'ease-out',
          trigger: ANIM_TRIGGERS.includes(style.animation.trigger) ? style.animation.trigger : 'scroll'
        };
      }
      if (Object.keys(clean).length) elementStyles[id] = clean;
    }
  }

  const socialLinks = [];
  if (Array.isArray(input.socialLinks)){
    if (input.socialLinks.length > 8) throw bad('Use up to 8 social links.');
    for (const l of input.socialLinks){
      if (!l || typeof l !== 'object') throw bad('Invalid social link.');
      const label = text(l.label, 60), url = text(l.url, 300), icon = SOCIAL_ICONS.includes(l.icon) ? l.icon : 'website';
      if (!label || !url) throw bad('Each social link needs a label and a link.');
      if (icon === 'email'){ if (!/^mailto:[^@\s]+@[^@\s]+\.[^@\s]+$/.test(url)) throw bad('Email links must start with mailto: and include a valid address.'); }
      else if (!httpUrl(url)) throw bad('Social links must start with https://, http:// or mailto:.');
      socialLinks.push({ label, url, icon });
    }
  }

  const logo = text(input.branding?.logoUrl, 600);
  if (logo && !isImageUrl(logo)) throw bad('Upload the logo image before saving.');
  const branding = { enabled: !!input.branding?.enabled, logoUrl: logo };
  if (branding.enabled && !branding.logoUrl) throw bad('Upload a logo image before turning it on.');

  // plain text only: the homepage sets it with textContent, never as HTML
  const notice = { enabled: !!input.notice?.enabled, text: text(input.notice?.text, 220), tone: input.notice?.tone === 'warning' ? 'warning' : 'info' };
  if (notice.enabled && !notice.text) throw bad('Add notice text before turning the banner on, or turn it off.');
  const visibility = { navGallery: input.visibility?.navGallery !== false, navAbout: input.visibility?.navAbout !== false, autoFullscreen: input.visibility?.autoFullscreen !== false };

  const layoutOverrides = {};
  for (const bp of LAYOUT_BREAKPOINTS){
    const src = input.layoutOverrides?.[bp], clean = {};
    if (src && typeof src === 'object'){
      for (const [id, pos] of Object.entries(src)){
        if (!DRAGGABLE_IDS.includes(id)) throw bad('Unknown layout element: ' + id.slice(0, 40));
        const bound = TEXT_DRAGGABLE_IDS.includes(id) ? 300 : 2000;
        const x = Number(pos?.x), y = Number(pos?.y), s = pos?.scale === undefined ? 1 : Number(pos.scale);
        if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > bound || Math.abs(y) > bound) throw bad('Layout position out of range.');
        if (!Number.isFinite(s) || s < 0.5 || s > 2.5) throw bad('Layout scale out of range.');
        clean[id] = { x, y, scale: s };
      }
    }
    layoutOverrides[bp] = clean;
  }

  const originals = new Map();
  for (const doc of [seed, current]) for (const i of (doc?.images || [])) if (!i.src && Array.isArray(i.widths) && i.widths.length) originals.set(i.slug, i);
  const images = [];
  for (const image of input.images){
    if (!image || typeof image !== 'object') throw bad('Invalid project.');
    const slug = text(image.slug, 100), title = text(image.title, 160), cat = text(image.cat, 70);
    if (!/^[a-zA-Z0-9_-]+$/.test(slug) || !title || !folders.includes(cat) || images.some(i => i.slug === slug)) throw bad('Each image needs a unique ID, a title and an existing folder.');
    const description = text(image.description, 4000), link = text(image.link, 2000);
    if (link && !httpUrl(link)) throw bad('Project links must start with https:// or http://.');
    if (image.technologies !== undefined && (!Array.isArray(image.technologies) || image.technologies.length > 20)) throw bad('Use up to 20 technology labels.');
    const technologies = (image.technologies || []).map(v => text(v, 60)).filter(Boolean);
    const common = { id: slug, slug, title, cat, description, technologies, link, downloadable: image.downloadable !== false };
    const w = Number(image.width), h = Number(image.height);
    const dims = Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0 && w <= 20000 && h <= 20000 ? { width: Math.round(w), height: Math.round(h) } : {};
    if (image.src){
      const src = text(image.src, 600);
      const exported = /^\/images\/([a-zA-Z0-9_-]+)-(480|768|1080|1600|2400|3840|full)\.webp$/.exec(src);
      if (!isImageUrl(src) && !(exported && originals.has(exported[1]))) throw bad('Upload this image before saving.');
      images.push({ ...common, ...dims, src, widths: [], full: 0 });
    } else {
      const original = originals.get(slug);
      if (!original) throw bad('Unknown original image: ' + slug);
      images.push({ ...original, ...common });
    }
  }
  const stacks = { loop: input.stacks?.loop !== false, covers: {} };
  if (input.stacks?.covers && typeof input.stacks.covers === 'object'){
    for (const [folder, slug] of Object.entries(input.stacks.covers)) if (folders.includes(folder) && images.some(i => i.slug === slug && i.cat === folder)) stacks.covers[folder] = slug;
  }
  // The checkout pass (Studio > Checkout pass): label, logo, fonts and where things sit on the card.
  const pc = input.passCard && typeof input.passCard === 'object' ? input.passCard : {};
  const pickOf = (v, list, fb) => list.includes(v) ? v : fb;
  const num = (v, lo, hi, fb) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : fb; };
  const passLogo = text(pc.logoUrl, 600);
  if (passLogo && !isImageUrl(passLogo)) throw bad('Upload the pass logo before saving.');
  const passCard = {
    label: text(pc.label, 24) || 'KA PASS',
    logoUrl: passLogo,
    logoSize: num(pc.logoSize, 16, 44, 24),
    showTag: pc.showTag !== false,
    tagText: text(pc.tagText, 30),
    titleFont: allowedFonts.includes(pc.titleFont) ? pc.titleFont : '',
    priceFont: allowedFonts.includes(pc.priceFont) ? pc.priceFont : '',
    textPosition: pickOf(pc.textPosition, ['bottom', 'center', 'top'], 'bottom'),
    pricePosition: pickOf(pc.pricePosition, ['right', 'left', 'below'], 'right'),
    stampText: text(pc.stampText, 12) || 'PAID',
    foil: pc.foil !== false,
    dim: num(pc.dim, 0, 90, 55),
  };
  // About > numbers (count up on the page): up to 6, each a label, a whole number and an optional suffix like "+".
  const st = input.stats && typeof input.stats === 'object' ? input.stats : null;
  const stats = st ? {
    enabled: st.enabled !== false,
    items: (Array.isArray(st.items) ? st.items : []).slice(0, 6).map(x => ({ label: text(x && x.label, 40), value: num(x && x.value, 0, 1e9, 0), suffix: text(x && x.suffix, 4) })).filter(x => x.label),
  } : structuredClone(STATS_DEFAULT);
  return { typeV2: true, details, folders, images, notice, visibility, stacks, layoutOverrides, branding, elementStyles, socialLinks, passCard, stats };
}
