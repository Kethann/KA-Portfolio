// Switches the homepage to the chosen intro version and hands it the owner's skill bubbles, as text.
// The Pages router does the same with HTMLRewriter in production; the local dev server (which has no router) uses this,
// so what you test locally behaves like the live site. Only the chosen intro is kept (the others are left out, so the page
// loads faster), and its script goes out exactly as built; V1 is the default.
export function applyIntroToHtml(html, version, bubbles){
  const v = typeof version === 'string' && /^v\d{1,3}$/.test(version) ? version : 'v1';
  return html.replace(/<script data-intro="(v\d{1,3})"([^>]*)>([\s\S]*?)<\/script>/g, (whole, id, attrs, code) => {
    if (id !== v) return '';
    const inject = v !== 'v1' && Array.isArray(bubbles) ? `<script>window.KA_INTRO_BUBBLES=${JSON.stringify(bubbles).replace(/</g, '<')};</script>` : '';
    return `${inject}<script data-intro="${id}">${code}</script>`;
  }).replace('<html', `<html data-ka-intro="${v}"`);
}
