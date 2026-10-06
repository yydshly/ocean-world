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
export function navigateDemoEntry(choice, world, { movingDirector = false } = {}) {
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
    return world.focusNearbyOceanAnimal(null);
  }
  return false;
}
