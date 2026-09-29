// Typography studio entry (lazy bundle: dist/assets/studio.js). Phase 8 fills in the canvas; this
// shell already provides the full-screen dialog, focus handling and cleanup the canvas plugs into.
export interface StudioOptions { returnFocus?: HTMLElement | null }

let openDialog: HTMLElement | null = null;

export function openStudio(options: StudioOptions = {}): void {
  if (openDialog) return;
  const dialog = document.createElement('div');
  dialog.className = 'ka-studio';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', 'Typography studio');
  dialog.innerHTML = '<p class="ka-studio-note">Typography studio</p><button type="button" class="ka-studio-close" aria-label="Close studio">Close</button>';
  const close = () => {
    document.removeEventListener('keydown', onKey);
    dialog.remove();
    openDialog = null;
    options.returnFocus?.focus({ preventScroll: true });
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
  dialog.querySelector('button')!.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  document.body.appendChild(dialog);
  openDialog = dialog;
  (dialog.querySelector('button') as HTMLButtonElement).focus();
}
