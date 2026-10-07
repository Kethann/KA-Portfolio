// The homepage intro versions. Exactly one runs per page load; the owner picks it in the Creator Portal
// (Studio > Intro) and can switch back to any version at any time.
//
// How a version is wired:
//  - its code is one <script data-intro="<id>"> block in index.html; every version except V1 ships with
//    type="text/plain" (so it does not run) and the Pages router (pages/_worker.js) switches on the chosen one
//    before the page reaches the browser;
//  - a version must keep the homepage contract V1 keeps: fade the #boot-veil out, and dispatch the
//    'ka-sequence-complete' window event once the logo is fully revealed (the nav, sounds and pages wait for it).
//
// V1 is LOCKED: its code must never change. tests/intro-lock.test.mjs fails the build if the fingerprint below no
// longer matches the script, so a new idea always becomes a new version instead of an edit to V1.
export const INTRO_VERSIONS = [
  {
    id: 'v1',
    name: 'KA crystal',
    label: 'Version 1',
    locked: true,
    description: 'The shattered KA crystal flies in, reassembles shard by shard and lights up; the skill icons orbit the finished logo.',
    sha256: '56725c66ba5e99a4ae983b28a092ba3d44ebfd3f2740e2e49512746d723c6e7a',
  },
];
export const INTRO_IDS = INTRO_VERSIONS.map(v => v.id);
export const DEFAULT_INTRO = 'v1';
/** the version a saved setting points at (anything unknown falls back to V1) */
export const introVersion = (id) => INTRO_IDS.includes(id) ? id : DEFAULT_INTRO;
