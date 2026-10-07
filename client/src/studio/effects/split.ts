// Splits text into lines → words → letters (spans), keeping the full text readable to screen readers.
export interface Split { lines: HTMLElement[]; words: HTMLElement[]; chars: { el: HTMLSpanElement; word: number; line: number }[] }

export function splitText(host: HTMLElement, text: string): Split {
  host.replaceChildren();
  host.setAttribute('role', 'img');
  host.setAttribute('aria-label', text);
  const out: Split = { lines: [], words: [], chars: [] };
  text.split('\n').forEach((lineText, li) => {
    const line = document.createElement('div'); line.className = 'fx-line'; line.setAttribute('aria-hidden', 'true');
    host.appendChild(line); out.lines.push(line);
    const parts = lineText.split(/(\s+)/);
    for (const part of parts){
      if (!part) continue;
      if (/^\s+$/.test(part)){ const sp = document.createElement('span'); sp.className = 'fx-space'; sp.textContent = ' '; line.appendChild(sp); continue; }
      const word = document.createElement('span'); word.className = 'fx-word'; line.appendChild(word);
      const wi = out.words.push(word) - 1;
      for (const ch of Array.from(part)){
        const c = document.createElement('span'); c.className = 'fx-char'; c.textContent = ch; word.appendChild(c);
        out.chars.push({ el: c, word: wi, line: li });
      }
    }
  });
  return out;
}
