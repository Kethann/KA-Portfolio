// One heartbeat as a real monitor draws it, for k in 0..1 of a beat (up is positive, R peak = 1):
// a small rounded P wave, a short Q dip, the tall narrow R spike, the S dip below the line, then the broad T wave.
const bump = (k: number, at: number, w: number) => Math.exp(-((k - at) * (k - at)) / (2 * w * w));
export function ecgWave(k: number){
  k = ((k % 1) + 1) % 1;
  return 0.11 * bump(k, 0.16, 0.026) - 0.13 * bump(k, 0.285, 0.0075) + 1 * bump(k, 0.31, 0.0085) - 0.27 * bump(k, 0.336, 0.0095) + 0.26 * bump(k, 0.56, 0.046);
}
