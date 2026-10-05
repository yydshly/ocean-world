import * as THREE from 'three';

// All animals face +X. The visible anatomy is authored at approximately one
// metre/unit so the ecosystem, rather than individual mesh builders, sets size.
const resources = new Map();
let serial = 0;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;

function use(root, key, make) {
  let entry = resources.get(key);
  if (!entry) { entry = { value: make(), refs: 0 }; resources.set(key, entry); }
  if (!root.userData.resources.has(key)) {
    root.userData.resources.add(key);
    entry.refs++;
  }
  return entry.value;
}

function material(root, key, settings) {
  return use(root, `mat/${key}`, () => new THREE.MeshStandardMaterial(settings));
}

function mesh(root, geometry, mat, parent = root) {
  const item = new THREE.Mesh(geometry, mat);
  item.castShadow = true;
  item.receiveShadow = true;
  parent.add(item);
  return item;
}

function seeded(seed) {
  let state = 2166136261;
  for (const c of seed) state = Math.imul(state ^ c.charCodeAt(0), 16777619);
  return () => {
    state += 0x6D2B79F5;
    let n = state;
    n = Math.imul(n ^ n >>> 15, n | 1);
    n ^= n + Math.imul(n ^ n >>> 7, n | 61);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}

function geometry(positions, indices, uvs, colors) {
  const out = new THREE.BufferGeometry();
  try {
    out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    if (uvs) out.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    if (colors) out.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    out.setIndex(indices);
    out.computeVertexNormals();
    out.computeBoundingSphere();
    return out;
  } catch (error) {
    out.dispose();
    throw error;
  }
}

function smoothCylinderSeam(shape, rings, sides) {
  const normals = shape.getAttribute('normal');
  const blended = new THREE.Vector3();
  for (let ring = 0; ring < rings; ring++) {
    const a = ring * (sides + 1), b = a + sides;
    blended.set(normals.getX(a) + normals.getX(b), normals.getY(a) + normals.getY(b),
      normals.getZ(a) + normals.getZ(b)).normalize();
    normals.setXYZ(a, blended.x, blended.y, blended.z);
    normals.setXYZ(b, blended.x, blended.y, blended.z);
  }
  return shape;
}

function merge(parts) {
  const positions = [], normals = [], uvs = [], colors = [], indices = [];
  let offset = 0;
  for (const part of parts) {
    const p = part.getAttribute('position');
    const n = part.getAttribute('normal');
    const uv = part.getAttribute('uv');
    const color = part.getAttribute('color');
    positions.push(...p.array);
    if (n) normals.push(...n.array);
    else normals.push(...Array(p.count * 3).fill(0));
    if (uv) uvs.push(...uv.array);
    else uvs.push(...Array(p.count * 2).fill(0));
    if (color) colors.push(...color.array);
    else colors.push(...Array(p.count * 3).fill(1));
    if (part.index) for (const i of part.index.array) indices.push(i + offset);
    else for (let i = 0; i < p.count; i++) indices.push(i + offset);
    offset += p.count;
  }
  const out = geometry(positions, indices, uvs, colors);
  try {
    out.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  } catch (error) {
    out.dispose();
    throw error;
  }
  for (const part of parts) part.dispose();
  return out;
}

// A tapered curved limb/branch, with an elliptical cross section when desired.
function tube(points, radii, sides = 8, flatten = 1, tint = null) {
  const pos = [], uv = [], col = [], idx = [];
  const color = tint ? new THREE.Color(tint) : null;
  let previousAcross = null;
  for (let i = 0; i < points.length; i++) {
    const tangent = points[Math.min(i + 1, points.length - 1)].clone()
      .sub(points[Math.max(0, i - 1)]).normalize();
    let a;
    if (previousAcross) {
      // Transport the section orientation instead of switching its reference
      // axis at almost-vertical bends, which produced angular cylinder bands.
      a = previousAcross.clone().addScaledVector(tangent, -previousAcross.dot(tangent));
    }
    if (!a || a.lengthSq() < .00001) {
      const up = Math.abs(tangent.y) > .85 ? V(1, 0, 0) : V(0, 1, 0);
      a = new THREE.Vector3().crossVectors(tangent, up);
    }
    a.normalize(); previousAcross = a;
    const b = new THREE.Vector3().crossVectors(tangent, a).normalize();
    for (let j = 0; j <= sides; j++) {
      const angle = j / sides * TAU;
      const r = radii[i] ?? radii[radii.length - 1];
      const p = points[i].clone().addScaledVector(a, Math.cos(angle) * r)
        .addScaledVector(b, Math.sin(angle) * r * flatten);
      pos.push(p.x, p.y, p.z); uv.push(j / sides, i / (points.length - 1));
      if (color) {
        const light = .86 + .14 * Math.sin(angle + i * .9);
        col.push(color.r * light, color.g * light, color.b * light);
      }
      if (i < points.length - 1 && j < sides) {
        const p0 = i * (sides + 1) + j, p1 = p0 + sides + 1;
        idx.push(p0, p0 + 1, p1, p0 + 1, p1 + 1, p1);
      }
    }
  }
  return smoothCylinderSeam(geometry(pos, idx, uv, tint ? col : undefined), points.length, sides);
}

function line(root, points, color, parent = root, opacity = 1, key = null) {
  const geo = use(root, `line/${key ?? `${root.userData.serial}/${root.userData.part++}`}`,
    () => new THREE.BufferGeometry().setFromPoints(points));
  const mat = use(root, `lineMat/${color}/${opacity}`, () => new THREE.LineBasicMaterial({
    color, transparent: opacity < 1, opacity, depthWrite: opacity === 1,
  }));
  const out = new THREE.Line(geo, mat); parent.add(out); return out;
}

function bead(root, center, scale, color, parent = root, roughness = .5) {
  const geo = use(root, 'anatomy/eye', () => new THREE.SphereGeometry(1, 12, 8));
  const mat = material(root, `bead/${color}/${roughness}`, { color, roughness });
  const out = mesh(root, geo, mat, parent);
  out.position.copy(center); out.scale.copy(scale); return out;
}

function anatomyBeads(root, key, points, parent = root) {
  const geo = use(root, `beads/${key}`, () => {
    const parts = points.map(({ center, scale, color }) => {
      const shape = new THREE.SphereGeometry(1, 12, 8);
      shape.scale(scale.x, scale.y, scale.z); shape.translate(center.x, center.y, center.z);
      const tint = new THREE.Color(color), colors = [];
      for (let i = 0; i < shape.attributes.position.count; i++) colors.push(tint.r, tint.g, tint.b);
      shape.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); return shape;
    });
    return merge(parts);
  });
  return mesh(root, geo, material(root, 'beads/eyes', { color: '#ffffff', vertexColors: true, roughness: .22 }), parent);
}

const FISH = {
  'blue-tang': { height: .235, width: .068, head: .8, tail: .205, type: 'blue', base: '#2462b9', fin: '#295cb2', tailColor: '#edca43' },
  'butterflyfish': { height: .285, width: .055, head: .62, tail: .16, type: 'butterfly', base: '#c8c9b2', fin: '#c8b95c', tailColor: '#cfbc58' },
  'green-chromis': { height: .175, width: .06, head: .82, tail: .20, type: 'chromis', base: '#7fc8b9', fin: '#94cabc', tailColor: '#93c7b8' },
  'lined-tang': { height: .21, width: .06, head: .78, tail: .20, type: 'lined', base: '#cfba57', fin: '#466c6e', tailColor: '#40566c' },
  'cleaner-wrasse': { height: .082, width: .045, head: .65, tail: .105, type: 'wrasse', base: '#94afb5', fin: '#779fa9', tailColor: '#6494aa' },
  'honeycomb-grouper': { height: .165, width: .11, head: 1.15, tail: .14, type: 'grouper', base: '#aa8f67', fin: '#a18662', tailColor: '#947b59' },
  // Small golden-orange female representative; size comes from the regional
  // agent. The common fish path supplies its forked tail, without male filaments.
  'lyretail-anthias': { height: .145, width: .055, head: .85, tail: .19, type: 'anthias', base: '#dc9632', fin: '#cf872f', tailColor: '#d58e32' },
  // A midwater representative: grey-blue flanks, pale pink belly and yellow
  // soft dorsal / caudal region. The regional agent supplies its metre scale.
  'yellowtail-fusilier': { height: .145, width: .05, head: .8, tail: .185, type: 'fusilier', base: '#8b9ea8', fin: '#a1afb2', tailColor: '#cfb248' },
};

function fishProfile(species) {
  if (FISH[species.id]) return FISH[species.id];
  const name = `${species.scientificName ?? ''} ${species.id}`.toLowerCase();
  if (name.includes('paracanthurus')) return FISH['blue-tang'];
  if (name.includes('chaetodon')) return FISH.butterflyfish;
  if (name.includes('chromis')) return FISH['green-chromis'];
  if (name.includes('lineatus')) return FISH['lined-tang'];
  if (name.includes('labroides')) return FISH['cleaner-wrasse'];
  if (name.includes('epinephelus')) return FISH['honeycomb-grouper'];
  return { ...FISH['green-chromis'], base: species.colors?.[0] ?? '#8da99a', type: 'plain' };
}

function bodyGeometry(profile, segments = 60, sides = 32) {
  const pos = [], uv = [], idx = [];
  // Caudal peduncle, shoulder, forehead and small real mouth, not an ellipsoid.
  const stations = [
    [-.355, .065, .12], [-.28, .30, .35], [-.15, .79, .78],
    [0, 1, 1], [.13, .94, .99], [.24, .75, .84],
    [.33, .54 * profile.head, .63], [.40, .33 * profile.head, .45],
    [.445, .23 * profile.head, .29], [.460, .19 * profile.head, .22],
    [.470, .105 * profile.head, .12], [.474, .002, .002],
  ];
  function sample(x, component) {
    for (let i = 1; i < stations.length; i++) {
      if (x <= stations[i][0]) {
        const a = stations[i - 1], b = stations[i];
        const span = b[0] - a[0], t = (x - a[0]) / span;
        const previous = stations[Math.max(0, i - 2)], next = stations[Math.min(stations.length - 1, i + 1)];
        const slope = (b[component] - a[component]) / span;
        let m0 = (b[component] - previous[component]) / (b[0] - previous[0]);
        let m1 = (next[component] - a[component]) / (next[0] - a[0]);
        // Monotone Hermite sections maintain one continuous shoulder/head
        // contour, while preventing overshoot at the caudal stalk and mouth.
        if (Math.abs(slope) < 1e-8) m0 = m1 = 0;
        else {
          if (m0 * slope < 0) m0 = 0;
          if (m1 * slope < 0) m1 = 0;
          const ratio = Math.hypot(m0 / slope, m1 / slope);
          if (ratio > 3) { m0 *= 3 / ratio; m1 *= 3 / ratio; }
        }
        return (2 * t ** 3 - 3 * t ** 2 + 1) * a[component] +
          (t ** 3 - 2 * t ** 2 + t) * span * m0 +
          (-2 * t ** 3 + 3 * t ** 2) * b[component] +
          (t ** 3 - t ** 2) * span * m1;
      }
    }
    return stations.at(-1)[component];
  }
  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    // More sections around the short rounded muzzle prevent a triangular
    // spear-like snout, without spending those vertices along the tail.
    const x = u < .74 ? -.355 + u / .74 * .680 : .325 + (u - .74) / .26 * .149;
    const h = sample(x, 1) * profile.height;
    const w = sample(x, 2) * profile.width;
    const centerY = -.012 * u + (profile.type === 'grouper' ? -.018 * u * u : 0);
    for (let j = 0; j <= sides; j++) {
      const theta = j / sides * TAU;
      const belly = Math.sin(theta) < 0 ? .88 : 1;
      pos.push(x, Math.sin(theta) * h * belly + centerY, Math.cos(theta) * w);
      uv.push((x + .355) / .829, j / sides);
      if (i < segments && j < sides) {
        const a = i * (sides + 1) + j, b = a + sides + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  return smoothCylinderSeam(geometry(pos, idx, uv), segments + 1, sides);
}

function skinTexture(root, key, profile) {
  return use(root, `skin/${key}`, () => {
    // The final sixteen texels are white for the eyes in the same material.
    // Body UVs occupy exactly the original 512-pixel pattern, preserving every
    // species stripe while allowing the eyes and body to share one draw call.
    const width = 528, bodyWidth = 512, height = 256, pixels = new Uint8Array(width * height * 4);
    const base = new THREE.Color(profile.base).convertLinearToSRGB();
    const pick = hex => new THREE.Color(hex).convertLinearToSRGB();
    const dark = pick('#263542'), gold = pick('#e2c86a'), blue = pick('#416baa');
    const stripeGold = pick('#c8b373'), stripeBlue = pick('#547e98');
    const fusilierBelly = profile.type === 'fusilier' ? pick('#d0beb7') : null;
    const fusilierYellow = profile.type === 'fusilier' ? pick(profile.tailColor) : null;
    for (let y = 0; y < height; y++) for (let x = 0; x < bodyWidth; x++) {
      const u = x / bodyWidth, angle = y / height * TAU, vertical = Math.sin(angle);
      let r = base.r, g = base.g, b = base.b;
      let selected, stripeMix;
      if (profile.type === 'blue') {
        const kidney = Math.pow((u - .45) / .37, 2) + Math.pow((vertical - .28) / .62, 2);
        const inner = Math.pow((u - .48) / .24, 2) + Math.pow((vertical + .03) / .27, 2);
        if (kidney < 1 && inner > 1) selected = dark;
        if (u < .105) selected = gold;
      } else if (profile.type === 'butterfly') {
        if (u > .78 && u < .86) selected = dark;
        else if (Math.abs(vertical) > .82 || u < .14) selected = gold;
        else if (u > .18 && u < .74 && Math.sin(u * 86 + vertical * 3.5) > .89) selected = dark;
      } else if (profile.type === 'lined') {
        const stripe = .5 + .5 * Math.sin(vertical * 34 + u * 1.6);
        stripeMix = THREE.MathUtils.smoothstep(stripe, .36, .67);
        if (vertical > .81 && u > .2 && u < .76) selected = dark;
      } else if (profile.type === 'wrasse') {
        if (Math.abs(vertical) < .27 + .10 * (1 - u)) selected = dark;
        else if (vertical > 0) selected = blue;
      } else if (profile.type === 'grouper') {
        // Offset polygonal cells form the species' honeycomb spot pattern.
        const row = Math.floor((vertical + 1) * 8);
        const cx = u * 27 + (row % 2) * .5;
        const dx = Math.abs(cx - Math.floor(cx) - .5);
        const dy = Math.abs((vertical + 1) * 8 - row - .5);
        if (Math.max(dx * .9 + dy * .55, dy) < .35) selected = pick('#67523d');
      } else if (profile.type === 'fusilier') {
        // UV u runs from the caudal stalk toward the head; yellow is confined
        // to the upper stalk, while the lower third has a restrained pink tint.
        const bellyMix = THREE.MathUtils.smoothstep(-vertical, .32, .72);
        r = THREE.MathUtils.lerp(r, fusilierBelly.r, bellyMix);
        g = THREE.MathUtils.lerp(g, fusilierBelly.g, bellyMix);
        b = THREE.MathUtils.lerp(b, fusilierBelly.b, bellyMix);
        const yellowMix = (1 - THREE.MathUtils.smoothstep(u, .18, .30)) *
          THREE.MathUtils.smoothstep(vertical, .10, .45);
        r = THREE.MathUtils.lerp(r, fusilierYellow.r, yellowMix);
        g = THREE.MathUtils.lerp(g, fusilierYellow.g, yellowMix);
        b = THREE.MathUtils.lerp(b, fusilierYellow.b, yellowMix);
      }
      if (stripeMix !== undefined) {
        const belly = vertical < -.45 ? .80 : 1;
        r = THREE.MathUtils.lerp(stripeBlue.r, stripeGold.r, stripeMix * belly);
        g = THREE.MathUtils.lerp(stripeBlue.g, stripeGold.g, stripeMix * belly);
        b = THREE.MathUtils.lerp(stripeBlue.b, stripeGold.b, stripeMix * belly);
      }
      if (selected) { r = selected.r; g = selected.g; b = selected.b; }
      const scaleRow = Math.floor((y / height) * 50);
      const sx = u * 100 + (scaleRow % 2) * .5;
      const sy = ((y / height) * 50) % 1;
      const edge = Math.abs(Math.pow(sx % 1 - .5, 2) * 2.4 + sy - .88) < .09;
      const sparkle = Math.sin(x * 9.13 + y * 7.11) * .018;
      const shade = (.86 + vertical * .105 + sparkle) * (edge ? .89 : 1);
      const i = (y * width + x) * 4;
      pixels[i] = clamp(r * shade * 255, 0, 255);
      pixels[i + 1] = clamp(g * shade * 255, 0, 255);
      pixels[i + 2] = clamp(b * shade * 255, 0, 255); pixels[i + 3] = 255;
    }
    for (let y = 0; y < height; y++) for (let x = bodyWidth; x < width; x++) {
      const i = (y * width + x) * 4;
      pixels.fill(255, i, i + 4);
    }
    const texture = new THREE.DataTexture(pixels, width, height);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true; texture.needsUpdate = true;
    return texture;
  });
}

function finGeometry(outline) {
    const contour = new THREE.CatmullRomCurve3(outline, true, 'centripetal')
      .getPoints(outline.length * 5).slice(0, -1);
    const origin = outline[0], axis = outline[1].clone().sub(origin).normalize();
    let normal = V(0, 0, 0);
    for (let i = 2; i < outline.length && normal.lengthSq() < .000001; i++) {
      normal.crossVectors(axis, outline[i].clone().sub(origin));
    }
    normal.normalize();
    const across = new THREE.Vector3().crossVectors(normal, axis).normalize();
    const flat = contour.map(p => {
      const relative = p.clone().sub(origin);
      return new THREE.Vector2(relative.dot(axis), relative.dot(across));
    });
    const faces = THREE.ShapeUtils.triangulateShape(flat, []);
    // One radial texture replaces a separate LineSegments draw for fin rays.
    // Anchor at UV (0,.5); projection into each fin plane preserves the rays
    // when a pectoral fin flaps out of the body plane.
    const maxAlong = Math.max(.001, ...flat.map(p => p.x));
    const maxAcross = Math.max(.001, ...flat.map(p => Math.abs(p.y)));
    const pos = [], uv = [], idx = [];
    contour.forEach((p, i) => {
      pos.push(p.x, p.y, p.z);
      uv.push(flat[i].x / maxAlong, .5 + flat[i].y / (2 * maxAcross));
    });
    faces.forEach(face => idx.push(...face));
    return geometry(pos, idx, uv);
}

function finRayTexture(root) {
  return use(root, 'fish/finRayTexture', () => {
    const width = 128, pixels = new Uint8Array(width * width * 4);
    for (let y = 0; y < width; y++) for (let x = 0; x < width; x++) {
      const u = x / (width - 1), v = y / (width - 1) - .5;
      const angle = Math.atan2(v, Math.max(.025, u));
      const ray = Math.exp(-Math.pow(Math.sin(angle * 24) / .105, 2));
      const fine = .008 * Math.sin(x * 1.7 + y * 2.3);
      const tone = clamp((.98 - ray * .17 + fine) * 255, 0, 255);
      const i = (y * width + x) * 4;
      pixels[i] = pixels[i + 1] = pixels[i + 2] = tone; pixels[i + 3] = 255;
    }
    const texture = new THREE.DataTexture(pixels, width, width);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true; texture.needsUpdate = true;
    return texture;
  });
}

function fin(root, key, outline, color, parent, opacity = .84) {
  const geo = use(root, `fin/${key}`, () => finGeometry(outline));
  const map = finRayTexture(root);
  const mat = material(root, `fin/${color}/${opacity}`, {
    color, map, roughness: .73, metalness: .04, side: THREE.DoubleSide,
    transparent: opacity < 1, opacity, depthWrite: opacity > .9,
    // A thin membrane has no separated front/back surfaces. Rendering its two
    // sides in a single pass avoids doubling every transparent fin draw.
    forceSinglePass: true,
  });
  return mesh(root, geo, mat, parent);
}

function fishBodyWithEyes(profile, detail, eyes) {
  const body = bodyGeometry(profile, detail === 'near' ? 60 : 28, detail === 'near' ? 32 : 16);
  const uv = body.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setX(i, (.5 + uv.getX(i) * 511) / 528);
  const parts = [body];
  for (const { center, scale, color } of eyes) {
    const shape = new THREE.SphereGeometry(1, detail === 'near' ? 12 : 6, detail === 'near' ? 8 : 4);
    shape.scale(scale.x, scale.y, scale.z); shape.translate(center.x, center.y, center.z);
    const tint = new THREE.Color(color), colors = [];
    const eyeUV = shape.getAttribute('uv');
    for (let i = 0; i < shape.attributes.position.count; i++) {
      colors.push(tint.r, tint.g, tint.b);
      eyeUV.setXY(i, 520.5 / 528, .5);
    }
    shape.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    parts.push(shape);
  }
  return merge(parts);
}

function createFish(root, species) {
  const p = fishProfile(species), key = species.id ?? p.type;
  const anatomy = new THREE.Group(); root.add(anatomy);
  const map = skinTexture(root, key, p);
  const bodyMat = material(root, `fish/${key}`, { map, vertexColors: true, roughness: .54, metalness: .11 });
  const near = new THREE.Group(), far = new THREE.Group();
  near.name = 'fish-near'; far.name = 'fish-far'; far.visible = false;
  anatomy.add(near, far);
  const fork = p.type === 'grouper' || p.type === 'wrasse' ? -.175 : -.10;
  const tailOutline = [V(0, .02, 0), V(-.16, p.tail, 0),
    V(-.2, p.tail * .66, 0), V(fork, 0, 0), V(-.2, -p.tail * .66, 0),
    V(-.16, -p.tail, 0), V(0, -.02, 0)];
  const tall = p.type === 'butterfly' ? .10 : p.type === 'wrasse' ? .024 : .055;
  const dorsalOutline = [V(.23, p.height * .68, 0), V(.12, p.height * .98 + tall, 0),
    V(-.03, p.height + tall * 1.15, 0), V(-.17, p.height * .77 + tall, 0),
    V(-.29, p.height * .3 + tall, 0), V(-.24, p.height * .38, 0),
    V(-.10, p.height * .90, 0), V(.10, p.height * .98, 0)];
  const analOutline = [V(.05, -p.height * .88, 0), V(-.05, -p.height * .98 - tall, 0),
    V(-.22, -p.height * .53 - tall, 0), V(-.29, -p.height * .20, 0),
    V(-.18, -p.height * .60, 0)];
  const pectorals = [], farPectoralShapes = [];
  const eyes = [], seams = [];
  for (const side of [-1, 1]) {
    const pec = new THREE.Group(); pec.position.set(.19, -.025, side * p.width * .83);
    near.add(pec); pectorals.push(pec);
    const pecOutline = [V(0, 0, 0), V(-.075, -.015, side * .07),
      V(-.14, -.10, side * .06), V(-.12, -.12, side * .025), V(-.025, -.045, 0)];
    fin(root, `${key}/pec/${side}`, pecOutline, p.fin, pec, .68);
    // Preserve even the slender wrasse's low chest-fin silhouette at distance.
    // Its small far fins join the dorsal/anal mesh in their neutral pose.
    farPectoralShapes.push({ outline: pecOutline, position: pec.position.clone() });
    const eyeX = p.type === 'grouper' ? .305 : .315;
    const eyeY = p.height * .18;
    const eyeZ = p.width * .66 * side;
    eyes.push({ center: V(eyeX, eyeY, eyeZ), scale: V(.025, .027, .014), color: '#adab72' },
      { center: V(eyeX + .003, eyeY + .001, eyeZ + side * .009), scale: V(.018, .02, .008), color: '#09151b' },
      { center: V(eyeX + .007, eyeY + .007, eyeZ + side * .015), scale: V(.004, .004, .002), color: '#dce7db' });
    const gill = [];
    for (let i = 0; i <= 15; i++) {
      const theta = -1.05 + i / 15 * 2.1;
      gill.push(V(.235 - Math.cos(theta) * .05, Math.sin(theta) * p.height * .53,
        side * p.width * .88));
    }
    for (let i = 1; i < gill.length; i++) seams.push(gill[i - 1], gill[i]);
    // Small mouth seam, set into the muzzle rather than a detached primitive.
    seams.push(V(.454, -.02, side * .018), V(.472, -.017, 0));
  }
  const finMap = finRayTexture(root);
  // Colour the fused dorsal/anal mesh without adding a draw per fish. Only this
  // new profile receives vertex colours; previous profile output stays intact.
  const colourFusilierFins = shape => {
    if (p.type !== 'fusilier') return shape;
    const positions = shape.getAttribute('position'), colors = [];
    const base = new THREE.Color(p.fin), yellow = new THREE.Color(p.tailColor);
    for (let i = 0; i < positions.count; i++) {
      const mix = positions.getY(i) > 0 ?
        1 - THREE.MathUtils.smoothstep(positions.getX(i), -.16, -.04) : 0;
      const color = base.clone().lerp(yellow, mix);
      colors.push(color.r, color.g, color.b);
    }
    shape.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return shape;
  };
  const staticFinMat = material(root, `fin/${p.fin}/0.84`, {
    color: p.type === 'fusilier' ? '#ffffff' : p.fin, vertexColors: p.type === 'fusilier',
    map: finMap, roughness: .73, metalness: .04, side: THREE.DoubleSide,
    transparent: true, opacity: .84, depthWrite: false, forceSinglePass: true,
  });
  const staticFinGeo = use(root, `fin/${key}/dorsal-anal`, () => colourFusilierFins(merge([
    finGeometry(dorsalOutline), finGeometry(analOutline),
  ])));
  const farFinGeo = use(root, `fin/${key}/dorsal-anal-pectorals`, () => colourFusilierFins(merge([
    finGeometry(dorsalOutline), finGeometry(analOutline),
    ...farPectoralShapes.map(({ outline, position }) => finGeometry(outline).translate(position.x, position.y, position.z)),
  ])));
  const tails = [], farShadowMeshes = [];
  let farBody;
  for (const [detail, parent] of [['near', near], ['far', far]]) {
    const bodyGeo = use(root, `body-eyes/${key}/${detail}`, () => fishBodyWithEyes(p, detail, eyes));
    const body = mesh(root, bodyGeo, bodyMat, parent);
    const staticFin = mesh(root, detail === 'near' ? staticFinGeo : farFinGeo, staticFinMat, parent);
    const tail = new THREE.Group(); tail.position.x = -.348; parent.add(tail); tails.push(tail);
    const tailFin = fin(root, `${key}/tail`, tailOutline, p.tailColor, tail, .91);
    if (detail === 'far') {
      farBody = body;
      farShadowMeshes.push(body, staticFin, tailFin);
      staticFin.castShadow = tailFin.castShadow = false;
    }
  }
  const seamGeo = use(root, `${key}/seams`, () => new THREE.BufferGeometry().setFromPoints(seams));
  const seamMat = use(root, 'fish/seamMat', () => new THREE.LineBasicMaterial({ color: '#454e46', transparent: true, opacity: .58 }));
  near.add(new THREE.LineSegments(seamGeo, seamMat));
  root.userData.animation = { anatomy, tail: tails[0], tails, pectorals, type: 'fish' };
  root.userData.detail = { near, far, level: 'near', nearDraws: 6, farDraws: 3,
    farAboveBodyLengths: 20, nearBelowBodyLengths: 16, farBody, farShadowMeshes };
}

// Coral-only solid branches. Animals continue to use tube(); their geometry,
// animation, UVs and LOD budgets are independent of this surface refinement.
function coralLimb(points, radius, endRatio, sides, tint, detail = 0, axial = true, allowLowShoulder = true, exsertAxial = false) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const length = curve.getLength(), endRadius = radius * endRatio;
  const phase = points[0].x * 37 + points[0].z * 53 + length * 29 + radius * 317;
  // Living Acropora tips have an exsert axial corallite. A narrow tissue-covered
  // lip and recessed mouth replace the uniformly rounded stick end. The cup
  // remains closed geometry, not an open pipe or exposed white skeleton.
  const axialRadius = clamp(radius * .14, .0016, .0031);
  const cupDepth = axialRadius * .92;
  const capStart = 1 - Math.min(.18, endRadius * 1.08 / length);
  const neckStart = exsertAxial && axial ? 1 - Math.min((1-capStart)*.25,axialRadius*1.8/length) : 1;
  const neckRadius = exsertAxial && axial ? axialRadius*1.18 : axialRadius;
  const coreStops = detail === 0 ? [0, .46, 1] :
    detail === 1 ? [0, .28, .63, 1] : [0, .22, .45, .72, 1];
  const swellingAt = t => 1 + Math.sin(t * 9 + phase) * .054 + Math.sin(t * 17 - phase) * .025;
  const shaftRadiusAt = t => THREE.MathUtils.lerp(radius, endRadius, t / capStart) * swellingAt(t);
  const shoulderRadius = shaftRadiusAt(capStart);
  // The old single cone from a broad shaft to a millimetre axial lip made
  // close-view tips look sharpened. One rounded shoulder is enough on thicker
  // medium/high branches. Low detail reallocates its tiny inner cup ring to
  // this visible shoulder, keeping the same six-sided 60-triangle budget.
  // This sampling threshold/profile is an authored display choice, not a
  // measured A. muricata growth or corallite-size parameter.
  // Six-sided low landscape shells use this budget; the named specimen's
  // eight-sided detail-0 twigs retain their previously validated geometry.
  const compactAxialCup = axial && detail === 0 && sides === 6 && allowLowShoulder;
  const roundedShoulder = axial && (compactAxialCup || (detail > 0 && endRadius >= .0065));
  let lowShoulderRadiusOffset = 0;
  const outerRadiusAt = t => {
    if (t <= capStart) return shaftRadiusAt(t);
    if(exsertAxial && axial && t>=neckStart)return THREE.MathUtils.lerp(neckRadius,axialRadius,(t-neckStart)/(1-neckStart));
    const u = (t - capStart) / (neckStart - capStart);
    if (axial) {
      const rounded = Math.sqrt(neckRadius ** 2 +
        (shoulderRadius ** 2 - neckRadius ** 2) * Math.max(0, 1 - u * u));
      const r = THREE.MathUtils.lerp(THREE.MathUtils.lerp(shoulderRadius, neckRadius, u), rounded, .8);
      // Any low-detail envelope constraint changes this same radius function,
      // so the shading sampler follows the geometry rather than a guessed tube.
      const weight = u <= .62 ? THREE.MathUtils.smoothstep(u / .62, 0, 1) :
        THREE.MathUtils.smoothstep((1 - u) / .38, 0, 1);
      return r + lowShoulderRadiusOffset * weight;
    }
    // The existing rounded non-axial ring at u=.72 is unchanged. Blend the
    // small shaft swelling back to its original radius before that ring.
    return THREE.MathUtils.lerp(shoulderRadius, endRadius, Math.min(1, u / .72)) *
      Math.sqrt(Math.max(0, 1 - u * u));
  };
  const stops = [...coreStops.map(t => ({ t: t * capStart, radius: null, outer: true })),
    ...(roundedShoulder ? [{ t: capStart + (neckStart - capStart) * .62,
      radius: outerRadiusAt(capStart + (neckStart - capStart) * .62), outer: true, insertedShoulder: true }] : []),
    ...(exsertAxial && axial ? [{t:neckStart,radius:neckRadius,outer:true}] : []),
    ...(axial ? [{ t: 1, radius: axialRadius },
      compactAxialCup ? { t: 1, radius: axialRadius, duplicateLip: true } :
        { t: 1 - cupDepth * .16 / length, radius: axialRadius * .55 }] :
      [{ t: capStart + (1 - capStart) * .72, radius: endRadius * Math.sqrt(1 - .72 ** 2) }])];
  const positions = [], uvs = [], colors = [], indices = [];
  const ringFrames = [];
  const tissue = new THREE.Color(tint).lerp(new THREE.Color('#9b8057'), .12);
  const pale = new THREE.Color('#d5c69f');
  let across;
  for (let ring = 0; ring < stops.length; ring++) {
    const { t } = stops[ring], center = curve.getPointAt(t), tangent = curve.getTangentAt(t).normalize();
    let ringAcross = stops[ring].duplicateLip ? ringFrames[ring - 1].across.clone() : across?.clone();
    if (ringAcross) ringAcross.addScaledVector(tangent, -ringAcross.dot(tangent));
    if (!ringAcross || ringAcross.lengthSq() < 1e-6) ringAcross = new THREE.Vector3().crossVectors(tangent,
      Math.abs(tangent.y) > .85 ? V(1, 0, 0) : V(0, 1, 0));
    ringAcross.normalize();
    // Inserting the shoulder must not change the transport history of any
    // existing ring, including the original axial lip and recessed mouth.
    if (!stops[ring].insertedShoulder) across = ringAcross.clone();
    const normal = new THREE.Vector3().crossVectors(tangent, ringAcross).normalize();
    const r = stops[ring].radius ?? shaftRadiusAt(t);
    ringFrames.push({ center, across: ringAcross, normal, t });
    const growthBlend = THREE.MathUtils.smoothstep(t, .76, 1) * (axial ? .63 : .19);
    const color = tissue.clone().lerp(pale, growthBlend);
    if (axial && ring === stops.length - 1) color.lerp(tissue, .45).multiplyScalar(.79);
    for (let side = 0; side <= sides; side++) {
      const angle = side / sides * TAU;
      const relief = 1 + Math.sin(angle * 3 + t * 13 + phase) * .040 +
        Math.cos(angle * 2 - t * 9 - phase) * .025;
      const p = stops[ring].duplicateLip ? V(...positions.slice((ring - 1) * (sides + 1) * 3 + side * 3,
        (ring - 1) * (sides + 1) * 3 + side * 3 + 3)) :
        center.clone().addScaledVector(ringAcross, Math.cos(angle) * r * relief)
        .addScaledVector(normal, Math.sin(angle) * r * relief);
      positions.push(p.x, p.y, p.z);
      // Physical-length UVs keep the close-set authored corallite texture from
      // stretching into giant cups on longer branches. Spacing is a visual
      // proxy, not a measured A. muricata microstructure.
      uvs.push(side / sides * TAU * radius / .085 + Math.sin(phase) * .37,
        t * length / .10 + Math.cos(phase) * .41);
      const shade = .93 + Math.sin(angle * 2 + t * 7 + phase) * .038 + Math.sin(t * 6 - phase) * .033;
      colors.push(color.r * shade, color.g * shade, color.b * shade);
      if (ring < stops.length - 1 && side < sides && !stops[ring + 1].duplicateLip) {
        const a = ring * (sides + 1) + side, b = a + sides + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  const basalPole = positions.length / 3, tipPole = basalPole + 1;
  const tipColor = axial ? tissue.clone().multiplyScalar(.58) : tissue.clone().lerp(pale, .19);
  const tipCenter = curve.getPointAt(axial ? 1 - cupDepth / length : 1);
  for (const [center, color, v] of [[curve.getPointAt(0), tissue, 0], [tipCenter, tipColor, length / .10]]) {
    positions.push(center.x, center.y, center.z); uvs.push(.5, v); colors.push(color.r, color.g, color.b);
  }
  if (compactAxialCup) {
    // Bound only the new shoulder's circular radius by the previous low-detail
    // shell. Existing shaft rings, lip, mouth and basal foot never move. Include
    // the removed narrow inner ring when reconstructing that original AABB.
    const bounds = new THREE.Box3(), shoulderRing = coreStops.length, stride = sides + 1;
    for (let vertex = 0; vertex < positions.length / 3; vertex++) {
      if (vertex >= shoulderRing * stride && vertex < (shoulderRing + 1) * stride) continue;
      bounds.expandByPoint(V(...positions.slice(vertex * 3, vertex * 3 + 3)));
    }
    const lipFrame = ringFrames[stops.length - 2], innerT = 1 - cupDepth * .16 / length;
    const innerTangent = curve.getTangentAt(innerT).normalize(), innerAcross = lipFrame.across.clone();
    innerAcross.addScaledVector(innerTangent, -innerAcross.dot(innerTangent)).normalize();
    const innerNormal = new THREE.Vector3().crossVectors(innerTangent, innerAcross).normalize();
    for (let side = 0; side < sides; side++) {
      const angle = side / sides * TAU, relief = 1 + Math.sin(angle * 3 + innerT * 13 + phase) * .040 +
        Math.cos(angle * 2 - innerT * 9 - phase) * .025;
      bounds.expandByPoint(curve.getPointAt(innerT).addScaledVector(innerAcross, Math.cos(angle) * axialRadius * .55 * relief)
        .addScaledVector(innerNormal, Math.sin(angle) * axialRadius * .55 * relief));
    }
    const frame = ringFrames[shoulderRing], wanted = stops[shoulderRing].radius;
    let allowed = wanted;
    for (let side = 0; side < sides; side++) {
      const angle = side / sides * TAU, relief = 1 + Math.sin(angle * 3 + frame.t * 13 + phase) * .040 +
        Math.cos(angle * 2 - frame.t * 9 - phase) * .025;
      const direction = frame.across.clone().multiplyScalar(Math.cos(angle) * relief)
        .addScaledVector(frame.normal, Math.sin(angle) * relief);
      for (const axis of ['x', 'y', 'z']) {
        if (direction[axis] > 1e-12) allowed = Math.min(allowed, (bounds.max[axis] - frame.center[axis]) / direction[axis]);
        else if (direction[axis] < -1e-12) allowed = Math.min(allowed, (bounds.min[axis] - frame.center[axis]) / direction[axis]);
      }
    }
    allowed = Math.max(axialRadius, allowed * (allowed < wanted ? 1 - 1e-7 : 1));
    // A few short tilted tips have no room for a visibly wider shoulder inside
    // their old AABB. Retain that original shell instead of squeezing it into
    // a thinner cone. This one bounded retry consumes no additional RNG.
    if (allowed <= THREE.MathUtils.lerp(shoulderRadius, axialRadius, .62) * 1.02) {
      return coralLimb(points, radius, endRatio, sides, tint, detail, axial, false);
    }
    lowShoulderRadiusOffset = allowed - wanted;
    for (let side = 0; side <= sides; side++) {
      const angle = side / sides * TAU, relief = 1 + Math.sin(angle * 3 + frame.t * 13 + phase) * .040 +
        Math.cos(angle * 2 - frame.t * 9 - phase) * .025;
      const p = frame.center.clone().addScaledVector(frame.across, Math.cos(angle) * allowed * relief)
        .addScaledVector(frame.normal, Math.sin(angle) * allowed * relief);
      const vertex = (shoulderRing * stride + side) * 3;
      positions.splice(vertex, 3, p.x, p.y, p.z);
    }
  }
  const finalRing = (stops.length - 1) * (sides + 1);
  for (let side = 0; side < sides; side++) {
    indices.push(basalPole, side + 1, side, tipPole, finalRing + side, finalRing + side + 1);
  }
  const shape = geometry(positions, indices, uvs, colors);
  const normals = shape.getAttribute('normal');
  const drawnPositions = shape.getAttribute('position'), adjacentWallNormals = [];
  const faceA = new THREE.Vector3(), faceB = new THREE.Vector3(), faceC = new THREE.Vector3();
  // A tight authored fusion can fold the ideal continuous tube between the
  // sparse rings. Use its actual wall faces to reject inverted shading there,
  // while leaving the basal closure/cup poles out of the shaft-side test.
  const wallIndexCount = indices.length - sides * 6;
  for (let k = 0; k < wallIndexCount; k += 3) {
    const ids = indices.slice(k, k + 3);
    faceA.fromBufferAttribute(drawnPositions, ids[0]); faceB.fromBufferAttribute(drawnPositions, ids[1]);
    faceC.fromBufferAttribute(drawnPositions, ids[2]);
    const face = faceB.sub(faceA).cross(faceC.sub(faceA)).normalize();
    for (const vertex of ids) (adjacentWallNormals[vertex] ??= []).push(face.clone());
  }
  let exteriorNormalFallbacks = 0;
  // Area-weighted normals from long, sparse triangles visibly inherit the
  // coarse axial tessellation. Evaluate the same continuous centreline,
  // radius, angular relief and transported frame on both sides of each shaft
  // sample instead. Concave cup rings/poles keep their geometric normals.
  const tStep = Math.min(.0001, .00002 / length), angleStep = .001;
  const frameAt = (t, referenceAcross) => {
    const tangent = curve.getTangentAt(t).normalize(), transverse = referenceAcross.clone();
    transverse.addScaledVector(tangent, -transverse.dot(tangent)).normalize();
    return { center: curve.getPointAt(t), across: transverse,
      normal: new THREE.Vector3().crossVectors(tangent, transverse).normalize(), t };
  };
  const pointAt = (frame, angle) => {
    const r = outerRadiusAt(frame.t), relief = 1 + Math.sin(angle * 3 + frame.t * 13 + phase) * .040 +
      Math.cos(angle * 2 - frame.t * 9 - phase) * .025;
    return frame.center.clone().addScaledVector(frame.across, Math.cos(angle) * r * relief)
      .addScaledVector(frame.normal, Math.sin(angle) * r * relief);
  };
  for (let ring = 0; ring < stops.length; ring++) {
    if (!stops[ring].outer) continue;
    const frame = ringFrames[ring], before = frameAt(Math.max(0, frame.t - tStep), frame.across),
      after = frameAt(Math.min(1, frame.t + tStep), frame.across);
    for (let side = 0; side <= sides; side++) {
      const angle = side / sides * TAU;
      const angular = pointAt(frame, angle + angleStep).sub(pointAt(frame, angle - angleStep));
      const axialDirection = pointAt(after, angle).sub(pointAt(before, angle));
      const outward = angular.cross(axialDirection);
      // Tiny finite-difference vectors are expected on millimetre branches;
      // their cross products are valid well below ordinary metre-scale epsilons.
      const vertex = ring * (sides + 1) + side;
      if (outward.lengthSq() > 1e-30) outward.normalize();
      if (outward.lengthSq() > .99 && (adjacentWallNormals[vertex] ?? []).every(face => outward.dot(face) > .00001)) {
        normals.setXYZ(vertex, outward.x, outward.y, outward.z);
      } else exteriorNormalFallbacks++;
    }
  }
  smoothCylinderSeam(shape, stops.length, sides);
  shape.userData.coralBranch = { length, radius, endRadius, endRatio, closedEnds: 2,
    centerlineExcess: length / points[0].distanceTo(points.at(-1)) - 1,
    axialCup: axial, axialOuterDiameter: axial ? axialRadius * 2 : 0,
    axialCupDepth: axial ? cupDepth : 0,
    inspection: { sides, rings: stops.length, lipRing: axial ? stops.length - 2 : null,
      mouthPole: tipPole, axis: curve.getTangentAt(1).normalize().toArray(),
      shaftRings: coreStops.length, roundedShoulderRing: roundedShoulder ? coreStops.length : null,
      compactAxialCup, lowShoulderRadiusOffset,
      ...(exsertAxial?{exsertNeckLengthM:(1-neckStart)*length,exsertNeckRing:coreStops.length+(roundedShoulder?1:0)}:{}),
      outerNormalRings: stops.flatMap((stop, ring) => stop.outer ? [ring] : []),
      exteriorNormalMethod: 'finite differences of authored centreline, radius, angular relief and local transported frame',
      exteriorNormalFallbacks, exteriorNormalGuard: 'candidate must face all adjacent drawn wall triangles; otherwise retain geometry normal',
      concaveCupNormals: compactAxialCup ? 'separate inward geometry normals on duplicated original lip and original mouth pole' :
        'original geometry normals retained' } };
  return shape;
}

// A small tubular radial corallite, with a tissue-colored wall and concave
// polyp mouth. Three rings and two poles form a watertight 30-triangle shell
// at five sides. Bases intersect the branch; no detached beads or new draws.
function coralRadialCup(curve, branchRadius, endRatio, t, angle, tint, random, sides = 5, surfaceMesh = null) {
  const center = curve.getPointAt(t), tangent = curve.getTangentAt(t).normalize();
  const across = new THREE.Vector3().crossVectors(tangent,
    Math.abs(tangent.y) > .85 ? V(1, 0, 0) : V(0, 1, 0)).normalize();
  const normal = new THREE.Vector3().crossVectors(tangent, across).normalize();
  const radial = across.clone().multiplyScalar(Math.cos(angle)).addScaledVector(normal, Math.sin(angle));
  const axis = radial.clone().addScaledVector(tangent, .35 + random() * .32).normalize();
  const xAxis = new THREE.Vector3().crossVectors(axis, tangent).normalize();
  const yAxis = new THREE.Vector3().crossVectors(axis, xAxis).normalize();
  const radius = clamp(branchRadius * (.12 + random() * .065), .00125, .0030);
  const projection = radius * (1.35 + random() * .65), depth = radius * .82;
  const branchSurface = THREE.MathUtils.lerp(branchRadius, branchRadius * endRatio, t);
  let base;
  if(surfaceMesh){
    const reach=branchRadius*2+.01;
    const ray=new THREE.Raycaster(center.clone().addScaledVector(radial,reach),radial.clone().negate(),0,reach*2);
    const hit=ray.intersectObject(surfaceMesh,false)[0];
    if(!hit)throw new Error('Prototype radial corallite requires an actual branch surface');
    base=hit.point.clone().addScaledVector(axis,-radius*.45);
  }else base = center.addScaledVector(radial, branchSurface * .94 - radius * .35);
  const positions = [], indices = [], uvs = [], colors = [];
  const tissue = new THREE.Color(tint).lerp(new THREE.Color('#a68b61'), .16);
  const lip = tissue.clone().lerp(new THREE.Color('#c9ba94'), .25);
  const mouth = tissue.clone().multiplyScalar(.64);
  const rings = [{ height: 0, radius: radius * 1.12, color: tissue },
    { height: projection, radius, color: lip },
    { height: projection - depth * .12, radius: radius * .53, color: mouth }];
  for (let ring = 0; ring < rings.length; ring++) {
    const spec = rings[ring];
    for (let side = 0; side <= sides; side++) {
      const a = side / sides * TAU;
      const p = base.clone().addScaledVector(axis, spec.height)
        .addScaledVector(xAxis, Math.cos(a) * spec.radius)
        .addScaledVector(yAxis, Math.sin(a) * spec.radius * .87);
      positions.push(p.x, p.y, p.z);
      // Cup walls keep the same tiny-scale surface as the branch. A geometry
      // lip carries the silhouette; cup shading does not rely on a black map.
      uvs.push(side / sides * TAU * radius / .085 + .23, spec.height / .10 + .17);
      colors.push(spec.color.r, spec.color.g, spec.color.b);
      if (ring < rings.length - 1 && side < sides) {
        const a = ring * (sides + 1) + side, b = a + sides + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  const basalPole = positions.length / 3, mouthPole = basalPole + 1;
  for (const [height, color] of [[0, tissue], [projection - depth, mouth]]) {
    const p = base.clone().addScaledVector(axis, height);
    positions.push(p.x, p.y, p.z); uvs.push(.23, height / .10 + .17);
    colors.push(color.r, color.g, color.b);
  }
  const lastRing = (rings.length - 1) * (sides + 1);
  for (let side = 0; side < sides; side++) {
    indices.push(basalPole, side + 1, side, mouthPole, lastRing + side, lastRing + side + 1);
  }
  const out = smoothCylinderSeam(geometry(positions, indices, uvs, colors), rings.length, sides);
  out.userData.coralRadialCup = { outerDiameter: radius * 2, projection, depth, t,
    ...(surfaceMesh?{attachment:'ray against actual isolated branch triangles; basal centre buried 0.45 display-cup radii'}:{}),
    inspection: { sides, rings: rings.length, lipRing: 1, mouthPole, axis: axis.toArray() } };
  return out;
}

function mergeCoralLimbs(parts) {
  const branches = parts.map(part => part.userData.coralBranch).filter(Boolean);
  const cups = parts.map(part => part.userData.coralRadialCup).filter(Boolean);
  const average = values => values.reduce((sum, value) => sum + value, 0) / values.length;
  const radiusMean = average(branches.map(branch => branch.radius));
  let vertexStart = 0;
  const sections = parts.map(part => {
    const branch = part.userData.coralBranch, cup = part.userData.coralRadialCup;
    const section = { kind: branch ? 'branch' : 'radial', vertexStart,
      axialCup: Boolean(branch?.axialCup), ...(branch ?? cup).inspection };
    vertexStart += part.getAttribute('position').count;
    return section;
  });
  const out = merge(parts);
  // Creation-time diagnostics let the node inspector measure actual vertices
  // and normals. These do not participate in animation or frame updates.
  out.userData.coralSurfaceSections = sections;
  out.userData.coralBranches = { count: branches.length,
    closedEnds: branches.reduce((sum, branch) => sum + branch.closedEnds, 0),
    minimumLength: Math.min(...branches.map(branch => branch.length)),
    maximumLength: Math.max(...branches.map(branch => branch.length)),
    minimumRadius: Math.min(...branches.map(branch => branch.radius)),
    maximumRadius: Math.max(...branches.map(branch => branch.radius)),
    radiusCoefficientOfVariation: Math.sqrt(average(branches.map(branch => (branch.radius - radiusMean) ** 2))) / radiusMean,
    minimumEndRatio: Math.min(...branches.map(branch => branch.endRatio)),
    maximumEndRatio: Math.max(...branches.map(branch => branch.endRatio)),
    meanCenterlineExcess: average(branches.map(branch => branch.centerlineExcess)),
    axialCups: branches.filter(branch => branch.axialCup).length };
  const axial = branches.filter(branch => branch.axialCup);
  out.userData.coralCorallites = { axialCount: axial.length, radialCount: cups.length,
    axialOuterDiameterRange: [Math.min(...axial.map(branch => branch.axialOuterDiameter)),
      Math.max(...axial.map(branch => branch.axialOuterDiameter))],
    axialCupDepthRange: [Math.min(...axial.map(branch => branch.axialCupDepth)),
      Math.max(...axial.map(branch => branch.axialCupDepth))],
    radialOuterDiameterRange: [Math.min(...cups.map(cup => cup.outerDiameter)), Math.max(...cups.map(cup => cup.outerDiameter))],
    radialProjectionRange: [Math.min(...cups.map(cup => cup.projection)), Math.max(...cups.map(cup => cup.projection))],
    radialBranchPositionRange: [Math.min(...cups.map(cup => cup.t)), Math.max(...cups.map(cup => cup.t))],
    surface: 'pigmented living-tissue proxy; recessed mouths; no bare-skeleton treatment',
    scale: 'authored display detail, not a measured specimen or a polyp census' };
  return out;
}

function coralGeometry(type, seed) {
  const random = seeded(seed), parts = [];
  const palette = ['#8a7952', '#998453', '#a38f60', '#81734b', '#a28b58'];
  if (type === 'plate') {
    for (let plate = 0; plate < 5; plate++) {
      const pos = [], idx = [], uv = [], color = [];
      const tint = new THREE.Color(palette[plate % 4]);
      const radius = .23 + random() * .22, height = .12 + plate * .085;
      const ox = (random() - .5) * .3, oz = (random() - .5) * .3;
      for (let ring = 0; ring <= 12; ring++) for (let j = 0; j <= 64; j++) {
        const r = radius * ring / 12, a = j / 64 * TAU;
        const warp = Math.sin(a * 7 + plate) * .018 * ring / 12;
        pos.push(ox + Math.cos(a) * r, height + r * .13 + warp, oz + Math.sin(a) * r);
        uv.push(j / 64, ring / 12); color.push(tint.r, tint.g, tint.b);
        if (ring < 12 && j < 64) { const p = ring * 65 + j; idx.push(p, p + 1, p + 65, p + 1, p + 66, p + 65); }
      }
      parts.push(geometry(pos, idx, uv, color));
    }
  } else if (type === 'boulder') {
    const sphere = new THREE.SphereGeometry(.43, 48, 28);
    const pos = sphere.getAttribute('position'), colors = [];
    const tint = new THREE.Color('#a29170');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const ridge = 1 + .045 * Math.sin(x * 70 + Math.cos(z * 22) * 2) + .025 * Math.sin(z * 81 + y * 17);
      pos.setXYZ(i, x * ridge, (y * .78 + .31) * ridge, z * ridge);
      const c = .85 + random() * .22; colors.push(tint.r * c, tint.g * c, tint.b * c);
    }
    sphere.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); sphere.computeVertexNormals(); parts.push(sphere);
  } else {
    // Corals of the World describes A. muricata as cylindrical, thicket-forming
    // branches, compact in shallow water, with pale ends. This remains an
    // authored proxy: no measured branch angles or radial-corallite sizes are
    // claimed. Unequal lateral forks attach along each curved growing axis.
    // Cup geometry is sparse display detail, not a census of living polyps.
    let radialCount = 0;
    for (let cluster = 0; cluster < 7; cluster++) {
      const azimuth = cluster * 2.39996 + (random() - .5) * .45;
      const spread = cluster === 0 ? 0 : .17 + random() * .12;
      const center = V(Math.cos(azimuth) * spread, .008 + random() * .025, Math.sin(azimuth) * spread);
      const stems = 4 + Math.floor(random() * 2);
      const crownHeight = .23 + random() * .10 + (cluster === 0 ? .05 : 0);
      for (let stem = 0; stem < stems; stem++) {
        const a = azimuth + stem / stems * TAU + (random() - .5) * .7;
        const start = center.clone().add(V((random() - .5) * .09, 0, (random() - .5) * .09));
        const end = start.clone().add(V(Math.cos(a) * (.085 + random() * .08),
          crownHeight * (.83 + random() * .34), Math.sin(a) * (.085 + random() * .08)));
        const shoulder = start.clone().lerp(end, .47).add(V((random() - .5) * .058, .019, (random() - .5) * .058));
        const radius = .011 + random() * .015;
        const tint = palette[(cluster + stem) % palette.length];
        const limbRandom = seeded(`${seed}/axis-detail/${cluster}/${stem}`);
        const endRatio = .43 + limbRandom() * .25;
        const crownEnd = end.clone().add(V(Math.cos(a) * .010, .036 + random() * .025, Math.sin(a) * .010));
        const axis = new THREE.CatmullRomCurve3([start, shoulder, end, crownEnd], false, 'centripetal');
        parts.push(coralLimb([start, shoulder, end, crownEnd], radius * 1.12, endRatio, 10, tint, 1));
        for (let cup = 0; cup < 2 && radialCount < 64; cup++, radialCount++) {
          parts.push(coralRadialCup(axis, radius * 1.12, endRatio, .57 + limbRandom() * .32,
            a + cup * 2.4 + limbRandom(), tint, limbRandom, 6));
        }
        const forks = 4 + Math.floor(random() * 2);
        for (let fork = 0; fork < forks; fork++) {
          const height = .17 + fork / forks * .66 + random() * .11;
          const attach = axis.getPointAt(height * .88);
          const forkAngle = a + fork * 2.23 + (random() - .5) * 1.05;
          const length = .070 + random() * .11;
          const branchDirection = V(Math.cos(forkAngle) * length * .82,
            length * (.55 + random() * .43), Math.sin(forkAngle) * length * .82);
          const elbow = attach.clone().addScaledVector(branchDirection, .54).add(V(0, -.010, 0));
          const branchEnd = attach.clone().add(branchDirection);
          const r = radius * (.50 + random() * .27);
          const forkTip = branchEnd.clone().add(V(Math.cos(forkAngle) * .009, .027 + random() * .014,
            Math.sin(forkAngle) * .009));
          const forkRatio = .42 + seeded(`${seed}/fork-detail/${cluster}/${stem}/${fork}`)() * .27;
          parts.push(coralLimb([attach, elbow, branchEnd, forkTip], r * 1.08, forkRatio, 10, tint, 1));
          if (random() > .48) {
            const twigAngle = forkAngle + .68 + (random() - .5) * .45;
            const reach = .047 + random() * .045;
            const tipDirection = V(Math.cos(twigAngle) * reach * .61,
              reach * (.79 + random() * .33), Math.sin(twigAngle) * reach * .61);
            const split = elbow.clone().lerp(branchEnd, .46);
            parts.push(coralLimb([split, split.clone().addScaledVector(tipDirection, .49).add(V(0, -.006, 0)),
              split.clone().add(tipDirection)], r * .69, .49 + limbRandom() * .20, 8,
            palette[(cluster + stem + fork) % palette.length]));
          }
        }
      }
    }
  }
  return type === 'staghorn' ? mergeCoralLimbs(parts) : merge(parts);
}

function coralSurface(root, channel, morphotype = 'branch') {
  return use(root, `coral/surface/${morphotype}/${channel}`, () => {
    const width = 256, height = 256, pixels = new Uint8Array(width * height * 4);
    const tubular = ['staghorn', 'branching', 'table'].includes(morphotype);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const cellHeight = morphotype === 'boulder' ? 8 : tubular ? height / 20 : 12;
      const cellWidth = morphotype === 'boulder' ? 8 : tubular ? width / 16 : 14;
      const row = Math.floor(y / cellHeight), xx = x / cellWidth + (row % 2) * .5;
      const cell = Math.floor(xx) % (tubular ? 16 : 32);
      const wrappedRow = row % (tubular ? 20 : 32);
      const irregular = Math.sin(cell * 12.9898 + wrappedRow * 78.233) * 43758.5453;
      const cellRandom = irregular - Math.floor(irregular);
      const jitter = (cellRandom - .5) * (tubular ? .31 : .14);
      const size = tubular ? .76 + cellRandom * .48 : 1;
      const dx = (xx % 1 - .5 - jitter) * 1.12 / size;
      const dy = (y / cellHeight % 1 - .5 + jitter * .7) / (tubular ? size * 1.17 : 1);
      const distance = Math.sqrt(dx * dx + dy * dy);
      const rim = Math.exp(-Math.pow((distance - .24) / .057, 2));
      const cup = Math.exp(-Math.pow(distance / .13, 2));
      // Irregular elongated lips and a short raised basal tube suggest living
      // radial corallites. Pigmented tissue covers the surface between them.
      const tubeRelief = tubular ?
        Math.exp(-Math.pow(dx / .18, 2) - Math.pow((dy + .24) / .27, 2)) * .11 : 0;
      const grain = Math.sin(x * 4.37 + y * 7.91) * Math.sin(x * .49 - y * .67);
      // Multiple scales of tissue variation survive mip filtering in a wide
      // view. Fine cups alone averaged into a uniform plastic-looking grey.
      // The harmonics tile exactly so the low-frequency patches have no seam.
      const sx = x / width * TAU, sy = y / height * TAU;
      const tissuePatch = morphotype === 'boulder' ?
        Math.sin(sx + Math.sin(sy) * .72) * Math.cos(sy * 2 + Math.sin(sx * 2) * .45) * .54 +
        Math.sin(sx * 3 - sy * 2 + .8) * Math.cos(sy * 3 + .4) * .28 +
        Math.sin(sx * 7 + sy * 4 + Math.sin(sy * 2)) * .18 :
        Math.sin(sx * 2 + Math.sin(sy) * .65) * Math.cos(sy * 2 - Math.sin(sx) * .48) * .65 +
        Math.sin(sx * 5 + sy * 3 + .7) * .35;
      const value = channel === 'bump' ? .44 + rim * .35 - cup * .16 + tubeRelief + grain * .035 :
        morphotype === 'boulder' ? .82 + tissuePatch * .23 + rim * .07 - cup * .10 + grain * .033 :
          tubular ? .84 + tissuePatch * .14 + rim * .067 - cup * .10 + tubeRelief * .24 + grain * .025 :
            .87 + tissuePatch * .085 + rim * .045 - cup * .07 + grain * .022;
      const i = (y * width + x) * 4, byte = clamp(value * 255, 0, 255);
      pixels[i] = channel === 'color' ?
        clamp(byte * (1.01 + tissuePatch * (morphotype === 'boulder' ? .045 : .025)), 0, 255) : byte;
      pixels[i + 1] = byte;
      pixels[i + 2] = channel === 'color' ?
        clamp(byte * (.91 - tissuePatch * .025), 0, 255) : byte;
      pixels[i + 3] = 255;
    }
    const texture = new THREE.DataTexture(pixels, width, height);
    if (channel === 'color') texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true; texture.needsUpdate = true;
    return texture;
  });
}

function createCoral(root, species) {
  const name = `${species.id} ${species.scientificName}`.toLowerCase();
  const type = name.includes('plate') || name.includes('montipora') ? 'plate' :
    name.includes('boulder') || name.includes('porites') ? 'boulder' : 'staghorn';
  const variant = root.userData.serial % 4;
  const geo = use(root, `coral/${type}/${variant}`, () => coralGeometry(type, `${name}/${variant}`));
  const surfaceType = type === 'staghorn' ? 'staghorn' : 'branch';
  const map = coralSurface(root, 'color', surfaceType), bumpMap = coralSurface(root, 'bump', surfaceType);
  const mat = material(root, `coral/living/${type}`, { color: '#ffffff', vertexColors: true,
    map, bumpMap, bumpScale: type === 'staghorn' ? .0017 : .0011, roughness: .89,
    side: type === 'plate' ? THREE.DoubleSide : THREE.FrontSide });
  mesh(root, geo, mat);
}

// Additional reef-cover assets are morphologies, not ecosystem organisms. Their
// geometry never inherits the Acropora muricata identity of createCoral().
// They must not be included in species totals or simulated coral biomass.
function landscapeCoralGeometry(morphotype, palette, variant, detail) {
  const random = seeded(`landscape/${morphotype}/${variant}`);
  const tissuePrototype=detail==='medium-prototype';
  const level = detail === 'high' || detail === 2 ? 2 : detail === 'medium' || detail === 1 || tissuePrototype ? 1 : 0;
  const colors = palette.map(color => new THREE.Color(color));
  if (morphotype === 'branching') {
    // Decorative branching cover retains 28 axes and 56 unequal lateral forks
    // at every LOD, distributed as 1/2/2/3 forks per axis rather than two
    // repeated forks. Higher detail tessellates it and adds enclosed twigs.
    const parts = [], sides = tissuePrototype?10:[6, 8, 10][level];
    const phase = random() * TAU;
    const probeMaterial=tissuePrototype?new THREE.MeshBasicMaterial({side:THREE.DoubleSide}):null;
    let prototypeCups=0;
    function roundBranch(start, end, radius, endRatio, tint, bend) {
      const middle = start.clone().lerp(end, .52).add(bend);
      const points = [start, middle, end];
      const shape=coralLimb(points, radius, endRatio, sides, tint, tissuePrototype?2:level,true,true,tissuePrototype);
      parts.push(shape);
      const curve=new THREE.CatmullRomCurve3(points, false, 'centripetal');
      if(tissuePrototype){
        const cupRandom=seeded(`landscape/tissue-prototype/${variant}/branch/${parts.length}`);
        const surfaceMesh=new THREE.Mesh(shape,probeMaterial);surfaceMesh.updateMatrixWorld(true);
        // Cover the distal shaft as well as the central branch. The dedicated
        // axial neck remains a small pale tube, rather than a smooth end cap.
        // Length/sampling values are display choices, not measured cup density.
        const length=curve.getLength(),rows=Math.max(3,Math.ceil(length/.0135));
        for(let row=0;row<rows;row++)for(let side=0;side<3;side++){
          const t=.07+(row+.15+cupRandom()*.55)/rows*.87;
          const angle=side/3*TAU+row*2.399963+cupRandom()*.7;
          parts.push(coralRadialCup(curve,radius,endRatio,t,angle,tint,cupRandom,6,surfaceMesh));prototypeCups++;
        }
        const colors=shape.getAttribute('color'),positions=shape.getAttribute('position');
        for(let index=0;index<positions.count;index++){
          const x=positions.getX(index),y=positions.getY(index),z=positions.getZ(index);
          const patch=Math.sin(x*47+z*29+phase)*Math.cos(y*39-x*17)*.075;
          colors.setXYZ(index,colors.getX(index)*(1+patch),colors.getY(index)*(1+patch*.56),colors.getZ(index)*(1-patch*.3));
        }
      }
      return curve;
    }
    try {
    for (let cluster = 0; cluster < 7; cluster++) {
      const clusterRandom = seeded(`landscape/branching/${variant}/cluster/${cluster}`);
      const azimuth = cluster * 2.399963 + phase + (clusterRandom() - .5) * .68;
      const spread = cluster === 0 ? 0 : .15 + clusterRandom() * .11;
      const center = V(Math.cos(azimuth) * spread, .008, Math.sin(azimuth) * spread * .87);
      const crown = .23 + clusterRandom() * .11 + (cluster === 0 ? .045 : 0);
      for (let stem = 0; stem < 4; stem++) {
        const axisId = cluster * 4 + stem;
        const axisRandom = seeded(`landscape/branching/${variant}/axis/${axisId}`);
        const a = azimuth + stem / 4 * TAU + (axisRandom() - .5) * .94;
        const start = center.clone().add(V((axisRandom() - .5) * .060, 0, (axisRandom() - .5) * .060));
        const end = start.clone().add(V(Math.cos(a) * (.071 + axisRandom() * .086),
          crown * (.80 + axisRandom() * .34), Math.sin(a) * (.071 + axisRandom() * .086)));
        const radius = .010 + axisRandom() * .015;
        const endRatio = .43 + axisRandom() * .24;
        const tint = palette[(variant + axisId) % palette.length];
        const bend = .015 + axisRandom() * .021;
        const axis = roundBranch(start, end, radius, endRatio, tint,
          V(-Math.sin(a) * bend, .008 + axisRandom() * .011, Math.cos(a) * bend));
        const cupRandom = seeded(`landscape/branching/${variant}/cup/${axisId}`);
        const cupCount = axisId < 2 ? 2 : 1; // Exactly 30 low-detail cups.
        for (let cup = 0; cup < cupCount; cup++) {
          parts.push(coralRadialCup(axis, radius, endRatio, .59 + cupRandom() * .28,
            a + cup * 2.4 + cupRandom() * TAU, tint, cupRandom));
        }
        const forkCount = [1, 3, 2, 2][(axisId + variant) % 4];
        for (let fork = 0; fork < forkCount; fork++) {
          const forkRandom = seeded(`landscape/branching/${variant}/axis/${axisId}/fork/${fork}`);
          const attach = axis.getPointAt(.24 + fork / forkCount * .54 + forkRandom() * .13);
          const angle = a + fork * 2.27 - .91 + (forkRandom() - .5) * .85;
          const reach = .083 + forkRandom() * .099;
          const branchEnd = attach.clone().add(V(Math.cos(angle) * reach * .81,
            reach * (.69 + forkRandom() * .21), Math.sin(angle) * reach * .81));
          roundBranch(attach, branchEnd, radius * (.47 + forkRandom() * .31),
            .40 + forkRandom() * .29, tint,
            V(-Math.sin(angle) * .022, .004 + forkRandom() * .017, Math.cos(angle) * .022));
        }
        if (level > 0) {
          // Short lower twigs remain inside the existing main crown envelope.
          const innerStart = axis.getPointAt(.29);
          const innerEnd = innerStart.clone().add(V(-Math.cos(a) * .048, .088, -Math.sin(a) * .048));
          roundBranch(innerStart, innerEnd, radius * .60, .58, tint, V(0, .009, 0));
        }
      }
    }
    const out=mergeCoralLimbs(parts);
    if(tissuePrototype)out.userData.tissuePrototype={version:'v3',extraRadialCups:prototypeCups,
      rowCountLengthDivisorM:.0135,samplingArcFraction:.87,radialPositionsPerRow:3,
      scope:'one authored decorative near-view colony; not measured density, a new species or modeled biomass'};
    return out;
    } catch (error) {
      for (const part of parts) part.dispose();
      throw error;
    } finally {
      probeMaterial?.dispose();
    }
  }
  if (morphotype === 'boulder') {
    const rows = [22, 32, 46][level], sides = [72, 96, 128][level];
    const positions = [], indices = [], uvs = [], vertexColors = [];
    const stretchX = .90 + random() * .17, stretchZ = .82 + random() * .15;
    const height = .235 + random() * .060;
    const phase = random() * TAU;
    const crownOffset = V((random() - .5) * .13, 0, (random() - .5) * .13);
    const growthLobes = Array.from({ length: 4 }, (_, i) => ({
      angle: phase + i * 1.57 + (random() - .5) * .50,
      reach: .16 + random() * .10,
      radius: .155 + random() * .065,
      relief: .027 + random() * .035,
    }));
    const warmTissue = new THREE.Color('#9b865b'), shadedTissue = new THREE.Color('#77764e');
    const angularDistance = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
    function surface(t, a) {
      // A single attached surface joins unequal growth lobes. The outline is
      // independently lobed and indented, rather than a noisy circular cap.
      // These are authored massive-colony morphologies, not a named species
      // or additional simulated coral biomass.
      const notch = Math.exp(-Math.pow(angularDistance(a, phase + .82) / .32, 2));
      let outline = 1 + Math.sin(a * 2 + phase) * .10 + Math.sin(a * 3 - phase) * .065 - notch * .17;
      for (const lobe of growthLobes) {
        outline += Math.exp(-Math.pow(angularDistance(a, lobe.angle) / .34, 2)) * .14;
      }
      const r = t * .46 * outline;
      const x = Math.cos(a) * r * stretchX + crownOffset.x * (1 - t);
      const z = Math.sin(a) * r * stretchZ + crownOffset.z * (1 - t);
      let lobes = 0;
      for (const lobe of growthLobes) {
        const lx = Math.cos(lobe.angle) * lobe.reach, lz = Math.sin(lobe.angle) * lobe.reach;
        lobes += lobe.relief * Math.exp(-((x - lx) ** 2 + (z - lz) ** 2) / (lobe.radius ** 2));
      }
      const saddle = .021 * Math.exp(-((x + .035) ** 2 + (z - .025) ** 2) / .026);
      const crown = Math.pow(Math.max(0, 1 - t * t), .65);
      const macroRelief = .008 * Math.sin(x * 31 + phase) * Math.sin(z * 26 - phase) +
        .006 * Math.sin(x * 49 - z * 37 + phase);
      const y = -.014 + height * crown + (lobes - saddle + macroRelief + x * .06 - z * .04) *
        THREE.MathUtils.smoothstep(1 - t, 0, .22);
      return { x, y, z, crown, lobes, macroRelief };
    }
    function vertex(t, a) {
      const p = surface(t, a);
      positions.push(p.x, p.y, p.z);
      // Close-set shallow cups are surface detail. Their display scale is an
      // authored proxy; the broad silhouette does not depend on bump mapping.
      // Local metre projection removes the angular seam and crown pinch. The
      // unchanged 256px/8px-cell tissue pattern has 6mm spacing along z;
      // x's 1.12 factor compensates its existing horizontal cup compression.
      // Instance scale still scales this authored tissue proxy in world space.
      uvs.push(p.x / .21504, p.z / .192);
      const patch = .5 + .5 * Math.sin(p.x * 11 + phase) * Math.sin(p.z * 13 - phase);
      const color = colors[variant % colors.length].clone()
        .lerp(warmTissue, patch * .17).lerp(shadedTissue, (1 - p.crown) * .12);
      const shade = .81 + .14 * p.crown + p.lobes * .32 + p.macroRelief * 1.25 +
        Math.sin(p.x * 37 + phase) * Math.sin(p.z * 41 - phase) * .034;
      vertexColors.push(color.r * shade, color.g * shade, color.b * shade);
    }
    // One real pole avoids the degenerate repeated centre triangles that can
    // produce a pinched or dark star at the crown. The basal rim is buried in
    // the support rock by the world's attachment offset.
    vertex(0, 0);
    for (let row = 1; row <= rows; row++) for (let side = 0; side <= sides; side++) {
      vertex(row / rows, side / sides * TAU);
    }
    for (let side = 0; side < sides; side++) indices.push(0, side + 2, side + 1);
    for (let row = 0; row < rows - 1; row++) for (let side = 0; side < sides; side++) {
      const p = 1 + row * (sides + 1) + side;
      indices.push(p, p + 1, p + sides + 1, p + 1, p + sides + 2, p + sides + 1);
    }
    const out = geometry(positions, indices, uvs, vertexColors);
    const normal = out.getAttribute('normal');
    // The duplicated UV seam needs one shared lighting normal on each ring.
    for (let row = 0; row < rows; row++) {
      const first = 1 + row * (sides + 1), last = first + sides;
      const averaged = V(normal.getX(first) + normal.getX(last), normal.getY(first) + normal.getY(last),
        normal.getZ(first) + normal.getZ(last)).normalize();
      normal.setXYZ(first, averaged.x, averaged.y, averaged.z);
      normal.setXYZ(last, averaged.x, averaged.y, averaged.z);
    }
    return out;
  }

  // The table is a low, fused branching crown, not a stack of solid disks.
  // Unequal lateral twigs interlock across axes, with short upright terminals.
  // All LODs keep the same major crown axes; only small branches and radial
  // tessellation change, so far/near selection preserves the colony outline.
  const parts = [], axes = 24, forks = [2, 5, 8][level], sides = [6, 8, 9][level];
  const shapePhase = random() * TAU;
  const centers = [V(-.055, .134, -.045), V(.065, .154, -.035), V(.003, .143, .070)];
  for (let i = 0; i < 3; i++) {
    const c = centers[i];
    parts.push(coralLimb([V(c.x * .2, .01, c.z * .2), V(c.x * .7, c.y * .66, c.z * .7), c],
      .030, .61, sides, palette[(variant + i) % palette.length], level, false));
  }
  const ends = [];
  for (let axis = 0; axis < axes; axis++) {
    const axisRandom = seeded(`landscape/table/${variant}/axis/${axis}`);
    const a = axis / axes * TAU + shapePhase + (axisRandom() - .5) * .27;
    const growth = 1 + Math.sin(a * 3 + shapePhase) * .075 + Math.sin(a * 7 - shapePhase) * .024;
    const start = centers[axis % 3].clone();
    const reach = .35 * growth * (.94 + axisRandom() * .12);
    const end = V(Math.cos(a) * reach, .162 + .028 * Math.sin(a * 3 + shapePhase) +
      (axisRandom() - .5) * .015, Math.sin(a) * reach);
    const mid = start.clone().lerp(end, .53).add(V(-Math.sin(a) * .020, .014, Math.cos(a) * .020));
    const color = palette[(variant + axis) % palette.length];
    const axisCurve = new THREE.CatmullRomCurve3([start, mid, end], false, 'centripetal');
    const axisRadius = .010 + axisRandom() * .012;
    const endRatio = .39 + axisRandom() * .22;
    parts.push(coralLimb([start, mid, end], axisRadius, endRatio, sides, color, level));
    // Sparse geometry catches light at close range; remaining radial cups use
    // the existing color/bump channels. Twelve cups keep the actual low mesh
    // under 6000 triangles without turning the whole crown into micro-meshes.
    if (axis % 2 === 0) {
      const cupRandom = seeded(`landscape/table/${variant}/cup/${axis}`);
      parts.push(coralRadialCup(axisCurve, axisRadius, endRatio, .61 + cupRandom() * .23,
        1.1 + cupRandom() * 1.4, color, cupRandom));
    }
    ends.push(end);
    for (let fork = 0; fork < forks; fork++) {
      const forkRandom = seeded(`landscape/table/${variant}/axis/${axis}/fork/${fork}`);
      // The same two large forks survive every LOD. Extra inner twigs have
      // shorter reach and do not become a new far/near crown silhouette.
      const t = fork < 2 ? .25 + fork * .37 + (forkRandom() - .5) * .13 :
        .22 + (fork - 2) / Math.max(1, forks - 2) * .52;
      const attach = axisCurve.getPointAt(t);
      const side = fork % 2 === 0 ? -1 : 1;
      const forkAngle = a + side * (.39 + forkRandom() * .44);
      const length = (.049 + forkRandom() * .081) * (fork < 2 ? 1 : .68);
      const branchEnd = attach.clone().add(V(Math.cos(forkAngle) * length,
        .013 + forkRandom() * .018, Math.sin(forkAngle) * length));
      const elbow = attach.clone().lerp(branchEnd, .53).add(V(-Math.sin(a) * .005, .005, Math.cos(a) * .005));
      const radius = .0056 + forkRandom() * .006;
      const tip = branchEnd.clone().add(V(Math.cos(forkAngle) * .007,
        .017 + forkRandom() * .021, Math.sin(forkAngle) * .007));
      parts.push(coralLimb([attach, elbow, branchEnd, tip], radius * 1.10, .41 + forkRandom() * .24, sides,
        palette[(variant + axis + fork) % palette.length], level));
    }
  }
  // Low horizontal fusions fill some inner gaps and avoid a wagon-wheel core.
  for (let i = 0; i < ends.length; i++) {
    const a = ends[i].clone().lerp(centers[i % 3], .35);
    const b = ends[(i + 1) % ends.length].clone().lerp(centers[(i + 1) % 3], .43);
    const chord = a.distanceTo(b);
    // Neighboring unequal axes can approach closely. A short fusion must
    // narrow and flatten its bend to avoid folding its own outer normals.
    parts.push(coralLimb([a, a.clone().lerp(b, .5).add(V(0, Math.min(.009, chord * .12), 0)), b],
      Math.min(.0095, chord * .19), .79,
      sides, palette[(variant + i) % palette.length], level, false));
  }
  return mergeCoralLimbs(parts);
}

export function createCoralLandscape(morphotype, colors, variant = 0, detail = 'low') {
  if (!['table', 'boulder', 'branching'].includes(morphotype)) {
    throw new Error(`Unsupported landscape coral morphology: ${morphotype}`);
  }
  const palette = colors?.length ? colors : morphotype === 'table' ?
    ['#95835c', '#ac9870', '#88764f'] : morphotype === 'branching' ?
      ['#8a7952', '#998453', '#a38f60', '#81734b'] : ['#a1956e', '#968960', '#b2a27b'];
  // Also accept { detail: 'low'|'medium'|'high' } as the fourth argument.
  const level = typeof detail === 'object' ? detail.detail ?? 'low' : detail;
  const root = new THREE.Group();
  root.name = `${morphotype} landscape coral`;
  root.userData.kind = 'coral';
  root.userData.landscapeCoral = true;
  root.userData.morphotype = morphotype;
  root.userData.detail = level;
  root.userData.serial = serial++;
  root.userData.part = 0;
  root.userData.resources = new Set();
  const geo = use(root, `landscape/${morphotype}/${palette.join(',')}/${variant}/${level}`,
    () => landscapeCoralGeometry(morphotype, palette, variant, level));
  const map = coralSurface(root, 'color', morphotype), bumpMap = coralSurface(root, 'bump', morphotype);
  const mat = material(root, `coral/landscape/${morphotype}`, { color: '#ffffff', vertexColors: true,
    map, bumpMap, bumpScale: morphotype === 'boulder' ? .0024 : .0017,
    roughness: .91, side: morphotype === 'table' ? THREE.DoubleSide : THREE.FrontSide });
  mesh(root, geo, mat);
  return root;
}

function createShrimp(root, species) {
  const key = species.id ?? 'cleaner-shrimp';
  // Lysmata amboinensis: orange-yellow sides, red dorsal bands bordering a
  // white median stripe. Prakash et al. 2016, Check List 12(6):2010, p.4 / Fig.4,
  // DOI 10.15560/12.6.2010; Georgia Aquarium's species page agrees. The telson
  // has a break in its white marking; it is not L. grabhami's continuous line.
  const shellMap = use(root, 'shrimp/amboinensis/color', () => {
    const width = 256, height = 64, pixels = new Uint8Array(width * height * 4);
    const amber = new THREE.Color('#d5ac62'), red = new THREE.Color('#b83d30');
    const white = new THREE.Color('#eee9da');
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      // tube() transports its upward normal to u=.75 for both body directions.
      const distance = Math.abs(x / (width - 1) - .75);
      const redMix = 1 - THREE.MathUtils.smoothstep(distance, .155, .205);
      const whiteMix = 1 - THREE.MathUtils.smoothstep(distance, .035, .047);
      const shade = .97 + Math.sin(x * .17 + y * .27) * .025;
      const color = amber.clone().lerp(red, redMix).lerp(white, whiteMix).multiplyScalar(shade);
      const i = (y * width + x) * 4;
      // Less pigment on the sides lets the amber shell transmit light; the
      // dorsal identifying bands stay readable at the same illumination.
      const encoded = color.getHex(THREE.SRGBColorSpace);
      pixels[i] = encoded >> 16 & 255;
      pixels[i + 1] = encoded >> 8 & 255;
      pixels[i + 2] = encoded & 255;
      pixels[i + 3] = (.49 + redMix * .40 + whiteMix * .09) * 255;
    }
    const map = new THREE.DataTexture(pixels, width, height);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = THREE.RepeatWrapping;
    map.magFilter = THREE.LinearFilter; map.minFilter = THREE.LinearMipmapLinearFilter;
    map.generateMipmaps = true; map.needsUpdate = true;
    return map;
  });
  const shell = material(root, 'shrimp/amboinensis/shell', { color: '#ffffff', map: shellMap,
    roughness: .38, transparent: true, opacity: 1, metalness: 0, depthWrite: false });
  const pale = material(root, 'shrimp/pale', { color: '#d7bd79', roughness: .43,
    transparent: true, opacity: .67, depthWrite: false });
  const body = new THREE.Group(); root.add(body);
  const shellGeo = use(root, `${key}/carapace`, () => tube([
    V(.03, .16, 0), V(.12, .19, 0), V(.22, .175, 0), V(.27, .14, 0),
  ], [.046, .067, .049, .01], 16, .78));
  mesh(root, shellGeo, shell, body);
  const abdomen = new THREE.Group(); body.add(abdomen);
  const abdomenGeo = use(root, `${key}/abdomen`, () => {
    const segments = [];
    for (let i = 0; i < 6; i++) {
      const x = .025 - i * .053, y = .16 - Math.pow(i / 5, 2) * .078;
      const radius = .043 - i * .0045;
      segments.push(tube([V(x, y, 0), V(x - .026, y - .006, 0), V(x - .049, y - .012, 0)],
        [radius, radius * 1.04, radius * .85], 12, .87));
    }
    return merge(segments);
  });
  mesh(root, abdomenGeo, shell, abdomen);
  const fanGeo = use(root, `${key}/fan`, () => {
    const parts = [], rows = 12, across = 8;
    const red = new THREE.Color('#b74434'), white = new THREE.Color('#e8e4d4');
    for (const side of [-1, 0, 1]) {
      const pos = [], idx = [], uv = [], colors = [];
      for (let row = 0; row <= rows; row++) for (let j = 0; j <= across; j++) {
        const t = row / rows, f = j / across * 2 - 1;
        const width = Math.pow(Math.sin(t * Math.PI), .55) * (side === 0 ? .018 : .030);
        const x = -.29 - t * (side === 0 ? .134 : .116) + side * f * width * .24;
        const y = .070 - t * .051 + Math.sin(t * Math.PI) * .005;
        const z = side * (.009 + t * .046) + f * width;
        pos.push(x, y, z); uv.push(t, j / across);
        const patches = side === 0 ? t > .78 && Math.abs(f) < (t - .78) * 4.6 :
          ((t - .45) ** 2 / .005 + (f + side * .12) ** 2 / .20 < 1 ||
            (t - .77) ** 2 / .006 + (f - side * .18) ** 2 / .25 < 1);
        const color = (patches ? white : red).clone().multiplyScalar(.96 + t * .04);
        colors.push(color.r, color.g, color.b);
        if (row < rows && j < across) {
          const p = row * (across + 1) + j;
          idx.push(p, p + 1, p + across + 1, p + 1, p + across + 2, p + across + 1);
        }
      }
      parts.push(geometry(pos, idx, uv, colors));
    }
    return merge(parts);
  });
  mesh(root, fanGeo, material(root, 'shrimp/fan', { color: '#ffffff', vertexColors: true,
    roughness: .45, transparent: true, opacity: .83, depthWrite: false, side: THREE.DoubleSide }), abdomen);
  const legs = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const leg = new THREE.Group(); leg.position.set(.20 - i * .051, .15, side * .024);
      body.add(leg); legs.push(leg);
      const a = V(0, 0, 0), b = V(.032 - i * .016, -.034, side * .09);
      const c = V(.066 - i * .033, -.115, side * .13), d = V(.078 - i * .040, -.149, side * .16);
      const legGeo = use(root, `${key}/leg/${side}/${i}`, () => tube([a, b, c, d], [.009, .007, .004, .0012], 6));
      mesh(root, legGeo, pale, leg);
    }
    const stalkGeo = use(root, `${key}/eyeStalk/${side}`, () => tube([V(.22, .19, side * .03), V(.265, .225, side * .056)], [.005, .0035], 8));
    mesh(root, stalkGeo, pale, body);
    bead(root, V(.265, .225, side * .056), V(.012, .014, .012), '#323c2d', body, .16);
    for (let j = 0; j < 3; j++) {
      const points = [];
      for (let i = 0; i <= 24; i++) {
        const t = i / 24;
        points.push(V(.235 + Math.sin(t * (1.25 + j * .17)) * (.37 - j * .035),
          .19 + t * (.15 + j * .034) - t * t * .10,
          side * (.023 + t * (.19 + j * .07))));
      }
      line(root, points, '#e3dcc7', body, .87, `${key}/antenna/${side}/${j}`);
    }
  }
  const rostrumGeo = use(root, `${key}/rostrum`, () => geometry([
    .20, .21, -.008, .20, .21, .008, .34, .20, 0, .27, .175, 0,
  ], [0, 2, 1, 0, 3, 2, 1, 2, 3]));
  mesh(root, rostrumGeo, pale, body);
  root.userData.animation = { type: 'shrimp', legs, abdomen };
}

function createCrab(root, species) {
  const key = species.id ?? 'reef-crab';
  const shellMat = material(root, 'crab/shell', { color: species.colors?.[0] ?? '#92684d', roughness: .84 });
  const dark = material(root, 'crab/limb', { color: '#795c47', roughness: .83 });
  const shell = use(root, `${key}/shell`, () => {
    const pos = [], uv = [], idx = [];
    for (let ring = 0; ring <= 10; ring++) for (let j = 0; j <= 48; j++) {
      const r = ring / 10, a = j / 48 * TAU;
      const edge = 1 + Math.sin(a * 12) * .035 * r;
      pos.push(Math.cos(a) * .21 * r * edge, .115 + Math.sqrt(1 - r * r) * .13, Math.sin(a) * .29 * r * edge);
      uv.push(j / 48, r);
      if (ring < 10 && j < 48) { const p = ring * 49 + j; idx.push(p, p + 1, p + 49, p + 1, p + 50, p + 49); }
    }
    return geometry(pos, idx, uv);
  });
  mesh(root, shell, shellMat);
  const legs = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const leg = new THREE.Group(); leg.position.set(.13 - i * .083, .135, side * .20); root.add(leg); legs.push(leg);
      const geo = use(root, `${key}/leg/${side}/${i}`, () => tube([V(0, 0, 0),
        V(.15 - i * .09, .048, side * .15), V(.20 - i * .11, -.04, side * .27),
        V(.24 - i * .14, -.125, side * .31)], [.037, .024, .014, .002], 8, .72));
      mesh(root, geo, dark, leg);
    }
    const clawArm = use(root, `${key}/clawArm/${side}`, () => tube([V(.15, .16, side * .14), V(.31, .17, side * .23), V(.37, .21, side * .17)], [.038, .035, .05], 10));
    mesh(root, clawArm, shellMat);
    const pincer = use(root, `${key}/claw/${side}`, () => merge([
      tube([V(.35, .21, side * .17), V(.43, .225, side * .14), V(.49, .22, side * .09)], [.048, .034, .003], 10, .8),
      tube([V(.35, .19, side * .17), V(.41, .155, side * .12), V(.48, .19, side * .095)], [.035, .019, .003], 10, .8),
    ]));
    mesh(root, pincer, shellMat);
    const stalk = use(root, `${key}/eyeStalk/${side}`, () => tube([V(.17, .22, side * .09), V(.225, .274, side * .11)], [.012, .007], 8));
    mesh(root, stalk, dark);
    bead(root, V(.225, .274, side * .11), V(.018, .018, .017), '#142124', root, .18);
  }
  root.userData.animation = { type: 'crab', legs };
}

function createStar(root, species) {
  const key = species.id ?? 'blue-starfish';
  const random = seeded(key);
  const geo = use(root, `${key}/body`, () => {
    const pos = [], idx = [], uv = [];
    const rings = 18, sides = 120;
    for (let ring = 0; ring <= rings; ring++) for (let i = 0; i <= sides; i++) {
      const a = i / sides * TAU, radial = ring / rings;
      const arm = Math.pow((Math.cos(a * 5) + 1) / 2, 5.5);
      const radius = (.13 + arm * .37) * radial;
      const height = .015 + .052 * (1 - radial * radial) + .012 * arm * Math.sin(radial * Math.PI);
      pos.push(Math.cos(a) * radius, height, Math.sin(a) * radius); uv.push(radial, i / sides);
      if (ring < rings && i < sides) { const p = ring * (sides + 1) + i; idx.push(p, p + 1, p + sides + 1, p + 1, p + sides + 2, p + sides + 1); }
    }
    return geometry(pos, idx, uv);
  });
  const mat = material(root, `${key}/mat`, { color: species.colors?.[0] ?? '#356e9f', roughness: .88, side: THREE.DoubleSide });
  mesh(root, geo, mat);
  // Low relief ossicles follow the five arms rather than a generic star outline.
  const granules = use(root, `${key}/granules`, () => {
    const pieces = [];
    for (let arm = 0; arm < 5; arm++) for (let i = 0; i < 20; i++) {
      const a = arm / 5 * TAU, r = .065 + i / 20 * .40;
      const dot = new THREE.SphereGeometry(.006 + random() * .003, 5, 3);
      dot.scale(1, .48, 1); dot.translate(Math.cos(a) * r, .061 - r * .064, Math.sin(a) * r); pieces.push(dot);
    }
    return merge(pieces);
  });
  mesh(root, granules, material(root, `${key}/dots`, { color: '#5389a5', roughness: .9 }));
}

function createCucumber(root, species) {
  const key = species.id ?? 'black-cucumber';
  const mat = material(root, `${key}/skin`, { color: '#29332e', roughness: .99 });
  const geo = use(root, `${key}/body`, () => {
    const points = [], radii = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      points.push(V(-.5 + t, .10 + Math.sin(t * Math.PI) * .035, Math.sin(t * Math.PI * 1.3) * .022));
      radii.push(.02 + Math.pow(Math.sin(t * Math.PI), .4) * .095);
    }
    const out = tube(points, radii, 24, .78);
    const p = out.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const bump = .005 * Math.sin(p.getX(i) * 170) * Math.sin(p.getZ(i) * 185 + p.getY(i) * 51);
      p.setY(i, p.getY(i) + bump);
    }
    out.computeVertexNormals(); return out;
  });
  mesh(root, geo, mat);
  const tentacles = use(root, `${key}/tentacles`, () => {
    const parts = [];
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * TAU;
      parts.push(tube([V(.48, .12, 0), V(.52, .13 + Math.sin(a) * .018, Math.cos(a) * .02),
        V(.54, .13 + Math.sin(a) * .035, Math.cos(a) * .037)], [.007, .005, .002], 5));
    }
    return merge(parts);
  });
  mesh(root, tentacles, material(root, `${key}/mouth`, { color: '#615a3f', roughness: .85 }));
}

function createSnail(root, species) {
  const key = species.id ?? 'top-shell';
  const geo = use(root, `${key}/shell`, () => {
    const pos = [], uv = [], idx = [];
    const turns = 5.25, segments = 260, sides = 18;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments, a = t * turns * TAU;
      const radius = .015 + t * t * .30, thickness = .008 + t * t * .108;
      for (let j = 0; j <= sides; j++) {
        const theta = j / sides * TAU;
        const ridge = 1 + .045 * Math.sin(a * 15 + theta * 3);
        const r = radius + Math.cos(theta) * thickness * ridge;
        pos.push(Math.cos(a) * r, .46 * (1 - t) + .09 + Math.sin(theta) * thickness * ridge,
          Math.sin(a) * r); uv.push(t * 9, j / sides);
        if (i < segments && j < sides) { const p = i * (sides + 1) + j; idx.push(p, p + sides + 1, p + 1, p + 1, p + sides + 1, p + sides + 2); }
      }
    }
    return geometry(pos, idx, uv);
  });
  mesh(root, geo, material(root, `${key}/shellMat`, { color: species.colors?.[0] ?? '#b3a185', roughness: .79, side: THREE.DoubleSide }));
  const footGeo = use(root, `${key}/foot`, () => tube([V(-.35, .035, 0), V(0, .042, 0), V(.40, .047, 0)], [.035, .13, .03], 16, .22));
  mesh(root, footGeo, material(root, `${key}/footMat`, { color: '#746f55', roughness: .9 }));
  for (const side of [-1, 1]) {
    line(root, [V(.34, .065, side * .035), V(.45, .11, side * .10), V(.5, .14, side * .13)], '#9b9472', root, 1, `${key}/tentacle/${side}`);
  }
}

function createClam(root, species) {
  const key = species.id ?? 'giant-clam';
  const random = seeded(key);
  const shellGeo = use(root, `${key}/shell`, () => {
    const parts = [];
    for (const side of [-1, 1]) {
      const pos = [], uv = [], idx = [];
      for (let ring = 0; ring <= 16; ring++) for (let j = 0; j <= 64; j++) {
        const r = ring / 16, a = j / 64 * TAU;
        const fold = 1 + Math.sin(a * 9 + .7) * .065 * r;
        pos.push(Math.cos(a) * .5 * r * fold,
          .07 + .20 * r * r + .018 * Math.sin(a * 9) * r,
          side * (.035 + Math.abs(Math.sin(a)) * .20 * r * fold));
        uv.push(j / 64, r);
        if (ring < 16 && j < 64) { const p = ring * 65 + j; idx.push(p, p + 65, p + 1, p + 1, p + 65, p + 66); }
      }
      parts.push(geometry(pos, idx, uv));
    }
    return merge(parts);
  });
  mesh(root, shellGeo, material(root, `${key}/shellMat`, { color: '#b7aa88', roughness: .95, side: THREE.DoubleSide }));
  const mantleGeo = use(root, `${key}/mantle`, () => {
    const pos = [], uv = [], idx = [], colors = [];
    const base = new THREE.Color(species.colors?.[0] ?? '#377c86');
    for (let row = 0; row <= 12; row++) for (let i = 0; i <= 80; i++) {
      const t = i / 80, x = -.48 + t * .96, width = Math.pow(Math.sin(t * Math.PI), .55) * .20;
      const z = (row / 12 * 2 - 1) * width;
      const fold = Math.sin(t * TAU * 7) * .033 * Math.pow(Math.abs(row / 6 - 1), 1.4);
      pos.push(x, .245 + fold - Math.pow(z / .23, 2) * .035, z);
      uv.push(t, row / 12);
      const spot = Math.sin(t * 110 + row * 6) > .76 ? 1.35 : .78 + random() * .22;
      colors.push(base.r * spot, base.g * spot, base.b * spot);
      if (row < 12 && i < 80) { const p = row * 81 + i; idx.push(p, p + 1, p + 81, p + 1, p + 82, p + 81); }
    }
    return geometry(pos, idx, uv, colors);
  });
  mesh(root, mantleGeo, material(root, `${key}/mantleMat`, { color: '#ffffff', vertexColors: true, roughness: .44, metalness: .08, side: THREE.DoubleSide }));
  root.userData.animation = { type: 'clam', mantle: root.children.at(-1) };
}

function createAlgae(root, species) {
  const key = species.id ?? 'turf-algae';
  const variant = root.userData.serial % 3;
  const geo = use(root, `${key}/tuft/${variant}`, () => {
    const random = seeded(`${key}/${variant}`), parts = [];
    for (let i = 0; i < 34; i++) {
      const a = random() * TAU, r = Math.sqrt(random()) * .40, h = .045 + random() * .12;
      const ox = Math.cos(a) * r, oz = Math.sin(a) * r, pos = [], idx = [], uv = [], colors = [];
      const tint = new THREE.Color(i % 3 === 0 ? '#687044' : '#536547');
      for (let j = 0; j <= 8; j++) {
        const t = j / 8, width = Math.sin(t * Math.PI) * .013 + .002;
        const lean = t * t * .055;
        for (const side of [-1, 1]) {
          pos.push(ox + Math.cos(a) * lean + side * width * Math.sin(a), t * h,
            oz + Math.sin(a) * lean + side * width * Math.cos(a));
          uv.push((side + 1) / 2, t); colors.push(tint.r * (.85 + t * .15), tint.g, tint.b);
        }
        if (j < 8) { const p = j * 2; idx.push(p, p + 2, p + 1, p + 1, p + 2, p + 3); }
      }
      parts.push(geometry(pos, idx, uv, colors));
    }
    return merge(parts);
  });
  mesh(root, geo, material(root, 'algae/material', { color: '#ffffff', vertexColors: true,
    roughness: .89, side: THREE.DoubleSide }));
  root.userData.animation = { type: 'algae', blades: root.children[0] };
}

// Manta size is disc width, unlike the head-to-tail fish length convention.
// Extended tips are exactly z = +/- .5. Broad pectoral fins provide the
// silhouette; the finite authored shape and slow stroke are display proxies.
function mantaColor(x, y, z) {
  const upper = y >= 0;
  const base = new THREE.Color(upper ? '#35434a' : '#d5dcd6');
  if (upper) {
    const shoulder = Math.exp(-((x - .105) ** 2 / .006 + (Math.abs(z) - .095) ** 2 / .005));
    base.lerp(new THREE.Color('#a4b2af'), shoulder * .68);
  } else {
    const spots = Math.exp(-((x + .055) ** 2 / .001 + (Math.abs(z) - .055) ** 2 / .0005));
    base.lerp(new THREE.Color('#5b6769'), spots * .62);
  }
  return base;
}

function mantaBodyGeometry() {
  const positions = [], colors = [], indices = [];
  const stations = [[-.225, .035], [-.16, .09], [-.08, .128], [.015, .142],
    [.09, .139], [.16, .12], [.23, .095]];
  const sides = 32;
  for (const [x, radius] of stations) for (let side = 0; side <= sides; side++) {
    const angle = side / sides * TAU;
    const y = Math.sin(angle) * radius * .29, z = Math.cos(angle) * radius;
    positions.push(x, y, z);
    const color = mantaColor(x, y, z); colors.push(color.r, color.g, color.b);
  }
  for (let ring = 0; ring < stations.length - 1; ring++) for (let side = 0; side < sides; side++) {
    const a = ring * (sides + 1) + side, b = a + sides + 1;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  for (const end of [0, stations.length - 1]) {
    const center = positions.length / 3, x = stations[end][0];
    positions.push(x, 0, 0);
    const color = mantaColor(x, -.001, 0); colors.push(color.r, color.g, color.b);
    for (let side = 0; side < sides; side++) {
      const a = end * (sides + 1) + side;
      indices.push(...(end === 0 ? [center, a, a + 1] : [center, a + 1, a]));
    }
  }
  return geometry(positions, indices, null, colors);
}

function mantaWingGeometry() {
  // A closed, thin fin separates dark dorsal and pale ventral surfaces.
  // Its swept outline stays attached to the central disc at the hinge.
  const outline = [V(.155, 0, 0), V(.14, 0, .105), V(.065, 0, .25),
    V(-.035, 0, .395), V(-.095, 0, .315), V(-.185, 0, .17), V(-.205, 0, 0)];
  const contour = new THREE.CatmullRomCurve3(outline, true, 'centripetal')
    .getPoints(56).slice(0, -1);
  const maxSpan = Math.max(...contour.map(point => point.z));
  for (const point of contour) point.z = Math.max(0, point.z / maxSpan * .395);
  const positions = [], colors = [], indices = [], rows = 8, sides = contour.length;
  const center = V(-.035, 0, .095);
  for (const surface of [1, -1]) for (let row = 0; row <= rows; row++) {
    const radial = row / rows;
    for (const edge of contour) {
      const x = center.x + (edge.x - center.x) * radial;
      const z = center.z + (edge.z - center.z) * radial;
      const y = surface * (.001 + .009 * (1 - radial * radial)) * (1 - z / .46);
      positions.push(x, y, z);
      const color = mantaColor(x, y, z + .105); colors.push(color.r, color.g, color.b);
    }
  }
  const stride = (rows + 1) * sides;
  for (let surface = 0; surface < 2; surface++) for (let row = 0; row < rows; row++) {
    for (let side = 0; side < sides; side++) {
      const a = surface * stride + row * sides + side;
      const b = surface * stride + row * sides + (side + 1) % sides;
      const c = a + sides, d = b + sides;
      indices.push(...(surface === 0 ? [a, b, c, b, d, c] : [a, c, b, b, c, d]));
    }
  }
  for (let side = 0; side < sides; side++) {
    const a = rows * sides + side, b = rows * sides + (side + 1) % sides;
    indices.push(a, a + stride, b, b, a + stride, b + stride);
  }
  return geometry(positions, indices, null, colors);
}

function createRay(root, species) {
  const key = species.id ?? 'reef-manta';
  const anatomy = new THREE.Group(); root.add(anatomy);
  const skin = material(root, `${key}/skin`, { color: '#ffffff', vertexColors: true,
    roughness: .76, metalness: .015, side: THREE.DoubleSide });
  const body = mesh(root, use(root, `${key}/disc`, mantaBodyGeometry), skin, anatomy);
  body.name = 'Manta central disc';
  const wings = [-1, 1].map(side => {
    const hinge = new THREE.Group(); hinge.position.z = side * .105;
    hinge.userData.side = side; hinge.name = side < 0 ? 'Manta left wing' : 'Manta right wing';
    anatomy.add(hinge);
    const wing = mesh(root, use(root, `${key}/pectoral`, mantaWingGeometry), skin, hinge);
    wing.scale.z = side; return hinge;
  });
  const dark = material(root, `${key}/dark`, { color: '#35434a', roughness: .8 });
  const tail = new THREE.Group(); tail.position.x = -.205; anatomy.add(tail);
  mesh(root, use(root, `${key}/tail`, () => tube([V(0, 0, 0), V(-.16, -.007, 0),
    V(-.36, -.012, .005), V(-.56, -.014, .007)], [.011, .0075, .0038, .0012], 8)), dark, tail);
  for (const side of [-1, 1]) {
    const lobe = mesh(root, use(root, `${key}/cephalic/${side}`, () => tube([V(.20, -.002, side * .115),
      V(.245, -.01, side * .105), V(.285, -.009, side * .098), V(.31, -.002, side * .11)],
    [.012, .021, .02, .006], 10, .46)), dark, anatomy);
    lobe.name = `Manta cephalic lobe ${side}`;
  }
  const mouth = mesh(root, use(root, `${key}/mouth`, () => geometry([
    .232, -.017, -.084, .232, .006, -.084, .232, .006, .084, .232, -.017, .084,
  ], [0, 1, 2, 0, 2, 3])), material(root, `${key}/mouthMat`, { color: '#172326',
    roughness: .95, side: THREE.DoubleSide }), anatomy);
  mouth.name = 'Manta terminal mouth';
  anatomyBeads(root, `${key}/eyes`, [-1, 1].map(side => ({
    center: V(.16, .017, side * .119), scale: V(.010, .009, .007), color: '#1c292d',
  })), anatomy);
  mesh(root, use(root, `${key}/dorsal`, () => geometry([
    -.22, .019, -.009, -.13, .031, -.009, -.18, .088, 0,
    -.22, .019, .009, -.13, .031, .009,
  ], [0, 1, 2, 3, 2, 4, 0, 2, 3, 1, 4, 2, 0, 3, 1, 1, 3, 4])), dark, anatomy);
  root.userData.displayMeasure = 'disc-width';
  root.userData.animation = { type: 'ray', anatomy, wings, tail };
}

export function createOrganism(species) {
  const root = new THREE.Group();
  root.name = species.commonName ?? species.id ?? species.kind;
  root.userData.speciesId = species.id;
  root.userData.kind = species.kind;
  root.userData.serial = serial++;
  root.userData.part = 0;
  root.userData.phase = root.userData.serial * 2.399963229728653;
  root.userData.resources = new Set();
  const builders = { fish: createFish, ray: createRay, shrimp: createShrimp, crab: createCrab,
    cucumber: createCucumber, star: createStar, snail: createSnail,
    coral: createCoral, clam: createClam, algae: createAlgae };
  (builders[species.kind] ?? createFish)(root, species);
  return root;
}

export function animateOrganism(group, t, activity = 1) {
  const a = group.userData.animation;
  if (!a) return;
  const phase = group.userData.phase, speed = clamp(activity, .1, 2.5);
  if (a.type === 'fish') {
    const beat = t * (4.5 + speed * 4) + phase;
    const tailAngle = Math.sin(beat) * (.12 + speed * .15);
    (a.tails ?? [a.tail]).forEach(tail => { tail.rotation.y = tailAngle; });
    a.anatomy.rotation.y = Math.sin(beat - .55) * .018 * speed;
    a.anatomy.rotation.z = Math.sin(beat * .5) * .009;
    a.pectorals.forEach((fin, i) => {
      fin.rotation.x = Math.sin(beat * .55 + i * .3) * .20;
      fin.rotation.y = Math.sin(beat * .55) * .09;
    });
  } else if (a.type === 'ray') {
    const beat = t * (1.08 + speed * .22) + phase;
    const glide = .45 + .55 * (.5 + .5 * Math.sin(t * .18 + phase));
    const stroke = Math.sin(beat) * .27 * glide;
    a.wings.forEach(wing => { wing.rotation.x = -wing.userData.side * stroke; });
    a.anatomy.rotation.z = Math.sin(beat - .45) * .012;
    a.tail.rotation.y = Math.sin(beat * .7 - .8) * .022;
  } else if (a.type === 'shrimp' || a.type === 'crab') {
    a.legs.forEach((leg, i) => { leg.rotation.y = Math.sin(t * 5 * speed + phase + i * .8) * .045; });
    if (a.abdomen) a.abdomen.rotation.z = Math.sin(t * 1.4 + phase) * .015;
  } else if (a.type === 'clam') {
    a.mantle.scale.y = 1 + Math.sin(t * .7 + phase) * .018;
  } else if (a.type === 'algae') {
    a.blades.rotation.x = Math.sin(t * .65 + phase) * .04;
    a.blades.rotation.z = Math.sin(t * .81 + phase) * .025;
  }
}

const detailWorldScale = new THREE.Vector3();

// Called by the world before rendering. Distances are metres and the authored
// fish is approximately one unit long; its world scale is the actual display
// length. A 16–20 body-length band prevents LOD chatter as either camera or fish
// crosses a boundary. Both meshes retain the same silhouette and moving tail;
// only the distant tessellation, tiny seams and chest-fin motion are omitted.
export function updateOrganismDetail(group, cameraDistanceM) {
  const detail = group?.userData.detail;
  if (!detail || !Number.isFinite(cameraDistanceM) || cameraDistanceM < 0) return;
  group.getWorldScale(detailWorldScale);
  const lengthM = Math.max(Math.abs(detailWorldScale.x), Math.abs(detailWorldScale.y),
    Math.abs(detailWorldScale.z), 1e-6);
  const bodyLengths = cameraDistanceM / lengthM;
  const next = detail.level === 'near'
    ? (bodyLengths > detail.farAboveBodyLengths ? 'far' : 'near')
    : (bodyLengths < detail.nearBelowBodyLengths ? 'near' : 'far');
  if (next !== detail.level) {
    detail.level = next;
    detail.near.visible = next === 'near';
    detail.far.visible = next === 'far';
    if (next === 'near') detail.near.traverse(object => { if (object.isMesh) object.castShadow = true; });
  }
  // A fish at twenty body lengths is still visible as a small recognizable
  // animal. Keep its body shadow as a depth cue, while omitting its tiny far
  // membranes from the shadow pass. Reapply after the world's initial generic
  // fish-caster setup, even if a subsequent call retains the same detail level.
  for (const object of detail.farShadowMeshes) object.castShadow = object === detail.farBody;
  return next;
}

export function disposeOrganism(group) {
  if (!group?.userData.resources) return;
  for (const key of group.userData.resources) {
    const entry = resources.get(key);
    if (entry && --entry.refs <= 0) {
      entry.value.dispose?.();
      resources.delete(key);
    }
  }
  group.userData.resources.clear();
  group.removeFromParent();
  group.clear();
}
