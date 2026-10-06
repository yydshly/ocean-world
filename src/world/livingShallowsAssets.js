import * as THREE from 'three';
import { oceanRockMesh } from '../oceanRockShape.js';
import { sceneElementMesh } from '../oceanSceneElements.js';

export const LIVING_SHALLOWS_ASSET_VERSION = 4;
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
  // Seven unequal outward-growing axes, each with two divergent forks and
  // paired terminal twigs, form one spreading colony rather than a rod bundle.
  lowColonyBase(positions, indices, .41, .095);
  for (let axis = 0; axis < 7; axis++) {
    const angle = axis * 2.3999632297 + .13 * Math.sin(axis * 1.91);
    const rootRadius = .09 + .04 * (.5 + .5 * Math.sin(axis * 2.71));
    const root = [Math.cos(angle) * rootRadius, .05, Math.sin(angle) * rootRadius];
    const reach = .235 + .035 * Math.sin(axis * 1.37);
    const shoulder = [Math.cos(angle) * reach, .40 + .09 * Math.sin(axis * 1.73), Math.sin(angle) * reach];
    curvedBranch(positions, indices, root, [root[0] * .85, .27, root[2] * .85], shoulder, .048, .033, 4, 8);
    for (const side of [-1, 1]) {
      const direction = angle + side * (.43 + .13 * Math.sin(axis * 2.13));
      const radius = .35 + .055 * (.5 + .5 * Math.sin(axis * 1.41 + side));
      const tip = [Math.cos(direction) * radius, .69 + .13 * Math.sin(axis * 1.17 + side * .63), Math.sin(direction) * radius];
      const bend = [(shoulder[0] + tip[0]) * .5 + Math.cos(angle) * .027,
        shoulder[1] + (tip[1] - shoulder[1]) * .65, (shoulder[2] + tip[2]) * .5 + Math.sin(angle) * .027];
      curvedBranch(positions, indices, shoulder, bend, tip, .032, .021, 3, 7);
      for (const twig of [-1, 1]) {
        const heading = direction + twig * .64, length = .048 + .018 * (.5 + .5 * Math.sin(axis + side + twig));
        const end = [tip[0] + Math.cos(heading) * length, tip[1] + .10 + .06 * (.5 + .5 * Math.sin(axis * 2.1 + twig)),
          tip[2] + Math.sin(heading) * length];
        curvedBranch(positions, indices, tip, [(tip[0] + end[0]) * .5, tip[1] + .09, (tip[2] + end[2]) * .5], end, .020, .009, 2, 6);
      }
    }
  }
}

function curvedBranch(positions, indices, a, bend, b, r0, r1, steps, sides) {
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(...a), new THREE.Vector3(...bend), new THREE.Vector3(...b));
  const first = positions.length / 3;
  for (let row = 0; row <= steps; row++) {
    const t = row / steps, p = curve.getPoint(t), direction = curve.getTangent(t);
    const reference = Math.abs(direction.y) > .94 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const u = new THREE.Vector3().crossVectors(direction, reference).normalize(), v = new THREE.Vector3().crossVectors(direction, u).normalize();
    const radius = THREE.MathUtils.lerp(r0, r1, t) * (1 + .035 * Math.sin(t * Math.PI));
    for (let side = 0; side < sides; side++) {
      const angle = side * TAU / sides;
      positions.push(p.x + radius * (u.x * Math.cos(angle) + v.x * Math.sin(angle)),
        p.y + radius * (u.y * Math.cos(angle) + v.y * Math.sin(angle)),
        p.z + radius * (u.z * Math.cos(angle) + v.z * Math.sin(angle)));
    }
  }
  for (let row = 0; row < steps; row++) for (let side = 0; side < sides; side++) {
    const a = first + row * sides + side, b = first + row * sides + (side + 1) % sides;
    indices.push(a, b, b + sides, a, b + sides, a + sides);
  }
  const last = first + steps * sides;
  for (let side = 1; side < sides - 1; side++) indices.push(last, last + side, last + side + 1);
}

function tableColony(positions, indices) {
  lowColonyBase(positions, indices, .19, .10, 14);
  // Offset shallow lobed plates overlap into one canopy. Their thin margins
  // and differently bowed surfaces replace three thick stacked discs.
  const plates = [[-.10, .29, .08, .28], [.13, .45, -.08, .30], [-.11, .59, -.07, .32],
    [.08, .75, .09, .35], [-.025, .91, .02, .40]];
  for (let tier = 0; tier < plates.length; tier++) {
    const [x, y, z, radius] = plates[tier], sectors = 30, rings = 3;
    curvedBranch(positions, indices, [x * .2, .07, z * .2], [x * .6, y * .64, z * .45], [x, y - .015, z], .033, .023, 3, 6);
    const first = positions.length / 3;
    positions.push(x, y + .032, z, x, y + .009, z);
    for (let ring = 1; ring <= rings; ring++) for (let sector = 0; sector < sectors; sector++) {
      const angle = sector / sectors * TAU, fraction = ring / rings;
      const lobes = 1 + .13 * Math.sin(angle * 3 + tier * .71) + .055 * Math.sin(angle * 7 + tier * 1.13);
      const edge = radius * fraction * lobes;
      const crown = y + .032 * (1 - fraction * fraction) + fraction * (.019 * Math.sin(angle * 4 + tier) + .023 * Math.cos(angle + tier * 1.7));
      const depth = .92 + .05 * Math.sin(tier * 1.3), thickness = .020 + .008 * (1 - fraction);
      positions.push(x + Math.cos(angle) * edge, crown, z + Math.sin(angle) * edge * depth,
        x + Math.cos(angle) * edge, crown - thickness, z + Math.sin(angle) * edge * depth);
      const a = first + 2 + ((ring - 1) * sectors + sector) * 2;
      const b = first + 2 + ((ring - 1) * sectors + (sector + 1) % sectors) * 2;
      if (ring === 1) indices.push(first, b, a, first + 1, a + 1, b + 1);
      else { const previousA = a - sectors * 2, previousB = b - sectors * 2;
        indices.push(previousA, b, a, previousA, previousB, b,
          previousA + 1, a + 1, b + 1, previousA + 1, b + 1, previousB + 1); }
      if (ring === rings) indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
}

function fanColony(positions, indices) {
  lowColonyBase(positions, indices, .12, .10, 10, .28);
  curvedBranch(positions, indices, [0, .055, 0], [-.016, .22, .008], [0, .37, 0], .031, .024, 3, 7);
  // Curved ribs and unequal cross-veins create a branching open fan rather
  // than rectangular annular cells cut from one mechanical panel.
  const ribs = 11;
  const point = (rib, fraction) => {
    const angle = -1.18 + rib / (ribs - 1) * 2.36 + .025 * Math.sin(rib * 1.7);
    const reach = .17 + fraction * (.78 + .045 * Math.sin(rib * 2.1));
    return [Math.sin(angle) * .52 * reach, .13 + Math.cos(angle) * .91 * reach,
      .031 * Math.sin(angle * 1.7) * reach + .012 * Math.sin(fraction * 3.1 + rib * .7)];
  };
  for (let rib = 0; rib < ribs; rib++) {
    const end = point(rib, 1), mid = point(rib, .46);
    curvedBranch(positions, indices, [0, .29, 0], mid, end, .019, .0085, 4, 6);
    for (let row = 0; row < 4 && rib < ribs - 1; row++) {
      const fraction = .25 + row * .19 + .025 * Math.sin(rib * 1.7 + row);
      const a = point(rib, fraction), b = point(rib + 1, fraction + .035 * Math.sin(rib + row * 1.9));
      const bend = [(a[0] + b[0]) * .5, (a[1] + b[1]) * .5 + .012 * Math.sin(rib * 2.1 + row), (a[2] + b[2]) * .5];
      curvedBranch(positions, indices, a, bend, b, .0095, .008, 2, 5);
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
    const height = positions[vertex + 1], variation = Math.sin(positions[vertex] * 13 + positions[vertex + 2] * 9 + height * 3.7);
    const brightness = .82 + .13 * height + variation * .025;
    colors.push(brightness, brightness * .985, brightness * .965);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  geometry.userData = { assetVersion: LIVING_SHALLOWS_ASSET_VERSION, morphotype: form,
    assetShape: form === 'branching' ? 'spreading-multiroot-curved-fork-crown' : form === 'table' ? 'overlapping-thin-lobed-layered-crown' : 'curved-branching-perforated-fan',
    colonyStructure: form === 'branching' ? { primaryAxes: 7, secondaryForks: 14, terminalTwigs: 28 } : form === 'table' ? { overlappingPlates: 5, thinMarginM: [.020, .028] } : { curvedRibs: 11, unequalCrossVeins: 40 },
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

// Physics/feeding may sample this same immutable prototype without allocating
// the other scenery assets. This does not change the renderer's mesh recipe.
export function livingShallowsMeadowGeometry() { return meadowGeometry(); }

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
