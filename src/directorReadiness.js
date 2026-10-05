import { demoWorldMatches } from './demoNavigation.js';
import { LIVING_SHALLOWS_PROFILE } from './livingShallows.js';

/** This only acknowledges the actual applied scene. The player owns dwell,
 * cancellation and panel result tokens; focus transitions may keep moving. */
export function directorSceneReady(choice, world, snapshot, { panelReady = false } = {}) {
  if (!choice || !demoWorldMatches(choice, world, snapshot)) return false;
  // Current-world tools do not request a profile, but must still reject an old
  // shallow snapshot delivered while the renderer changes its actual profile.
  if (world.biomeId === 'reef' && !demoWorldMatches({
    profile: world.isLivingShallows ? LIVING_SHALLOWS_PROFILE : 'legacy',
  }, world, snapshot)) return false;
  if (choice.kind === 'population' && panelReady !== true) return false;
  if (!snapshot.ocean?.exploring) return true;
  const { ecology, localHabitat, chunkId } = snapshot.ocean;
  if (ecology?.metrics?.loadingRegions !== 0 || !(ecology.metrics.activeRegions > 0) ||
    !['ready', 'empty'].includes(localHabitat?.status) || typeof chunkId !== 'string' ||
    !Array.isArray(ecology.regions)) return false;
  const coordinates = chunkId.split(',').map(Number), [cx, cz] = coordinates;
  if (coordinates.length !== 2 || !coordinates.every(Number.isSafeInteger) || `${cx},${cz}` !== chunkId ||
    ![cx - 1, cx + 1, cz - 1, cz + 1].every(Number.isSafeInteger)) return false;
  // An old nine-owner window can still include the new centre while its exit
  // save is pending. A count alone does not prove the requested window loaded.
  const resident = new Set(ecology.regions.map(region => region?.id));
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    if (!resident.has(`${cx + dx},${cz + dz}`)) return false;
  }
  return true;
}
