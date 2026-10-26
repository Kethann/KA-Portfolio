import './style.css';
import { KaIntroV4 } from './intro';
import { T } from './timeline';
import { LOGO_BODY_IMAGE } from './logo-paths';

const stage = document.getElementById('ka-intro')!;
const hint = document.getElementById('ka-hint')!;
const replayBtn = document.getElementById('ka-replay') as HTMLButtonElement;

const params = new URLSearchParams(location.search);
const num = (k: string) => (params.has(k) && !Number.isNaN(Number(params.get(k))) ? Number(params.get(k)) : undefined);
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches && !params.has('motion');

function showStatic() {
  const img = document.createElement('img');
  img.src = LOGO_BODY_IMAGE;
  img.alt = 'KA';
  img.className = 'ka-static';
  stage.appendChild(img);
}

let intro: KaIntroV4 | undefined;
try {
  intro = new KaIntroV4(stage, {
    fixedTime: num('t'),
    speed: num('speed'),
    startAt: reduced ? T.end : num('start'),
    onDone: () => {
      document.body.classList.add('ka-done');
      window.dispatchEvent(new CustomEvent('ka-intro-v4:done'));
    },
  });
  intro.start().catch((err) => {
    console.error(err);
    intro?.dispose();
    showStatic();
  });
} catch (err) {
  console.error(err);
  showStatic();
}

if (intro && num('t') === undefined && !reduced) document.body.classList.add('ka-playing');

const skip = () => {
  intro?.skip();
  document.body.classList.remove('ka-playing');
};
stage.addEventListener('pointerdown', skip);
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') skip();
  if (e.key === 'r' || e.key === 'R') replay();
});

let hintTimer = 0;
function scheduleHintHide() {
  clearTimeout(hintTimer);
  hintTimer = window.setTimeout(() => document.body.classList.remove('ka-playing'), T.skipTo * 1000);
}

function replay() {
  if (!intro) return;
  intro.replay();
  document.body.classList.remove('ka-done');
  document.body.classList.add('ka-playing');
  scheduleHintHide();
}
replayBtn.addEventListener('click', replay);

setTimeout(() => hint.classList.add('ka-show'), 700);
scheduleHintHide();
