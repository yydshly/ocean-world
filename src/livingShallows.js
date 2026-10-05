// A separate deterministic world identity protects earlier terrain/ecology and
// observation records. This prefix is a scene version, never a population reset.
export const LIVING_SHALLOWS_PROFILE = 'living-shallows-v1';
export const LIVING_SHALLOWS_PREFIX = `${LIVING_SHALLOWS_PROFILE}|`;
export function livingShallowsSeed(seed) {
  if (isLivingShallowsSeed(seed)) return seed;
  if (typeof seed !== 'string' && !(typeof seed === 'number' && Number.isFinite(seed))) {
    throw new TypeError('A living-shallows seed must be a string or finite number.');
  }
  return `${LIVING_SHALLOWS_PREFIX}${typeof seed}:${seed}`;
}
export const isLivingShallowsSeed = seed => typeof seed === 'string' && seed.startsWith(LIVING_SHALLOWS_PREFIX);
