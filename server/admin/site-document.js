// Validation for the portfolio document the homepage renders (settings key 'site'). Ported from the
// old creator server with the same rules; uploads are now checked against our own media bucket
// (isOwnMediaUrl) instead of a local uploads folder. Bad input is refused, never silently dropped,
// so an edit can't quietly disappear.
import { HttpError } from '../core/http.js';
import { isOwnMediaUrl } from './catalog.js';
import { SKILL_LOGOS } from '../../shared/skill-logos.js';
import { ABOUT_DEFAULT, ABOUT_LIMITS } from '../../shared/about-default.js';

import { FONT_NAMES } from '../../shared/fonts.js';
import { introVersion } from '../../shared/intros.js';
import { SOUND_EVENT_IDS, SOUND_CATEGORIES, SOUND_LIBRARY, SOUND_DEFAULTS } from '../../shared/sounds.js';

export const FONT_CHOICES = FONT_NAMES;   // the shared library (studio, portal, homepage) + system-ui
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
// About > Skills: a resume-style board, one card per category. Each skill shows a logo tile (a short code on
// its colour), a 0-5 level (0 hides the meter) and a one-line note. The homepage keeps an identical copy
// (DEFAULT_SKILLS in index.html) for its first paint, before /api/portfolio answers.
export const SKILL_ICONS = ['design', 'arts', 'motion', 'video', 'ai', 'languages', 'frontend', 'backend', 'database', 'apis', 'tools', 'star'];
const sk = (name, code, color, level, note) => ({ name, code, color, level, note, logo: '', logoUrl: '' });
export const SKILLS_DEFAULT = {
  enabled: true, title: 'Skills', intro: 'Design, motion, video and code: the tools and crafts behind every frame and every build',
  categories: [
    { name: 'Design', icon: 'design', items: [
      sk('Photoshop', 'Ps', '#31A8FF', 5, 'Compositing and retouching every key-art layer'),
      sk('Illustrator', 'Ai', '#FF9A00', 4, 'Vector typography and title treatments'),
      sk('InDesign', 'Id', '#FF3366', 3, 'Press kits and print-ready layouts'),
      sk('Blender', 'Bl', '#E87D0D', 3, '3D modelling, lighting and renders'),
      sk('Figma', 'Fg', '#A259FF', 4, 'Campaign layouts and social deliverable systems') ] },
    { name: 'Motion design', icon: 'motion', items: [
      sk('After Effects', 'Ae', '#9999FF', 4, 'Motion posters, title animation and compositing'),
      sk('Motion posters', 'Mp', '#C792FF', 4, 'Key art brought to life for launches'),
      sk('Kinetic typography', 'Kt', '#7FD4FF', 4, 'Titles, credits and lyric sequences'),
      sk('Lottie & web motion', 'Lt', '#00DDB3', 3, 'Lightweight animation for sites and apps') ] },
    { name: 'Video', icon: 'video', items: [
      sk('Premiere Pro', 'Pr', '#EA77FF', 4, 'Teasers, promos and social cut-downs'),
      sk('Adobe Media Encoder', 'Me', '#8F8FFF', 4, 'Batch exports for every platform and format'),
      sk('Teaser & promo edits', 'Te', '#FF7A59', 4, 'Pacing, music and story in seconds'),
      sk('Social cut-downs', 'Sc', '#FFB347', 4, 'Reels, shorts and stories from one master') ] },
    { name: 'AI & generative', icon: 'ai', items: [
      sk('Adobe Firefly', 'Ff', '#FF4F3F', 4, 'Concept frames, textures and extensions'),
      sk('Generative Fill', 'Gf', '#31A8FF', 4, 'Extending and repairing plates inside Photoshop'),
      sk('AI-assisted upscaling', 'Up', '#FFD166', 3, 'Print-size masters from small sources') ] },
    { name: 'AI tools', icon: 'ai', items: [
      sk('Claude', 'Cl', '#D97757', 4, 'Writing, research and reasoning'), sk('Claude Code', 'CC', '#D97757', 4, 'Agentic coding in the terminal and editor'),
      sk('Codex', 'Cx', '#FFFFFF', 3, 'OpenAI coding agent'), sk('Antigravity', 'Ag', '#4285F4', 3, 'Agent-first development platform'),
      sk('GitHub Copilot', 'Co', '#FFFFFF', 3, 'AI pair programming in the editor') ] },
    { name: 'Arts', icon: 'arts', items: [
      sk('Movie posters', 'Po', '#FF9438', 5, 'Theatrical key art from first look to release'),
      sk('Typography', 'Ty', '#E8AA82', 5, 'Custom title logos and lettering'),
      sk('Photo manipulation', 'Pm', '#FF6B4A', 5, 'Blending stars, sets and effects into one frame'),
      sk('Digital painting', 'Dp', '#C9864F', 4, 'Painted skies, light and texture passes'),
      sk('Campaign design', 'Cd', '#FFD9B8', 4, 'One look across every format') ] },
    { name: 'Languages', icon: 'languages', items: [
      sk('JavaScript', 'JS', '#F7DF1E', 4, ''), sk('TypeScript', 'TS', '#3178C6', 4, ''), sk('Python', 'Py', '#3776AB', 3, ''),
      sk('HTML', 'HT', '#E34F26', 4, ''), sk('CSS', 'CSS', '#1572B6', 4, ''), sk('SQL', 'SQL', '#CC8A3B', 3, '') ] },
    { name: 'Frontend', icon: 'frontend', items: [
      sk('React', 'Re', '#61DAFB', 4, 'Components, hooks and state'), sk('Three.js', '3D', '#FFFFFF', 4, 'WebGL scenes and shaders'),
      sk('GSAP', 'Gs', '#88CE02', 4, 'Timeline animation'), sk('Vite', 'Vi', '#646CFF', 4, 'Builds and dev tooling'),
      sk('Tailwind CSS', 'Tw', '#38BDF8', 3, 'Utility-first styling'), sk('Streamlit', 'St', '#FF4B4B', 3, 'Python data apps and dashboards') ] },
    { name: 'Backend', icon: 'backend', items: [
      sk('Node.js', 'No', '#5FA04E', 4, 'APIs, jobs and servers'), sk('Cloudflare Workers', 'Cf', '#F38020', 3, 'Edge functions and R2 storage'),
      sk('Vercel', 'Vc', '#EDEBE8', 3, 'Serverless deploys'),
      sk('Render', 'Rn', '#FFFFFF', 3, 'Web services, workers and deploys'), sk('Netlify', 'Nf', '#00C7B7', 3, 'Static sites, previews and functions') ] },
    { name: 'Database', icon: 'database', items: [
      sk('PostgreSQL', 'Pg', '#4169E1', 3, ''), sk('SQLite', 'Sq', '#0F80CC', 3, ''), sk('Cloudflare D1', 'D1', '#F38020', 3, ''), sk('Cloudflare R2', 'R2', '#F38020', 3, 'Object storage for images and downloads'),
      sk('Supabase', 'Sb', '#3ECF8E', 3, ''), sk('Firebase', 'Fb', '#FFCA28', 3, '') ] },
    { name: 'APIs', icon: 'apis', items: [
      sk('REST APIs', 'API', '#8B8BFF', 4, 'Designing and consuming JSON APIs'), sk('Razorpay', 'Rp', '#3395FF', 4, 'Payments, webhooks and refunds'),
      sk('AI APIs', 'AI', '#D97757', 4, 'Gemini and Claude assistants'), sk('Webhooks', 'Wh', '#C73A63', 3, 'Signed event delivery'),
      sk('Email (SMTP)', '@', '#9AA3AF', 3, 'Receipts, alerts and auto-replies'), sk('ipstack', 'IP', '#38BDF8', 3, 'IP geolocation for visitor insights') ] },
    { name: 'DevOps & tools', icon: 'tools', items: [
      sk('Docker', 'Dk', '#2496ED', 3, 'Containers, images and compose setups'), sk('Kubernetes', 'K8', '#326CE5', 2, 'Deployments, services and scaling'),
      sk('CI/CD pipelines', 'CI', '#22C55E', 3, 'Automated build, test and deploy'), sk('Linux', 'Lx', '#FCC624', 3, 'Shell, servers and administration'),
      sk('Networking', 'Nw', '#38BDF8', 3, 'TCP/IP, DNS, HTTP and routing'), sk('Git', 'Gt', '#F05032', 4, 'Version control, branching and merges'),
      sk('GitHub', 'GH', '#E6EDF3', 4, 'Repositories, pull requests and Actions'),
      sk('Cloudflared', 'Cf', '#F38020', 3, 'Secure tunnels from local servers to the web') ] },
    { name: 'Robotics', icon: 'tools', items: [
      sk('ROS', 'ROS', '#8FA8CC', 3, 'Robot Operating System nodes, topics and tooling'),
      sk('RViz', 'RV', '#5FB3E4', 3, 'Visualising robot models, sensors and maps in 3D'),
      sk('Model training', 'Mt', '#C792FF', 3, 'Training robot perception and control models'), sk('Inference', 'If', '#7FD4FF', 3, 'Running trained models on the robot in real time'),
      sk('Validation', 'Va', '#4FD08A', 3, 'Testing models against held-out data and real runs'), sk('Datasets', 'Ds', '#F5C451', 3, 'Collecting, labelling and curating training data'),
      sk('Vision-based navigation', 'Vn', '#FFB347', 3, 'Camera-driven models that guide a robot'),
      sk('Sensor integrations', 'Se', '#7FD4FF', 3, 'Wiring, reading and calibrating robot sensors'),
      sk('Arduino Nano', 'An', '#00A3AD', 3, 'Compact microcontroller builds and firmware') ] },
    { name: 'Data & ML', icon: 'ai', items: [
      sk('Power BI', 'BI', '#F2C811', 3, 'Dashboards and reports from live data'),
      sk('NumPy', 'Np', '#4DABCF', 3, 'Arrays and numerical computing'), sk('pandas', 'Pd', '#E70488', 3, 'Tables, cleaning and analysis'),
      sk('Matplotlib', 'Mp', '#4C9BE8', 3, 'Charts and plots'), sk('OpenCV', 'Cv', '#5C3EE8', 3, 'Computer vision and image processing'),
      sk('scikit-learn', 'Sk', '#F7931E', 3, 'Classic machine learning'), sk('TensorFlow', 'Tf', '#FF6F00', 3, 'Neural networks and training'),
      sk('PyTorch', 'Pt', '#EE4C2C', 3, 'Deep learning models'), sk('Flask', 'Fl', '#FFFFFF', 3, 'Lightweight Python web APIs') ] }
  ]
};
export const SKILL_LIMITS = { categories: 14, items: 24 };

export { ABOUT_DEFAULT, ABOUT_LIMITS };
const YT_ID = /^[A-Za-z0-9_-]{11}$/;
// a YouTube video id from an id, a watch link, a youtu.be link or a shorts/embed link; '' when it is none of those
export function youtubeId(v){
  const t = text(v, 300);
  if (YT_ID.test(t)) return t;
  try {
    const u = new URL(t);
    if (/(^|\.)youtu\.be$/.test(u.hostname)){ const id = u.pathname.slice(1, 12); return YT_ID.test(id) ? id : ''; }
    if (/(^|\.)youtube\.com$/.test(u.hostname)){
      const q = u.searchParams.get('v'); if (q && YT_ID.test(q)) return q;
      const m = /^\/(shorts|embed|live)\/([A-Za-z0-9_-]{11})/.exec(u.pathname); return m ? m[2] : '';
    }
  } catch { /* not a link */ }
  return '';
}
const isImageUrl = (u) => isOwnMediaUrl(u) && /\.(png|jpe?g|webp|avif)$/i.test(u);
const isFontUrl = (u) => isOwnMediaUrl(u) && /\/fonts\/[A-Za-z0-9_-]+\.(woff2|woff|ttf|otf)$/i.test(u);
function httpUrl(u){ try { return ['https:', 'http:'].includes(new URL(u).protocol); } catch { return false; } }

// `current` is the stored document, `seed` the shipped one: an image without its own upload must be
// one of the site's exported originals (known widths), found in either.
/** skills added to sites that already have their own list (once each, by name; see handlers/public.js) */
export const SKILLS_ADDITIONS = { id: 'skills-2026-10i',
  categories: [
    { name: 'Design', icon: 'design', items: SKILLS_DEFAULT.categories.find(c => c.name === 'Design').items.filter(i => i.name === 'Blender') },
    SKILLS_DEFAULT.categories.find(c => c.name === 'DevOps & tools'),
    { name: 'Backend', icon: 'backend', items: SKILLS_DEFAULT.categories.find(c => c.name === 'Backend').items.filter(i => ['Render', 'Netlify'].includes(i.name)) },
    SKILLS_DEFAULT.categories.find(c => c.name === 'AI tools'),
    { name: 'APIs', icon: 'apis', items: SKILLS_DEFAULT.categories.find(c => c.name === 'APIs').items.filter(i => i.name === 'ipstack') },
    // on an existing site the libraries get their own category (they are added only where none of them exists yet)
    { name: 'Python libraries', icon: 'languages', items: SKILLS_DEFAULT.categories.find(c => c.name === 'Data & ML').items.filter(i => ['NumPy', 'pandas', 'Matplotlib', 'OpenCV', 'scikit-learn', 'TensorFlow', 'PyTorch', 'Flask'].includes(i.name)) },
    { name: 'Frontend', icon: 'frontend', items: SKILLS_DEFAULT.categories.find(c => c.name === 'Frontend').items.filter(i => i.name === 'Streamlit') },
    { name: 'Database', icon: 'database', items: SKILLS_DEFAULT.categories.find(c => c.name === 'Database').items.filter(i => i.name === 'Cloudflare R2') },
    { ...SKILLS_DEFAULT.categories.find(c => c.name === 'Robotics'), items: SKILLS_DEFAULT.categories.find(c => c.name === 'Robotics').items.filter(i => ['ROS', 'RViz', 'Model training', 'Inference', 'Validation', 'Datasets', 'Vision-based navigation'].includes(i.name)) },
  ],
  // skills that belong in another category (moved, keeping the owner's edits), and names that lead their category
  moves: [{ names: ['Render', 'Netlify'], to: 'Backend' }],
  first: [{ category: 'Robotics', names: ['ROS', 'RViz', 'Model training', 'Inference', 'Validation', 'Datasets', 'Vision-based navigation'] }],
};

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
  const visibility = { navGallery: input.visibility?.navGallery !== false, navAbout: input.visibility?.navAbout !== false, autoFullscreen: input.visibility?.autoFullscreen === true, downloadFormat: input.visibility?.downloadFormat === 'jpeg' ? 'jpeg' : 'png' };

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
    // how the picture sits on its stack card: the point that stays in view (0-100 each way) and a zoom; only stored when it differs from centred
    const clamp = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
    const fx = clamp(image.focusX, 0, 100, 50), fy = clamp(image.focusY, 0, 100, 50), zm = clamp(image.zoom, 1, 3, 1);
    const framing = fx !== 50 || fy !== 50 || zm !== 1 ? { focusX: Math.round(fx * 10) / 10, focusY: Math.round(fy * 10) / 10, zoom: Math.round(zm * 100) / 100 } : {};
    const archived = image.archived === true;   // archived = taken off the site but kept here to republish; it is hidden too
    const common = { id: slug, slug, title, cat, description, technologies, link, downloadable: image.downloadable !== false, hidden: image.hidden === true || archived, ...(archived ? { archived: true } : {}), ...framing };
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
      const { archived: _a, focusX: _x, focusY: _y, zoom: _z, ...plain } = original;   // the stored flags must not leak back once they are switched off
      images.push({ ...plain, ...common });
    }
  }
  // loop: the default for every stack; loops: a stack's own choice (true or false), kept only for folders that exist
  const stacks = { loop: input.stacks?.loop !== false, loops: {}, covers: {}, featured: [] };
  // featured: the stacks shown in About > Featured Work, in this order; the Portfolio below shows all the others (no stack twice)
  if (Array.isArray(input.stacks?.featured)) for (const f of input.stacks.featured) if (typeof f === 'string' && folders.includes(f) && !stacks.featured.includes(f) && stacks.featured.length < 8) stacks.featured.push(f);
  if (input.stacks?.loops && typeof input.stacks.loops === 'object'){
    for (const [folder, v] of Object.entries(input.stacks.loops)) if (folders.includes(folder) && typeof v === 'boolean') stacks.loops[folder] = v;
  }
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
    signatureText: text(pc.signatureText, 40) || 'Kethan Artzz',
    signatureFont: allowedFonts.includes(pc.signatureFont) ? pc.signatureFont : '',
    signatureSize: num(pc.signatureSize, 16, 60, 30),
    signatureTone: pickOf(pc.signatureTone, ['gold', 'white', 'ink', 'accent'], 'gold'),
    signatureAngle: num(pc.signatureAngle, -12, 12, -4),
    showSeal: pc.showSeal !== false,
    backEyebrow: text(pc.backEyebrow, 24) || 'License',
    licensedLabel: text(pc.licensedLabel, 24) || 'Licensed to',
    signLabel: text(pc.signLabel, 32) || 'Authorised signature',
    backNote: text(pc.backNote, 100),
    showTerms: pc.showTerms !== false,
  };
  // About > numbers (count up on the page): up to 6, each a label, a whole number and an optional suffix like "+".
  const st = input.stats && typeof input.stats === 'object' ? input.stats : null;
  const stats = st ? {
    enabled: st.enabled !== false,
    items: (Array.isArray(st.items) ? st.items : []).slice(0, 6).map(x => ({ label: text(x && x.label, 40), value: num(x && x.value, 0, 1e9, 0), suffix: text(x && x.suffix, 4), auto: !(x && x.auto === false) })).filter(x => x.label),
  } : structuredClone(STATS_DEFAULT);
  const skills = validateSkills(input.skills);
  const about = validateAbout(input.about);
  const sounds = validateSounds(input.sounds);
  const intro = { version: introVersion(input.intro?.version) };   // which homepage intro runs (Studio > Intro)
  // a save from the portal makes the owner's skill list the authority: the one-time additions (handlers/public.js) never apply after it
  const skillsAdded = SKILLS_ADDITIONS.id;
  return { typeV2: true, details, folders, images, notice, visibility, stacks, layoutOverrides, branding, elementStyles, socialLinks, passCard, stats, skills, about, sounds, intro, skillsAdded };
}

// About > story. Missing (a document saved before the story was editable) means the defaults; bad values are refused.
// UI sounds (Creator Portal > Sounds): on by default for visitors or not, master and category volumes, and per event
// on/off, volume and the file (a built-in library sound by name, or an audio file uploaded to our own media bucket).
const ownMedia = (u) => { try { return isOwnMediaUrl(u); } catch { return false; } };   // a URL that can't be checked is refused
export function validateSounds(input){
  const s = input && typeof input === 'object' ? input : {};
  const vol = (v, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(1, Math.max(0, Math.round(n * 100) / 100)) : d; };
  const out = { defaultOn: typeof s.defaultOn === 'boolean' ? s.defaultOn : SOUND_DEFAULTS.defaultOn, master: vol(s.master, SOUND_DEFAULTS.master), categories: {}, events: {} };
  const cats = s.categories && typeof s.categories === 'object' ? s.categories : {};
  for (const c of SOUND_CATEGORIES) if (cats[c.id] !== undefined) out.categories[c.id] = vol(cats[c.id], c.volume);
  const evs = s.events && typeof s.events === 'object' ? s.events : {};
  for (const id of SOUND_EVENT_IDS){
    const e = evs[id]; if (!e || typeof e !== 'object') continue;
    const clean = {};
    if (typeof e.on === 'boolean') clean.on = e.on;
    if (e.volume !== undefined) clean.volume = vol(e.volume, 0.3);
    if (typeof e.file === 'string' && e.file){
      if (SOUND_LIBRARY.includes(e.file)) clean.file = e.file;
      else if (/\.(mp3|webm|ogg|wav|m4a)$/i.test(e.file) && ownMedia(e.file)) clean.file = e.file;
      else throw bad(`The sound for “${id}” must be one from the library or a file you uploaded.`);
    }
    if (Object.keys(clean).length) out.events[id] = clean;
  }
  return out;
}

export function validateAbout(input){
  const D = ABOUT_DEFAULT;
  if (!input || typeof input !== 'object') return structuredClone(D);
  const bio = text(input.bio, 1600) || D.bio;
  const j = input.journey && typeof input.journey === 'object' ? input.journey : {};
  const since = Number(j.since);
  const rawSteps = Array.isArray(j.steps) ? j.steps : [];
  if (rawSteps.length > ABOUT_LIMITS.steps) throw bad(`Use up to ${ABOUT_LIMITS.steps} journey steps.`);
  const steps = [];
  for (const x of rawSteps){
    if (!x || typeof x !== 'object') throw bad('Invalid journey step.');
    const title = text(x.title, 40);
    if (!title) continue;                                       // an empty row is an unfinished edit, not an error
    steps.push({ title, text: text(x.text, 90) });
  }
  const journey = { enabled: j.enabled !== false, since: Number.isFinite(since) ? Math.min(2100, Math.max(1990, Math.round(since))) : D.journey.since, steps };
  const r = input.reel && typeof input.reel === 'object' ? input.reel : {};
  const rawVideos = Array.isArray(r.videos) ? r.videos : [];
  if (rawVideos.length > ABOUT_LIMITS.videos) throw bad(`Use up to ${ABOUT_LIMITS.videos} videos.`);
  const videos = [], seen = new Set();
  for (const v of rawVideos){
    if (!v || typeof v !== 'object') throw bad('Invalid video.');
    const raw = text(v.id, 300);
    if (!raw && !text(v.title, 120)) continue;                  // an empty row
    const id = youtubeId(raw);
    if (!id) throw bad('Paste a YouTube link or the 11-character video ID for each video.');
    if (seen.has(id)) continue;
    seen.add(id);
    const len = Number(v.len);
    videos.push({ id, len: Number.isFinite(len) ? Math.min(86400, Math.max(0, Math.round(len))) : 0, title: text(v.title, 120) });
  }
  const enabled = r.enabled !== false;
  if (enabled && !videos.length) throw bad('Add at least one video, or turn the clips section off.');
  const channelUrl = text(r.channelUrl, 300) || D.reel.channelUrl;
  if (!/^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(channelUrl)) throw bad('The channel link must be a youtube.com link starting with https://.');
  let clipMin = Math.round(Number(r.clipMin)), clipMax = Math.round(Number(r.clipMax));
  if (!Number.isFinite(clipMin)) clipMin = D.reel.clipMin;
  if (!Number.isFinite(clipMax)) clipMax = D.reel.clipMax;
  clipMin = Math.min(30, Math.max(2, clipMin)); clipMax = Math.min(30, Math.max(clipMin, clipMax));
  const reel = { enabled, title: text(r.title, 60) || D.reel.title, intro: text(r.intro, 200), panelLabel: text(r.panelLabel, 30) || D.reel.panelLabel,
    panelText: text(r.panelText, 220), buttonLabel: text(r.buttonLabel, 40) || D.reel.buttonLabel, channelLabel: text(r.channelLabel, 40) || D.reel.channelLabel,
    channelUrl, clipMin, clipMax, videos };
  return { bio, journey, reel };
}

// About > Skills. Missing (a document saved before skills existed) means the defaults; anything sent is
// bounded and cleaned, and too many categories or skills are refused rather than silently cut.
export function validateSkills(input){
  if (!input || typeof input !== 'object') return structuredClone(SKILLS_DEFAULT);
  const cats = Array.isArray(input.categories) ? input.categories : [];
  if (cats.length > SKILL_LIMITS.categories) throw bad(`Use up to ${SKILL_LIMITS.categories} skill categories.`);
  const categories = [];
  for (const c of cats){
    if (!c || typeof c !== 'object') throw bad('Invalid skill category.');
    const name = text(c.name, 40);
    if (!name) throw bad('Each skill category needs a name.');
    const raw = Array.isArray(c.items) ? c.items : [];
    if (raw.length > SKILL_LIMITS.items) throw bad(`Use up to ${SKILL_LIMITS.items} skills in ${name}.`);
    const items = [];
    for (const x of raw){
      if (!x || typeof x !== 'object') throw bad('Invalid skill.');
      const itemName = text(x.name, 40);
      if (!itemName) continue;                                   // an empty row is an unfinished edit, not an error
      const color = text(x.color, 20), level = Number(x.level);
      const logoUrl = text(x.logoUrl, 600);
      if (logoUrl && !isImageUrl(logoUrl)) throw bad(`Upload the logo for ${itemName} before saving.`);
      const logo = text(x.logo, 30);   // '' = match the name, 'none' = letters only, else a library logo
      if (logo && logo !== 'none' && !Object.prototype.hasOwnProperty.call(SKILL_LOGOS, logo)) throw bad(`Pick a logo from the list for ${itemName}.`);
      items.push({ name: itemName, code: text(x.code, 3), logo, color: /^#[0-9a-fA-F]{6}$/.test(color) ? color.toUpperCase() : '',
        level: Number.isFinite(level) ? Math.min(5, Math.max(0, Math.round(level))) : 0, note: text(x.note, 140), logoUrl });
    }
    categories.push({ name, icon: SKILL_ICONS.includes(c.icon) ? c.icon : 'star', items });
  }
  return { enabled: input.enabled !== false, title: text(input.title, 60) || SKILLS_DEFAULT.title, intro: text(input.intro, 200), categories };
}
