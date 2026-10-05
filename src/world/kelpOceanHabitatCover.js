export const KELP_HABITAT_BIN_M = 8;
export const KELP_HABITAT_MAX_SUPPORT_RADIUS_M = 8;
const clamp01 = value => Math.max(0, Math.min(1, value));
const smooth = value => { const t = clamp01(value); return t * t * (3 - 2 * t); };
const byId = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const finiteXZ = element => Number.isFinite(element?.x) && Number.isFinite(element?.z);

/** Read-only display coverage around existing scenery. The index is local to
 * this chunk's terrain vertices, includes its eight neighbours, and is never
 * a plant census, measured bottom cover, substrate support or food stock. */
export function createKelpOceanHabitatCover(generator, chunk) {
  if (typeof generator?.chunk !== 'function' || typeof generator?.sample !== 'function' ||
      !Number.isSafeInteger(chunk?.cx) || !Number.isSafeInteger(chunk?.cz)) {
    throw new TypeError('Kelp habitat cover requires a generator and a terrain chunk.');
  }
  const rocks = new Map(), roots = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const neighbour = dx === 0 && dz === 0 ? chunk : generator.chunk(chunk.cx + dx, chunk.cz + dz);
    for (const element of neighbour.elements) {
      if (element.kind === 'rock' && typeof element.id === 'string' && finiteXZ(element) &&
          Number.isFinite(element.scale?.x) && Number.isFinite(element.scale?.z) &&
          element.scale.x > 0 && element.scale.z > 0) rocks.set(element.id, element);
      else if (element.kind === 'kelp' && typeof element.id === 'string' && finiteXZ(element)) roots.push(element);
    }
  }

  const rootGroups = new Map();
  for (const root of roots.sort(byId)) {
    const rock = rocks.get(root.hostId);
    if (!rock) continue;
    const angle = Number.isFinite(rock.rotation) ? rock.rotation : 0;
    const cos = Math.cos(angle), sin = Math.sin(angle), dx = root.x - rock.x, dz = root.z - rock.z;
    const lx = dx * cos - dz * sin, lz = dx * sin + dz * cos;
    // A host ID alone cannot turn an unrelated, distant root into a forest.
    if (Math.hypot(lx / (rock.scale.x * .5), lz / (rock.scale.z * .5)) > 1) continue;
    let group = rootGroups.get(rock.id);
    if (!group) { group = []; rootGroups.set(rock.id, group); }
    group.push(root);
  }

  const bins = new Map();
  let actualMaximumRadiusM = 0, validRootCount = 0;
  const add = entry => {
    const key = `${Math.floor(entry.x / KELP_HABITAT_BIN_M)},${Math.floor(entry.z / KELP_HABITAT_BIN_M)}`;
    let items = bins.get(key);
    if (!items) { items = []; bins.set(key, items); }
    items.push(entry); actualMaximumRadiusM = Math.max(actualMaximumRadiusM, entry.radius);
  };
  for (const rock of [...rocks.values()].sort(byId)) {
    const angle = Number.isFinite(rock.rotation) ? rock.rotation : 0;
    const rx = Math.min(7.1, rock.scale.x * .5), rz = Math.min(7.1, rock.scale.z * .5);
    const edgeX = rx + .9, edgeZ = rz + .9;
    add({ kind: 'hard', x: rock.x, z: rock.z, rx, rz, edgeX, edgeZ,
      cos: Math.cos(angle), sin: Math.sin(angle), radius: Math.max(edgeX, edgeZ) });
    const group = rootGroups.get(rock.id);
    if (!group?.length) continue;
    validRootCount += group.length;
    const width = Math.max(rock.scale.x, rock.scale.z);
    // One union zone per real host group avoids counting representative
    // fronds or multiple roots as extra biomass. Neighbouring zones can join.
    add({ kind: 'forest', x: group.reduce((sum, root) => sum + root.x, 0) / group.length,
      z: group.reduce((sum, root) => sum + root.z, 0) / group.length,
      core: Math.min(3.5, 2.65 + width * .1), radius: Math.min(8, 4.35 + width * .15) });
  }

  const stats = Object.freeze({ sourceChunkCount: 9, sourceRockCount: rocks.size,
    validRootCount, rootGroupCount: rootGroups.size, binCount: bins.size,
    binSizeM: KELP_HABITAT_BIN_M, maxSupportRadiusM: KELP_HABITAT_MAX_SUPPORT_RADIUS_M,
    actualMaximumRadiusM, queryBinCount: 9 });

  return Object.freeze({ stats, sample(x, z, state = undefined) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) throw new RangeError('Kelp cover coordinates must be finite.');
    const authoredBlend = smooth((Math.hypot(x, z) - 40) / 56);
    if (authoredBlend === 0) return { forest: 0, hardBottom: 0, opening: 0, authoredBlend: 0 };
    const local = state ?? generator.sample(x, z);
    if (!Number.isFinite(local?.forestCover) || !Number.isFinite(local?.rockiness)) {
      throw new TypeError('Kelp cover fields must be finite at the sampled coordinates.');
    }
    const bx = Math.floor(x / KELP_HABITAT_BIN_M), bz = Math.floor(z / KELP_HABITAT_BIN_M);
    let forestEnvelope = 0, hardEnvelope = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      for (const entry of bins.get(`${bx + dx},${bz + dz}`) ?? []) {
        const px = x - entry.x, pz = z - entry.z, distance2 = px * px + pz * pz;
        if (distance2 >= entry.radius * entry.radius) continue;
        if (entry.kind === 'forest') {
          forestEnvelope = Math.max(forestEnvelope, 1 - smooth((Math.sqrt(distance2) - entry.core) / (entry.radius - entry.core)));
        } else {
          const lx = px * entry.cos - pz * entry.sin, lz = px * entry.sin + pz * entry.cos;
          const core = Math.hypot(lx / entry.rx, lz / entry.rz);
          if (core <= 1) hardEnvelope = 1;
          else {
            const edge = Math.hypot(lx / entry.edgeX, lz / entry.edgeZ);
            if (edge < 1) hardEnvelope = Math.max(hardEnvelope, 1 - smooth((core - 1) / (core - edge)));
          }
        }
      }
    }
    const forest = forestEnvelope * (.55 + .45 * clamp01(local.forestCover));
    const hardBottom = hardEnvelope * (.65 + .35 * clamp01(local.rockiness)) * (1 - forest);
    const opening = clamp01(1 - forest - hardBottom);
    return { forest: forest * authoredBlend, hardBottom: hardBottom * authoredBlend,
      opening: opening * authoredBlend, authoredBlend };
  } });
}
