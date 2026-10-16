// Switches the homepage to the chosen intro version and hands it the owner's skill bubbles, as text.
// The Pages router does the same with HTMLRewriter in production; the local dev server (which has no router) uses this,
// so what you test locally behaves like the live site. V1 (the default, locked) is returned exactly as built.
export function applyIntroToHtml(html, version, bubbles){
  if (!version || version === 'v1') return html;
  return html.replace(/<script data-intro="(v\d{1,3})"([^>]*)>/g, (tag, id) => {
    if (id !== version) return `<script data-intro="${id}" type="text/plain">`;
    const inject = Array.isArray(bubbles) ? `<script>window.KA_INTRO_BUBBLES=${JSON.stringify(bubbles).replace(/</g, '\u003c')};</script>` : '';
    return `${inject}<script data-intro="${id}">`;
  }).replace('<html', `<html data-ka-intro="${version}"`);
}
