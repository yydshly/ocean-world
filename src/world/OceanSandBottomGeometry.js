// Complete neutral representatives in body-size units, local +X forward.
// Static ventral contacts remain nonnegative during bounded appendage motion.
const TAU = Math.PI * 2;
function flounder(builder) {
  const b = builder(), rings = Array.from({ length: 17 }, (_, i) => [Math.cos(i * 2.4) * .29, Math.sin(i * 2.4) * .18]);
  b.ellipsoid([.04, .039, 0], [.46, .039, .255], [.50, .46, .35], 40, 14, (x, y, z) => {
    if (y < .026) return [.77, .74, .65];
    if ((x + .23) ** 2 + z ** 2 < .0035) return [.16, .15, .11];
    for (const [sx, sz] of rings) { const d = Math.hypot(x - sx, z - sz); if (d < .021) return [.70, .65, .49]; if (d < .035) return [.27, .25, .18]; }
    return [.50, .46, .35];
  });
  for (const side of [-1, 1]) for (let i = 0; i < 26; i++) {
    const a = (i + .5) / 26 * Math.PI, x = .04 + .43 * Math.cos(a), z = side * .255 * Math.sin(a);
    b.sheet([[x + .016, .031, z * .94], [x - .016, .031, z * .94], [x - .014, .024, z * 1.26], [x + .014, .024, z * 1.26]], [.53, .48, .35]);
  }
  for (const [x, z] of [[.32, -.06], [.39, .055]]) {
    b.ellipsoid([x, .071, z], [.032, .027, .025], [.44, .41, .30], 12, 8);
    b.ellipsoid([x + .006, .092, z], [.018, .006, .016], [.08, .08, .06], 10, 6);
  }
  b.sheet([[.25, .062, .07], [.06, .086, .14], [.12, .060, .11]], [.56, .51, .38]);
  b.tube([[.465, .032, -.032], [.493, .032, 0], [.465, .032, .032]], [.004, .004, .004], [.20, .19, .14], 4);
  return b.finish();
}
function star(builder) {
  const b = builder(), tips = [], radius = .525731112119;
  for (let i = 0; i < 10; i++) { const angle = i * Math.PI / 5, r = i % 2 ? .13 : radius; tips.push([Math.cos(angle) * r, Math.sin(angle) * r]); }
  const top = tips.map(([x, z]) => b.vertex([x, .031, z], [.36, .28, .35]));
  const bottom = tips.map(([x, z]) => b.vertex([x, .009, z], [.73, .65, .53]));
  const centre = b.vertex([0, .10, 0], [.35, .27, .34]), under = b.vertex([0, .009, 0], [.75, .67, .55]);
  for (let i = 0; i < 10; i++) { const n = (i + 1) % 10; b.face(centre, top[n], top[i]); b.face(under, bottom[i], bottom[n]); b.face(top[i], top[n], bottom[i]); b.face(top[n], bottom[n], bottom[i]); }
  for (let arm = 0; arm < 5; arm++) {
    const a = arm * TAU / 5, c = Math.cos(a), s = Math.sin(a);
    const p = (x, y, z) => [x * c - z * s, y, x * s + z * c];
    for (let j = 0; j < 9; j++) for (const side of [-1, 1]) {
      const x = .13 + j * .041, width = (.5257 - x) * .29;
      b.tube([p(x, .024, side * width), p(x + .008, .025, side * (width + .028))], [.006, .001], [.69, .62, .51], 5);
      b.tube([p(x, .023, side * .016), p(x, .002, side * .018)], [.005, .001], [.75, .66, .53], 5);
    }
  }
  return b.finish();
}
function cucumber(builder) {
  const b = builder();
  b.ellipsoid([0, .145, 0], [.50, .145, .19], [.48, .47, .42], 40, 16, (x, y, z) => {
    if (y < .055) return Math.sin(x * 157 + z * 117) > .8 ? [.28, .28, .25] : [.71, .70, .64];
    const wrinkle = Math.cos(x * 75) * .033; return [.46 + wrinkle, .46 + wrinkle, .40 + wrinkle];
  });
  for (let i = 0; i < 14; i++) {
    const x = -.39 + i * .06, round = Math.sqrt(1 - (x / .5) ** 2);
    for (const a of [-.8, 0, .8]) b.ellipsoid([x, .145 + Math.cos(a) * .145 * round, Math.sin(a) * .19 * round], [.009, .012, .009], [.40, .40, .35], 6, 4);
    for (const z of [-.055, 0, .055]) b.ellipsoid([x, .008, z], [.009, .008, .009], [.68, .67, .60], 6, 4);
  }
  return b.finish();
}
export function sandBottomBody(builder, id) {
  return id === 'leopard-flounder' ? flounder(builder) : id === 'comb-sand-star' ? star(builder) : cucumber(builder);
}
export function sandBottomAppendages(builder, id) {
  const b = builder();
  if (id === 'leopard-flounder') {
    const rim = Array.from({ length: 13 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 12; return [-.025 - .105 * Math.cos(a), .026, .13 * Math.sin(a)]; });
    b.sheet([[0, .030, 0], ...rim], [.54, .49, .36]);
  } else if (id === 'sandfish-sea-cucumber') for (let i = 0; i < 20; i++) {
    const a = i * TAU / 20, z = Math.sin(a) * .029, y = .046 + Math.cos(a) * .018;
    b.tube([[.443, .050, 0], [.475, y, z], [.497, .022, z * 1.5]], [.003, .0025, .001], [.57, .57, .52], 5);
  }
  return b.finish();
}
export function animateSandBottomParts(parts, id, time, agent, phase) {
  if (agent.alive === false) return;
  const moving = Math.hypot(agent.velocity?.x ?? 0, agent.velocity?.z ?? 0) > 1e-7;
  if (id === 'leopard-flounder') parts.appendages.rotation.y = moving ? Math.sin(time * 3 + phase) * .04 : 0;
  else if (id === 'sandfish-sea-cucumber') parts.appendages.rotation.y = agent.state === 'benthic-proxy-feeding' ? Math.sin(time * 2 + phase) * .008 : 0;
}
