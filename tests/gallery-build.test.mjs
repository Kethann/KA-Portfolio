import {test} from 'node:test';
import assert from 'node:assert/strict';

test('compiled panda exposes its lazy mount without requiring a browser at import time',async()=>{
  const panda=await import('../dist/assets/panda.js');
  assert.equal(typeof panda.mountPanda,'function');
});

test('ambient artwork loads independently of the gallery',async()=>{
  const poster=await import('../dist/assets/poster.js');
  assert.equal(typeof poster.startPosterBackground,'function');
});

test('compiled gallery exposes the mountStacks function used by the crystal homepage',async()=>{
  // Import the real output and its dependencies, not a source-level stand-in.
  const gallery=await import('../dist/assets/gallery.js');
  assert.equal(typeof gallery.mountStacks,'function','Vite must preserve the externally called mountStacks export');
});
