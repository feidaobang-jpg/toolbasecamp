// Scripted QA player for hop-fox-3d (Node sim, seed checks and the browser capture share this exact function).
// botInput(w, W) → { x, run, jump, action }. W is the world module (tileAt, PLANK, PLATFORM).
const memo = new WeakMap();
export function botInput(w, W) {
  const p = w.hero, none = { x: 0, run: false, jump: false, action: false };
  if (!p || p.dead || w.goal || w.status !== 'playing') return none;
  const i = { x: 1, run: true, jump: false, action: false };
  const t = (dx, y) => W.tileAt(w, Math.floor(p.x + dx), Math.floor(y));
  const solid = v => v && v !== W.PLANK;
  const front = p.x + p.hw;
  const wall = [0.25, 0.9, 1.6].some(d => solid(t(p.hw + d, p.y + .4)));
  const gap = [0.5, 1.2].some(d => !t(p.hw + d, p.y - .5) && !t(p.hw + d, p.y - 1.5) && !t(p.hw + d, p.y - 3.5));
  const foe = w.enemies.some(e => e.alive && e.active && e.state !== 'dead' && e.state !== 'squashed' && Math.abs(e.y - p.y) < 1.2 && !(e.state === 'shell' && Math.abs(e.vx) < .1) &&
    ((e.x > p.x - .2 && e.x - front < 2.8) || (e.x <= p.x - .2 && p.x - e.x < 1.8 && e.vx > 0)));   // ahead, or closing in from behind
  const pl = w.platform, P = W.PLATFORM, plMid = pl.x + P.w / 2, top = P.y + .5;
  // Route note for the opening: hop onto the branch walkway and bump the power crate above it.
  if (W.tileAt(w, 20, 6) === W.CRATE && p.x > 15.8 && p.x < 21) {
    if (p.grounded && p.y < 1 && p.x < 17.4) return { x: 1, run: true, jump: p.x > 16.4, action: false };
    if (p.grounded && p.y > 3.9) return p.x < 20.25 ? { ...none, x: 1 } : { ...none, jump: true };
    if (!p.grounded && p.x > 17) return { x: p.x < 19.3 ? 1 : p.vx > .6 ? -1 : 0, run: false, jump: p.vy > 0, action: false };
  }
  // Finish: a running leap at the bell pole grabs it higher.
  if (p.x > 152.5 && p.x < 168 && !foe) {
    if (p.grounded) return { x: 1, run: true, jump: p.y < .5 ? p.x > 164.4 : wall, action: false };   // run off the plateau, leap near the pole
    return { x: 1, run: true, jump: p.vy > 0 && p.x > 163, action: false };
  }
  // Wide gap with the moving log: walk up the steps, stop on the top step, wait for the log to swing back, hop on.
  const st = memo.get(w) || memo.set(w, { log: 'approach' }).get(w);
  if (p.x > 70 && p.x < 83 && !p.onPlatform) {
    const onTop = p.grounded && p.y > 3.9;
    if (onTop) {
      st.log = 'waitTop';
      if (p.x < 81.45) return { ...none, x: 1 };
      if (pl.x < 84.4) { st.log = 'jumpToLog'; return { x: 1, run: false, jump: true, action: false }; }
      return { ...none };
    }
    if (st.log === 'jumpToLog' && !p.grounded) return { x: plMid > p.x + .3 ? 1 : 0, run: false, jump: p.vy > 0, action: false };
    if (!p.grounded) return { x: p.x > 81.2 && p.vx > .3 ? -1 : (p.x > 81.2 ? 0 : 1), run: false, jump: p.vy > 0, action: false };
    const step = solid(t(p.hw + .3, p.y + .4));
    return { x: 1, run: false, jump: step || foe, action: false };
  }
  if (p.x >= 83) st.log = 'approach';
  if (p.onPlatform) {
    const far = pl.x + P.w > P.x1 - .6;   // at the far end: hop off toward the landing
    return { x: far ? 1 : (plMid - p.x > .3 ? 1 : plMid - p.x < -.3 ? -1 : 0), run: false, jump: far, action: false };
  }
  if (p.x > 83 && p.x < 93 && !p.grounded) {   // airborne over the log gap: steer onto the log or the far bank
    const target = p.y > top - .1 && Math.abs(plMid - p.x) < 3 && pl.x + P.w < P.x1 - .6 ? plMid : 94;
    return { x: target > p.x + .2 ? 1 : target < p.x - .2 ? -1 : 0, run: false, jump: p.vy > 0, action: false };
  }
  if (!p.grounded) {
    // Airborne: if a walker is below the landing zone, steer onto it for a stomp instead of landing beside it.
    const prey = w.enemies.filter(e => e.alive && e.state === 'walk' && e.y < p.y - .3 && Math.abs(e.x - p.x) < 2.2).sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
    if (prey && p.vy < 2) { const dx = prey.x + prey.vx * .12 - p.x; i.x = dx > .15 ? 1 : dx < -.15 ? -1 : 0; i.run = false; }
    i.jump = p.vy > 0; return i;
  }
  // Showcase habits: jump under reachable crates, and walk to power-ups / extra lives that are close by.
  const crateAbove = [Math.floor(p.x - .2), Math.floor(p.x + .2)].some(cx => { for (let dy = 1.5; dy <= 4.4; dy += .5) { const v = W.tileAt(w, cx, Math.floor(p.y + p.h + dy - 1)); if (v === W.CRATE) return true; if (v && v !== W.PLANK) return false; } return false; });
  const item = w.items.find(it => it.alive && Math.abs(it.x - p.x) < 7 && it.y <= p.y + 4.5 && it.y >= p.y - 4);
  if (item && item.rising && p.grounded) return { ...none };   // let it finish sprouting
  if (item && p.grounded && !foe) { const dx = item.x - p.x; i.run = false; i.x = dx > .2 ? 1 : dx < -.2 ? -1 : 0; if (item.y > p.y + 1) i.jump = Math.abs(dx) < 1.2; if (wall && i.x > 0) i.jump = true; return i; }
  if (crateAbove && p.grounded) { i.jump = true; i.run = false; return i; }
  const ledge = p.y >= 1.5 && [0.3, 0.8].some(d => !t(p.hw + d, p.y - .5));   // leaving a raised stump/step: hop off with a full jump
  if (wall || gap || foe || ledge) i.jump = true;
  return i;
}
