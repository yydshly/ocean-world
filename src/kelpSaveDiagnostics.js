import { KELP_SEASCAPE_OWNERS } from './kelpSeascape.js';

// A failed restore must remain inspectable without flushing, repairing,
// regenerating, or deleting its original records. Include the offscreen
// aligned forest owners that admission validates before publishing the 9 cells.
export async function readKelpSaveDiagnostics({ store, worldKey, seed, position, error = '', isCurrent = () => true }) {
  if (!store || store.available === false || typeof store.loadMany !== 'function')
    throw new Error('浏览器海域存储不可读，原记录未改动。');
  if (typeof worldKey !== 'string' || !worldKey || !position ||
      !Number.isFinite(position.x) || !Number.isFinite(position.z))
    throw new Error('海域诊断缺少当前坐标。');
  const cx = Math.floor(position.x / 64), cz = Math.floor(position.z / 64);
  if (![cx - 2, cx + 2, cz - 2, cz + 2].every(Number.isSafeInteger))
    throw new Error('海域诊断坐标超出安全范围。');
  const checkCurrent = () => {
    if (typeof isCurrent !== 'function' || isCurrent() !== true)
      throw new Error('海域已经切换或重新准备，请在当前海域重新导出。');
  };
  const requested = [], halo = new Set();
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    requested.push(`${cx + dx},${cz + dz}`);
    const gx = Math.floor((cx + dx) / 2) * 2, gz = Math.floor((cz + dz) / 2) * 2;
    for (let z = 0; z < 2; z++) for (let x = 0; x < 2; x++) halo.add(`${gx + x},${gz + z}`);
  }
  const read = async ids => {
    checkCurrent();
    const result = await store.loadMany(worldKey, ids);
    checkCurrent();
    if (!(result instanceof Map) || ids.some(id => !result.has(id) || result.get(id) === undefined))
      throw new Error('海域诊断读取未完成，原记录未改动。');
    return result;
  };
  const rows = await read([...halo]);
  let transactions = 1;
  const seascapeMarked = row => row && (row.forestBeltVersion === 2 || row.forestBeltPlan?.version === 2 ||
    ['kelpSeascapeVersion', 'kelpSeascapeGroupId', 'kelpSeascapeInitializedAtSec'].some(key => Object.hasOwn(row, key)));
  if (requested.some(id => KELP_SEASCAPE_OWNERS.includes(id)) || [...rows.values()].some(seascapeMarked)) {
    const extra = KELP_SEASCAPE_OWNERS.filter(id => !rows.has(id));
    if (extra.length) {
      for (const [id, row] of await read(extra)) rows.set(id, row);
      transactions++;
    }
  }
  checkCurrent();
  return {
    schema: 'tidal-kelp-save-diagnostics-v1',
    biomeId: 'kelp', seed, seedType: typeof seed, worldKey,
    timestamp: new Date().toISOString(), position: { x: position.x, z: position.z },
    center: { cx, cz }, requestedOwnerIds: requested, ownerIds: [...rows.keys()],
    error: String(error).slice(0, 2000), readonlyTransactions: transactions,
    scope: 'Original disk records for this bounded admission window. No save, flush, restore, generation or deletion; multiple reads are not one atomic snapshot.',
    records: [...rows].map(([ownerId, record]) => ({ ownerId, record: structuredClone(record) })),
  };
}
