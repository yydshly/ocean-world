import * as THREE from 'three';

// Source-grounded representative shapes. This module does not choose a biome,
// move an agent, produce food, or add illumination. See docs/DEEP_ASSETS.md.
const cache = new Map();
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;
let serial = 0;

const TYPES = {
  pig: { id: 'sea-pig-group', scientificName: 'Scotoplanes spp.', identityLevel: 'genus-group',
    measure: 'body-length', source: 'https://www.mbari.org/animal/sea-pig/', range: [.08, .16] },
  fish: { id: 'rattail-family', scientificName: 'Macrouridae', identityLevel: 'family-group',
    measure: 'body-length', source: 'https://www.mbari.org/animal/rattail-fish/', range: [.35, .75] },
  anemone: { id: 'pom-pom-anemone', scientificName: 'Liponema brevicorne', identityLevel: 'species',
    measure: 'expanded-diameter', source: 'https://www.mbari.org/animal/pom-pom-anemone/', range: [.12, .28] },
};

function share(root, key, create) {
  let entry = cache.get(key);
  if (!entry) { entry = { value: create(), refs: 0 }; cache.set(key, entry); }
  if (!root.userData.shared.has(key)) { root.userData.shared.add(key); entry.refs++; }
  return entry.value;
}

function own(root, item) { root.userData.owned.push(item); return item; }
function mat(root, key, options) {
  return share(root, `mat/${key}`, () => new THREE.MeshStandardMaterial({ metalness: 0,
    emissive: '#000000', emissiveIntensity: 0, ...options }));
}
function mesh(root, shape, material) {
  const out = new THREE.Mesh(shape, material);
  out.castShadow = out.receiveShadow = true; root.add(out); return out;
}
function randomFor(seed) {
  let state = 2166136261;
  for (const c of seed) state = Math.imul(state ^ c.charCodeAt(0), 16777619);
  return () => {
    state += 0x6D2B79F5;
    let n = Math.imul(state ^ state >>> 15, state | 1);
    n ^= n + Math.imul(n ^ n >>> 7, n | 61);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}

function shape(pos, idx, uv, colors, motion) {
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv ?? Array(pos.length / 3 * 2).fill(0), 2));
  out.setAttribute('color', new THREE.Float32BufferAttribute(colors ?? Array(pos.length).fill(1), 3));
  out.setAttribute('motion', new THREE.Float32BufferAttribute(motion ?? Array(pos.length / 3 * 4).fill(0), 4));
  out.setIndex(idx); out.computeVertexNormals(); out.computeBoundingSphere();
  return out;
}

function wrapped(shape, rings, sides) {
  shape.userData.seams = Array.from({ length: rings }, (_, ring) =>
    [ring * (sides + 1), ring * (sides + 1) + sides]);
  return smoothNormals(shape);
}
function smoothNormals(shape) {
  const n = shape.attributes.normal;
  for (const [a, b] of shape.userData.seams ?? []) {
    const vector = V(n.getX(a) + n.getX(b), n.getY(a) + n.getY(b), n.getZ(a) + n.getZ(b)).normalize();
    n.setXYZ(a, vector.x, vector.y, vector.z); n.setXYZ(b, vector.x, vector.y, vector.z);
  }
  return shape;
}

function join(parts) {
  const p = [], uv = [], col = [], motion = [], idx = [], seams = [];
  let offset = 0;
  for (const part of parts) {
    p.push(...part.attributes.position.array); uv.push(...part.attributes.uv.array);
    col.push(...part.attributes.color.array); motion.push(...part.attributes.motion.array);
    for (const [a, b] of part.userData.seams ?? []) seams.push([a + offset, b + offset]);
    for (const i of part.index.array) idx.push(i + offset);
    offset += part.attributes.position.count; part.dispose();
  }
  const out = shape(p, idx, uv, col, motion); out.userData.seams = seams;
  return smoothNormals(out);
}

// Tags are [kind, appendageIndex, lengthFraction, side]. Tubes use smoothly
// transported cross-sections instead of intersecting cone/cylinder segments.
function tube(points, radii, sides, tint, tags = [0, 0, 0], flatten = 1) {
  const pos = [], uv = [], colors = [], idx = [], motion = [];
  const color = new THREE.Color(tint); let previous = null;
  for (let ring = 0; ring < points.length; ring++) {
    const tangent = points[Math.min(ring + 1, points.length - 1)].clone()
      .sub(points[Math.max(0, ring - 1)]).normalize();
    let a = previous?.clone().addScaledVector(tangent, -previous.dot(tangent));
    if (!a || a.lengthSq() < .00001) a = new THREE.Vector3().crossVectors(tangent,
      Math.abs(tangent.y) > .85 ? V(1, 0, 0) : V(0, 1, 0));
    a.normalize(); previous = a;
    const b = new THREE.Vector3().crossVectors(tangent, a).normalize();
    const t = ring / (points.length - 1), radius = radii[ring];
    for (let side = 0; side <= sides; side++) {
      const angle = side / sides * TAU;
      const point = points[ring].clone().addScaledVector(a, Math.cos(angle) * radius)
        .addScaledVector(b, Math.sin(angle) * radius * flatten);
      pos.push(point.x, point.y, point.z); uv.push(side / sides, t);
      const shade = .93 + .07 * Math.sin(angle + t * 1.2);
      colors.push(color.r * shade, color.g * shade, color.b * shade);
      motion.push(tags[0], tags[1], t, tags[2]);
      if (ring < points.length - 1 && side < sides) {
        const p = ring * (sides + 1) + side;
        idx.push(p, p + 1, p + sides + 1, p + 1, p + sides + 2, p + sides + 1);
      }
    }
  }
  return wrapped(shape(pos, idx, uv, colors, motion), points.length, sides);
}

function animated(root, key, factory, material, channel) {
  const base = share(root, `geo/${key}`, factory);
  const instance = own(root, base.clone());
  instance.attributes.position.setUsage(THREE.DynamicDrawUsage);
  const item = mesh(root, instance, material);
  // A conservative bound avoids clipping softly bending tips without updating
  // bounds each frame. Actual vertex displacement is constrained below .07.
  instance.boundingSphere.radius += .08;
  root.userData.animation.push({ channel, item, rest: base.attributes.position.array,
    tags: base.attributes.motion.array });
  return item;
}

function microSurface(root, kind) {
  return share(root, `texture/${kind}`, () => {
    const size = 128, data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const grain = Math.sin(x * 3.7 + y * 2.9) * Math.cos(y * .39 - x * .55);
      const v = kind === 'fish' ? .47 + .12 * Math.cos((x + (Math.floor(y / 5) % 2) * 3) * TAU / 6) *
        Math.sin(y * TAU / 5) + grain * .03 : .50 + grain * .04 + Math.sin(x * .6 + y * .4) * .018;
      const p = (y * size + x) * 4;
      data[p] = data[p + 1] = data[p + 2] = clamp(v * 255, 0, 255); data[p + 3] = 255;
    }
    const out = new THREE.DataTexture(data, size, size);
    out.wrapS = out.wrapT = THREE.RepeatWrapping;
    out.generateMipmaps = true; out.minFilter = THREE.LinearMipmapLinearFilter;
    out.needsUpdate = true; return out;
  });
}

// Authored external-surface variation, not a measured species pattern or an
// internal-organ anatomy. A shared colour map makes close views less uniform
// without extra meshes, shader passes, transmission buffers or illumination.
function skinColour(root, kind) {
  return share(root, `texture/${kind}-colour`, () => {
    const size = 256, data = new Uint8Array(size * size * 4);
    const base = kind === 'fish' ? [238, 231, 216] : [255, 246, 241];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const grain = Math.sin(x * 2.47 + y * 3.31) * Math.cos(y * .73 - x * .49);
      const mottle = Math.sin(x * .087 + Math.sin(y * .049) * 2.6) *
        Math.cos(y * .073 + Math.sin(x * .043) * 1.7);
      let shade;
      if (kind === 'fish') {
        const row = Math.floor(y / 9), dx = ((x + (row % 2) * 5) % 10) / 10 - .5;
        const dy = (y % 9) / 9;
        const scaleEdge = Math.exp(-((dy - (.32 + dx * dx * 1.35)) ** 2) * 180);
        shade = .935 + mottle * .039 + grain * .012 - scaleEdge * .055;
      } else {
        shade = .965 + mottle * .024 + grain * .005;
      }
      const offset = (y * size + x) * 4;
      for (let channel = 0; channel < 3; channel++) data[offset + channel] =
        clamp(Math.round(base[channel] * shade), 0, 255);
      data[offset + 3] = 255;
    }
    const out = new THREE.DataTexture(data, size, size);
    out.colorSpace = THREE.SRGBColorSpace;
    out.wrapS = out.wrapT = THREE.RepeatWrapping;
    out.generateMipmaps = true; out.minFilter = THREE.LinearMipmapLinearFilter;
    out.needsUpdate = true; return out;
  });
}

const PIG_FEET = Array.from({ length: 12 }, (_, index) => {
  const i = Math.floor(index / 2), side = index % 2 ? 1 : -1;
  const mid = Math.sin(i / 5 * Math.PI);
  return { side, start: V(.31 - i * .139, .205, side * (.133 + mid * .067)),
    end: V(.34 - i * .142, 0, side * (.265 + mid * .066)), radius: .024 + mid * .018 };
});

function pigBody() {
  const p = [], idx = [], uv = [], col = [];
  const rows = 40, sides = 28;
  const white = new THREE.Color('#eed6d0'), pink = new THREE.Color('#d8a09b');
  for (let row = 0; row <= rows; row++) for (let j = 0; j <= sides; j++) {
    const t = row / rows, angle = j / sides * TAU;
    const fullness = Math.pow(Math.max(0, Math.sin(t * Math.PI)), .43);
    const x = -.5 + t * .93;
    const y = .252 + Math.sin(t * Math.PI) * .018 + Math.sin(angle) * .173 * fullness;
    const z = Math.cos(angle) * .216 * fullness * (1 - t * .10);
    p.push(x, y, z); uv.push(j / sides * 2, t * 2);
    const color = white.clone().lerp(pink, .14 + .30 * Math.sin(t * Math.PI) * Math.max(0, -Math.sin(angle)));
    col.push(color.r, color.g, color.b);
    if (row < rows && j < sides) {
      const k = row * (sides + 1) + j;
      idx.push(k, k + sides + 1, k + 1, k + 1, k + sides + 1, k + sides + 2);
    }
  }
  return wrapped(shape(p, idx, uv, col), rows + 1, sides);
}

function pigAppendages() {
  const parts = [];
  for (let i = 0; i < PIG_FEET.length; i++) {
    const f = PIG_FEET[i];
    parts.push(tube([f.start, f.start.clone().lerp(f.end, .37).add(V(-.025, .012, f.side * .008)),
      f.start.clone().lerp(f.end, .76), f.end.clone().add(V(-.007, .026, 0)),
      f.end.clone().add(V(0, .009, 0)), f.end],
    [f.radius, f.radius * .88, f.radius * .66, f.radius * .63, f.radius * .69, .001],
    8, '#e2bdb6', [1, i, f.side]));
  }
  // Four long papillae are a documented representative arrangement; this does
  // not claim that every Scotoplanes species has exactly the same appendages.
  for (const x of [-.22, .21]) for (const side of [-1, 1]) {
    const id = (x > 0 ? 2 : 0) + (side > 0 ? 1 : 0);
    parts.push(tube([V(x, .40, side * .095), V(x + .028, .49, side * .155),
      V(x - .012, .64, side * .205), V(x - .055, .735, side * .255),
      V(x - .078, .762, side * .273)], [.026, .022, .015, .007, .0013],
    8, '#eacac2', [2, id, side]));
  }
  const out = join(parts);
  const positions = out.attributes.position;
  for (let i = 0; i < positions.count; i++) positions.setY(i, Math.max(0, positions.getY(i)));
  out.computeVertexNormals(); return smoothNormals(out);
}

function pigOral() {
  const parts = [];
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * TAU;
    const start = V(.409, .158 + Math.sin(a) * .036, Math.cos(a) * .037);
    const end = V(.472, .035 + (Math.sin(a) + 1) * .019, Math.cos(a) * .084);
    parts.push(tube([start, start.clone().lerp(end, .42).add(V(.005, .01, 0)), end],
      [.017, .020, .013], 7, '#d9afa9', [3, i, 0]));
    // Small digitate ends, rather than crustacean claws or a feathered crown.
    for (let digit = 0; digit < 3; digit++) {
      const d = digit - 1;
      parts.push(tube([end, end.clone().add(V(.016, -.007, d * .010)),
        end.clone().add(V(.028, -.011, d * .015))], [.008, .006, .0008],
      5, '#e8cbc3', [3, i, 0]));
    }
  }
  return join(parts);
}

function createPig(root) {
  const surface = microSurface(root, 'soft');
  const colour = skinColour(root, 'soft');
  const skin = mat(root, 'pig/skin', { color: '#ffffff', vertexColors: true, map: colour, roughness: .64,
    bumpMap: surface, bumpScale: .00045, transparent: true, opacity: .92, depthWrite: true });
  const appendages = mat(root, 'pig/appendages', { color: '#ffffff', vertexColors: true,
    map: colour, roughness: .62, transparent: true, opacity: .94, depthWrite: true });
  animated(root, 'pig/body', pigBody, skin, 'pig-body');
  animated(root, 'pig/appendages', pigAppendages, appendages, 'pig-appendages');
  animated(root, 'pig/oral', pigOral, appendages, 'pig-oral');
  root.userData.contactTemplateLocal = PIG_FEET.map(f => f.end.toArray());
  root.userData.contactOrder = 'anterior-to-posterior, left(-Z), right(+Z), 6 pairs';
  root.userData.feedingPointLocal = { x: .472, y: .045, z: 0 };
  root.userData.originConvention = 'mud-contact-plane; stilt endpoints at local y=0';
}

const FISH_PROFILE = [
  [-.5, .0009, .0008], [-.42, .010, .005], [-.28, .027, .013],
  [-.12, .051, .028], [.035, .084, .043], [.18, .119, .058],
  [.29, .108, .062], [.39, .080, .053], [.465, .044, .030], [.5, .008, .002],
];
function fishSection(x) {
  let i = 0;
  while (i < FISH_PROFILE.length - 2 && FISH_PROFILE[i + 1][0] < x) i++;
  const a = FISH_PROFILE[i], b = FISH_PROFILE[i + 1];
  const t = clamp((x - a[0]) / (b[0] - a[0]), 0, 1);
  // Hermite slopes limit overshoot and give a continuous, round body section.
  const out = [];
  for (let channel = 1; channel < 3; channel++) {
    const lo = FISH_PROFILE[Math.max(0, i - 1)], hi = FISH_PROFILE[Math.min(FISH_PROFILE.length - 1, i + 2)];
    const d = (b[channel] - a[channel]) / (b[0] - a[0]);
    let m0 = (b[channel] - lo[channel]) / (b[0] - lo[0]);
    let m1 = (hi[channel] - a[channel]) / (hi[0] - a[0]);
    if (m0 * d <= 0) m0 = 0;
    if (m1 * d <= 0) m1 = 0;
    const length = b[0] - a[0];
    m0 = Math.sign(d) * Math.min(Math.abs(m0), Math.abs(d) * 3);
    m1 = Math.sign(d) * Math.min(Math.abs(m1), Math.abs(d) * 3);
    out.push((2 * t ** 3 - 3 * t * t + 1) * a[channel] + (t ** 3 - 2 * t * t + t) * length * m0 +
      (-2 * t ** 3 + 3 * t * t) * b[channel] + (t ** 3 - t * t) * length * m1);
  }
  return out;
}

function fishBody() {
  const p = [], idx = [], uv = [], col = [];
  const rows = 68, sides = 28;
  const top = new THREE.Color('#81786f'), pale = new THREE.Color('#b4ab9a');
  for (let row = 0; row <= rows; row++) for (let j = 0; j <= sides; j++) {
    const x = -.5 + row / rows, a = j / sides * TAU;
    const [height, width] = fishSection(x);
    p.push(x, .19 + Math.sin(a) * height, Math.cos(a) * width);
    uv.push(j / sides * 2, row / rows * 3);
    const c = top.clone().lerp(pale, (1 - Math.sin(a)) * .42 + .11);
    col.push(c.r, c.g, c.b);
    if (row < rows && j < sides) {
      const k = row * (sides + 1) + j;
      idx.push(k, k + sides + 1, k + 1, k + 1, k + sides + 1, k + sides + 2);
    }
  }
  return wrapped(shape(p, idx, uv, col), rows + 1, sides);
}

function ribbon(rows, sample, tint, tag = 0) {
  const pos = [], idx = [], uv = [], col = [], motion = [];
  const color = new THREE.Color(tint);
  for (let row = 0; row <= rows; row++) {
    const t = row / rows, [base, edge, side] = sample(t);
    for (let j = 0; j <= 3; j++) {
      const f = j / 3, p = base.clone().lerp(edge, f);
      pos.push(p.x, p.y, p.z); uv.push(t, f);
      const shade = .83 + (1 - f) * .17 + Math.cos(t * rows * Math.PI * 2) * .026 * f;
      col.push(color.r * shade, color.g * shade, color.b * shade);
      motion.push(tag, 0, f, side ?? 0);
      if (row < rows && j < 3) {
        const k = row * 4 + j; idx.push(k, k + 1, k + 4, k + 1, k + 5, k + 4);
      }
    }
  }
  return shape(pos, idx, uv, col, motion);
}

function fishFins() {
  const parts = [];
  parts.push(ribbon(20, t => {
    const x = .235 - t * .17, [height] = fishSection(x), y = .19 + height;
    const rise = Math.pow(Math.sin(t * Math.PI), .7) * (.112 - t * .038);
    return [V(x, y - .003, 0), V(x - .004 * Math.sin(t * Math.PI), y + rise, 0), 0];
  }, '#898487'));
  for (const sign of [-1, 1]) parts.push(ribbon(54, t => {
    const x = .034 - t * .534, [height] = fishSection(x);
    const y = .19 + height * sign;
    const width = Math.pow(1 - t, .83) * (sign < 0 ? .058 : .029) * Math.min(1, t * 18);
    return [V(x, y - sign * .003, 0), V(x, y + width * sign, .0014 * Math.sin(t * 35)), 0];
  }, '#968f94'));
  return join(parts);
}

function fishPectorals() {
  const parts = [-1, 1].map(side => ribbon(18, t => {
    const base = V(.198 - t * .073, .176 + t * .035, side * .058);
    const span = Math.pow(Math.sin(t * Math.PI), .64);
    return [base, base.clone().add(V(-.060 * span, -.025 * span, side * .100 * span)), side];
  }, '#aaa2a5', 4));
  // Paired pelvic membranes are forward of the pectoral origin. Ray counts are
  // intentionally not assigned to an unidentified family-level representative.
  for (const side of [-1, 1]) parts.push(ribbon(12, t => {
    const base = V(.262 - t * .047, .096 + t * .004, side * .023);
    const span = Math.pow(Math.sin(t * Math.PI), .67);
    return [base, base.clone().add(V(-.049 * span, -.026 * span, side * .033 * span)), side];
  }, '#aba2a6', 7));
  return join(parts);
}

function finMembrane(root) {
  return share(root, 'texture/rattail-fin-membrane', () => {
    const width = 128, height = 64, pixels = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const edge = y / (height - 1);
      const ribs = Math.exp(-Math.pow(Math.sin(x / width * TAU * 23), 2) * 30);
      const index = (y * width + x) * 4;
      pixels[index] = pixels[index + 1] = pixels[index + 2] = ( .91 + ribs * .08) * 255;
      pixels[index + 3] = (.94 - Math.pow(edge, .75) * .29 + ribs * .025) * 255;
    }
    const out = new THREE.DataTexture(pixels, width, height);
    out.colorSpace = THREE.SRGBColorSpace;
    out.generateMipmaps = true; out.minFilter = THREE.LinearMipmapLinearFilter;
    out.needsUpdate = true; return out;
  });
}

function fishAnatomy() {
  const parts = [];
  for (const side of [-1, 1]) {
    parts.push(fishEye(side));
    const points = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const x = .246 - Math.sin(t * Math.PI) * .018, y = .282 - t * .134;
      points.push(V(x, y, side * (fishSkinZ(x, y) + .0014)));
    }
    parts.push(tube(points, points.map(() => .0011), 5, '#71665b'));
    parts.push(tube([V(.460, .151, side * .011), V(.433, .124, side * .022),
      V(.405, .119, side * .015)], [.0025, .0020, .0015], 5, '#5d555b', [5, 0, side]));
  }
  parts.push(tube([V(.410, .117, 0), V(.400, .081, -.004), V(.385, .046, .002),
    V(.372, .006, 0)], [.0040, .0032, .0023, .0004], 6, '#a8a0a3'));
  return join(parts);
}

function fishSkinZ(x, y) {
  const [height, width] = fishSection(x);
  return width * Math.sqrt(Math.max(0, 1 - ((y - .19) / height) ** 2));
}

// The eye remains large for this family proxy, but its socket follows the
// lateral head surface. The prior stacked spheres protruded like toy eyes.
// No diagnostic iris colour, lens diameter or named-species identity is implied.
function fishEye(side) {
  const p = [], uv = [], col = [], idx = [], sides = 24, rings = 8;
  const skin = new THREE.Color('#8f8272'), iris = new THREE.Color('#514d43');
  const pupil = new THREE.Color('#171b19');
  for (let row = 0; row <= rings; row++) for (let j = 0; j <= sides; j++) {
    const r = row / rings, a = j / sides * TAU;
    const x = .350 + Math.cos(a) * .030 * r, y = .226 + Math.sin(a) * .026 * r;
    const z = side * (fishSkinZ(x, y) + .0010 + (1 - r * r) * .004);
    p.push(x, y, z); uv.push(.5 + Math.cos(a) * r * .5, .5 + Math.sin(a) * r * .5);
    const color = r < .59 ? pupil : r < .87 ? iris.clone().lerp(pupil, (.87 - r) * .5) :
      skin.clone().lerp(iris, (1 - r) / .13);
    col.push(color.r, color.g, color.b);
    if (row < rings && j < sides) {
      const k = row * (sides + 1) + j;
      if (side > 0) idx.push(k, k + sides + 1, k + 1, k + 1, k + sides + 1, k + sides + 2);
      else idx.push(k, k + 1, k + sides + 1, k + 1, k + sides + 2, k + sides + 1);
    }
  }
  return wrapped(shape(p, idx, uv, col), rings + 1, sides);
}

function createFish(root) {
  const scaleMap = microSurface(root, 'fish');
  animated(root, 'rattail/body', fishBody, mat(root, 'rattail/body', { color: '#ffffff',
    vertexColors: true, map: skinColour(root, 'fish'), roughness: .67,
    bumpMap: scaleMap, bumpScale: .0006 }), 'fish-body');
  const finMap = finMembrane(root);
  const finMaterial = mat(root, 'rattail/fins', { color: '#ffffff', vertexColors: true,
    map: finMap, roughness: .51, side: THREE.DoubleSide, transparent: true, opacity: .94,
    depthWrite: false, forceSinglePass: true });
  animated(root, 'rattail/median-fins', fishFins, finMaterial, 'fish-fins');
  animated(root, 'rattail/pectoral-fins', fishPectorals, finMaterial, 'fish-pectoral');
  animated(root, 'rattail/anatomy', fishAnatomy, mat(root, 'rattail/anatomy', {
    color: '#ffffff', vertexColors: true, roughness: .40 }), 'fish-anatomy');
  root.userData.feedingPointLocal = { x: .44, y: .128, z: 0 };
  root.userData.originConvention = 'lower support reference; body centreline at local y=0.19';
}

function anemoneBody() {
  const rows = 16, sides = 40, p = [], idx = [], uv = [], col = [];
  const tint = new THREE.Color('#a998a0');
  for (let row = 0; row <= rows; row++) for (let j = 0; j <= sides; j++) {
    const t = row / rows, a = j / sides * TAU;
    const r = Math.sin(t * Math.PI / 2) * .272;
    const uneven = 1 + Math.sin(a * 3 + .7) * .041 + Math.sin(a * 7 - .3) * .024;
    const y = Math.cos(t * Math.PI / 2) * .361 + Math.sin(a * 5) * .006 * Math.sin(t * Math.PI);
    p.push(Math.cos(a) * r * uneven, y, Math.sin(a) * r * uneven);
    uv.push(j / sides * 2, t * 2);
    const shade = .91 + .09 * Math.cos(t * Math.PI / 2);
    col.push(tint.r * shade, tint.g * shade, tint.b * shade);
    if (row < rows && j < sides) {
      const k = row * (sides + 1) + j;
      idx.push(k, k + 1, k + sides + 1, k + 1, k + sides + 2, k + sides + 1);
    }
  }
  return wrapped(shape(p, idx, uv, col), rows + 1, sides);
}

const ANEMONE_TENTACLES = 136;
function anemoneTentacles() {
  const parts = [], random = randomFor('liponema/representative-v1');
  for (let i = 0; i < ANEMONE_TENTACLES; i++) {
    const a = i * 2.3999632297, up = 1 - (i + .5) / ANEMONE_TENTACLES * 1.30;
    const horizontal = Math.sqrt(1 - up * up);
    const direction = V(Math.cos(a) * horizontal, up, Math.sin(a) * horizontal);
    const center = V(direction.x * .218, .195 + up * .156, direction.z * .218);
    const length = .170 + random() * .045;
    const radial = .237 + length;
    const tip = V(direction.x * radial, Math.max(.015, .195 + up * (.175 + length)), direction.z * radial);
    const bend = V(-Math.sin(a) * (.011 + random() * .007), -.014, Math.cos(a) * .013);
    const points = [0, .35, .70, .91, 1].map(t => center.clone().lerp(tip, t)
      .addScaledVector(bend, Math.sin(t * Math.PI)));
    const radius = .012 + random() * .0039;
    parts.push(tube(points, [radius, radius * 1.06, radius * .90, radius * .49, radius * .022], 6,
    ['#c4b3bf', '#baa8b4', '#d0bcc5'][i % 3], [6, i, 0]));
  }
  const out = join(parts);
  // Canonical expanded transverse diameter is exactly 1. The longitudinal
  // body lengths of the other templates do not include their lateral feet.
  out.computeBoundingBox();
  const box = out.boundingBox;
  const factor = 1 / Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
  out.scale(factor, factor, factor);
  return out;
}

function createAnemone(root) {
  const surface = microSurface(root, 'soft');
  animated(root, 'liponema/body', anemoneBody, mat(root, 'liponema/body', { color: '#ffffff',
    vertexColors: true, roughness: .66, bumpMap: surface, bumpScale: .0007 }), 'anemone-body');
  animated(root, 'liponema/tentacles', anemoneTentacles, mat(root, 'liponema/tentacles', {
    color: '#ffffff', vertexColors: true, roughness: .54, transparent: true, opacity: .93,
    depthWrite: false }), 'anemone-tentacles');
  root.userData.tentacleCount = ANEMONE_TENTACLES;
  root.userData.tentacleCountStatus = 'rendering-sample-not-diagnostic';
  root.userData.feedingPointLocal = { x: 0, y: .40, z: 0 };
  root.userData.originConvention = 'attached basal contact plane at local y=0';
}

function chooseType(species) {
  const name = species.scientificName?.trim();
  const type = Object.keys(TYPES).find(key => species.id === TYPES[key].id ||
    name === TYPES[key].scientificName || (key === 'pig' && name === 'Scotoplanes'));
  if (!type) throw new Error(`Unsupported deep-sea morphology: ${name ?? species.id ?? 'unknown'}`);
  const info = TYPES[type];
  if (name && name !== info.scientificName && !(type === 'pig' && name === 'Scotoplanes')) {
    throw new Error(`The ${info.id} template is only identified as ${info.scientificName}`);
  }
  if (species.identityLevel && species.identityLevel !== info.identityLevel) {
    throw new Error(`Identity level must remain ${info.identityLevel} for ${info.scientificName}`);
  }
  return type;
}

export function createDeepOrganism(species) {
  if (!species || typeof species !== 'object') throw new Error('A deep-sea catalog entry is required');
  const type = chooseType(species), info = TYPES[type], root = new THREE.Group();
  root.name = species.commonName ?? info.scientificName;
  Object.assign(root.userData, { speciesId: species.id ?? info.id, scientificName: info.scientificName,
    identityLevel: info.identityLevel, morphologyProxy: type !== 'anemone', morphology: type,
    sizeMeasure: info.measure, displaySizeRangeM: [...info.range], source: info.source,
    shared: new Set(), owned: [], animation: [], phase: serial++ * 2.3999632297,
    animationParametersStatus: 'illustrative-uncalibrated', disposed: false });
  ({ pig: createPig, fish: createFish, anemone: createAnemone })[type](root);
  return root;
}

function finite(value, fallback = 0) { return Number.isFinite(value) ? value : fallback; }
function feedPulse(t, lastFeedAt) {
  if (!Number.isFinite(lastFeedAt)) return 0;
  const age = t - lastFeedAt;
  return age < 0 || age > 5 ? 0 : Math.sin(age / 5 * Math.PI) ** 2;
}
function localCurrent(root, environment) {
  const input = environment?.currentMps ?? 0;
  const vector = typeof input === 'number' ? V(finite(input), 0, 0) :
    V(finite(input?.x), finite(input?.y), finite(input?.z));
  if (vector.lengthSq() > .25) vector.setLength(.5);
  // Directions are world-space; remove root orientation but not metre scale.
  const rotation = new THREE.Quaternion(); root.getWorldQuaternion(rotation);
  return vector.applyQuaternion(rotation.invert());
}

export function animateDeepOrganism(root, timeSec, stateOrAgent = {}, environment = {}) {
  if (!root?.userData.animation || root.userData.disposed) return;
  const t = finite(timeSec);
  const agent = typeof stateOrAgent === 'string' ? { state: stateOrAgent } : stateOrAgent ?? {};
  const nested = typeof agent.state === 'object' && agent.state ? agent.state : {};
  const state = String(typeof agent.state === 'string' ? agent.state : nested.name ?? agent.status ?? agent.behavior ?? '').toLowerCase();
  const size = Math.max(.001, finite(agent.sizeM, root.scale.x || 1));
  const velocity = agent.velocity;
  const speed = Math.hypot(finite(velocity?.x), finite(velocity?.y), finite(velocity?.z));
  const resting = /rest|idle|attached|stationary/.test(state);
  const activity = clamp(finite(agent.activity, resting ? 0 : speed / size * 3), 0, 1);
  const eventTime = agent.lastFeedAt ?? nested.lastFeedAt;
  const feeding = feedPulse(t, eventTime);
  const phase = finite(agent.phase, root.userData.phase);
  const current = localCurrent(root, environment);
  const flowX = clamp(current.x / .08, -1, 1), flowZ = clamp(current.z / .08, -1, 1);
  const contraction = clamp(finite(agent.contraction, finite(nested.contraction,
    /retract|contract/.test(state) ? .8 : 0)), 0, 1);
  const bodyBob = Math.sin(t * .58 + phase) * .0035 * activity;
  const contacts = agent.contactPointsLocal ?? nested.contactPointsLocal;
  const signature = [t, activity, feeding, Number.isFinite(eventTime) ? eventTime : 'none',
    phase, flowX, flowZ, contraction];
  if (contacts) for (const point of contacts) signature.push(
    finite(Array.isArray(point) ? point[0] : point?.x),
    finite(Array.isArray(point) ? point[1] : point?.y),
    finite(Array.isArray(point) ? point[2] : point?.z));
  const key = signature.join('/');
  if (root.userData.lastAnimationInput === key) return;
  root.userData.lastAnimationInput = key;
  // Motion is soft and small; update lighting normals at 8 Hz rather than
  // rebuilding every indexed face each rendered frame. Contraction and clock
  // rewinds update immediately; positions always follow the simulation clock.
  const updateNormals = !Number.isFinite(root.userData.lastNormalAt) ||
    t < root.userData.lastNormalAt || t - root.userData.lastNormalAt >= .125 ||
    contraction !== root.userData.lastNormalContraction;
  for (const record of root.userData.animation) {
    const attr = record.item.geometry.attributes.position, base = record.rest, tags = record.tags;
    for (let i = 0; i < attr.count; i++) {
      const k = i * 3, m = i * 4;
      const kind = tags[m], id = tags[m + 1], along = tags[m + 2], side = tags[m + 3];
      let x = base[k], y = base[k + 1], z = base[k + 2];
      if (record.channel === 'pig-body') {
        y += bodyBob * Math.sin((x + .5) / .93 * Math.PI);
      } else if (record.channel === 'pig-appendages') {
        if (kind === 1) {
          const f = PIG_FEET[id];
          const contact = contacts?.[id];
          if (contact) {
            const cx = finite(Array.isArray(contact) ? contact[0] : contact.x, f.end.x);
            const cy = finite(Array.isArray(contact) ? contact[1] : contact.y, f.end.y);
            const cz = finite(Array.isArray(contact) ? contact[2] : contact.z, f.end.z);
            x += (cx - f.end.x) * along; y += (cy - f.end.y) * along; z += (cz - f.end.z) * along;
          }
          // Endpoints stay on the shared support plane; the joint softly bends.
          x += Math.sin(t * .75 + phase + id * 1.13) * .016 * activity * Math.sin(along * Math.PI);
          y += bodyBob * (1 - along);
        } else {
          x += flowX * along * along * .024 + Math.sin(t * .43 + phase + id) * along * .004;
          z += flowZ * along * along * .024;
        }
      } else if (record.channel === 'pig-oral') {
        const gather = feeding * (.45 + .55 * Math.sin(t * 1.25 + id * .71) ** 2) * along;
        x -= gather * .030; y += gather * .058; z *= 1 - gather * .30;
      } else if (record.channel.startsWith('fish-')) {
        const behind = clamp((.23 - x) / .73, 0, 1);
        const wave = Math.sin(t * (1.7 + activity * 1.3) + phase - behind * 4.6);
        z += wave * behind * behind * (.009 + activity * .025);
        if (record.channel === 'fish-pectoral') {
          const flap = kind === 7 ? .25 : 1;
          z += side * along * Math.sin(t * .93 + phase + (side < 0 ? .27 : 0)) * (.003 + activity * .010) * flap;
          y += along * Math.sin(t * .93 + phase) * .003 * flap;
        }
        if (kind === 5) y -= feeding * .004 * along;
      } else if (record.channel === 'anemone-body') {
        x *= 1 - contraction * .20; z *= 1 - contraction * .20;
        y *= 1 - contraction * .12;
      } else if (record.channel === 'anemone-tentacles') {
        const sway = Math.sin(t * .48 + phase + id * .37) * .20 + .80;
        const bend = along * along * .020 * sway;
        x += flowX * bend; z += flowZ * bend;
        // A limited set of arms folds after recorded intake. An animation does
        // not itself imply another capture or remove any simulated resource.
        const active = Math.abs(Math.sin(id * .61 + finite(eventTime) * .21)) > .90 ? feeding : 0;
        x *= 1 - contraction * .33 - active * along * .050;
        z *= 1 - contraction * .33 - active * along * .050;
        y = .008 + (y - .008) * (1 - contraction * .34) - active * along * .011;
        y = Math.max(.005, y);
      }
      attr.setXYZ(i, x, y, z);
    }
    attr.needsUpdate = true;
    if (updateNormals) {
      record.item.geometry.computeVertexNormals(); smoothNormals(record.item.geometry);
    }
  }
  if (updateNormals) {
    root.userData.lastNormalAt = t; root.userData.lastNormalContraction = contraction;
  }
}

export function disposeDeepOrganism(root) {
  if (!root?.userData.shared || root.userData.disposed) return;
  root.userData.disposed = true;
  for (const item of root.userData.owned) item.dispose?.();
  for (const key of root.userData.shared) {
    const entry = cache.get(key);
    if (entry && --entry.refs <= 0) { entry.value.dispose?.(); cache.delete(key); }
  }
  root.userData.shared.clear(); root.userData.owned.length = 0; root.userData.animation.length = 0;
  root.removeFromParent(); root.clear();
}
