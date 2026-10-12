import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Sample-only authored whole-body assets, not scans or calibrated anatomy.
// Cuttlefish units are mantle length, as in the existing species catalogue;
// octopus units are the complete horizontal arm envelope. All appendages are
// included in displayEnvelope independently of those biological measures.
export const SHALLOW_CEPHALOPOD_IDS = Object.freeze(['reef-cuttlefish', 'day-octopus']);
const TAU = Math.PI * 2, lerp = THREE.MathUtils.lerp;

function skin(x, y, z, pale = false) {
  const low = new THREE.Color(pale ? '#7b7967' : '#514537');
  const high = new THREE.Color(pale ? '#d0c5a4' : '#b6a27b');
  const patch = .44 + .38 * Math.sin(x * 31 + Math.sin(z * 19)*2.1) * Math.cos(z * 28 + y * 21)
    + .19 * Math.sin(x * 83 + z * 67) * Math.cos(y * 57 + x * 43);
  return low.lerp(high, THREE.MathUtils.clamp(patch + (y < .015 ? .14 : 0), 0, 1));
}
function paint(g, colour = skin) {
  const p = g.attributes.position, c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) c.set(colour(p.getX(i), p.getY(i), p.getZ(i)).toArray(), i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.deleteAttribute('uv');
  g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere(); return g;
}
function merge(parts) {
  const g = mergeGeometries(parts); parts.forEach(p => p.dispose());
  g.computeBoundingBox(); g.computeBoundingSphere(); return g;
}
function egg(center, scale, colour = skin, sides = 16, rows = 10) {
  const g = new THREE.SphereGeometry(1, sides, rows); g.scale(...scale); g.translate(...center); return paint(g, colour);
}

// One closed axial surface: ovoid mantle sections narrow into an overlapping
// neck, rather than three spheres with disconnected rings around the head.
function body(stations, rows = 40, sides = 22, colour = skin) {
  const positions = [], indices = [];
  for (let i = 0; i <= rows; i++) {
    const x = lerp(stations[0][0], stations.at(-1)[0], i / rows);
    let k = 0; while (k < stations.length - 2 && x > stations[k + 1][0]) k++;
    const a = stations[k], b = stations[k + 1], u = (x - a[0]) / (b[0] - a[0]), t = u * u * (3 - 2 * u);
    const h = lerp(a[1], b[1], t), w = lerp(a[2], b[2], t), cy = lerp(a[3], b[3], t);
    for (let j = 0; j <= sides; j++) {
      const angle = j / sides * TAU;
      const papilla=1+.032*Math.sin(x*123+angle*7)*Math.sin(x*79-angle*11);
      positions.push(x, cy + h * Math.sin(angle)*papilla, w * Math.cos(angle)*papilla);
      if (i < rows && j < sides) { const p = i * (sides + 1) + j, n = p + sides + 1; indices.push(p, n, p + 1, p + 1, n, n + 1); }
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setIndex(indices);
  return paint(g, colour);
}

function tube(points, radiusAt, rows = 22, sides = 10, colour = skin) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), false, 'centripetal');
  const frames = curve.computeFrenetFrames(rows, false), positions = [], indices = [];
  for (let i = 0; i <= rows; i++) {
    const t = i / rows, c = curve.getPoint(t), radius = radiusAt(t);
    for (let j = 0; j <= sides; j++) {
      const angle = j / sides * TAU, p = c.clone().addScaledVector(frames.normals[i], radius * Math.cos(angle)).addScaledVector(frames.binormals[i], radius * Math.sin(angle));
      positions.push(p.x, p.y, p.z);
      if (i < rows && j < sides) { const a = i * (sides + 1) + j, b = a + sides + 1; indices.push(a, a + 1, b, a + 1, b + 1, b); }
    }
  }
  for (const end of [0, rows]) {
    const c = curve.getPoint(end / rows), center = positions.length / 3; positions.push(c.x, c.y, c.z);
    for (let j = 0; j < sides; j++) { const a = end * (sides + 1) + j; if (end === 0) indices.push(center, a + 1, a); else indices.push(center, a, a + 1); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setIndex(indices);
  return { geometry: paint(g, colour), curve };
}

// A very small paired underside cup field; merged with each arm, no mesh or
// animation resource per sucker. This is a display suggestion, not a count of
// an animal's complete sucker population.
function cups(curve, count, rootRadius, octopus) {
  const positions = [], indices = [];
  for (let i = 0; i < count; i++) for (const side of [-1, 1]) {
    const t = .15 + .66 * i / Math.max(1, count - 1), center = curve.getPoint(t), tangent = curve.getTangent(t).normalize();
    const across = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    const r = rootRadius * (1 - .72 * t), c = center.clone().addScaledVector(across, side * r * .43);
    c.y -= r * .70;
    const radius = r * (octopus ? .42 : .35), start = positions.length / 3;
    // Bowed cup walls and shallow lumen face downward into the prey surface.
    for (const [radial, y] of [[1, -.0015], [.47, .0025]]) for (let j = 0; j < 8; j++) {
      const a = j / 8 * TAU, p = c.clone().addScaledVector(across, radius * radial * Math.cos(a)).addScaledVector(tangent, radius * radial * Math.sin(a));
      positions.push(p.x, p.y + y, p.z);
    }
    positions.push(c.x, c.y + .003, c.z);
    for (let j = 0; j < 8; j++) {
      const n = (j + 1) % 8, a = start + j, b = start + n, d = start + 8 + j, e = start + 8 + n;
      indices.push(a, d, b, b, d, e, start + 16, e, d);
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setIndex(indices);
  return paint(g, () => new THREE.Color('#b9aa8a'));
}

function cuttleFin(side) {
  const positions = [], indices = [], rows = 34, bands = 4;
  for (const face of [1, -1]) for (let i = 0; i <= rows; i++) {
    const t = i / rows, x = -.49 + .94 * t, oval = Math.sin(Math.PI * t) ** .68;
    const inner = .05 + oval * .21, outer = inner + oval * .115;
    for (let j = 0; j <= bands; j++) {
      const u = j / bands, z = side * lerp(inner, outer, u), y = -.013 + .013 * Math.sin(t * TAU * 1.7) * u + face * .0045 * Math.sin(Math.PI * u);
      positions.push(x, y, z);
      if (i < rows && j < bands) { const a = (face === 1 ? 0 : (rows + 1) * (bands + 1)) + i * (bands + 1) + j, b = a + bands + 1;
        if (face * side === 1) indices.push(a, a + 1, b, a + 1, b + 1, b); else indices.push(a, b, a + 1, a + 1, b, b + 1); }
    }
  }
  const half = (rows + 1) * (bands + 1);
  for (const j of [0, bands]) for (let i = 0; i < rows; i++) {
    const a = i * (bands + 1) + j, b = a + bands + 1;
    indices.push(a, a + half, b, b, a + half, b + half);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setIndex(indices);
  return paint(g, (x, y, z) => skin(x, y, z, true));
}

function octopusWeb() {
  const positions = [], indices = [], sectors = 64, rings = 5;
  for (const face of [1, -1]) for (let r = 0; r <= rings; r++) for (let i = 0; i <= sectors; i++) {
    const a = i / sectors * TAU, lobe = .5 + .5 * Math.cos(a * 8), u = r / rings;
    const radius = lerp(.045, .125 + .042 * lobe, u), y = face === 1 ? .063 + .006 * (1 - u) : .026;
    positions.push(.02 + Math.cos(a) * radius, y, Math.sin(a) * radius);
    if (r < rings && i < sectors) { const half = (rings + 1) * (sectors + 1), k = (face === 1 ? 0 : half) + r * (sectors + 1) + i, n = k + sectors + 1;
      if (face === 1) indices.push(k, k + 1, n, k + 1, n + 1, n); else indices.push(k, n, k + 1, k + 1, n, n + 1); }
  }
  const half = (rings + 1) * (sectors + 1);
  for (const ring of [0, rings]) for (let i = 0; i < sectors; i++) {
    const k = ring * (sectors + 1) + i; indices.push(k, k + half, k + 1, k + 1, k + half, k + half + 1);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setIndex(indices); return paint(g);
}

export class ShallowCephalopodAssets {
  constructor() {
    this.resources = new Set(); this.models = new Map(); this.disposed = false;
    this.material = this.own(new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: .83, metalness: 0, side: THREE.DoubleSide }));
    this.material.userData.biologicalSkin=true;
  }
  own(resource) { this.resources.add(resource); return resource; }
  part(root, geometry, name) { const mesh = new THREE.Mesh(this.own(geometry), this.material); mesh.name = name; root.add(mesh); return mesh; }
  create(id) {
    if (this.disposed || !SHALLOW_CEPHALOPOD_IDS.includes(id)) return null;
    if (this.models.has(id)) return this.models.get(id);
    const root = new THREE.Group(); root.name = `${id} / whole cephalopod body kit`; const arms = [], fins = [];
    const cuttle = id === 'reef-cuttlefish', kind = cuttle ? 1 : 2;
    if (cuttle) {
      const parts = [body([[-.5, 0, 0, 0], [-.38, .099, .19, 0], [-.15, .15, .255, .009], [.16, .14, .248, .012], [.40, .105, .182, 0], [.50, 0, 0, -.003]], 48, 24),
        body([[.39, 0, 0, -.007], [.48, .090, .137, -.007], [.60, .125, .182, -.007], [.72, .090, .134, -.014], [.765, 0, 0, -.014]], 26, 20)];
      for (const side of [-1, 1]) {
        parts.push(egg([.615, .032, side * .17], [.054, .049, .025], () => new THREE.Color('#b9ae8f')));
        // Broad W-shaped pupil follows the lateral eye rather than a black ball.
        const pupil = tube([[.581, .039, side * .194], [.601, .027, side * .194], [.614, .041, side * .195], [.626, .027, side * .193], [.646, .036, side * .191]], () => .0048, 14, 6, () => new THREE.Color('#282820')).geometry;
        parts.push(pupil);
        const fin = new THREE.Group(); fin.name = `Continuous mantle fringe ${side}`; root.add(fin); this.part(fin, cuttleFin(side), 'closed fin membrane'); fins.push(fin);
      }
      this.part(root, merge(parts), 'closed mantle and head with inset lateral eyes');
      for (let i = 0; i < 8; i++) {
        const angle = i / 8 * TAU, y = Math.sin(angle) * .080 - .013, z = Math.cos(angle) * .126;
        const reach = (i === 0 || i === 4) ? 1.11 : 1.04 + .028 * Math.sin(i * 1.8);
        const arm = tube([[.697, y, z], [.82, y * .88, z * 1.25], [.97, y * .47, z * 1.43], [reach, y * .18 + .015, z * 1.18]], t => .033 * (1 - t) ** .84 + .001, 20, 10);
        const pivot = new THREE.Group(); pivot.name = `Arm ${i + 1}`; root.add(pivot); this.part(pivot, merge([arm.geometry, cups(arm.curve, 5, .027, false)]), 'tapering arm and underside sucker cups'); arms.push(pivot);
      }
      for (const side of [-1, 1]) {
        const tentacle = tube([[.706, -.022, side * .040], [.88, -.01, side * .049], [1.10, .008, side * .071], [1.20, .004, side * .082]], t => .012 - t * .006, 18, 8);
        const pivot = new THREE.Group(); pivot.name = `Feeding tentacle ${side}`; root.add(pivot);
        this.part(pivot, merge([tentacle.geometry, egg([1.220, .006, side * .082], [.059, .021, .030], skin, 14, 8)]), 'retracted feeding shaft and broad club'); arms.push(pivot);
      }
    } else {
      const parts = [body([[-.32, 0, 0, .125], [-.25, .091, .100, .124], [-.14, .116, .132, .125], [-.02, .098, .114, .113], [.075, .057, .085, .078], [.14, 0, 0, .065]], 40, 22),
        body([[.015, 0, 0, .075], [.065, .067, .097, .084], [.13, .057, .088, .073], [.18, 0, 0, .062]], 22, 18), octopusWeb()];
      for (const side of [-1, 1]) {
        parts.push(egg([.090, .126, side * .082], [.027, .024, .019], skin));
        parts.push(egg([.094, .128, side * .097], [.017, .009, .004], () => new THREE.Color('#b7a679'), 12, 8));
        parts.push(egg([.094, .128, side * .101], [.015, .0035, .0018], () => new THREE.Color('#29291f'), 10, 6));
      }
      this.part(root, merge(parts), 'ovoid mantle head and muscular interbrachial web');
      for (let i = 0; i < 8; i++) {
        const angle = i / 8 * TAU + .08 * Math.sin(i * 1.9), clockwise = i % 2 ? 1 : -1;
        const reach=[1,.81,.95,.72,.94,.86,.75,.96][i],bend=[.25,-.38,.43,-.25,.31,-.47,.26,-.20][i];
        const point = (r, turn, y) => [.02 + Math.cos(angle + turn) * r, y, Math.sin(angle + turn) * r];
        const arm = tube([point(.066, 0, .062), point(.16, .02, .048), point(.30*reach, bend*.35, .028), point(.445*reach, bend, .014), point(.455*reach, bend+.21*clockwise, .021), point(.397*reach, bend+.36*clockwise, .034)], t => .051 * (1 - t) ** 1.22 + .002, 24, 10);
        const pivot = new THREE.Group(); pivot.name = `Arm ${i + 1}`; root.add(pivot);
        this.part(pivot, merge([arm.geometry, cups(arm.curve, 7, .034, true)]), 'continuous muscular arm curl and paired sucker cups'); arms.push(pivot);
      }
    }
    root.userData = { speciesId: id, assetFamily: 'shallow-cephalopods-v2', authored: true, calibrated: false,
      appendageCounts: { arms: 8, feedingTentacles: cuttle ? 2 : 0 }, sizeMeasure: cuttle ? 'mantle-length' : 'arm-envelope',
      measureDefinition: cuttle ? 'mantle X length 1; head and appendages additional' : 'complete neutral arm diameter <= 1',
      displayEnvelope: cuttle ? { radius: 1.35, minY: -.21, maxY: .21 } : { radius: .50, minY: 0, maxY: .255 },
      motionNote: 'bounded display fin flex and arm yaw/lift; no simulated muscle, jet propulsion or full camouflage' };
    // The fixed arm envelope includes curled tips and radial yaw at any heading.
    if (!cuttle) root.traverse(mesh => { if (!mesh.isMesh) return; const p = mesh.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) p.setY(i, Math.max(.001, p.getY(i))); mesh.geometry.computeVertexNormals(); mesh.geometry.computeBoundingBox(); mesh.geometry.computeBoundingSphere(); });
    root.updateMatrixWorld(true);
    const model = { id, root, kind, arms, fins, motionPadding: cuttle ? { radius: .040, bottom: .024, top: .024 } : { radius: .035, bottom: 0, top: .006 } };
    this.models.set(id, model); return model;
  }
  update(time, speeds = new Map()) {
    if (this.disposed) return;
    for (const [id, model] of this.models) {
      const speed = Math.min(1, Math.max(0, speeds.get(id) ?? 0)), cuttle = model.kind === 1;
      model.arms.forEach((arm, i) => {
        arm.rotation.y = Math.sin(time * (cuttle ? .8 + speed : 1.25 + speed) + i * 1.71) * (cuttle ? .021 : .037);
        arm.position.y = cuttle ? 0 : .003 * (1 + Math.sin(time * 1.18 + i * 1.13));
      });
      model.fins.forEach((fin, i) => { fin.rotation.x = Math.sin(time * (2.25 + speed * 1.5) + i * Math.PI) * .050; });
      model.root.updateMatrixWorld(true);
    }
  }
  dispose() {
    if (this.disposed) return; this.disposed = true;
    for (const model of this.models.values()) model.root.removeFromParent();
    for (const resource of this.resources) resource.dispose(); this.resources.clear(); this.models.clear();
  }
}
