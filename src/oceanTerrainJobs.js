import { createLivingShallowsGenerator } from './livingShallowsGeneration.js';
import { withWholeSeabedGenerator } from './wholeSeabedComposition.js';
import { sampleReefValleyRegion } from './reefValleyRegion.js';
import { sampleSeagrassMeadowRegion } from './seagrassMeadowRegion.js';
import { sampleLivingCoastalSeascape } from './livingCoastalSeascape.js';
import { sampleLivingShallowSeascape } from './livingShallowSeascape.js';
import { sampleLivingHabitatBelt } from './livingHabitatBelt.js';
import { livingSeabedFloorVertex, sampleLivingSeabedRelief } from './livingSeabedRelief.js';
import { buildOceanTerrainBuffers } from './world/oceanTerrainBuffers.js';
const SAMPLERS={3:sampleLivingSeabedRelief,4:sampleLivingSeabedRelief,5:sampleLivingHabitatBelt,
  6:sampleLivingShallowSeascape,7:sampleLivingCoastalSeascape,8:sampleReefValleyRegion,9:sampleSeagrassMeadowRegion};
const FLOOR_VERSIONS=new Set([3,4,6,7,8,9]);

// Read-only copies of the committed 3×3 render neighbourhood. There is no
// ecology, disk, owner registry or mechanism for publishing candidate plans.
export function createOceanTerrainJobs() {
  let base, seed, wholeSeabed;
  return function run(payload) {
    const { cx, cz, chunks } = payload;
    if (![cx, cz].every(Number.isSafeInteger) || !Array.isArray(chunks) || chunks.length !== 9)
      throw new TypeError('Terrain preparation requires nine source owners.');
    const byId = new Map();
    for (const chunk of chunks) {
      if (!chunk || ![chunk.cx, chunk.cz].every(Number.isSafeInteger) || chunk.id !== `${chunk.cx},${chunk.cz}` ||
          Math.abs(chunk.cx-cx)>1 || Math.abs(chunk.cz-cz)>1 || byId.has(chunk.id) ||
          chunk.size !== 64 || !Array.isArray(chunk.elements) || chunk.elements.length > 600 ||
          chunk.ridgePlan && ![1,2,3,4,5,6,7,8,9].includes(chunk.ridgePlan.version))
        throw new TypeError(`Invalid committed terrain neighbourhood at ${chunk?.id}.`);
      byId.set(chunk.id, chunk);
    }
    if (!base || !Object.is(seed, payload.seed) || wholeSeabed !== (payload.wholeSeabed === true)) {
      seed=payload.seed; wholeSeabed=payload.wholeSeabed === true;
      base=withWholeSeabedGenerator(createLivingShallowsGenerator(seed), wholeSeabed);
    }
    const planAt=(x,z)=>byId.get(`${Math.floor(x/64)},${Math.floor(z/64)}`)?.ridgePlan;
    const generator={ baseGenerator:base,
      chunk(x,z) { const chunk=byId.get(`${x},${z}`); if(!chunk)throw new RangeError('Terrain query exceeds its nine source owners.'); return chunk; },
      sample(x,z) {
        const plan=planAt(x,z),sampler=SAMPLERS[plan?.version];
        return sampler ? sampler(base,plan,x,z) : base.sample(x,z);
      },
      floorVertex(x,z) { const plan=planAt(x,z); return FLOOR_VERSIONS.has(plan?.version)
        ? livingSeabedFloorVertex(base,plan,x,z) : base.floorVertex(x,z); }
    };
    return buildOceanTerrainBuffers(generator, byId.get(`${cx},${cz}`), { livingShallows:true, sandHabitat:payload.sandHabitat===true });
  };
}

export function oceanTerrainTransferList(buffers) {
  return Object.values(buffers).filter(ArrayBuffer.isView).map(array=>array.buffer);
}

// A malformed reply never becomes a collision surface or an apparently ready
// owner. Keep the same complete 65×65 geometry, including every colour mask.
export function validateOceanTerrainBuffers(buffers, sandHabitat) {
  const counts={positions:12675,normals:12675,colors:12675,uvs:8450,indices:24576};
  if(!buffers || Object.keys(buffers).length!==6)return false;
  for(const [name,count]of Object.entries(counts)) {
    const array=buffers[name],type=name==='indices'?Uint16Array:Float32Array;
    if(!(array instanceof type)||array.length!==count||!array.every(Number.isFinite))return false;
  }
  if(!buffers.indices.every(i=>i<4225))return false;
  return sandHabitat ? buffers.sandMasks instanceof Float32Array && buffers.sandMasks.length===12675 &&
    buffers.sandMasks.every(Number.isFinite) : buffers.sandMasks===null;
}
