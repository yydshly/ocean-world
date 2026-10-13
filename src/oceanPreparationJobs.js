import { prepareReefResidentHabitat } from './oceanReefResidents.js';
import { withWholeSeabedGenerator } from './wholeSeabedComposition.js';
import { createLivingShallowsGenerator } from './livingShallowsGeneration.js';
import { createLivingRidgeGenerator, validateLivingRidgePlan } from './livingRidgeGeology.js';
import { createReefValleyRegionPlans, REEF_VALLEY_REGION_LAYOUT } from './reefValleyRegion.js';
import { createSeagrassMeadowRegionPlans } from './seagrassMeadowRegion.js';
import { OceanEcology } from './oceanEcology.js';
import { validateLivingNetworkRecord } from './livingEcologyNetwork.js';
import { validateMeadowAnimalBelt } from './meadowAnimalBelt.js';

// This module has no storage, DOM, render loop or shared live-world references.
export function createOceanPreparationJobs() {
  let base = null, seed, wholeSeabed;
  const contexts=new Map(), retained=new Map(), contextLimit=REEF_VALLEY_REGION_LAYOUT.maximumCachedGroups;
  const certifiedPlans=new Map(), planLimit=contextLimit*12;
  let planHits=0, planValidations=0;
  const certify=plan=>{
    const key=JSON.stringify(plan);
    if(certifiedPlans.has(key)){certifiedPlans.delete(key);certifiedPlans.set(key,true);planHits++;return true;}
    planValidations++;
    const valid=validateLivingRidgePlan(plan,base);
    if(valid){if(certifiedPlans.size>=planLimit)certifiedPlans.delete(certifiedPlans.keys().next().value);certifiedPlans.set(key,true);}
    return valid;
  };
  const lifetime=crypto.randomUUID(); let nextContext=0;
  let contextHits=0, contextValidations=0;
  const run=function run(kind, payload) {
    if (!base || !Object.is(seed, payload.seed) || wholeSeabed !== (payload.wholeSeabed === true)) { seed = payload.seed; wholeSeabed = payload.wholeSeabed === true; base = withWholeSeabedGenerator(createLivingShallowsGenerator(seed), wholeSeabed); contexts.clear(); retained.clear(); certifiedPlans.clear(); }
    if (kind === 'generate') {
      const { version, cx, cz } = payload;
      if (![8, 9].includes(version) || ![cx, cz].every(Number.isSafeInteger)) throw new TypeError('Invalid background macro-region request.');
      return (version === 8 ? createReefValleyRegionPlans : createSeagrassMeadowRegionPlans)(base, cx, cz);
    }
    let plans = payload.plans;
    if (kind === 'validate-plans') {
      if (!Array.isArray(plans) || plans.length > 25 || plans.some(p => !Number.isInteger(p?.version) || p.version < 1 || p.version > 9))
        throw new TypeError('Invalid background saved-plan request.');
      return plans.map(certify);
    }
    if (payload.contextToken !== undefined && (plans !== undefined || !['history','resident-habitats'].includes(kind)))
      throw new TypeError('Invalid retained physical context request.');
    let entry;
    if (payload.contextToken !== undefined) {
      entry=retained.get(payload.contextToken);
      if (!entry) throw new TypeError('Unknown or expired physical context.');
      plans=entry.plans;
      contexts.delete(entry.key); contexts.set(entry.key,entry); contextHits++;
    } else {
      if (!Array.isArray(plans) || plans.length > 25 || plans.some(p => ![7, 8, 9].includes(p?.version))) throw new TypeError('Invalid background plan batch.');
      // Only complete, immutable terrain is cached. The full serialized source
      // must match, including owner order and every height, support and element.
      // Each history/birth still runs against fresh independent animal records.
      const key=JSON.stringify(plans);
      entry=contexts.get(key);
      if(entry) { contexts.delete(key); contexts.set(key,entry); contextHits++; }
      else {
        const generator=createLivingRidgeGenerator(base);
        const withContext=plans[0]?.version===7 ? generator.prepareCoastalSeascapeContext(plans) : plans[0]?.version===8 ? generator.prepareReefValleyContext(plans) : generator.prepareMeadowRegionContext(plans);
        entry={generator,withContext,key,plans:withContext.immutablePlans,token:`${lifetime}:${++nextContext}`}; contextValidations++;
        // A complete validated group also certifies these exact static sources.
        // Keep only a bounded serialized source key, never animal/history data.
        for(const plan of entry.plans){const source=JSON.stringify(plan);certifiedPlans.delete(source);if(certifiedPlans.size>=planLimit)certifiedPlans.delete(certifiedPlans.keys().next().value);certifiedPlans.set(source,true);}
        if(contexts.size>=contextLimit) {
          const oldest=contexts.keys().next().value;
          retained.delete(contexts.get(oldest).token); contexts.delete(oldest);
        }
        contexts.set(key,entry);
        retained.set(entry.token,entry);
      }
    }
    const {generator,withContext}=entry;
    if (kind === 'validate-group') return payload.retainContext === true ? {valid:true,contextToken:entry.token} : true;
    if (kind === 'birth') {
      if (!plans.every(plan => [8, 9].includes(plan.version))) throw new TypeError('Background macro births require version 8 or 9.');
      if (payload.options?.sceneElements || payload.options?.habitatScenes || payload.options?.macroLandscape)
        throw new TypeError('Background births require isolated native macro scenery.');
      const refuseWrite = () => { throw new Error('Background preparation cannot persist records.'); };
      const ecology = new OceanEcology(payload.ecologySeed, generator, { ...payload.options, store: { saveMany: refuseWrite } });
      ecology.setEnvironment(payload.environment);
      return withContext(() => plans.map(plan => {
        ecology._supportCells.clear();
        const { region } = ecology._prepareRegion(null, [plan.cx, plan.cz], false, plan.version === 8);
        region.livingRidgePlan = structuredClone(plan);
        const prefix = plan.version === 8 ? 'reefValleyRegion' : 'meadowRegion';
        region[`${prefix}Version`] = 1; region[`${prefix}GroupId`] = `${plan.group.cx},${plan.group.cz}`;
        region[`${prefix}InitializedAtSec`] = 0;
        if (!plan.group.ownerIds.includes(region.id) || !validateLivingNetworkRecord(region) || ecology._residentCount(region) > 20 ||
            (plan.version === 9 && !validateMeadowAnimalBelt(region, generator))) throw new Error('Invalid background fresh community.');
        return region;
      }));
    }
    if (kind === 'resident-habitats') {
      if (!Array.isArray(payload.rows) || payload.rows.length > 12 || new Set(payload.rows.map(r => r.id)).size !== payload.rows.length)
        throw new TypeError('Invalid background resident habitat batch.');
      const byId = new Map(plans.map(p => [p.id, p]));
      const ecology = new OceanEcology(payload.ecologySeed, generator, { store: {} });
      const options = { surface: (x, z, coral) => ecology._surface(x, z, coral, true, true, true, true, true, false),
        bed: (x, z) => ecology._bed(x, z), habitatOrder: withContext.cacheReefHabitatOrder };
      return withContext(() => {
        for (const row of payload.rows) {
          if (!byId.has(row.id)) throw new TypeError('Unknown background resident habitat owner.');
          row.livingRidgePlan = byId.get(row.id);
          prepareReefResidentHabitat(row, generator, options);
        }
        return withContext.cacheReefHabitatOrder.exportEntries(payload.rows);
      });
    }
    if (kind === 'history') {
      if (!Array.isArray(payload.rows) || payload.rows.length > 12) throw new TypeError('Invalid background history batch.');
      const byId = new Map(plans.map(p => [p.id, p]));
      const ecology = new OceanEcology(payload.ecologySeed, generator, { store: {} });
      // This request has one immutable terrain context and no simulated ticks.
      // Reuse exact bounded physical queries across birth/current checks, as
      // the native integrator does within one tick. Never cache record verdicts
      // or carry these maps into another history request.
      ecology._historyTerrainCanonical=(row,compute)=>withContext.cacheBiodiversityPlan(row,ecology.livingNetworkEnabled,compute);
      return withContext(() => payload.rows.every(row => {
        if (!byId.has(row.id)) return false;
        // Terrain is sent once for the batch; all other saved fields are exact.
        row.livingRidgePlan = byId.get(row.id); ecology._supportCells.clear();
        // Legacy coastal records keep their original full composite validators.
        return ecology._withHistoryQueries(row,()=>ecology._validCoastalHistory(row, row.id, plans[0].version !== 7, withContext.cacheReefHabitatOrder));
      }));
    }
    throw new TypeError('Unknown ocean preparation job.');
  };
  run.stats=()=>({contextHits,contextValidations,contexts:contexts.size,contextLimit,planHits,planValidations,certifiedPlans:certifiedPlans.size,planLimit,
    groups:[...contexts.values()].map(entry=>entry.plans[0].group.id)});
  return run;
}
