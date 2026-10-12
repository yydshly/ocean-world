import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Authored shallow-sample growth forms. No source scan, taxonomic identification,
// measured corallite spacing or ecological biomass is implied by these meshes.
const TAU = Math.PI * 2;
const mix = THREE.MathUtils.lerp;
const clamp = THREE.MathUtils.clamp;
const point = (x, y, z) => new THREE.Vector3(x, y, z);
const palette = {
  branching: ['#67745a', '#c9bd96'],
  table: ['#6c745b', '#b5ba8c'],
  massive: ['#77794f', '#b6ac76'],
  fan: ['#855548', '#b38868'],
};

function mesh(positions, indices, uv = null) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv ?? positions.flatMap((v, i) => i % 3 === 0 ? [v + .5, positions[i + 1]] : []), 2));
  g.setIndex(indices);
  return g;
}

// Junctions begin inside the parent branch, so the whole visible crown is
// connected to its base. This is an intersecting branch hierarchy, not a
// watertight Boolean union or a physical pore-scale skeleton model.
function stem(start, control, end, radius, tipRadius, segments = 3, sides = 6, phase = 0, capped = true) {
  const curve = new THREE.QuadraticBezierCurve3(start, control, end);
  const frames = curve.computeFrenetFrames(segments, false);
  const positions = [], indices = [], uv = [];
  for (let row = 0; row <= segments; row++) {
    const t = row / segments, center = curve.getPoint(t);
    const r = mix(radius, tipRadius, t) * (1 + .08 * Math.sin(t * Math.PI));
    for (let side = 0; side <= sides; side++) {
      const angle = side / sides * TAU;
      const corrugated = r * (1 + .045 * Math.cos(angle * 3 + phase + t * 8));
      const p = center.clone().addScaledVector(frames.normals[row], Math.cos(angle) * corrugated).addScaledVector(frames.binormals[row], Math.sin(angle) * corrugated);
      positions.push(p.x, p.y, p.z); uv.push(side / sides, t);
      if (row < segments && side < sides) {
        const a = row * (sides + 1) + side, b = a + sides + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  if (capped) {
    const base = positions.length / 3;
    positions.push(start.x, start.y, start.z); uv.push(.5, 0);
    const tip = positions.length / 3;
    positions.push(end.x, end.y, end.z); uv.push(.5, 1);
    for (let side = 0; side < sides; side++) {
      const a = segments * (sides + 1) + side;
      indices.push(base, side + 1, side, tip, a, a + 1);
    }
  }
  return mesh(positions, indices, uv);
}

function basalMound(radius, height, sectors, rings, phase, lumpy = false) {
  const positions = [], indices = [], uv = [];
  for (let row = 0; row <= rings; row++) {
    const elevation = row / rings * Math.PI / 2;
    for (let side = 0; side <= sectors; side++) {
      const a = side / sectors * TAU, radial = Math.cos(elevation), y = Math.sin(elevation);
      const lobes = lumpy ? .09 * Math.sin(a * 3 + phase) + .052 * Math.cos(a * 5 - phase) : .035 * Math.sin(a * 5 + phase);
      const texture = lumpy ? .011 * Math.sin(a * 29 + elevation * 17) * Math.sin(elevation * 37 - a * 9) : 0;
      const r = radius * radial * (1 + lobes * (1 - y * .5) + texture);
      positions.push(Math.cos(a) * r, height * y * (1 + (lumpy ? .10 * Math.cos(a * 3 + phase) * radial : 0)) + texture * .2 * y, Math.sin(a) * r * (lumpy ? .92 : 1));
      uv.push(side / sectors, row / rings);
      if (row < rings && side < sectors) {
        const i = row * (sectors + 1) + side;
        indices.push(i, i + sectors + 1, i + 1, i + 1, i + sectors + 1, i + sectors + 2);
      }
    }
  }
  // The contact disc closes the colony rather than leaving a floating shell.
  const center = positions.length / 3; positions.push(0, 0, 0); uv.push(.5, .5);
  for (let side = 0; side < sectors; side++) indices.push(center, side, side + 1);
  return mesh(positions, indices, uv);
}

function branching(variant, far) {
  const parts = [basalMound(.13, .12, far ? 14 : 22, far ? 3 : 5, variant)];
  const count = far ? (variant ? 4 : 3) : (variant ? 9 : 8), phase = variant * 1.73;
  // Children begin on the centreline of the actual parent curve, inside its
  // tissue envelope. Five/six unequal low spreading limbs replace a bundle of
  // near-parallel stalks; subsequent forks grow from different parent heights.
  const add = (start, control, end, radius, tipRadius, segments, sides, bearing) => {
    parts.push(stem(start, control, end, radius, tipRadius, segments, sides, bearing));
    return new THREE.QuadraticBezierCurve3(start, control, end);
  };
  for (let i = 0; i < count; i++) {
    const a = i / count * TAU + phase + .18 * Math.sin(i * 2.7 + phase);
    const spread = .24 + .055 * Math.sin(i * 1.9 + phase), h = .29 + .11 * (.5 + .5 * Math.cos(i * 2.1 + phase));
    const base = point(.016 * Math.cos(a), .080, .016 * Math.sin(a));
    const tip = point(Math.cos(a) * spread, h, Math.sin(a) * spread);
    const primary = add(base, point(tip.x * .61, h * .28, tip.z * .61), tip, .039, .020, 3, far ? 5 : 6, a);
    const secondaryCount = far ? 2 : 3;
    for (let j = 0; j < secondaryCount; j++) {
      const bearing = a + (j - (secondaryCount - 1) / 2) * .95 + .11 * Math.cos(i + j * 2);
      const origin = primary.getPoint(.51 + j * .16), length = .15 + .055 * (.5 + .5 * Math.sin(i * 1.3 + j * 2.1));
      const out = point(origin.x + Math.cos(bearing) * length, h + .10 + .07 * Math.sin(i * 1.8 + j + phase), origin.z + Math.sin(bearing) * length);
      const secondary = add(origin, point(mix(origin.x, out.x, .70), mix(origin.y, out.y, .42), mix(origin.z, out.z, .70)), out, .023, .012, 3, 5, bearing);
      for (let k = 0; k < 2; k++) {
        const forkBearing = bearing + (k ? .72 : -.63), start = secondary.getPoint(k ? .82 : .57);
        const forkLength = .065 + .038 * (.5 + .5 * Math.cos(i + j * 2 + k + phase));
        const end = point(out.x + Math.cos(forkBearing) * forkLength, out.y + .08 + .075 * (.5 + .5 * Math.sin(i * 2.4 + j + k)), out.z + Math.sin(forkBearing) * forkLength);
        const tertiary = add(start, point(mix(start.x, end.x, .57), mix(start.y, end.y, .43), mix(start.z, end.z, .57)), end, .014, .006, 2, 4, forkBearing);
        if (!far && k === 0 && i % 3 === 0) {
          const bud = tertiary.getPoint(.68), endBud = point(end.x + .047 * Math.cos(forkBearing - 1.1), end.y + .025 + .036 * (.5 + .5 * Math.cos(j + i)), end.z + .047 * Math.sin(forkBearing - 1.1));
          add(bud, point(mix(bud.x, endBud.x, .62), mix(bud.y, endBud.y, .54), mix(bud.z, endBud.z, .62)), endBud, .012, .006, 2, 5, forkBearing);
        }
      }
    }
  }
  return parts;
}

function table(variant, far) {
  // A flat-topped, densely branching corymbose canopy. All tips grow from
  // connected curved branches; there is no solid cup or scalloped bowl.
  const phase=variant*1.91,arms=far?5:8;
  const parts=[basalMound(.105,.035,far?12:18,3,variant)];
  for(let i=0;i<arms;i++){
    const angle=i/arms*TAU+phase+.07*Math.sin(i*2.7),spread=.31+.035*Math.cos(i*1.9+phase);
    const start=point(.012*Math.cos(angle),.032,.012*Math.sin(angle));
    const end=point(Math.cos(angle)*spread,.155+.018*Math.sin(i+phase),Math.sin(angle)*spread);
    const control=point(end.x*.57,.085,end.z*.57);
    parts.push(stem(start,control,end,.041,.016,far?2:3,5,angle));
    const main=new THREE.QuadraticBezierCurve3(start,control,end);
    for(let branch=0;branch<2;branch++){
      const bearing=angle+(branch? .32:-.32),origin=main.getPoint(.50+branch*.20);
      const tip=point(Math.cos(bearing)*(.39+.02*Math.cos(i)),.213+.015*Math.cos(i+branch),Math.sin(bearing)*.39);
      const bend=origin.clone().lerp(tip,.62);bend.y-=.012;
      parts.push(stem(origin,bend,tip,.019,.009,far?1:2,4,bearing));
    }
    const tips=far?5:12;
    for(let k=0;k<tips;k++){
      const t=.45+(k%4)*.15,origin=main.getPoint(t),bearing=angle+(k/(tips-1)-.5)*1.15;
      const reach=.055+.105*Math.sqrt((k+.5)/tips),tip=point(origin.x+Math.cos(bearing)*reach,
        .250+.037*Math.sin(i*1.9+k*.73+phase),origin.z+Math.sin(bearing)*reach);
      const bend=origin.clone().lerp(tip,.62);bend.y=origin.y+(tip.y-origin.y)*.40;
      parts.push(stem(origin,bend,tip,.014,.006,far?1:2,far?4:5,i+k));
    }
  }
  return parts;
}

function massive(variant, far) {
  const sectors = far ? 20 : 48, rings = far ? 9 : 24, phase = variant * 2.17;
  const positions = [], indices = [], uv = [], height = variant ? .57 : .69;
  for (let row = 0; row <= rings; row++) {
    const e = row / rings * Math.PI / 2, radial = Math.cos(e), y = Math.sin(e);
    for (let side = 0; side <= sectors; side++) {
      const a = side / sectors * TAU;
      const lobes = .14 * Math.sin(a * 3 + phase) + .073 * Math.cos(a * 5 - phase) + .055 * Math.sin(e * 2) * Math.cos(a * 2 + phase);
      const r = .45 * radial * (1 + lobes * (1 - y * .20));
      // Height remains monotone along each meridian so the closed broad base
      // and outer head face outward. Off-centre shoulders and broad lobes are
      // whole geometry, rather than only color mottling on a regular dome.
      const py = height * y * (1 + .10 * Math.cos(a * 3 + phase) * radial * radial) + .011*y*radial*Math.sin(a*17+e*11)*Math.cos(e*23-a*7);
      positions.push(Math.cos(a) * r + .032 * y * y * Math.sin(phase + e), py,
        Math.sin(a) * r * (.92 + .035 * y) + .021 * y * y * Math.cos(phase + e));
      uv.push(side / sectors, row / rings);
      if (row < rings && side < sectors) {
        const i = row * (sectors + 1) + side;
        indices.push(i, i + sectors + 1, i + 1, i + 1, i + sectors + 1, i + sectors + 2);
      }
    }
  }
  const center = positions.length / 3; positions.push(0, 0, 0); uv.push(.5, .5);
  for (let side = 0; side < sectors; side++) indices.push(center, side, side + 1);
  return [mesh(positions, indices, uv)];
}

function fan(variant, far) {
  const parts = [basalMound(.11, .037, 12, 3, 1)];
  parts.push(stem(point(0, 0, 0), point(-.012, .13, .01), point(0, .21, .018), .025, .014, 4, 6));
  // A rooted, irregular vascular graph gives natural open spaces. A regular
  // triangular/diamond lattice would read as a manufactured net in the tour.
  let state = 7187 + variant * 1367;
  const random = () => { state = (1664525 * state + 1013904223) >>> 0; return state / 4294967296; };
  const desired = far ? 48 : 112, separation = far ? .068 : .043;
  const nodes = [{ p: point(0, .205, .018), parent: -1, descendants: 1 }];
  for (let attempt = 0; nodes.length < desired && attempt < 5000; attempt++) {
    const x = (random() * 2 - 1) * .43, y = .22 + random() * .73;
    const outline = .43 * (1 + .09 * Math.sin(y * 13) + .06 * Math.cos(y * 27));
    if ((x / outline) ** 2 + ((y - .61) / .38) ** 2 > 1) continue;
    const p = point(x + .033 * Math.sin(y * 8), y, .032 * Math.sin(x * 4 + y * 3) + .008 * Math.sin(x * 31 - y * 24));
    if (nodes.some(n => n.p.distanceToSquared(p) < separation ** 2)) continue;
    nodes.push({ p, parent: -1, descendants: 1 });
  }
  nodes.sort((a, b) => a.p.y - b.p.y);
  const edges = [], linked = new Set(), degrees = new Array(nodes.length).fill(0);
  const addEdge = (a, b, main) => {
    const key = `${Math.min(a, b)},${Math.max(a, b)}`;
    if (a === b || linked.has(key)) return;
    linked.add(key); edges.push({ a, b, main }); degrees[a]++; degrees[b]++;
  };
  for (let i = 1; i < nodes.length; i++) {
    let parent = 0, score = Infinity;
    for (let j = 0; j < i; j++) {
      const distance = nodes[i].p.distanceTo(nodes[j].p) + .12 * Math.abs(nodes[i].p.x - nodes[j].p.x);
      if (distance < score) { score = distance; parent = j; }
    }
    nodes[i].parent = parent; addEdge(parent, i, true);
  }
  for (let i = nodes.length - 1; i > 0; i--) nodes[nodes[i].parent].descendants += nodes[i].descendants;
  for (let i = 1; i < nodes.length; i++) {
    if (degrees[i] >= 4) continue;
    let other = -1, distance = .125;
    for (let j = 1; j < nodes.length; j++) {
      if (j === i || degrees[j] >= 4 || linked.has(`${Math.min(i, j)},${Math.max(i, j)}`)) continue;
      const d = nodes[i].p.distanceTo(nodes[j].p);
      if (d < distance) { distance = d; other = j; }
    }
    if (other >= 0 && random() > .18) addEdge(i, other, false);
  }
  for (const { a, b, main } of edges) {
    const start = nodes[a].p, end = nodes[b].p, control = start.clone().add(end).multiplyScalar(.5);
    control.x += .009 * Math.sin(a * 2.4 + b); control.y += .006 * Math.sin(a + b * 1.7);
    const radius = main ? .0035 + .010 * Math.sqrt(nodes[b].descendants / nodes.length) : .0033;
    parts.push(stem(start, control, end, radius * 1.1, radius, 2, far ? 3 : 4, a + b, false));
  }
  return parts;
}

function finalize(form, variant, detail) {
  const far = detail === 'distant', builders = { branching, table, massive, fan };
  const parts = builders[form](variant, far), geometry = mergeGeometries(parts, false);
  parts.forEach(p => p.dispose());
  const position = geometry.getAttribute('position');
  let radial = 0, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < position.count; i++) {
    radial = Math.max(radial, Math.hypot(position.getX(i), position.getZ(i)));
    minY = Math.min(minY, position.getY(i)); maxY = Math.max(maxY, position.getY(i));
  }
  const colors = new Float32Array(position.count * 3), low = new THREE.Color(palette[form][0]), high = new THREE.Color(palette[form][1]), color = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i) * .489 / radial, y = clamp((position.getY(i) - minY) / (maxY - minY), 0, 1), z = position.getZ(i) * .489 / radial;
    position.setXYZ(i, x, y, z);
    const tissue = .04 * Math.sin(x * 49 + y * 21) * Math.cos(z * 47 - y * 9);
    // Small surface mottling and pale growth ends remain restrained at normal
    // observation distance; these do not identify live taxa or bleaching state.
    const light = form === 'fan' ? .25 + .27 * y + tissue : .15 + .55 * y + tissue;
    color.copy(low).lerp(high, clamp(light, 0, 1)); colors.set(color.toArray(), i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  let rootRadius = 0;
  for (let i = 0; i < position.count; i++) if (position.getY(i) <= .025) rootRadius = Math.max(rootRadius, Math.hypot(position.getX(i), position.getZ(i)));
  geometry.userData = { role: 'living-colony-display-not-biomass', sourceKind: 'authored-growth-form-approximation', form, variant, detail, rootRadius, rootBandY: .025, unitEnvelope: 'y 0..1; XZ radius <= .5', license: 'project-authored-no-third-party-mesh' };
  return geometry;
}

export function shallowLiveReefGeometries(detail = 'near') {
  if (!['near', 'distant'].includes(detail)) throw new Error(`Unknown shallow live reef detail: ${detail}`);
  const result = {};
  for (const form of ['branching', 'table', 'massive', 'fan']) for (let variant = 0; variant < (form === 'fan' ? 1 : 2); variant++) result[`${form}-${variant}`] = finalize(form, variant, detail);
  return result;
}

export function shallowReefRubbleGeometry() {
  const parts = [], paths = [
    [[-.31, .06, -.18], [-.12, .085, -.09], [.16, .025, -.12], .060, .035],
    [[.07, .09, .17], [.22, .12, .12], [.32, .09, -.03], .046, .027],
    [[-.23, .04, .23], [-.12, .065, .20], [.02, .09, .24], .038, .025],
    [[-.12, .09, -.32], [-.03, .08, -.22], [.04, .065, -.13], .035, .021],
  ];
  paths.forEach(([start, control, end, radius, tip], piece) => {
    const fragment = stem(point(...start), point(...control), point(...end), radius, tip, 3, 6, piece);
    const positions = fragment.attributes.position;
    let low = Infinity;
    for (let i = 0; i < positions.count; i++) {
      // Uneven break faces are explicit geometry, with angular cylinder
      // sections and a tapering branch bend, rather than rounded pebbles.
      if (i >= 3 * 7 && i < 4 * 7) positions.setY(i, positions.getY(i) + .016 * Math.sin(i * 2.4 + piece));
      low = Math.min(low, positions.getY(i));
    }
    fragment.translate(0, -low, 0); parts.push(fragment);
  });
  const slab = basalMound(.10, .062, 7, 2, .5, true); slab.translate(.18, 0, -.24); parts.push(slab);
  const geometry = mergeGeometries(parts, false); parts.forEach(g => g.dispose());
  const positions = geometry.attributes.position;
  let radius = 0, height = 0;
  for (let i = 0; i < positions.count; i++) {
    radius = Math.max(radius, Math.hypot(positions.getX(i), positions.getZ(i)));
    height = Math.max(height, positions.getY(i));
  }
  const colors = new Float32Array(positions.count * 3), color = new THREE.Color(), base = new THREE.Color('#c3b99a'), dark = new THREE.Color('#9e987f');
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i) * .488 / radius, y = positions.getY(i) / height, z = positions.getZ(i) * .488 / radius;
    positions.setXYZ(i, x, y, z);
    const pits = Math.sin(x * 87 + y * 30) * Math.cos(z * 91 + y * 17);
    color.copy(base).lerp(dark, .22 + .21 * Math.max(0, pits)); colors.set(color.toArray(), i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  geometry.userData = { role: 'reef-skeleton-rubble-display-not-biomass', sourceKind: 'authored-broken-fragment-approximation', pieceCount: 5, unitEnvelope: 'y 0..1; XZ radius <= .5', poreRepresentation: 'surface color mottling; no resolved physical pore voids' };
  return geometry;
}
