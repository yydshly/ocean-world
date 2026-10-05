import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Only these three regional representatives use this finite kit. The displayed
// metre is a different measure for each animal; no old organism is rebuilt.
export const REEF_GUILD_ASSET_IDS = Object.freeze(['day-octopus', 'spotted-reef-crab', 'tube-sponge']);
export const REEF_GUILD_ENVELOPES = Object.freeze({
  'day-octopus': Object.freeze({ sizeMeasure: 'arm-envelope', horizontalRadius: .5, height: .255 }),
  'spotted-reef-crab': Object.freeze({ sizeMeasure: 'carapace-width', horizontalRadius: 1.1, height: .39 }),
  'tube-sponge': Object.freeze({ sizeMeasure: 'height', horizontalRadius: .35, height: 1 }),
});
const resources = new Map(), instances = new Set();
const TAU = Math.PI * 2;
export const isReefGuildSpecies = id => REEF_GUILD_ASSET_IDS.includes(id);

function share(root, key, make) {
  let entry = resources.get(key);
  if (!entry) { entry = { value: make(), refs: 0 }; resources.set(key, entry); }
  if (!root.userData.guildResources.has(key)) { root.userData.guildResources.add(key); entry.refs++; }
  return entry.value;
}
function finish(shape) {
  shape.computeVertexNormals(); shape.computeBoundingBox(); shape.computeBoundingSphere(); return shape;
}
function colored(shape, color) {
  shape.deleteAttribute('uv');
  const rgb = new THREE.Color(color), colors = new Float32Array(shape.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) { colors[i] = rgb.r; colors[i + 1] = rgb.g; colors[i + 2] = rgb.b; }
  shape.setAttribute('color', new THREE.BufferAttribute(colors, 3)); return shape;
}
function ellipsoid(center, scale, color, columns = 16, rows = 8) {
  const shape = colored(new THREE.SphereGeometry(1, columns, rows), color);
  shape.scale(...scale); shape.translate(...center); return shape;
}
function merged(parts) {
  const result = mergeGeometries(parts); for (const part of parts) part.dispose(); return finish(result);
}
function tube(points, radii, color, flatten = 1, sides = 8) {
  const positions = [], indices = [], rgb = new THREE.Color(color), colors = [];
  for (let row = 0; row < points.length; row++) {
    const previous = points[Math.max(0, row - 1)], next = points[Math.min(points.length - 1, row + 1)];
    const dx = next[0] - previous[0], dz = next[2] - previous[2], length = Math.hypot(dx, dz) || 1;
    for (let side = 0; side < sides; side++) {
      const angle = side / sides * TAU, lateral = Math.cos(angle) * radii[row];
      positions.push(points[row][0] - dz / length * lateral,
        points[row][1] + Math.sin(angle) * radii[row] * flatten,
        points[row][2] + dx / length * lateral);
      const shade = .9 + .1 * (Math.sin(angle) + 1) / 2;
      colors.push(rgb.r * shade, rgb.g * shade, rgb.b * shade);
      if (row) {
        const a = (row - 1) * sides + side, b = (row - 1) * sides + (side + 1) % sides;
        indices.push(a, b, a + sides, b, b + sides, a + sides);
      }
    }
  }
  for (const row of [0, points.length - 1]) {
    const center = positions.length / 3; positions.push(...points[row]); colors.push(rgb.r, rgb.g, rgb.b);
    for (let side = 0; side < sides; side++) {
      const a = row * sides + side, b = row * sides + (side + 1) % sides;
      indices.push(...(row === 0 ? [center, b, a] : [center, a, b]));
    }
  }
  const result = new THREE.BufferGeometry(); result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  result.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); result.setIndex(indices); return finish(result);
}

function octopusBody() {
  return merged([
    ellipsoid([-.13, .13, 0], [.20, .125, .145], '#9b7a59'),
    ellipsoid([.055, .078, 0], [.11, .078, .12], '#a78966'),
    ellipsoid([.094, .135, -.090], [.028, .029, .021], '#272d28', 10, 6),
    ellipsoid([.094, .135, .090], [.028, .029, .021], '#272d28', 10, 6),
  ]);
}
function octopusArm(index) {
  const angle = [-165, -120, -90, -35, 35, 90, 120, 165][index] * Math.PI / 180;
  const point = (radius, turn, y) => [Math.cos(angle + turn) * radius, y, Math.sin(angle + turn) * radius];
  // Eight tapering low arms, including a small curl; the total radial envelope
  // stays at .5 under yaw animation, independently of loading order.
  return tube([point(.06, 0, .052), point(.16, .06, .035), point(.29, -.055, .025),
    point(.40, -.025, .015), point(.494, 0, .006)], [.060, .045, .029, .015, .006], '#ae8b65', .30);
}
function crabBody() {
  const shell = ellipsoid([0, .215, 0], [.38, .17, .5], '#cfb596', 20, 10);
  const positions = shell.attributes.position, colors = shell.attributes.color;
  const red = new THREE.Color('#9d4136');
  const patches = [[-.15, -.28], [-.15, .28], [.12, -.30], [.12, .30], [.24, 0], [-.26, 0]];
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), z = positions.getZ(i), y = positions.getY(i);
    if (y > .20 && patches.some(([px, pz]) => (x - px) ** 2 + (z - pz) ** 2 < .009)) colors.setXYZ(i, red.r, red.g, red.b);
  }
  const parts = [shell];
  for (const side of [-1, 1]) {
    parts.push(ellipsoid([.33, .27, side * .22], [.027, .035, .024], '#242b25', 8, 6));
    // Two stout front chelae are part of the complete neutral silhouette.
    parts.push(tube([[.24, .18, side * .23], [.45, .14, side * .49], [.66, .13, side * .38]],
      [.11, .09, .095], '#af806a', .75));
    parts.push(ellipsoid([.67, .125, side * .36], [.15, .095, .10], '#b68c77', 12, 6));
    parts.push(tube([[.70, .12, side * .32], [.84, .10, side * .25], [.79, .10, side * .29]],
      [.041, .025, .012], '#a47965', .65));
    parts.push(tube([[.68, .12, side * .41], [.81, .11, side * .44], [.84, .10, side * .35]],
      [.043, .029, .012], '#a47965', .65));
  }
  return merged(parts);
}
function crabLeg(index) {
  const side = index < 4 ? -1 : 1, slot = index % 4;
  const x = [.25, .085, -.085, -.25][slot], tipX = [.45, .20, -.20, -.43][slot];
  return tube([[x, .15, side * .36], [x + .04, .14, side * .70], [tipX, .055, side * .96],
    [tipX, .014, side * .96]], [.041, .032, .019, .014], '#ab836d', .75);
}
function spongeTube(cx, cz, height, radius, index) {
  const positions = [], colors = [], indices = [], sides = 12, rows = 6;
  const outer = new THREE.Color('#967c47'), inner = new THREE.Color('#3c4938');
  // Both wall surfaces and a thick open rim are geometry, not painted mouths.
  for (const inside of [false, true]) for (let row = 0; row <= rows; row++) {
    const f = row / rows;
    for (let side = 0; side < sides; side++) {
      const angle = side / sides * TAU;
      const swell = 1 + Math.sin(f * 4.1 + index) * .055 + Math.cos(angle * 3 + index) * .055;
      const r = radius * (inside ? .64 : swell) * (1 + (1 - f) * .13);
      const leanX = Math.sin(index + .5) * f * .018, leanZ = Math.cos(index) * f * .017;
      positions.push(cx + leanX + Math.cos(angle) * r, height * f, cz + leanZ + Math.sin(angle) * r);
      const rgb = inside ? inner : outer, shade = inside ? .8 + .2 * f : .86 + Math.sin(angle * 4 + f * 5) * .10;
      colors.push(rgb.r * shade, rgb.g * shade, rgb.b * shade);
      if (row) {
        const a = (inside ? (rows + 1) * sides : 0) + (row - 1) * sides + side;
        const b = a - side + (side + 1) % sides;
        indices.push(...(inside ? [a, a + sides, b, b, a + sides, b + sides] : [a, b, a + sides, b, b + sides, a + sides]));
      }
    }
  }
  const offset = (rows + 1) * sides;
  for (let side = 0; side < sides; side++) {
    const a = rows * sides + side, b = rows * sides + (side + 1) % sides;
    indices.push(a, a + offset, b, b, a + offset, b + offset);
  }
  // A low interior floor closes the tube's base, while the osculum stays open.
  const center = positions.length / 3; positions.push(cx, 0, cz); colors.push(inner.r, inner.g, inner.b);
  for (let side = 0; side < sides; side++) indices.push(center, offset + side, offset + (side + 1) % sides);
  const shape = new THREE.BufferGeometry(); shape.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  shape.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); shape.setIndex(indices); return finish(shape);
}
function spongeColony() {
  return merged([[-.12, -.12, 1, .090], [.13, -.10, .74, .087], [-.13, .12, .61, .083],
    [.12, .13, .84, .082], [0, .01, .48, .075]].map((values, index) => spongeTube(...values, index)));
}

function addMesh(parent, shape, material, name) {
  const object = new THREE.Mesh(shape, material); object.name = name;
  object.castShadow = false; object.receiveShadow = true; object.userData.oceanStreaming = true;
  parent.add(object); return object;
}
export function createReefGuildOrganism(species) {
  if (!isReefGuildSpecies(species?.id)) throw new Error('Unknown reef guild representative');
  const root = new THREE.Group(), id = species.id;
  root.name = species.commonName ?? id;
  Object.assign(root.userData, { speciesId: id, kind: species.kind, oceanStreaming: true,
    guildResources: new Set(), guildDisposed: false, phase: 0,
    sizeMeasure: REEF_GUILD_ENVELOPES[id].sizeMeasure,
    localEnvelope: { horizontalRadius: REEF_GUILD_ENVELOPES[id].horizontalRadius,
      bottom: 0, top: REEF_GUILD_ENVELOPES[id].height },
    morphologyStatus: 'simplified complete regional life silhouette; not calibrated anatomy',
    originConvention: 'lower support reference plane; sampled ecological Y is authoritative',
  });
  instances.add(root);
  try {
    const material = share(root, 'material/guild-skin', () => new THREE.MeshStandardMaterial({
      color: '#ffffff', vertexColors: true, roughness: .88, metalness: 0, side: THREE.DoubleSide }));
    if (id === 'tube-sponge') {
      addMesh(root, share(root, `${id}/colony`, spongeColony), material, 'Irregular living tubes with open oscula');
      root.userData.motion = { type: 'fixed-sponge', parts: [] }; return root;
    }
    const octopus = id === 'day-octopus', near = new THREE.Group(), far = new THREE.Group();
    near.name = 'Near complete guild silhouette'; far.name = 'Far complete guild silhouette';
    root.add(near, far); far.visible = false;
    const body = share(root, `${id}/body`, octopus ? octopusBody : crabBody);
    addMesh(near, body, material, octopus ? 'Mantle head and paired eyes' : 'Broad spotted carapace and paired claws');
    const shapes = [body], parts = [];
    for (let index = 0; index < 8; index++) {
      const pivot = new THREE.Group(); pivot.name = `${octopus ? 'Arm' : 'Walking leg'} ${index + 1}`; near.add(pivot);
      const shape = share(root, `${id}/limb/${index}`, () => octopus ? octopusArm(index) : crabLeg(index));
      addMesh(pivot, shape, material, pivot.name); shapes.push(shape); parts.push(pivot);
    }
    const farShape = share(root, `${id}/far`, () => merged(shapes.map(shape => shape.clone())));
    addMesh(far, farShape, material, 'Whole static distant outline');
    root.userData.motion = { type: octopus ? 'octopus-arms' : 'crab-gait', parts };
    root.userData.guildDetail = { level: 'near', near, far, farAboveSizeUnits: 24, nearBelowSizeUnits: 18 };
    return root;
  } catch (error) { disposeReefGuildOrganism(root); throw error; }
}

export function animateReefGuildOrganism(root, timeSec, agent = {}) {
  if (!root || root.userData.guildDisposed || !root.userData.motion) return;
  const motion = root.userData.motion;
  if (motion.type === 'fixed-sponge') return;
  const time = Number.isFinite(timeSec) ? timeSec : 0, phase = Number.isFinite(root.userData.phase) ? root.userData.phase : 0;
  const active = !['resting', 'sheltering', 'fixed', 'ambushing'].includes(agent.state);
  const velocity = Math.hypot(agent.velocity?.x || 0, agent.velocity?.z || 0);
  const activity = active ? Math.min(1, velocity / (motion.type === 'crab-gait' ? .012 : .018)) : 0;
  for (let index = 0; index < motion.parts.length; index++) {
    // Flat yaw keeps the entire foot/arm envelope on or above the shared
    // support plane. This illustrative gait never moves the durable animal.
    motion.parts[index].rotation.y = Math.sin(time * (motion.type === 'crab-gait' ? 3.2 : 1.2) + phase + index * 1.3)
      * (motion.type === 'crab-gait' ? .022 : .038) * activity;
  }
}
const worldScale = new THREE.Vector3();
export function updateReefGuildDetail(root, distanceM) {
  const detail = root?.userData.guildDetail;
  if (!detail || root.userData.guildDisposed || !Number.isFinite(distanceM) || distanceM < 0) return;
  root.getWorldScale(worldScale);
  const sizeUnits = distanceM / Math.max(1e-6, Math.abs(worldScale.x));
  const level = detail.level === 'near' ? sizeUnits > detail.farAboveSizeUnits ? 'far' : 'near'
    : sizeUnits < detail.nearBelowSizeUnits ? 'near' : 'far';
  detail.level = level; detail.near.visible = level === 'near'; detail.far.visible = level === 'far'; return level;
}
export function disposeReefGuildOrganism(root) {
  if (!root || root.userData.guildDisposed) return;
  root.userData.guildDisposed = true;
  for (const key of root.userData.guildResources ?? []) {
    const entry = resources.get(key);
    if (entry && --entry.refs <= 0) { entry.value.dispose(); resources.delete(key); }
  }
  root.userData.guildResources?.clear(); instances.delete(root); root.removeFromParent(); root.clear();
}
export function reefGuildAssetStats() {
  return { resources: resources.size, instances: instances.size };
}
