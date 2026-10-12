// This opt-in terrain profile belongs to a separate saved world. The ordinary
// base retains its exact descriptors; no visited seabed is rebuilt in place.
export const WHOLE_SEABED_VERSION = 1;
export function withWholeSeabedGenerator(base, enabled = true) {
  return enabled && base.profile === 'living-shallows-v1'
    ? Object.freeze({ ...base, wholeSeabedVersion: WHOLE_SEABED_VERSION }) : base;
}
function phase(seed, salt) {
  let h = 2166136261;
  for (const c of `${typeof seed}:${seed}|whole-seabed-v1|${salt}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0) / 4294967296 * Math.PI * 2;
}
const clamp = n => Math.max(0, Math.min(1, n));
export function createWholeSeabedComposition(seed, origin) {
  const sandPhase = phase(seed, `${origin.x},${origin.z}:sand`), grassPhase = phase(seed, `${origin.x},${origin.z}:grass`);
  return Object.freeze({
    // Qualitative shallow depositional ridges, not a sediment-flow solver.
    // The caller applies the original guard/protection and full slope gate.
    relief(x, z, facies) {
      const lx = x - origin.x, lz = z - origin.z, along = lx + 5 * Math.sin(lz / 23 + sandPhase);
      return 1.25 * (facies.sand + .15 * facies.meadow) * Math.sin(along / 10 + sandPhase) * Math.cos(lz / 29 + sandPhase * .3)
        + .25 * facies.sand * Math.sin(along / 25 + sandPhase * .7);
    },
    // Coherent bare-sand tongues between actual admitted grass patches.
    // This changes root placement, never paints vegetation into empty ground.
    grassFactor(x, z) {
      const lx = x - origin.x, lz = z - origin.z;
      const belt = Math.sin(lx / 7 + grassPhase + .4 * Math.sin(lz / 17)) * Math.cos(lz / 11 + grassPhase * .6);
      const t = clamp((belt + .10) / .75);
      return .06 + .94 * t * t * (3 - 2 * t);
    }
  });
}
