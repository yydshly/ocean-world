import { OCEAN_AUTHORED_RADIUS } from './oceanGeneration.js';

export const OCEAN_ENVIRONMENT_BLEND_END_M = 96;
const DEFAULTS = Object.freeze({ currentMps: .15, turbidity: .25, foodSupply: 1, hour: 10 });
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
function hash(text) {
  let value = 2166136261;
  for (let index = 0; index < text.length; index++) value = Math.imul(value ^ text.charCodeAt(index), 16777619);
  value ^= value >>> 16; value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15; value = Math.imul(value, 0x846ca68b);
  return (value ^ value >>> 16) >>> 0;
}

/** Authored continuous water proxies, not a fluid solver or measured ocean.
 * This field reads the shared habitat without mutating generation or consuming
 * its seed stream. No chunk-local boundary or visited-coordinate cache exists.
 * Current: m/s; attenuation: inverse metres; all other indices are relative. */
export function createOceanEnvironment(seed, generator, { uniformCurrent = false } = {}) {
  if ((typeof seed !== 'number' && typeof seed !== 'string') || (typeof seed === 'number' && !Number.isFinite(seed))) {
    throw new TypeError('The ocean seed must be a finite number or a string.');
  }
  if (typeof generator?.sample !== 'function') throw new TypeError('A shared ocean habitat sampler is required.');
  const seedKey = `${typeof seed}:${seed}`;
  const random = (x, z, salt) => hash(`${seedKey}|water|${x}|${z}|${salt}`) / 4294967296;
  const noise = (x, z, wavelength, salt) => {
    const gx = x / wavelength, gz = z / wavelength, ix = Math.floor(gx), iz = Math.floor(gz);
    const tx = smooth(gx - ix), tz = smooth(gz - iz);
    return mix(mix(random(ix, iz, salt), random(ix + 1, iz, salt), tx),
      mix(random(ix, iz + 1, salt), random(ix + 1, iz + 1, salt), tx), tz);
  };
  function sample(x, z, baseEnvironment = DEFAULTS, depthM) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) throw new RangeError('Water coordinates must be finite.');
    const base = { ...DEFAULTS, ...baseEnvironment };
    for (const key of Object.keys(DEFAULTS)) if (!Number.isFinite(base[key])) throw new TypeError(`Environment ${key} must be finite.`);
    const habitat = generator.sample(x, z);
    const depth = depthM ?? habitat.depthM;
    if (!Number.isFinite(depth)) throw new RangeError('Water depth must be finite.');
    base.currentMps = clamp(base.currentMps, 0, 1.2); base.turbidity = clamp(base.turbidity);
    const hour = ((base.hour % 24) + 24) % 24, foodSupply = clamp(base.foodSupply, 0, 3);
    const authoredBlend = smooth((Math.hypot(x, z) - OCEAN_AUTHORED_RADIUS) / (OCEAN_ENVIRONMENT_BLEND_END_M - OCEAN_AUTHORED_RADIUS));
    const rockiness = clamp(Number.isFinite(habitat.rockiness) ? habitat.rockiness : 0);
    const grass = clamp(Number.isFinite(habitat.seagrassSuitability) ? habitat.seagrassSuitability : 0);
    const broad = noise(x, z, 180, 'exposure'), suspended = noise(x, z, 95, 'suspended');
    // Habitat associations and coefficients are authored variation, not a
    // prediction that vegetation or rock cover causes measured current speed.
    const bedDepth = Number.isFinite(habitat.depthM) ? habitat.depthM : depth;
    const exposure = clamp(.55 * broad + .25 * (1 - grass) + .20 * clamp(bedDepth / 28));
    const currentMultiplier = mix(1, .55 + .95 * exposure, authoredBlend);
    const currentMps = clamp(base.currentMps * (uniformCurrent ? 1 : currentMultiplier), 0, 1.2);
    const angle = uniformCurrent ? 0 : (noise(x, z, 160, 'direction') - .5) * .9 * authoredBlend;
    const currentVector = currentMps === 0 ? { x: 0, z: 0 } : { x: currentMps * Math.cos(angle), z: currentMps * Math.sin(angle) };
    const sediment = clamp(.50 * suspended + .35 * (1 - rockiness) + .15 * grass);
    const turbidity = clamp(base.turbidity + (-.12 + .30 * sediment) * 4 * base.turbidity * (1 - base.turbidity) * authoredBlend);
    const attenuationPerM = .018 + .15 * turbidity + .025 * sediment;
    const daylight = hour > 6 && hour < 18 ? Math.sin((hour - 6) * Math.PI / 12) : 0;
    // Preserve the old regional proxy in the authored patch. Beyond the
    // transition it attenuates exponentially at the actual queried depth.
    const lightAtDepth = daylight * (1 - .8 * turbidity) * Math.exp(-Math.max(0, depth) * attenuationPerM * authoredBlend);
    const waterTint = mix(base.turbidity, clamp(.55 * turbidity + .30 * grass + .15 * suspended), authoredBlend);
    return { currentMps, currentVector, turbidity, visibilityM: 3 + (1 - turbidity) * 16,
      attenuationPerM, lightAtDepth, waterTint, exposure, authoredBlend, hour, foodSupply };
  }
  return Object.freeze({ seed, sample });
}
