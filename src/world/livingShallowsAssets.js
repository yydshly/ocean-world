import * as THREE from 'three';
import { oceanRockMesh } from '../oceanRockShape.js';
import { sceneElementMesh } from '../oceanSceneElements.js';

export const LIVING_SHALLOWS_ASSET_VERSION = 3;
export const LIVING_SHALLOWS_CORAL_FORMS = Object.freeze(['branching', 'table', 'fan']);
export const LIVING_SHALLOWS_PALETTE = Object.freeze({
  rock: '#a29a80', branching: '#a3997e', table: '#a88b83', fan: '#947659',
  seagrass: '#536c3d', rubble: '#ada48e', algae: '#657047',
  driftwood: '#756a56', bottle: '#8aaba1',
});
const TAU = Math.PI * 2;

// These are colony-level display assets, not additional individuals or biomass.
// All prototypes share one attached root, y=0, and a metre-scaled unit envelope.
function tube(positions, indices, a, b, r0, r1, segments = 6) {
  const direction = new THREE.Vector3(...b).sub(new THREE.Vector3(...a)).normalize();
  const sideways = new THREE.Vector3(0, 1, 0);
  if (Math.abs(direction.y) > .9) sideways.set(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(direction, sideways).normalize();
  const v = new THREE.Vector3().crossVectors(direction, u).normalize(), offset = positions.length / 3;
  for (let ring = 0; ring < 2; ring++) for (let sector = 0; sector < segments; sector++) {
    const angle = sector / segments * TAU, radius = ring ? r1 : r0, center = ring ? b : a;
    positions.push(center[0] + radius * (u.x * Math.cos(angle) + v.x * Math.sin(angle)),
      center[1] + radius * (u.y * Math.cos(angle) + v.y * Math.sin(angle)),
      center[2] + radius * (u.z * Math.cos(angle) + v.z * Math.sin(angle)));
  }
  for (let sector = 0; sector < segments; sector++) {
    const a0 = offset + sector, b0 = offset + (sector + 1) % segments;
    indices.push(a0, b0, b0 + segments, a0, b0 + segments, a0 + segments);
  }
  // Closed tips keep the silhouette intact at ordinary observation distance.
  for (let sector = 1; sector < segments - 1; sector++) indices.push(offset + segments, offset + segments + sector, offset + segments + sector + 1);
}

function lowColonyBase(positions, indices, radius, height, sectors = 18, depth = 1) {
  const first = positions.length / 3;
  positions.push(0, 0, 0, 0, height, 0);
  for (let sector = 0; sector < sectors; sector++) {
    const angle = sector / sectors * TAU, reach = radius * (1 + Math.sin(angle * 3 + .7) * .055);
    positions.push(Math.cos(angle) * reach, 0, Math.sin(angle) * reach * depth,
      Math.cos(angle) * reach, height * (.63 + .12 * Math.sin(angle * 4)), Math.sin(angle) * reach * depth);
  }
  for (let sector = 0; sector < sectors; sector++) {
    const a = first + 2 + sector * 2, b = first + 2 + (sector + 1) % sectors * 2;
    indices.push(first, a, b, first + 1, b + 1, a + 1, a, a + 1, b, b, a + 1, b + 1);
  }
}

function branchingColony(positions, indices) {
  // The complete crown grows from many positions on one low connected crust.
  // Its stout unequal branches do not converge into a central inverted cone.
  lowColonyBase(positions, indices, .40, .15);
  for (let stem = 0; stem < 23; stem++) {
    const angle = stem * 2.3999632297, radius = .34 * Math.sqrt((stem + .5) / 23);
    const root = [Math.cos(angle) * radius, .075, Math.sin(angle) * radius];
    const shoulder = [root[0] + Math.cos(angle + .7) * .028,
      .39 + .15 * (.5 + .5 * Math.sin(stem * 1.71)), root[2] + Math.sin(angle + .7) * .028];
    tube(positions, indices, root, shoulder, .045, .038, 5);
    for (let fork = 0; fork < 3; fork++) {
      const direction = angle + fork * TAU / 3 + .31;
      const top = .70 + .29 * (.5 + .5 * Math.sin(stem * 1.37 + fork * 2.09));
      const joint = [shoulder[0] + Math.cos(direction) * .037, shoulder[1] + (top - shoulder[1]) * .52,
        shoulder[2] + Math.sin(direction) * .037];
      const tip = [shoulder[0] + Math.cos(direction) * .056, top, shoulder[2] + Math.sin(direction) * .056];
      tube(positions, indices, shoulder, joint, .032, .025, 5);
      tube(positions, indices, joint, tip, .025, .019, 5);
    }
  }
}

function tableColony(positions, indices) {
  lowColonyBase(positions, indices, .23, .16, 14);
  const plates = [[-.10, .32, .05, .29], [.095, .55, -.065, .33], [-.025, .79, .015, .43]];
  for (let tier = 0; tier < plates.length; tier++) {
    const [x, y, z, radius] = plates[tier], sectors = 24, rings = 3;
    tube(positions, indices, [x * .4, .11, z * .4], [x, y - .025, z], .046, .053, 5);
    const first = positions.length / 3;
    positions.push(x, y + .085, z, x, y - .055, z);
    for (let ring = 1; ring <= rings; ring++) for (let sector = 0; sector < sectors; sector++) {
      const angle = sector / sectors * TAU, fraction = ring / rings;
      const edge = radius * fraction * (1 + .12 * Math.sin(angle * 3 + tier * 1.1) + .035 * Math.sin(angle * 7));
      const crown = y + .085 * (1 - fraction * fraction) + .030 * Math.sin(angle * 5 + fraction * 2 + tier);
      positions.push(x + Math.cos(angle) * edge, crown, z + Math.sin(angle) * edge,
        x + Math.cos(angle) * edge, crown - .10 - .022 * Math.cos(angle * 3), z + Math.sin(angle) * edge);
      const a = first + 2 + ((ring - 1) * sectors + sector) * 2;
      const b = first + 2 + ((ring - 1) * sectors + (sector + 1) % sectors) * 2;
      if (ring === 1) indices.push(first, b, a, first + 1, a + 1, b + 1);
      else { const previousA = a - sectors * 2, previousB = b - sectors * 2;
        indices.push(previousA, b, a, previousA, previousB, b,
          previousA + 1, a + 1, b + 1, previousA + 1, b + 1, previousB + 1); }
      if (ring === rings) indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
    // Thick short crowns and a lobed rim retain living volume from an ordinary
    // side view. They belong to the same three connected horizontal layers.
    for (let finger = 0; finger < 22; finger++) {
      const angle = finger * 2.3999632297 + tier * .43, reach = radius * .88 * Math.sqrt((finger + .5) / 22);
      const base = [x + Math.cos(angle) * reach, y + .035, z + Math.sin(angle) * reach];
      const height = .10 + .050 * (.5 + .5 * Math.sin(finger * 1.63 + tier));
      tube(positions, indices, base, [base[0] + Math.cos(angle) * .015, y + height, base[2] + Math.sin(angle) * .015], .021, .014, 5);
    }
  }
}

function fanColony(positions, indices) {
  lowColonyBase(positions, indices, .12, .10, 10, .28);
  tube(positions, indices, [0, .055, 0], [0, .35, 0], .033, .035, 5);
  // A curved connected web with genuine openings has a broad fan silhouette,
  // rather than a set of unattached radial wires. Each annular cell is closed
  // around its opening; neighbours share the same finite outer edges.
  const ribs = 11, rows = 5;
  const point = (u, v, side) => {
    const angle = -1.14 + u * 2.28, reach = .21 + v * .79;
    return [Math.sin(angle) * .49 * reach, .10 + Math.cos(angle) * .89 * reach,
      .017 * Math.sin(angle * 2 + v * 1.3) + side * .010];
  };
  for (let row = 0; row < rows; row++) for (let rib = 0; rib < ribs; rib++) {
    const u0 = rib / ribs, u1 = (rib + 1) / ribs, v0 = row / rows, v1 = (row + 1) / rows;
    const inset = .23, corners = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    const inner = [[u0 + (u1 - u0) * inset, v0 + (v1 - v0) * inset],
      [u1 - (u1 - u0) * inset, v0 + (v1 - v0) * inset],
      [u1 - (u1 - u0) * inset, v1 - (v1 - v0) * inset],
      [u0 + (u1 - u0) * inset, v1 - (v1 - v0) * inset]];
    const first = positions.length / 3;
    for (const side of [-1, 1]) for (const [u, v] of [...corners, ...inner]) positions.push(...point(u, v, side));
    for (let edge = 0; edge < 4; edge++) {
      const next = (edge + 1) % 4, a = first + edge, b = first + next, i = first + 4 + edge, j = first + 4 + next;
      indices.push(a, i, b, b, i, j, a + 8, b + 8, i + 8, b + 8, j + 8, i + 8,
        a, b, a + 8, b, b + 8, a + 8, i, i + 8, j, j, i + 8, j + 8);
    }
  }
}

function colonyGeometry(form) {
  const positions = [], indices = [];
  if (form === 'branching') branchingColony(positions, indices);
  else if (form === 'table') tableColony(positions, indices);
  else fanColony(positions, indices);
  // Tube cross-sections can lie a few millimetres outside their centreline.
  // Normalize the finished triangles rather than only the branch centreline.
  let radius = 0, top = 0;
  for (let vertex = 0; vertex < positions.length; vertex += 3) {
    positions[vertex + 1] = Math.max(0, positions[vertex + 1]);
    radius = Math.max(radius, Math.hypot(positions[vertex], positions[vertex + 2]));
    top = Math.max(top, positions[vertex + 1]);
  }
  const horizontal = .49 / Math.max(.49, radius), colors = [];
  for (let vertex = 0; vertex < positions.length; vertex += 3) {
    positions[vertex] *= horizontal; positions[vertex + 2] *= horizontal; positions[vertex + 1] /= top;
    const height = positions[vertex + 1], brightness = .76 + .24 * height;
    colors.push(brightness, brightness * .985, brightness * .95);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  geometry.userData = { assetVersion: LIVING_SHALLOWS_ASSET_VERSION, morphotype: form,
    assetShape: form === 'branching' ? 'low-connected-multiroot-branch-crown' : form === 'table' ? 'layered-irregular-live-crown' : 'connected-perforated-fan',
    unitEnvelope: 'one attached root; y 0..1; radial XZ <= 0.5', role: 'representative-colony-display-not-biomass' };
  return geometry;
}

function meadowGeometry() {
  const positions = [], indices = [], colors = [], uvs = [], roots = [];
  // One shared patch now spreads actual ribbon roots across its existing
  // footprint. Thirty-two irregular shoots leave a narrow sand opening; three
  // different-height blades per shoot describe an unspecified seagrass form,
  // never additional ecological individuals, biomass or new patch positions.
  for (let blade = 0; blade < 96; blade++) {
    const shoot = Math.floor(blade / 3), leaf = blade % 3;
    let shootAngle = (shoot * 2.3999632297 + .12 * Math.sin(shoot * 1.91)) % TAU;
    if (Math.abs(shootAngle - .35) < .21) shootAngle += .44;
    const rootRadius = .35 * Math.sqrt((shoot + .5) / 32);
    const separation = (leaf - 1) * .009, root = [Math.cos(shootAngle) * rootRadius - Math.sin(shootAngle) * separation,
      Math.sin(shootAngle) * rootRadius + Math.cos(shootAngle) * separation];
    const angle = shootAngle + (leaf - 1) * .62 + .33 * Math.sin(shoot * 2.13);
    const height = blade === 0 ? 1 : .48 + .48 * (.5 + .5 * Math.sin(shoot * 1.73 + leaf * 2.1));
    const reach = .024 + .044 * (.5 + .5 * Math.sin(shoot * 2.19 + leaf));
    const bladeWidth = .014 + .011 * (.5 + .5 * Math.sin(shoot * 1.47 + leaf * 1.83));
    const offset = positions.length / 3;
    for (let level = 0; level <= 4; level++) {
      const t = level / 4, bend = reach * t * t;
      const width = level === 0 || level === 4 ? 0 : bladeWidth * Math.sin(Math.PI * t) * (1 - t * .62);
      for (const side of [-1, 1]) {
        positions.push(root[0] + Math.cos(angle) * bend - Math.sin(angle) * width * side,
          height * t, root[1] + Math.sin(angle) * bend + Math.cos(angle) * width * side);
        colors.push(.76 + t * .30, .82 + t * .34, .63 + t * .21);
        uvs.push((side + 1) * .5, t); roots.push(...root);
      }
      if (level < 4) { const a = offset + level * 2; indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('rootXZ', new THREE.Float32BufferAttribute(roots, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  geometry.userData = { assetVersion: LIVING_SHALLOWS_ASSET_VERSION, role: 'planned-meadow-display-not-individual-biomass',
    shootCount: 32, bladeCount: 96, bladeSegments: 4,
    unitEnvelope: 'y 0..1; radial XZ <= .44 before local-current deformation',
    rootReference: 'rootXZ is each blade actual fixed substrate root; shared by all its vertices' };
  return geometry;
}

function rubbleGeometry() {
  const vertices = [], indices = [];
  // Five coarse broken pieces share one finite rubble prototype. Unequal
  // polygon ends and slanted cut faces replace the previous rounded pebble.
  const pieces = [[-.13, -.075, .20, 1, 6, .32], [.23, -.13, .13, .50, 5, .74],
    [-.24, .18, .12, .43, 5, .16], [.07, .23, .15, .34, 5, .55], [.025, -.26, .11, .28, 5, .81]];
  for (let piece = 0; piece < pieces.length; piece++) {
    const [cx, cz, radius, height, sectors, phase] = pieces[piece], first = vertices.length / 3;
    for (const upper of [false, true]) for (let sector = 0; sector < sectors; sector++) {
      const angle = phase + sector / sectors * TAU, rough = 1 + .16 * Math.sin(sector * 2.3 + piece);
      vertices.push(cx + Math.cos(angle) * radius * rough + (upper ? .035 * Math.sin(piece) : 0),
        upper ? height * (.78 + .22 * Math.cos(angle + piece)) : 0,
        cz + Math.sin(angle) * radius * rough + (upper ? -.024 * Math.cos(piece) : 0));
    }
    for (let sector = 0; sector < sectors; sector++) {
      const a = first + sector, b = first + (sector + 1) % sectors;
      indices.push(a, b, a + sectors, b, b + sectors, a + sectors);
    }
    for (let sector = 1; sector < sectors - 1; sector++) indices.push(first, first + sector, first + sector + 1,
      first + sectors, first + sectors + sector + 1, first + sectors + sector);
  }
  let radius = 0, top = 0;
  for (let vertex = 0; vertex < vertices.length; vertex += 3) {
    radius = Math.max(radius, Math.hypot(vertices[vertex], vertices[vertex + 2])); top = Math.max(top, vertices[vertex + 1]);
  }
  const horizontal = .49 / Math.max(.49, radius);
  for (let vertex = 0; vertex < vertices.length; vertex += 3) {
    vertices[vertex] *= horizontal; vertices[vertex + 1] /= top; vertices[vertex + 2] *= horizontal;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setIndex(indices);
  // The existing rubble material owns a stone map. An oblique planar mapping
  // gives both the crown and the short cut sides UV span without new textures.
  const uvs = [];
  for (let vertex = 0; vertex < vertices.length; vertex += 3) uvs.push(vertices[vertex] + .23 * vertices[vertex + 1] + .5,
    vertices[vertex + 2] + .37 * vertices[vertex + 1] + .5);
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  geometry.userData = { assetVersion: LIVING_SHALLOWS_ASSET_VERSION, assetShape: 'coarse-broken-angular-fragments',
    pieceCount: pieces.length, unitEnvelope: 'y 0..1; radial XZ <= .5', role: 'shared-reef-rubble-display-not-biomass' };
  return geometry;
}

export function livingShallowsAssetGeometries() {
  const result = { seagrass: meadowGeometry(), rubble: rubbleGeometry() };
  for (const form of LIVING_SHALLOWS_CORAL_FORMS) result[`coral-${form}`] = colonyGeometry(form);
  for (const kind of ['driftwood', 'bottle']) {
    const data = sceneElementMesh(kind, 0), geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3)); geometry.setIndex(data.indices);
    geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    geometry.userData = { assetVersion: LIVING_SHALLOWS_ASSET_VERSION, sharedSceneElement: { kind, variant: 0 },
      role: 'grounded-discovery-prop-not-biomass', physicalState: kind === 'bottle' ? 'grounded-flooded' : 'grounded' };
    result[kind] = geometry;
  }
  return result;
}

export function livingShallowsTerrainColor(x, z, sample, cover, rootEnvelope, target = [0, 0, 0]) {
  const hard = THREE.MathUtils.clamp(sample.rockiness || 0, 0, 1);
  const grass = THREE.MathUtils.clamp(cover.seagrass || 0, 0, 1) * THREE.MathUtils.clamp(rootEnvelope, 0, 1);
  const variation = Math.sin(x * .085 + z * .063) * .015;
  target[0] = 1 - hard * .17 - grass * .36 + variation;
  target[1] = 1 - hard * .16 - grass * .24 + variation;
  target[2] = 1 - hard * .20 - grass * .43 + variation;
  return target;
}

/** New natural profiles expose their own outer rim. Unlike the unchanged
 * legacy sixteen-sector footing this closure follows all new support vertices. */
export function livingShallowsRockFootingMesh(rocks, origin, floorHeight) {
  const positions = [], indices = [], footings = [];
  for (const rock of rocks) {
    const data = oceanRockMesh(rock.profile), sectors = data.rimSectors;
    if (!Number.isInteger(sectors) || sectors < 3) throw new TypeError('Natural rock mesh must declare its outer rim.');
    const first = data.positions.length / 3 - sectors, c = Math.cos(rock.rotation), s = Math.sin(rock.rotation), rim = [];
    let burialY = Math.min(rock.y, floorHeight(rock.x, rock.z));
    for (let sector = 0; sector < sectors; sector++) {
      const index = (first + sector) * 3, lx = data.positions[index] * rock.scale.x, lz = data.positions[index + 2] * rock.scale.z;
      const x = rock.x + lx * c + lz * s, z = rock.z - lx * s + lz * c, floorY = floorHeight(x, z);
      burialY = Math.min(burialY, floorY); rim.push({ x, z, floorY });
    }
    burialY -= .015;
    const start = positions.length / 3;
    for (const point of rim) positions.push(point.x - origin.x, rock.y, point.z - origin.z,
      point.x - origin.x, burialY, point.z - origin.z);
    for (let sector = 0; sector < sectors; sector++) {
      const a = start + sector * 2, b = start + (sector + 1) % sectors * 2;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
    footings.push({ id: rock.id, burialY, rim });
  }
  return { positions, indices, footings };
}
