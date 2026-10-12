import { createLivingShallowsGenerator } from './livingShallowsGeneration.js';
import { withWholeSeabedGenerator } from './wholeSeabedComposition.js';
import { createLivingRidgeGenerator } from './livingRidgeGeology.js';
import { OceanEcology } from './oceanEcology.js';

// Only computation runs here. Admissions, storage and authoritative publication
// stay on the main model. Input and output are complete native records.
export function createOceanRuntimeJobs() {
  let ecology = null, contextKey = null, topology = null, owners = null;
  return payload => {
    const key = JSON.stringify([payload.seed, payload.wholeSeabed, payload.options]);
    if (key !== contextKey) {
      const base = withWholeSeabedGenerator(createLivingShallowsGenerator(payload.seed), payload.wholeSeabed);
      ecology = new OceanEcology(payload.seed, createLivingRidgeGenerator(base), {
        ...payload.options, store: { saveMany: () => { throw new Error('Runtime worker cannot save records.'); } },
      });
      ecology.checkpoint = () => Promise.resolve();
      contextKey = key; topology = owners = null;
    }
    if (payload.topology !== topology) {
      ecology.generator.replaceRidgeOwners(payload.plans, payload.legacyIds);
      ecology._supportCells.clear(); ecology._runtimePoseCache = null; ecology._planktonFaces.clear();
      topology = payload.topology;
    }
    const ids = JSON.stringify(payload.rows.map(row => row.id));
    const previous = ecology._active;
    ecology._active = new Map(payload.rows.map(row => {
      const existing = previous.get(row.id);
      if (!existing) return [row.id, row];
      for (const field of Object.keys(existing)) if (!Object.hasOwn(row, field)) delete existing[field];
      Object.assign(existing, row);
      return [row.id, existing];
    }));
    if (ids !== owners) { ecology._runtimePoseCache = null; owners = ids; }
    ecology._lockedRegions = new Set(payload.locked);
    ecology._planktonDesiredRegions = new Set(payload.desired);
    ecology._sceneSupports = new Map(payload.sceneSupports);
    ecology._habitatSupports = new Map(payload.habitatSupports);
    ecology._macroSupports = new Map(payload.macroSupports);
    ecology._biodiversityBirthView = payload.birthView;
    ecology._activeTime = payload.activeTime;
    ecology._accumulator = payload.accumulator;
    if (payload.kind === 'support') return ecology._validateSupportHistory(payload.validationRows);
    if (payload.kind === 'active') {
      for (const [id, row] of payload.validationRows) {
        ecology._validateActiveHistory(row, id, payload.valid);
        ecology._validateRestoredMobileHistory(row, id, payload.valid);
      }
      return true;
    }
    const start = performance.now();
    for (const frame of payload.frames) ecology.step(frame.deltaSec, frame.environment);
    return { rows: [...ecology._active.values()], activeTime: ecology._activeTime,
      accumulator: ecology._accumulator, planktonLastStep: ecology._planktonLastStep,
      planktonFaces: [...ecology._planktonFaces], computationMs: performance.now() - start };
  };
}
