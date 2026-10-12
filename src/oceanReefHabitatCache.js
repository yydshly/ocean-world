// One capability belongs to one complete, validated immutable terrain context.
// Only geometry-derived ranking is memoized; animal/history verdicts never are.
export function reefHabitatCacheKey(row, epoch = row.reefResidentsVersion) {
  return JSON.stringify([row.id, row.cx, row.cz, epoch, row.biodiversity?.patches ?? []]);
}
const eligible = row => Number.isInteger(row.reefResidentsVersion) && row.reefResidentsVersion >= 7 && row.reefResidentsVersion <= 20;
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
export function createReefHabitatValidationCache() {
  const entries = new Map(), limit = 12;
  let hits = 0, computations = 0;
  const put = (key, order) => {
    if (!order || !Array.isArray(order.candidateOrder) || !order.candidateOrder.every(id => typeof id === 'string') ||
      !order.habitatEvidence || typeof order.habitatEvidence !== 'object' || Array.isArray(order.habitatEvidence))
      throw new TypeError('Invalid background reef habitat geometry.');
    const saved = freeze(structuredClone(order));
    entries.delete(key);
    if (entries.size >= limit) entries.delete(entries.keys().next().value);
    entries.set(key, saved);
    return saved;
  };
  const cache = (row, epoch, compute) => {
    const key = reefHabitatCacheKey(row, epoch);
    if (entries.has(key)) {
      const value = entries.get(key); entries.delete(key); entries.set(key, value); hits++;
      return value;
    }
    const value = compute();
    if (value?.then) throw new TypeError('Reef habitat geometry must be computed synchronously.');
    computations++;
    return put(key, value);
  };
  cache.exportEntries = rows => rows.filter(eligible).map(row => {
    const key = reefHabitatCacheKey(row);
    if (!entries.has(key)) throw new TypeError('Missing background reef habitat geometry.');
    return { key, order: entries.get(key) };
  });
  cache.importEntries = (input, rows) => {
    const wanted = new Set(rows.filter(eligible).map(row => reefHabitatCacheKey(row)));
    if (!Array.isArray(input) || input.length !== wanted.size || input.length > limit ||
      new Set(input.map(entry => entry?.key)).size !== input.length || input.some(entry => !wanted.has(entry?.key)))
      throw new TypeError('Mismatched background reef habitat geometry.');
    // Check the complete reply before accepting any entry.
    for (const { order } of input) if (!order || !Array.isArray(order.candidateOrder) ||
      !order.candidateOrder.every(id => typeof id === 'string') || !order.habitatEvidence ||
      typeof order.habitatEvidence !== 'object' || Array.isArray(order.habitatEvidence))
      throw new TypeError('Invalid background reef habitat geometry.');
    for (const { key, order } of input) put(key, order);
  };
  cache.stats = () => ({ entries: entries.size, limit, hits, computations });
  return cache;
}
