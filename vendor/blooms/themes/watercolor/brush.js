// What the hand does, turned into stamps for the paint.
//
//  - Moving brings paint and shoves the water. Slow is wide and rich; fast is
//    narrow and mostly a shove.
//  - The brush runs out as it travels and reloads when it rests. An empty
//    brush still stirs.
//  - Each new stroke takes the next pigment, with a trace of the last one.
//  - Resting with a finger (or the mouse button) down runs in clean water,
//    which pushes the paint around it outward: a bloom.

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.min(Math.max(v, 0), 1);

export function createBrush(params) {
  const strokes = new Map();
  let turn = -1; // pigment used by the most recent stroke

  function begin(id) {
    const prev = turn;
    turn = (turn + 1) % 4;
    const stroke = {
      pig: turn,
      prev,
      load: 1,
      travelled: 0,
      radius: 0,
      seed: Math.random() * 97,
      rested: false,
    };
    strokes.set(id, stroke);
    return stroke;
  }

  // `short` is the sheet's short edge in paint cells; `scale` is how the
  // sheet compares with the full-size one the constants were written for.
  function update(dt, pointers, short, scale) {
    const stamps = [];
    const seen = new Set();
    for (const p of pointers) {
      seen.add(p.id);
      let s = strokes.get(p.id);
      if (!s || p.isNew) s = begin(p.id);

      const dx = p.x - p.px;
      const dy = p.y - p.py;
      const seg = Math.hypot(dx, dy);
      const moving = seg > 1e-5;
      if (p.still > params.reloadRest) s.rested = true;

      if (moving) {
        if (s.rested) s = begin(p.id);
        // 0 = slow, 1 = fast, even steps for even ratios of speed
        const e = clamp01(Math.log(Math.max(p.speed, 1e-4) / params.speedSlow)
          / Math.log(params.speedFast / params.speedSlow));
        const target = lerp(params.rSlow, params.rFast, e);
        // A stroke starts at the tip of the brush and swells as it settles in.
        if (!s.radius) s.radius = target * 0.6;
        s.radius += (target - s.radius) * (1 - Math.exp(-dt / 0.14));
        const r = s.radius * short;

        const strength = lerp(params.pigSlow, params.pigFast, e);
        const trace = s.prev >= 0 ? params.trace * Math.exp(-s.travelled / 0.6) : 0;
        const pig = [0, 0, 0, 0];
        pig[s.pig] += strength * (1 - trace);
        if (s.prev >= 0) pig[s.prev] += strength * trace;

        let vx = (dx / dt) * short * params.velGain;
        let vy = (dy / dt) * short * params.velGain;
        const vm = Math.hypot(vx, vy);
        const cap = params.velMax * scale;
        if (vm > cap) {
          vx *= cap / vm;
          vy *= cap / vm;
        }
        stamps.push({
          ax: p.px * short, ay: p.py * short, bx: p.x * short, by: p.y * short,
          r,
          seed: s.seed,
          streak: lerp(0.2, 0.5, e),
          // An emptying brush replaces less and less of what it passes over.
          replace: lerp(params.replaceSlow, params.replaceFast, e) * s.load,
          rough: params.edgeRough,
          resting: 0,
          pig,
          vx, vy,
          push: 1,
          pushR: r * params.pushRadius,
          source: params.sourceMove * (0.35 + 0.65 * s.load),
        });
        s.travelled += seg;
        s.load = Math.max(params.loadFloor, Math.exp(-s.travelled / params.loadDistance));
      } else if (p.engaged && p.still > params.holdDelay) {
        const r = params.holdR * short;
        stamps.push({
          ax: p.x * short, ay: p.y * short, bx: p.x * short, by: p.y * short,
          r,
          seed: s.seed,
          streak: 0,
          replace: params.replaceHold * dt,
          rough: 0.2,
          resting: 1,
          pig: [0, 0, 0, 0],
          vx: 0, vy: 0,
          push: 0,
          pushR: r * 1.3,
          source: params.sourceHold,
        });
      }
    }
    for (const id of strokes.keys()) if (!seen.has(id)) strokes.delete(id);
    return stamps;
  }

  return { update };
}
