import { LIVING_SHALLOWS_PROFILE } from './livingShallows.js';

// Match the actual renderer, not only React's requested selector value.
export function demoWorldMatches(choice, world, snapshot) {
  if (!world || world.disposed || !snapshot || snapshot.biomeId !== world.biomeId) return false;
  if (choice.biome && choice.biome !== world.biomeId) return false;
  if (world.biomeId === 'reef' && choice.profile) {
    const living = choice.profile === LIVING_SHALLOWS_PROFILE;
    if (Boolean(world.isLivingShallows) !== living || (snapshot.sceneProfile === LIVING_SHALLOWS_PROFILE) !== living) return false;
  }
  return true;
}

// Reuse normal observation/navigation operations. No generation, population,
// clock, resource, environment or persistence reset belongs in this adapter.
export function navigateDemoEntry(choice, world, { movingDirector = false, directorEntryPlan = null, playing = true, playbackRate = 1 } = {}) {
  if (movingDirector) {
    world.directorEntryNotice = null;
    choice = resolveDirectorStop(choice, world);
  }
  if (movingDirector && directorEntryPlan?.kind === 'continuous')
    return world.beginDirectorEntry?.(directorEntryPlan, { playing, playbackRate }) === true;
  if (choice.kind === 'deep-stop') return world.biomeId==='deep'&&world.enterDeepSeascape?.(choice.stopId)===true;
  if (choice.kind === 'kelp-stop') return world.biomeId==='kelp'&&world.enterKelpForestBelt?.(choice.stopId)===true;
  if (choice.kind === 'living-stop') {
    const index = world.oceanChunks?.generator.routeStops?.findIndex(stop => stop.id === choice.stopId) ?? -1;
    return index >= 0 && world.enterLivingShallows(index);
  }
  if (choice.kind === 'world') {
    if (world.isLivingShallows) {
      const index=choice.entryStopId===undefined?0:world.oceanChunks?.generator.routeStops?.findIndex(stop=>stop.id===choice.entryStopId)??-1;
      return index>=0&&world.enterLivingShallows(index);
    }
    if (choice.entryStopId !== undefined) {
      if (world.biomeId === 'kelp') return world.enterKelpForestBelt?.(choice.entryStopId) === true;
      if (world.biomeId === 'deep') return world.enterDeepSeascape?.(choice.entryStopId) === true;
      return false;
    }
    // The moving shot takes ownership as soon as this entry is ready. Place
    // its fixed starting view now, before it clears any unfinished transition.
    if (world.biomeId === 'reef') {
      if (movingDirector) world.setView('wide', true);
      else world.setView('wide');
      return true;
    }
    world.startOceanExploration();
    world.setOceanOverview?.();
    return world.oceanExploring;
  }
  if (choice.kind === 'view') {
    if (movingDirector) world.setView(choice.view, true);
    else world.setView(choice.view);
    return true;
  }
  if (choice.kind === 'discoveries') {
    if (!world.isLivingShallows) return false;
    if (!world.oceanExploring) return world.enterLivingShallows(0);
    return true;
  }
  if (choice.kind === 'layer' || choice.kind === 'local-life') {
    if (!world.oceanExploring) world.startOceanExploration();
    // The director approaches this height in its real camera shot. Manual
    // observation buttons retain their existing safe, immediate placement.
    if (choice.kind === 'layer') return movingDirector
      ? world.oceanExploring && ['bed', 'midwater', 'surface'].includes(choice.layer)
      : world.setOceanObservationLayer(choice.layer);
    return movingDirector ? world.focusNearbyOceanAnimal(null, null, { director: true })
      : world.focusNearbyOceanAnimal(null);
  }
  return false;
}

// Authored macro routes can be absent for a valid procedural seed. Observe an
// existing native stop in the same biome; never reseed or create replacement
// animals just to satisfy a chapter. Manual shortcuts retain strict semantics.
export function resolveDirectorStop(choice, world) {
  const id = choice.stopId ?? choice.entryStopId;
  const generator = world.oceanChunks?.generator;
  if (!id || !generator) return choice;
  const alternatives = {
    'kelp-scene-forest': ['forest-belt-interior', 'kelp-bottom-life'],
    'kelp-scene-rockbed': ['kelp-understory-life'],
    'kelp-scene-opening': ['forest-belt-opening', 'kelp-near-bottom-life'],
    'kelp-scene-outer': ['kelp-water-life'],
    'forest-belt-interior': ['kelp-bottom-life'],
    'forest-belt-opening': ['kelp-near-bottom-life'],
    'deep-scene-plain': ['deep-plain-community', 'deep-bottom-life'],
    'deep-scene-slope': ['deep-slope-outcrop', 'deep-water-life'],
    'deep-scene-outcrop': ['deep-hard-life'],
    'deep-scene-outer': ['deep-water-life'],
    'deep-plain-community': ['deep-bottom-life'],
    'deep-slope-outcrop': ['deep-hard-life'],
  };
  if (!alternatives[id]) return choice;
  const keys = world.biomeId === 'kelp'
    ? ['forestRouteStops', 'kelpSeascapeRouteStops', 'kelpBenthicLifeRouteStops', 'kelpUnderstoryLifeRouteStops', 'kelpNearBottomLifeRouteStops', 'kelpWaterLifeRouteStops']
    : world.biomeId === 'deep'
      ? ['seascapeRouteStops', 'wholeSeascapeRouteStops', 'deepBenthicLifeRouteStops', 'deepHardLifeRouteStops', 'deepWaterLifeRouteStops'] : [];
  const stops = keys.flatMap(key => generator[key] ?? []);
  if (stops.some(stop => stop.id === id)) return choice;
  const replacement = alternatives[id].map(key => stops.find(stop => stop.id === key)).find(Boolean);
  if (!replacement) return choice;
  world.directorEntryNotice = `当前种子未形成此整景观察点，改为观察${replacement.label || '本海域已有生境'}。`;
  return { ...choice, ...(choice.stopId ? { stopId: replacement.id } : { entryStopId: replacement.id }) };
}
