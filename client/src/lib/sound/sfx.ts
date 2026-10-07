// A one-line way for any bundle (store, studio, gallery) to make a UI sound without carrying the engine:
// the page's engine lives on window.kaSound (loaded by /assets/sound.js). Missing engine = silence, never an error.
export function sfx(id: string, opts?: { force?: boolean; rate?: number; volume?: number }){
  try { (window as unknown as { kaSound?: { play(id: string, o?: object): void } }).kaSound?.play(id, opts); } catch { /* sound is optional */ }
}
