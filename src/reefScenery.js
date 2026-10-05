// Fixed authored hard substrate, in metres. These small rocks are terrain,
// not additional ecological organisms or a source of simulated biomass.
// Keep the historic seed and draw order: the returned generator resumes at
// the exact point used for the decorative colony layout after these rocks.
function sceneryRandom() {
  let state = 851;
  return () => {
    state |= 0; state = state + 0x6D2B79F5 | 0;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

export function createReefSceneryLayout() {
  const random = sceneryRandom(), rocks = [];
  for (let index = 0; index < 22; index++) {
    const x = -7.5 + random() * 16, z = -10 + random() * 18;
    if (x > -.5 && x < 3.5 && z > -5) continue;
    rocks.push(Object.freeze([x, .1, z, .3 + random() * .7,
      .2 + random() * .35, .3 + random() * .55]));
  }
  return { rocks: Object.freeze(rocks), random };
}

export const REEF_AUXILIARY_ROCKS = createReefSceneryLayout().rocks;
