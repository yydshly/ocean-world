import { shallowMeadowRibbonGeometry as livingShallowsMeadowGeometry } from './world/ShallowMeadowRibbonAssets.js';
import { shallowReefRubbleGeometry } from './world/ShallowLiveReefAssets.js';
import {sampleGrassFitsSoftBed,fitSampleRubbleOnSoftBed} from './shallowSampleSoftBedFit.js';

const TAU = Math.PI * 2;

function seeded(seed) {
  let state = (seed ^ 0x5A6D10) >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let n = Math.imul(state ^ state >>> 15, state | 1);
    n ^= n + Math.imul(n ^ n >>> 7, n | 61);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}

function routeDistance(points, x, z) {
  let nearest = Infinity;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], dx = b.x - a.x, dz = b.z - a.z;
    const u = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
    nearest = Math.min(nearest, Math.hypot(x - a.x - dx * u, z - a.z - dz * u));
  }
  return nearest;
}

// Low, discontinuous sediment-edge cover, rather than a carpet through the ray
// passage. Reuses the existing grass and broken skeleton display geometries;
// these are scenery placements, not animals, shell species or ecological stock.
export function arrangeShallowSandHabitat(model) {
  if (model.sandHabitat) return model.sandHabitat;
  const rng = seeded(model.seed), path = Array.from({ length: 101 }, (_, i) => model.path.getPointAt(i / 100));
  const grassGeometry = livingShallowsMeadowGeometry(), rubbleGeometry = shallowReefRubbleGeometry();
  const grassAdded = [], rubbleAdded = [], patches = [];
  const grassKeys = new Set(model.grass.map(g => `${Math.floor(g.x / 16)},${Math.floor(g.z / 16)}`));
  const extraGrassKeys = new Set();
  const residents = model.agents.filter(a => a.mode === 'crawl' || a.mode === 'fixed'
    || ['blue-spotted-ray', 'reef-goatfish', 'reef-cuttlefish'].includes(a.speciesId));

  function clear(x, z, radius, kind) {
    if (routeDistance(path, x, z) < 2.1 + radius) return false;
    if (model.corals.some(c => Math.hypot(x - c.x, z - c.z) < radius + c.radius + .1)) return false;
    for (const a of residents) {
      const sweep = a.mode === 'fixed' ? 0 : a.radius;
      const body = a.clearance?.radius ?? a.sizeM * .7;
      if (Math.hypot(x - a.home.x, z - a.home.z) < radius + sweep + body + (kind === 'grass' ? .25 : .12)) return false;
    }
    return true;
  }

  function grassFits(g) {
    return sampleGrassFitsSoftBed(model,grassGeometry,g);
  }

  function fitRubble(row) {
    return fitSampleRubbleOnSoftBed(model,rubbleGeometry,row);
  }

  try {
    const plans = [
      { id: 'inner-reef-foot', x: 2.2, z: -3.7, rx: 3.1, rz: 1.15, grass: 0, rubble: 64 },
      { id: 'sand-reef-margin', x: 8.9, z: -3.7, rx: 3.4, rz: 1.2, grass: 0, rubble: 64 },
      { id: 'short-grass-island', x: 12.3, z: 6.2, rx: 2.1, rz: 1.4, grass: 46, rubble: 28 },
      { id: 'sand-meadow-step', x: 18.0, z: 5.9, rx: 2.5, rz: 1.5, grass: 50, rubble: 32 },
      { id: 'meadow-outer-edge', x: 26.0, z: 5.5, rx: 2.6, rz: 1.25, grass: 44, rubble: 26 },
      { id: 'meadow-inner-edge', x: 36.5, z: 4.6, rx: 2.3, rz: 1.5, grass: 34, rubble: 24 },
    ];
    for (const patch of plans) {
      const startGrass = grassAdded.length, startRubble = rubbleAdded.length;
      for (let slot = 0; slot < patch.grass + patch.rubble; slot++) {
        const kind = slot < patch.grass ? 'grass' : 'rubble';
        const angle = slot * 2.399963 + rng() * .28, r = Math.sqrt(rng());
        const x = patch.x + patch.rx * Math.cos(angle) * r, z = patch.z + patch.rz * Math.sin(angle) * r;
        const width = kind === 'grass' ? .42 + rng() * .30 : .22 + rng() * .32;
        const radius = width * .56;
        if (!clear(x, z, radius, kind) || model.surface(x, z) - model.floor(x, z) > .002) continue;
        if (kind === 'grass') {
          const key = `${Math.floor(x / 16)},${Math.floor(z / 16)}`;
          // Keep the entire addition within four new spatial grass batches.
          if (!grassKeys.has(key) && !extraGrassKeys.has(key) && extraGrassKeys.size >= 4) continue;
          if ([...model.grass, ...grassAdded].some(g => Math.hypot(g.x - x, g.z - z) < radius + g.width * .44 + .16)) continue;
          const row = { x, y: model.floor(x, z), z, width, height: .16 + rng() * .14, rotation: rng() * TAU,
            color: ['#889b72', '#8d9c79', '#718761'][Math.floor(rng() * 3)], sandHabitatPatch: patch.id };
          if (!grassFits(row)) continue;
          grassAdded.push(row);
          if (!grassKeys.has(key)) extraGrassKeys.add(key);
        } else {
          if ([...model.rubble, ...rubbleAdded].some(r => Math.hypot(r.x - x, r.z - z) < radius + r.width * .46 + .07)) continue;
          if ([...model.grass, ...grassAdded].some(g => Math.hypot(g.x - x, g.z - z) < radius + g.width * .44 + .05)) continue;
          const row = { x, y: model.floor(x, z), z, width, depth: width * (.75 + rng() * .3), height: .045 + rng() * .065,
            rotation: rng() * TAU, sandHabitatPatch: patch.id };
          if (fitRubble(row)) rubbleAdded.push(row);
        }
      }
      patches.push({ id: patch.id, x: patch.x, z: patch.z, grassCount: grassAdded.length - startGrass,
        rubbleCount: rubbleAdded.length - startRubble });
    }
    model.grass.push(...grassAdded);
    model.rubble.push(...rubbleAdded);
    model.sandHabitat = { patches, grass: grassAdded, rubble: rubbleAdded, newGrassBatches: extraGrassKeys.size,
      routeClearanceM: 2.1, role: 'authored-sediment-edge-display-not-biomass' };
    return model.sandHabitat;
  } finally {
    grassGeometry.dispose(); rubbleGeometry.dispose();
  }
}
