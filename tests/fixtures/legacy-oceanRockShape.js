// The rendered rock and every support query share these exact Float32 vertices.
// Profiles describe broad forms rather than surface texture or surveyed geology.
export const OCEAN_ROCK_SURFACE_VERSION = 2;
export const OCEAN_ROCK_PROFILES = Object.freeze(['mound', 'terrace', 'ridge']);
// New scene profiles have a separate identity: historic meshes and their
// three-profile registry must remain byte-for-byte compatible with old saves.
export const LIVING_SHALLOWS_ROCK_PROFILES = Object.freeze(['natural-a', 'natural-b', 'natural-c']);
const NATURAL_SECTORS = 32;
const NATURAL_RADII = Object.freeze([.065, .13, .22, .32, .43, .55, .67, .78, .89, 1]);
const SECTORS = 16;
const RADII = Object.freeze([.09, .18, .27, .34, .43, .5]);
const ANGLE = Math.PI * 2 / SECTORS;
const EPSILON = 1e-10;
const meshes = new Map();
const rockTransforms = new WeakMap();

function profileHeight(profile, x, z, ring) {
  const radius = Math.hypot(x, z);
  if (ring === RADII.length) return 0;
  if (profile === 'terrace') {
    // A broad upper platform, steep shoulder and a lower shelf.
    if (ring <= 3) return .86;
    const angle = Math.atan2(z, x);
    return ring === 4 ? .44 + .035 * Math.sin(angle) : .30 + .025 * Math.sin(angle * 2);
  }
  const dome = Math.sqrt(Math.max(0, 1 - (radius * 2) ** 2));
  if (profile === 'ridge') return dome * (.18 + .82 * Math.exp(-((z / .105) ** 2)));
  return dome;
}

function getMesh(profile) {
  if (LIVING_SHALLOWS_ROCK_PROFILES.includes(profile)) return getNaturalMesh(profile);
  if (!OCEAN_ROCK_PROFILES.includes(profile)) throw new RangeError(`Unknown ocean rock profile: ${profile}`);
  if (meshes.has(profile)) return meshes.get(profile);
  const positions = [0, Math.fround(profileHeight(profile, 0, 0, 0)), 0], indices = [];
  for (let ring = 0; ring < RADII.length; ring++) for (let sector = 0; sector < SECTORS; sector++) {
    const angle = sector * ANGLE, x = Math.cos(angle) * RADII[ring], z = Math.sin(angle) * RADII[ring];
    positions.push(Math.fround(x), Math.fround(profileHeight(profile, x, z, ring + 1)), Math.fround(z));
  }
  const vertex = (ring, sector) => 1 + (ring - 1) * SECTORS + (sector % SECTORS);
  for (let sector = 0; sector < SECTORS; sector++) indices.push(0, vertex(1, sector + 1), vertex(1, sector));
  for (let ring = 2; ring <= RADII.length; ring++) for (let sector = 0; sector < SECTORS; sector++) {
    indices.push(vertex(ring - 1, sector), vertex(ring - 1, sector + 1), vertex(ring, sector));
    indices.push(vertex(ring - 1, sector + 1), vertex(ring, sector + 1), vertex(ring, sector));
  }
  const faces = [];
  for (let triangle = 0; triangle < indices.length / 3; triangle++) {
    const a = indices[triangle * 3] * 3, b = indices[triangle * 3 + 1] * 3, c = indices[triangle * 3 + 2] * 3;
    const abx = positions[b] - positions[a], aby = positions[b + 1] - positions[a + 1], abz = positions[b + 2] - positions[a + 2];
    const acx = positions[c] - positions[a], acy = positions[c + 1] - positions[a + 1], acz = positions[c + 2] - positions[a + 2];
    const nx = aby * acz - abz * acy, ny = abz * acx - abx * acz, nz = abx * acy - aby * acx;
    const length = Math.hypot(nx, ny, nz);
    faces.push({ a, b, c,
      denominator: (positions[b + 2] - positions[c + 2]) * (positions[a] - positions[c]) +
        (positions[c] - positions[b]) * (positions[a + 2] - positions[c + 2]),
      normal: Object.freeze({ x: nx / length, y: ny / length, z: nz / length }) });
  }
  const mesh = Object.freeze({ positions: Object.freeze(positions), indices: Object.freeze(indices) });
  const data = { mesh, faces };
  meshes.set(profile, data);
  return data;
}

function getNaturalMesh(profile) {
  if (meshes.has(profile)) return meshes.get(profile);
  const variant = LIVING_SHALLOWS_ROCK_PROFILES.indexOf(profile), phase = variant * 1.71;
  const rimRadius = angle => .5 * (.82 + .07 * Math.sin(angle * 3 + phase) +
    .05 * Math.cos(angle * 5 - phase) + .04 * Math.sin(angle * 2 + .9));
  const height = (x, z, radial) => {
    if (radial === 1) return 0;
    const u = x * 2, v = z * 2;
    const lobe = (cx, cz, sx, sz) => Math.exp(-(((u - cx) / sx) ** 2 + ((v - cz) / sz) ** 2));
    const ridge = variant === 1 ? .68 * lobe(-.12, .07, .72, .27) + .36 * lobe(.38, -.08, .30, .43) :
      variant === 2 ? .56 * lobe(.22, -.23, .43, .48) + .52 * lobe(-.30, .24, .47, .38) :
        .65 * lobe(-.19, .13, .49, .63) + .43 * lobe(.32, -.15, .38, .47);
    const grain = .045 * Math.sin(u * 17 + phase) * Math.cos(v * 13 - phase) +
      .025 * Math.sin((u + v) * 25);
    return Math.max(0, Math.min(1, (ridge + .10 + grain) * (1 - radial ** 3)));
  };
  const positions = [0, Math.fround(height(0, 0, 0)), 0], indices = [], angleStep = Math.PI * 2 / NATURAL_SECTORS;
  for (const radial of NATURAL_RADII) for (let sector = 0; sector < NATURAL_SECTORS; sector++) {
    const angle = sector * angleStep, radius = radial * rimRadius(angle), x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
    positions.push(Math.fround(x), Math.fround(height(x, z, radial)), Math.fround(z));
  }
  const vertex = (ring, sector) => 1 + (ring - 1) * NATURAL_SECTORS + sector % NATURAL_SECTORS;
  for (let sector = 0; sector < NATURAL_SECTORS; sector++) indices.push(0, vertex(1, sector + 1), vertex(1, sector));
  for (let ring = 2; ring <= NATURAL_RADII.length; ring++) for (let sector = 0; sector < NATURAL_SECTORS; sector++) {
    indices.push(vertex(ring - 1, sector), vertex(ring - 1, sector + 1), vertex(ring, sector));
    indices.push(vertex(ring - 1, sector + 1), vertex(ring, sector + 1), vertex(ring, sector));
  }
  const faces = [];
  for (let index = 0; index < indices.length; index += 3) {
    const [a, b, c] = indices.slice(index, index + 3).map(vertexIndex => vertexIndex * 3);
    const abx = positions[b] - positions[a], aby = positions[b + 1] - positions[a + 1], abz = positions[b + 2] - positions[a + 2];
    const acx = positions[c] - positions[a], acy = positions[c + 1] - positions[a + 1], acz = positions[c + 2] - positions[a + 2];
    const nx = aby * acz - abz * acy, ny = abz * acx - abx * acz, nz = abx * acy - aby * acx, length = Math.hypot(nx, ny, nz);
    faces.push({ a, b, c, denominator: (positions[b + 2] - positions[c + 2]) * (positions[a] - positions[c]) +
      (positions[c] - positions[b]) * (positions[a + 2] - positions[c + 2]),
      normal: Object.freeze({ x: nx / length, y: ny / length, z: nz / length }) });
  }
  const mesh = Object.freeze({ positions: Object.freeze(positions), indices: Object.freeze(indices), rimSectors: NATURAL_SECTORS });
  const data = { mesh, faces, natural: true, sectors: NATURAL_SECTORS, radii: NATURAL_RADII };
  meshes.set(profile, data);
  return data;
}

export function oceanRockMesh(profile = 'mound') {
  return getMesh(profile).mesh;
}

function triangleSurface(data, triangle, x, z) {
  const face = data.faces[triangle], p = data.mesh.positions;
  const u = ((p[face.b + 2] - p[face.c + 2]) * (x - p[face.c]) +
    (p[face.c] - p[face.b]) * (z - p[face.c + 2])) / face.denominator;
  const v = ((p[face.c + 2] - p[face.a + 2]) * (x - p[face.c]) +
    (p[face.a] - p[face.c]) * (z - p[face.c + 2])) / face.denominator;
  const w = 1 - u - v;
  if (u < -EPSILON || v < -EPSILON || w < -EPSILON) return null;
  return { height: Math.max(0, Math.min(1, u * p[face.a + 1] + v * p[face.b + 1] + w * p[face.c + 1])),
    normal: face.normal };
}

export function oceanRockSurface(profile = 'mound', x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) throw new RangeError('Rock surface coordinates must be finite.');
  const data = getMesh(profile);
  if (x * x + z * z > .25 + 1e-7) return null;
  if (data.natural) return naturalSurface(data, x, z);
  const radius = Math.hypot(x, z);
  let angle = Math.atan2(z, x);
  if (angle < 0) angle += Math.PI * 2;
  const sector = Math.min(SECTORS - 1, Math.floor(angle / ANGLE));
  // Intersect the radial ray with the regular polygon's straight edges.
  const polygonRadius = radius * Math.cos(angle - (sector + .5) * ANGLE) / Math.cos(ANGLE * .5);
  if (polygonRadius > .5 + 1e-7) return null;
  let ring = RADII.findIndex(value => polygonRadius <= value);
  if (ring === -1) ring = RADII.length - 1;
  ring++;
  const queryCell = (cellRing, cellSector) => {
    if (cellRing < 1 || cellRing > RADII.length) return null;
    const wrapped = (cellSector + SECTORS) % SECTORS;
    if (cellRing === 1) return triangleSurface(data, wrapped, x, z);
    const first = SECTORS + (cellRing - 2) * SECTORS * 2 + wrapped * 2;
    return triangleSurface(data, first, x, z) || triangleSurface(data, first + 1, x, z);
  };
  const surface = queryCell(ring, sector);
  if (surface) return surface;
  // Float32 rounding can put a ring/sector boundary a few ulps to either side
  // of its polar locator. Only neighbouring cells need checking, not all faces.
  for (const dr of [-1, 0, 1]) for (const ds of [-1, 0, 1]) {
    if (dr === 0 && ds === 0) continue;
    const adjacent = queryCell(ring + dr, sector + ds);
    if (adjacent) return adjacent;
  }
  return null;
}

function naturalSurface(data, x, z) {
  const step = Math.PI * 2 / data.sectors, radius = Math.hypot(x, z);
  let angle = Math.atan2(z, x);
  if (angle < 0) angle += Math.PI * 2;
  const sector = Math.min(data.sectors - 1, Math.floor(angle / step)), p = data.mesh.positions;
  const rim = 1 + (data.radii.length - 1) * data.sectors;
  const a = (rim + sector) * 3, b = (rim + (sector + 1) % data.sectors) * 3;
  const dx = Math.cos(angle), dz = Math.sin(angle), denominator = dx * (p[b + 2] - p[a + 2]) - dz * (p[b] - p[a]);
  const edge = (p[a] * p[b + 2] - p[a + 2] * p[b]) / denominator;
  const fraction = radius / edge;
  if (fraction > 1 + 1e-7) return null;
  let ring = data.radii.findIndex(value => fraction <= value);
  if (ring === -1) ring = data.radii.length - 1;
  ring++;
  const query = (candidateRing, candidateSector) => {
    if (candidateRing < 1 || candidateRing > data.radii.length) return null;
    const wrapped = (candidateSector + data.sectors) % data.sectors;
    if (candidateRing === 1) return triangleSurface(data, wrapped, x, z);
    const first = data.sectors + (candidateRing - 2) * data.sectors * 2 + wrapped * 2;
    return triangleSurface(data, first, x, z) || triangleSurface(data, first + 1, x, z);
  };
  const own = query(ring, sector);
  if (own) return own;
  // Shared Float32 vertices can put a boundary on the adjacent polar cell.
  for (const dr of [-1, 0, 1]) for (const ds of [-1, 0, 1]) {
    if (dr || ds) { const adjacent = query(ring + dr, sector + ds); if (adjacent) return adjacent; }
  }
  return null;
}

export function oceanRockHeight(rock, worldX, worldZ) {
  if (!Number.isFinite(worldX) || !Number.isFinite(worldZ)) throw new RangeError('Rock world coordinates must be finite.');
  const rotation = rock.rotation ?? 0, { x: sx, y: sy, z: sz } = rock.scale;
  let transform = rockTransforms.get(rock);
  if (!transform || transform.rotation !== rotation || transform.sx !== sx || transform.sy !== sy || transform.sz !== sz) {
    if (!(sx > 0 && sy > 0 && sz > 0 && Number.isFinite(sx) && Number.isFinite(sy) && Number.isFinite(sz) &&
      Number.isFinite(rotation))) throw new RangeError('Rock scale and rotation must be finite, with positive scale.');
    transform = { rotation, sx, sy, sz, cos: Math.cos(rotation), sin: Math.sin(rotation), inverseX: 1 / sx, inverseZ: 1 / sz };
    rockTransforms.set(rock, transform);
  }
  const wx = worldX - rock.x, wz = worldZ - rock.z;
  const x = (wx * transform.cos - wz * transform.sin) * transform.inverseX;
  const z = (wx * transform.sin + wz * transform.cos) * transform.inverseZ;
  if (x * x + z * z > .25 + 1e-7) return null;
  const surface = oceanRockSurface(rock.profile || 'mound', x, z);
  return surface ? rock.y + surface.height * sy : null;
}
