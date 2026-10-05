# Mobile and tablet refinements — 21 September 2026

Existing local changes were preserved. Pre-edit copies are under `_archive/mobile-2026-09-21/`.

- Enabled the same smoothed paint trail for finger, pen, and mouse input. Touch listeners are passive; scrolling and pinch zoom remain native. Form controls and navigation remain clear of the effect. Multi-touch, cancellation, hidden pages, and reduced-motion preferences stop the trail; it drains after release instead of running indefinitely.
- Replaced the enlarged galaxy glow's quantized texture falloff with an analytic shader fade. Glow brightness now follows the surrounding nebula, with a softer touch-device level. Corrected reversed star fade edges. These address plausible sources of mobile rings/bright disks, but the originally reported artifact has not been visually reproduced.
- Bounded the background framebuffer to 900,000 pixels on mobile/tablet and 2.2 million on desktop; background rendering targets at most 30 fps while the foreground retains its own timing. Hidden/reduced-motion states cancel the background loop. Context loss exposes the CSS fallback; restoration resumes rendering.
- Carousel gestures distinguish vertical scrolling from horizontal dragging. Cancelled or lost gestures snap without adding flick velocity. Additional fingers cannot replace the active pointer. Card sizing accounts for available height as well as width, including landscape.
- Consolidated the mobile chat layout after older conflicting rules. The sheet follows the visual viewport when the keyboard opens, preserves pinch zoom, keeps the composer from shrinking, and gives messages their own scroll area. Mobile inputs use 16px text, small controls have 44px targets, and quick replies scroll horizontally.
- Long carousel titles wrap, close controls retain their size, and touch devices avoid sticky hover expansion and unnecessary hover shadows.

Validation: six new behavioral regressions cover touch-only trail rendering, native scroll continuation, pinch/cancellation, control exclusion, reduced motion, bounded background rendering, keyboard viewport sizing, and carousel gesture cancellation. The full Node suite passes 35 tests. Build verification covers TypeScript, inline script syntax, five production asset/delivery tests, and hero startup checks.

No browser was connected. Actual iOS/Android/tablet screenshots, keyboard behavior, GPU shader output, and frame-time measurements remain unverified. The changes reduce known work and fix verified logic errors; they do not establish error-free behavior on every device. Refresh/redeploy the rebuilt app to test on the affected phone.


Glass and zoom follow-up (2026-09-21): shared warm glass gradients now include a soft rim and preserve live backdrop blur. Chat opening/closing animates opacity and transform instead of a second blur filter. Reduced-transparency and increased-contrast preferences select opaque surfaces. The idle panda is a child of the launcher again, sharing native zoom/pan; only its active chat travel uses the fixed overlay. The return path accounts for the visible viewport offset. Lifecycle regression checks cover attachment before opening, after zoom-like launcher geometry changes, and after return. Browser/on-device visual verification remains outstanding because no browser was connected.
