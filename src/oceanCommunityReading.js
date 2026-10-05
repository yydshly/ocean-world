// Read the actual loaded community without changing agents or ecological state.
const compareIds = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const distanceTo = (agent, camera) => {
  const p = agent.position;
  return [p?.x, p?.y, p?.z, camera?.x, camera?.y, camera?.z].every(Number.isFinite)
    ? Math.hypot(p.x - camera.x, p.y - camera.y, p.z - camera.z) : Infinity;
};
const lookupSpecies = (catalog, id) => catalog instanceof Map ? catalog.get(id) : catalog.find(species => species.id === id);

/** regionId restricts selection to that exact loaded region. No result in a
 * requested region must remain no result, even when a neighbour has that animal. */
export function nearestOceanAnimal(agents, cameraPosition, { speciesId = null, regionId = null } = {}) {
  let chosen = null, nearestDistance = Infinity;
  for (const agent of agents || []) {
    if (agent.alive !== true || !agent.regionId || (speciesId !== null && agent.speciesId !== speciesId) ||
      (regionId !== null && agent.regionId !== regionId)) continue;
    const distance = distanceTo(agent, cameraPosition);
    if (distance < nearestDistance || (chosen && distance === nearestDistance && compareIds(agent.id, chosen.id) < 0)) {
      chosen = agent;
      nearestDistance = distance;
    }
  }
  return chosen;
}

/** Counts are individual records, not inferred from landscape labels. Activity
 * states are kept separate from successful intake records. */
export function oceanCommunityReading({ agents = [], regionId, cameraPosition, catalog = [], loaded = false } = {}) {
  const species = new Map(), activityCounts = {};
  let livingAnimals = 0;
  for (const agent of agents) {
    if (agent.alive !== true || agent.regionId !== regionId) continue;
    livingAnimals++;
    if (agent.state) activityCounts[agent.state] = (activityCounts[agent.state] || 0) + 1;
    let entry = species.get(agent.speciesId);
    if (!entry) {
      entry = { speciesId: agent.speciesId, commonName: lookupSpecies(catalog, agent.speciesId)?.commonName || null,
        count: 0, nearestAgentId: null, nearestDistanceM: Infinity };
      species.set(agent.speciesId, entry);
    }
    entry.count++;
    const distance = distanceTo(agent, cameraPosition);
    if (distance < entry.nearestDistanceM || (entry.nearestAgentId && distance === entry.nearestDistanceM &&
      compareIds(agent.id, entry.nearestAgentId) < 0)) {
      entry.nearestDistanceM = distance;
      entry.nearestAgentId = agent.id;
    }
  }
  const entries = [...species.values()].sort((a, b) => b.count - a.count ||
    a.nearestDistanceM - b.nearestDistanceM || compareIds(a.speciesId, b.speciesId));
  return { status: loaded ? livingAnimals ? 'ready' : 'empty' : 'loading',
    livingAnimals, speciesCount: entries.length, speciesIds: entries.map(entry => entry.speciesId),
    species: entries, representatives: entries.filter(entry => entry.commonName && entry.nearestAgentId).slice(0, 3), activityCounts };
}
