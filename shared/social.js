// Social posts: what each network allows, how a caption and hashtags become the text that is posted, and the
// checks the portal and the server both run before anything is sent. One module, imported by the portal and the
// server, so the counter you see is the rule that is enforced.

// limit: characters of caption (hashtags included, as they are posted). images: most pictures in one post.
export const PLATFORMS = {
  instagram: { name: 'Instagram', limit: 2200, tags: 30, images: 10, needsImage: true },
  x: { name: 'X', limit: 280, tags: null, images: 4, needsImage: false },
  facebook: { name: 'Facebook', limit: 63206, tags: null, images: 10, needsImage: false },
  linkedin: { name: 'LinkedIn', limit: 3000, tags: null, images: 9, needsImage: false },
  threads: { name: 'Threads', limit: 500, tags: null, images: 20, needsImage: false },
  pinterest: { name: 'Pinterest', limit: 500, tags: 20, images: 1, needsImage: true }
};
export const PLATFORM_IDS = Object.keys(PLATFORMS);
export const POST_LIMITS = { caption: 5000, tags: 60, media: 20, title: 80, alt: 300 };
export const X_LINK_LENGTH = 23;   // X counts every link as 23 characters

// A tag as it is posted (no #): letters, numbers and underscores, not all digits, at most 60 characters.
export function cleanTag(raw){
  const t = String(raw ?? '').normalize('NFC').replace(/^#+/, '').replace(/[^\p{L}\p{M}\p{N}_]/gu, '').slice(0, 60);
  return /^\d+$/.test(t) ? '' : t;
}
// "#poster, Design  #poster" -> ['poster', 'Design']: split on spaces, commas and #, drop empties and repeats (any case).
export function parseTags(input, max = POST_LIMITS.tags){
  const parts = Array.isArray(input) ? input.flatMap(x => String(x ?? '').split(/[\s,;#]+/)) : String(input ?? '').split(/[\s,;#]+/);
  const out = [], seen = new Set();
  for (const p of parts){
    const t = cleanTag(p), k = t.toLowerCase();
    if (!t || seen.has(k)) continue;
    seen.add(k); out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

// Characters as the network counts them: code points, and (X) every link as 23.
export function textLength(text, platform){
  let s = String(text ?? '');
  if (platform === 'x') s = s.replace(/https?:\/\/[^\s]+/g, 'x'.repeat(X_LINK_LENGTH));
  return Array.from(s).length;
}
// The text that goes out: the caption, then a blank line and the hashtags.
export function composeText(post, _platform){
  const caption = String(post.caption ?? '').trim();
  const tags = parseTags(post.hashtags).map(t => '#' + t);
  return tags.length ? `${caption}${caption ? '\n\n' : ''}${tags.join(' ')}` : caption;
}

// What would stop or spoil this post. level "error" blocks sending; "warn" is advice.
export function checkPost(post){
  const out = [];
  const platforms = (post.platforms || []).filter(p => PLATFORMS[p]);
  const images = (post.media || []).length;
  const tags = parseTags(post.hashtags);
  if (!platforms.length) out.push({ platform: null, level: 'error', code: 'no_platform', message: 'Choose at least one network.' });
  if (!String(post.caption ?? '').trim() && !images) out.push({ platform: null, level: 'error', code: 'empty', message: 'Write a caption or add a picture.' });
  for (const id of platforms){
    const P = PLATFORMS[id], len = textLength(composeText(post, id), id);
    if (len > P.limit) out.push({ platform: id, level: 'error', code: 'too_long', message: `${P.name}: ${len - P.limit} over the ${P.limit}-character limit.` });
    if (P.needsImage && !images) out.push({ platform: id, level: 'error', code: 'needs_image', message: `${P.name} needs at least one picture.` });
    if (P.images && images > P.images) out.push({ platform: id, level: 'error', code: 'too_many_images', message: `${P.name} takes up to ${P.images} pictures (you have ${images}).` });
    if (P.tags && tags.length > P.tags) out.push({ platform: id, level: 'error', code: 'too_many_tags', message: `${P.name} allows ${P.tags} hashtags (you have ${tags.length}).` });
    if (id === 'linkedin' && tags.length > 5) out.push({ platform: id, level: 'warn', code: 'many_tags', message: 'LinkedIn works best with up to 5 hashtags.' });
    if (id === 'x' && tags.length > 3) out.push({ platform: id, level: 'warn', code: 'many_tags', message: 'X posts read best with 1 to 3 hashtags.' });
  }
  return out;
}

// Starter hashtag sets for a design, motion and film portfolio (the owner can save their own too).
export const STARTER_SETS = [
  { name: 'Movie posters', tags: ['movieposter', 'posterdesign', 'keyart', 'filmposter', 'cinema', 'theatrical', 'graphicdesign', 'photoshop'] },
  { name: 'Motion design', tags: ['motiondesign', 'aftereffects', 'motiongraphics', 'animation', 'kinetictypography', 'motionposter'] },
  { name: 'Video editing', tags: ['videoediting', 'premierepro', 'teaser', 'trailer', 'reels', 'filmmaking', 'postproduction'] },
  { name: 'Digital art', tags: ['digitalart', 'digitalpainting', 'conceptart', 'illustration', 'photomanipulation', 'artistsoninstagram'] },
  { name: 'Behind the scenes', tags: ['behindthescenes', 'workinprogress', 'process', 'designprocess', 'creativeprocess'] }
];

const STOP = new Set('the and for with that this from your you our are was were will have has had not but all any can out new now just more most into over than then them they their what when where which while about after again also been before being both could does doing done each even every first here how its like make many much must only other some such take their there these those through under very want well work would'.split(' '));
// A few tags drawn from the caption's own words, then the most used ones; never one already on the post.
export function suggestTags(caption, { used = [], popular = [], limit = 10 } = {}){
  const have = new Set(parseTags(used).map(t => t.toLowerCase()));
  const out = [];
  const add = (t) => { const c = cleanTag(t), k = c.toLowerCase(); if (c && !have.has(k) && c.length >= 3 && !out.some(x => x.toLowerCase() === k)) out.push(c); };
  const words = String(caption ?? '').toLowerCase().match(/[\p{L}][\p{L}\p{M}\p{N}]{3,}/gu) || [];
  const freq = new Map();
  for (const w of words) if (!STOP.has(w)) freq.set(w, (freq.get(w) || 0) + 1);
  [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).slice(0, 5).forEach(([w]) => add(w));
  for (const t of popular) add(t);
  const lower = String(caption ?? '').toLowerCase();
  for (const set of STARTER_SETS){ if (set.tags.some(t => lower.includes(t.slice(0, 5)))) set.tags.forEach(add); }
  if (out.length < limit) STARTER_SETS[0].tags.forEach(add);
  return out.slice(0, limit);
}
