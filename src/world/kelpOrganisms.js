import * as THREE from 'three';
import { KELP_FROND_COUNT, KELP_LEAF_COUNT, KELP_STIPE_RADIUS_M, KELP_MORPHOLOGY, kelpStipePosition, kelpLeafFrame, kelpLeafWidth, kelpPneumatocystDimensions } from '../kelpHabitat.js';

// Morphology is grounded in each species' Monterey Bay Aquarium sourceLinks
// in biomes.js. Fine mesh dimensions, motion amplitudes and skin patterns are
// illustrative rendering choices, not measured rates or individual scans.
// Macrocystis is built in metres; all five animals are built near unit length /
// diameter and receive their displaySizeM scale in the world, not in this file.
const cache = new Map();
const TAU = Math.PI * 2;
const vec = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
let instanceSerial = 0;

function shared(root, key, create) {
  let entry = cache.get(key);
  if (!entry) { entry = { value: create(), count: 0 }; cache.set(key, entry); }
  if (!root.userData.shared.has(key)) { root.userData.shared.add(key); entry.count++; }
  return entry.value;
}

function owned(root, item) { root.userData.owned.push(item); return item; }
function mat(root, key, options) {
  return shared(root, `mat/${key}`, () => new THREE.MeshStandardMaterial(options));
}

// A blade is a thin, pigmented sheet rather than an opaque mineral surface.
// Keep Three's interface/specular lighting, but split the diffuse budget into
// reflection and a back-facing Lambert lobe driven by the same incident lights.
// sqrt(albedo) is an authored shorter-path absorption approximation, NOT a
// measured Macrocystis transmission spectrum. Both lobes stay below the input
// energy; no emission, extra illuminant, transparency pass or animation clock
// is introduced. Existing shadow maps also attenuate the transmitted sunlight.
const KELP_THIN_SHEET_LIGHTING = /* glsl */`
const float kelpDiffuseTransmission = 0.30;

vec3 kelpTransmittedAlbedo( const in PhysicalMaterial material ) {
  return sqrt( clamp( material.diffuseContribution, vec3( 0.0 ), vec3( 1.0 ) ) );
}

void RE_Direct_Kelp( const in IncidentLight directLight, const in vec3 geometryPosition,
  const in vec3 geometryNormal, const in vec3 geometryViewDir,
  const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material,
  inout ReflectedLight reflectedLight ) {
  vec3 previousDiffuse = reflectedLight.directDiffuse;
  RE_Direct_Physical( directLight, geometryPosition, geometryNormal,
    geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
  reflectedLight.directDiffuse = previousDiffuse +
    ( reflectedLight.directDiffuse - previousDiffuse ) * ( 1.0 - kelpDiffuseTransmission );
  float backCosine = saturate( dot( -geometryNormal, directLight.direction ) );
  vec3 transmittedIrradiance = backCosine * directLight.color;
  reflectedLight.directDiffuse += transmittedIrradiance * kelpDiffuseTransmission *
    BRDF_Lambert( kelpTransmittedAlbedo( material ) ) * ( vec3( 1.0 ) - material.specularColor );
}

void RE_IndirectDiffuse_Kelp( const in vec3 irradiance, const in vec3 geometryPosition,
  const in vec3 geometryNormal, const in vec3 geometryViewDir,
  const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material,
  inout ReflectedLight reflectedLight ) {
  vec3 previousDiffuse = reflectedLight.indirectDiffuse;
  RE_IndirectDiffuse_Physical( irradiance, geometryPosition, geometryNormal,
    geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
  reflectedLight.indirectDiffuse = previousDiffuse +
    ( reflectedLight.indirectDiffuse - previousDiffuse ) * ( 1.0 - kelpDiffuseTransmission );
  // The existing sky/ground hemisphere reaches the other side of the sheet.
  // Its scene intensity still determines day/night brightness.
  vec3 oppositeIrradiance = getAmbientLightIrradiance( ambientLightColor );
  #if defined( USE_LIGHT_PROBES )
    oppositeIrradiance += getLightProbeIrradiance( lightProbe, -geometryNormal );
  #endif
  #if ( NUM_HEMI_LIGHTS > 0 )
    #pragma unroll_loop_start
    for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) {
      oppositeIrradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], -geometryNormal );
    }
    #pragma unroll_loop_end
  #endif
  reflectedLight.indirectDiffuse += max( oppositeIrradiance, vec3( 0.0 ) ) *
    kelpDiffuseTransmission * BRDF_Lambert( kelpTransmittedAlbedo( material ) ) *
    ( vec3( 1.0 ) - material.specularColor );
}

#undef RE_Direct
#undef RE_IndirectDiffuse
#define RE_Direct RE_Direct_Kelp
#define RE_IndirectDiffuse RE_IndirectDiffuse_Kelp
`;

function kelpBladeMaterial(root) {
  // Every plant owns a cache reference to the shared map, including when the
  // material itself was created by another plant earlier.
  const map = texture(root, 'kelp');
  return shared(root, 'mat/kelp/leaf', () => {
    const material = new THREE.MeshStandardMaterial({ map,
      roughness: .78, side: THREE.DoubleSide, metalness: 0 });
    material.userData.opticalStatus = 'authored-thin-sheet-diffuse-approximation';
    material.userData.diffuseTransmissionFraction = .30;
    material.onBeforeCompile = shader => {
      const marker = '#include <lights_physical_pars_fragment>';
      if (!shader.fragmentShader.includes(marker)) throw new Error('Kelp blade lighting requires Three physical light chunks.');
      shader.fragmentShader = shader.fragmentShader.replace(marker, `${marker}\n${KELP_THIN_SHEET_LIGHTING}`);
    };
    material.customProgramCacheKey = () => 'kelp-thin-sheet-diffuse-v1';
    return material;
  });
}
function addMesh(root, geo, material, parent = root) {
  const item = new THREE.Mesh(geo, material);
  item.castShadow = item.receiveShadow = true; parent.add(item); return item;
}
function geo(positions, indices, uv, colors) {
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (uv) out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (colors) out.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  out.setIndex(indices); out.computeVertexNormals(); out.computeBoundingSphere(); return out;
}
function merged(parts) {
  const p = [], n = [], uv = [], colors = [], idx = []; let offset = 0;
  for (const item of parts) {
    const position = item.attributes.position;
    p.push(...position.array); n.push(...item.attributes.normal.array);
    if (item.attributes.uv) uv.push(...item.attributes.uv.array); else uv.push(...Array(position.count * 2).fill(0));
    if (item.attributes.color) colors.push(...item.attributes.color.array); else colors.push(...Array(position.count * 3).fill(1));
    for (const i of item.index.array) idx.push(i + offset);
    offset += position.count; item.dispose();
  }
  const out = geo(p, idx, uv, colors);
  out.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3)); return out;
}
function tube(points, radii, sides = 7, tint = '#ffffff') {
  const p = [], idx = [], uv = [], colors = [], color = new THREE.Color(tint);
  let previous;
  for (let ring = 0; ring < points.length; ring++) {
    const tangent = points[Math.min(points.length - 1, ring + 1)].clone().sub(points[Math.max(0, ring - 1)]).normalize();
    let across = previous?.clone().addScaledVector(tangent, -previous.dot(tangent));
    if (!across || across.lengthSq() < .00001) across = new THREE.Vector3().crossVectors(tangent, Math.abs(tangent.y) > .9 ? vec(1, 0, 0) : vec(0, 1, 0));
    across.normalize(); previous = across;
    const up = new THREE.Vector3().crossVectors(tangent, across).normalize();
    for (let side = 0; side <= sides; side++) {
      const angle = side / sides * TAU;
      const point = points[ring].clone().addScaledVector(across, Math.cos(angle) * radii[ring])
        .addScaledVector(up, Math.sin(angle) * radii[ring]);
      p.push(point.x, point.y, point.z); uv.push(side / sides, ring / (points.length - 1));
      colors.push(color.r, color.g, color.b);
      if (ring < points.length - 1 && side < sides) {
        const a = ring * (sides + 1) + side, b = a + sides + 1;
        idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  return geo(p, idx, uv, colors);
}

function texture(root, type, bump = false) {
  return shared(root, `texture/${type}/${bump}`, () => {
    const width = 256, height = 128, pixels = new Uint8Array(width * height * 4);
    const base = new THREE.Color(type === 'fish' ? '#777d45' : type === 'chiton' ? '#965448' : type === 'snail' ? '#78644d' : '#967846').convertLinearToSRGB();
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const u = x / width, v = y / height;
      const noise = Math.sin(x * 2.41 + y * 4.19) * Math.sin(x * .83 - y * 1.73);
      let variation = 1;
      if (type === 'fish') variation = .88 + Math.sin(u * 41 + Math.sin(v * 29)) * .10 + Math.sin(u * 13 - v * 17) * .09;
      else if (type === 'chiton') variation = .88 + noise * .09 + Math.sin(u * 38 + v * 17) * .045;
      else if (type === 'snail') variation = .84 + Math.sin(u * 69 + v * 6) * .09 + noise * .06;
      else {
        // Fine lengthwise striations follow blade UVs; broad, faint ribbing
        // replaces transverse bands that read as hard bamboo-like segments.
        const rib = Math.exp(-Math.pow((v - .5) * 9, 2));
        const striations = Math.sin(v * 94 + Math.sin(u * 9) * .25);
        variation = .91 + rib * .045 + striations * .027 + noise * .009;
      }
      const i = (y * width + x) * 4;
      if (bump) pixels[i] = pixels[i + 1] = pixels[i + 2] = 120 + noise * 34;
      else {
        pixels[i] = THREE.MathUtils.clamp(base.r * variation * 255, 0, 255);
        pixels[i + 1] = THREE.MathUtils.clamp(base.g * variation * 255, 0, 255);
        pixels[i + 2] = THREE.MathUtils.clamp(base.b * variation * 255, 0, 255);
      }
      pixels[i + 3] = 255;
    }
    const out = new THREE.DataTexture(pixels, width, height);
    if (!bump) out.colorSpace = THREE.SRGBColorSpace;
    out.wrapS = out.wrapT = THREE.RepeatWrapping;
    out.magFilter = THREE.LinearFilter; out.minFilter = THREE.LinearMipmapLinearFilter;
    out.generateMipmaps = true; out.needsUpdate = true; return out;
  });
}

function eyes(root, key, positions, radius = .015) {
  const shape = shared(root, `eyes/${key}`, () => {
    const parts = [];
    for (const center of positions) {
      const sphere = new THREE.SphereGeometry(radius, 10, 7);
      sphere.translate(center.x, center.y, center.z); parts.push(sphere);
    }
    return merged(parts);
  });
  return addMesh(root, shape, mat(root, 'eyes', { color: '#111c18', roughness: .2 }));
}

function createUrchin(root) {
  const shell = shared(root, 'urchin/test', () => {
    const out = new THREE.SphereGeometry(1, 28, 18);
    out.scale(.286, .252, .286); out.translate(0, .282, 0); return out;
  });
  addMesh(root, shell, mat(root, 'urchin/test', { color: '#514253', roughness: .95 }));
  const spineGeo = shared(root, 'urchin/spine', () => {
    const out = new THREE.CylinderGeometry(.001, .0075, 1, 5, 1);
    out.translate(0, .5, 0); return out;
  });
  const count = 260, spines = new THREE.InstancedMesh(spineGeo,
    mat(root, 'urchin/spine', { color: '#665272', roughness: .82 }), count);
  spines.castShadow = true; root.add(spines);
  const records = [];
  for (let i = 0; i < count; i++) {
    const y = .985 - i / (count - 1) * 1.92, r = Math.sqrt(1 - y * y), a = i * 2.399963;
    const normal = vec(Math.cos(a) * r, y, Math.sin(a) * r);
    const start = vec(normal.x * .286, .282 + normal.y * .252, normal.z * .286);
    records.push({ normal, start, length: .152 + (.5 + .5 * Math.sin(i * 13.7)) * .052 });
    spines.setColorAt(i, new THREE.Color(i % 5 === 0 ? '#79647b' : '#594664'));
  }
  spines.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const feet = shared(root, 'urchin/tube-feet', () => {
    const parts = [];
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * TAU;
      parts.push(tube([vec(Math.cos(a) * .17, .078, Math.sin(a) * .17),
        vec(Math.cos(a) * .20, .030, Math.sin(a) * .20),
        vec(Math.cos(a) * .23, .008, Math.sin(a) * .23)], [.0055, .0045, .003], 5));
    }
    return merged(parts);
  });
  addMesh(root, feet, mat(root, 'urchin/tube-feet', { color: '#85798a', roughness: .87 }));
  root.userData.motion = { type: 'urchin', spines, records, matrix: new THREE.Matrix4() };
}

function createBatStar(root) {
  const shape = shared(root, 'bat-star/body', () => {
    const p = [], idx = [], uv = [], colors = [], rows = 20, sides = 100;
    const red = new THREE.Color('#ab6652'), purple = new THREE.Color('#755a65');
    for (let row = 0; row <= rows; row++) for (let i = 0; i <= sides; i++) {
      const a = i / sides * TAU, t = row / rows;
      const edge = .405 + .093 * Math.cos(a * 5);
      const x = Math.cos(a) * edge * t, z = Math.sin(a) * edge * t;
      p.push(x, .015 + .112 * Math.pow(1 - t * t, .8) + .002 * Math.sin(x * 155 + z * 131), z);
      uv.push(x + .5, z + .5);
      const blend = (.5 + .5 * Math.sin(x * 27 + Math.sin(z * 33))) * .43;
      colors.push(THREE.MathUtils.lerp(red.r, purple.r, blend), THREE.MathUtils.lerp(red.g, purple.g, blend), THREE.MathUtils.lerp(red.b, purple.b, blend));
      if (row < rows && i < sides) { const b = row * (sides + 1) + i; idx.push(b, b + 1, b + sides + 1, b + 1, b + sides + 2, b + sides + 1); }
    }
    return geo(p, idx, uv, colors);
  });
  addMesh(root, shape, mat(root, 'bat-star/body', { color: '#ffffff', vertexColors: true, roughness: .95, side: THREE.DoubleSide }));
}

function kelpfishBody() {
  const p = [], uv = [], idx = [], rows = 60, sides = 24;
  for (let row = 0; row <= rows; row++) {
    const t = row / rows, x = -.38 + t * .855;
    const shoulder = Math.pow(Math.sin(t * Math.PI), .73);
    const h = .012 + shoulder * .075, width = .004 + shoulder * .025;
    const head = t > .88 ? THREE.MathUtils.lerp(1, .17, (t - .88) / .12) : 1;
    for (let j = 0; j <= sides; j++) {
      const a = j / sides * TAU;
      p.push(x, Math.sin(a) * h * head, Math.cos(a) * width * head); uv.push(t, j / sides);
      if (row < rows && j < sides) { const b = row * (sides + 1) + j; idx.push(b, b + sides + 1, b + 1, b + 1, b + sides + 1, b + sides + 2); }
    }
  }
  return geo(p, idx, uv);
}
function finStrip(top, bottom) {
  const p = [], idx = [], uv = [];
  for (let i = 0; i < top.length; i++) {
    p.push(...top[i].toArray(), ...bottom[i].toArray()); uv.push(i / (top.length - 1), 1, i / (top.length - 1), 0);
    if (i < top.length - 1) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  return geo(p, idx, uv);
}
function createKelpfish(root) {
  const anatomy = new THREE.Group(); root.add(anatomy);
  const map = texture(root, 'fish');
  addMesh(root, shared(root, 'kelpfish/body', kelpfishBody), mat(root, 'kelpfish/body', { map, roughness: .67, metalness: .04 }), anatomy);
  const finMat = mat(root, 'kelpfish/fins', { color: '#83894f', roughness: .75, side: THREE.DoubleSide, transparent: true, opacity: .86, depthWrite: false });
  const finGeo = shared(root, 'kelpfish/continuous-fins', () => {
    const parts = [];
    for (const sign of [-1, 1]) {
      const upper = [], lower = [];
      for (let i = 0; i <= 30; i++) {
        const t = i / 30, x = -.35 + t * .65;
        const bodyT = (x + .38) / .855;
        const profile = .012 + .075 * Math.pow(Math.sin(bodyT * Math.PI), .73);
        const edge = .010 + .030 * Math.pow(Math.sin(t * Math.PI), .5) + Math.sin(t * 29) * .002;
        lower.push(vec(x, sign * profile * (sign < 0 ? .75 : 1), 0));
        upper.push(vec(x, sign * (profile + edge) * (sign < 0 ? .70 : 1), 0));
      }
      parts.push(finStrip(upper, lower));
    }
    return merged(parts);
  });
  addMesh(root, finGeo, finMat, anatomy);
  const tail = new THREE.Group(); tail.position.x = -.373; anatomy.add(tail);
  const tailGeo = shared(root, 'kelpfish/tail', () => {
    const top = [], bottom = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16, x = -.13 * t;
      const h = .012 + Math.sin(t * Math.PI / 2) * .067;
      top.push(vec(x, h, 0)); bottom.push(vec(x, -h, 0));
    }
    return finStrip(top, bottom);
  });
  addMesh(root, tailGeo, finMat, tail);
  const eyeGeo = shared(root, 'kelpfish/eyes', () => {
    const parts = [];
    for (const side of [-1, 1]) {
      const out = new THREE.SphereGeometry(.012, 12, 8);
      out.scale(1, 1, .5); out.translate(.368, .028, side * .022); parts.push(out);
    }
    return merged(parts);
  });
  addMesh(root, eyeGeo, mat(root, 'kelpfish/eye', { color: '#1e291c', roughness: .23 }), anatomy);
  const pectoralGeo = shared(root, 'kelpfish/pectoral', () => merged([-1, 1].map(side => {
    const upper = [vec(.205, .003, side * .025), vec(.145, -.012, side * .066), vec(.075, -.036, side * .088)];
    const lower = [vec(.205, -.012, side * .025), vec(.125, -.041, side * .055), vec(.075, -.036, side * .088)];
    return finStrip(upper, lower);
  })));
  addMesh(root, pectoralGeo, finMat, anatomy);
  root.userData.motion = { type: 'fish', anatomy, tail };
}

function createSnail(root) {
  const shell = shared(root, 'tegula/shell', () => {
    const p = [], uv = [], idx = [], rows = 210, sides = 16;
    for (let row = 0; row <= rows; row++) {
      const t = row / rows, a = t * 3 * TAU;
      const radius = .007 + t * t * .286, thick = .008 + t * t * .115;
      for (let side = 0; side <= sides; side++) {
        const theta = side / sides * TAU;
        const ridged = 1 + Math.sin(a * 17 + theta * 3) * .022;
        const r = radius + Math.cos(theta) * thick * ridged;
        p.push(Math.cos(a) * r, .12 + (1 - t) * .31 + Math.sin(theta) * thick * ridged, Math.sin(a) * r);
        uv.push(t * 3, side / sides);
        if (row < rows && side < sides) { const b = row * (sides + 1) + side; idx.push(b, b + sides + 1, b + 1, b + 1, b + sides + 1, b + sides + 2); }
      }
    }
    return geo(p, idx, uv);
  });
  const shellMesh = addMesh(root, shell, mat(root, 'tegula/shell', { map: texture(root, 'snail'), bumpMap: texture(root, 'snail', true), bumpScale: .002, roughness: .87, side: THREE.DoubleSide }));
  root.userData.sizeReference = shellMesh;
  const foot = shared(root, 'tegula/foot', () => {
    const shape = new THREE.SphereGeometry(1, 20, 12);
    shape.scale(.455, .055, .215); shape.translate(.025, .056, 0); return shape;
  });
  addMesh(root, foot, mat(root, 'tegula/foot', { color: '#464c3c', roughness: .84 }));
  const tentacles = shared(root, 'tegula/tentacles', () => merged([-1, 1].map(side =>
    tube([vec(.36, .077, side * .05), vec(.435, .119, side * .12), vec(.49, .156, side * .14)], [.014, .007, .0015], 6))));
  addMesh(root, tentacles, mat(root, 'tegula/tentacles', { color: '#77765b', roughness: .86 }));
}

function createChiton(root) {
  const mantle = shared(root, 'cryptochiton/mantle', () => {
    const p = [], idx = [], uv = [], rows = 22, sides = 72;
    for (let row = 0; row <= rows; row++) for (let side = 0; side <= sides; side++) {
      const r = row / rows, a = side / sides * TAU;
      const x = Math.cos(a) * .5 * r, z = Math.sin(a) * .245 * r;
      const swell = .119 * Math.pow(1 - r * r, .58);
      const coveredPlates = Math.sin((x + .5) * Math.PI * 8) * .003 * (1 - r);
      const grain = Math.sin(x * 168 + z * 91) * Math.sin(z * 173 - x * 31) * .0018;
      p.push(x, .021 + swell + coveredPlates + grain, z); uv.push(x + .5, z * 2 + .5);
      if (row < rows && side < sides) { const b = row * (sides + 1) + side; idx.push(b, b + 1, b + sides + 1, b + 1, b + sides + 2, b + sides + 1); }
    }
    return geo(p, idx, uv);
  });
  addMesh(root, mantle, mat(root, 'cryptochiton/leathery-mantle', { map: texture(root, 'chiton'), bumpMap: texture(root, 'chiton', true), bumpScale: .003, roughness: .98, side: THREE.DoubleSide }));
  const foot = shared(root, 'cryptochiton/foot', () => {
    const shape = new THREE.SphereGeometry(1, 24, 10);
    shape.scale(.43, .025, .194); shape.translate(0, .023, 0); return shape;
  });
  addMesh(root, foot, mat(root, 'cryptochiton/foot', { color: '#897557', roughness: .95 }));
}

function point(value) {
  if (value?.isVector3) return value;
  if (value?.position) return point(value.position);
  if (Array.isArray(value)) return vec(...value);
  return vec(value?.x ?? 0, value?.y ?? 0, value?.z ?? 0);
}

// Kelp geometry is filled through the exact habitat curves used by leaf-bound
// animals. No independent sine wave can let a snail drift off its rendered leaf.
function createKelp(root, anchor) {
  root.userData.anchor = anchor;
  root.userData.representation = KELP_MORPHOLOGY;
  const fronds = KELP_FROND_COUNT, leaves = KELP_LEAF_COUNT, leafRows = 10, stemRows = 48, stemSides = 7;
  const p = [], idx = [], uv = [];
  for (let frond = 0; frond < fronds; frond++) for (let ring = 0; ring <= stemRows; ring++) for (let side = 0; side <= stemSides; side++) {
    p.push(0, 0, 0); uv.push(side / stemSides, ring / stemRows);
    if (ring < stemRows && side < stemSides) { const a = frond * (stemRows + 1) * (stemSides + 1) + ring * (stemSides + 1) + side, b = a + stemSides + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  }
  const stemGeo = owned(root, geo(p, idx, uv));
  stemGeo.attributes.position.setUsage(THREE.DynamicDrawUsage);
  const stem = addMesh(root, stemGeo, mat(root, 'kelp/stipe', { color: '#6d6740', roughness: .89 }));
  const positions = [], normals = [], indices = [], uvs = [];
  for (let leaf = 0; leaf < leaves * fronds; leaf++) for (let row = 0; row <= leafRows; row++) {
    positions.push(0, 0, 0, 0, 0, 0); normals.push(0, 1, 0, 0, 1, 0);
    uvs.push(row / leafRows, 0, row / leafRows, 1);
    if (row < leafRows) { const a = leaf * (leafRows + 1) * 2 + row * 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const leafGeo = owned(root, geo(positions, indices, uvs));
  leafGeo.attributes.position.setUsage(THREE.DynamicDrawUsage);
  leafGeo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  const blades = addMesh(root, leafGeo, kelpBladeMaterial(root));
  const bulbGeo = shared(root, 'kelp/pneumatocyst', () => {
    const shape = new THREE.SphereGeometry(1, 10, 7), positions = shape.attributes.position;
    for (let index = 0; index < positions.count; index++) {
      const y = positions.getY(index), taper = .74 + .26 * (y + 1) / 2;
      positions.setXYZ(index, positions.getX(index) * taper, y, positions.getZ(index) * taper);
    }
    shape.computeVertexNormals(); return shape;
  });
  const bulbs = new THREE.InstancedMesh(bulbGeo, mat(root, 'kelp/pneumatocyst', { color: '#81774c', roughness: .75 }), leaves * fronds);
  bulbs.instanceMatrix.setUsage(THREE.DynamicDrawUsage); bulbs.castShadow = true; root.add(bulbs);
  const holdfastGeo = shared(root, 'kelp/holdfast', () => {
    const parts = [];
    for (let i = 0; i < 35; i++) {
      const a = i * 2.39996, reach = .13 + (i % 7) * .018;
      parts.push(tube([vec(0, .05, 0), vec(Math.cos(a) * reach * .43, .024, Math.sin(a) * reach * .43),
        vec(Math.cos(a) * reach, .003, Math.sin(a) * reach)], [.013, .009, .0025], 6));
    }
    return merged(parts);
  });
  addMesh(root, holdfastGeo, mat(root, 'kelp/holdfast', { color: '#685942', roughness: .95 }));
  // Conservative bounds keep dynamic vertices visible at every sway position.
  stem.frustumCulled = blades.frustumCulled = bulbs.frustumCulled = false;
  root.userData.motion = { type: 'kelp', stem, blades, bulbs, fronds, leaves, leafRows, stemRows, stemSides, matrix: new THREE.Matrix4(),
    vectors: Array.from({length: 9}, () => vec()), leafCenters: Array.from({length: leafRows + 1}, () => vec()),
    sheetFrame: { position: {}, tangent: {}, across: {}, normal: {} }, quaternion: new THREE.Quaternion() };
}

export function createKelpOrganism(species, { anchor } = {}) {
  if (species.kind === 'kelp' && !anchor) throw new Error('Giant kelp requires its habitat anchor in metres.');
  const root = new THREE.Group();
  root.name = species.commonName ?? species.id;
  root.userData.speciesId = species.id;
  root.userData.kind = species.kind;
  root.userData.sources = species.sourceLinks?.map(source => ({ ...source })) ?? [];
  root.userData.morphologyStatus = 'source-grounded-procedural-proxy';
  root.userData.shared = new Set(); root.userData.owned = [];
  root.userData.phase = instanceSerial++ * 2.39996;
  const builders = { kelp: () => createKelp(root, anchor), urchin: () => createUrchin(root),
    star: () => createBatStar(root), fish: () => createKelpfish(root), snail: () => createSnail(root), chiton: () => createChiton(root) };
  if (!builders[species.kind]) throw new Error(`Unsupported kelp organism: ${species.id}`);
  builders[species.kind]();
  animateKelpOrganism(root, 0, {}, anchor);
  if (species.kind !== 'kelp') {
    const bounds = new THREE.Box3().setFromObject(root.userData.sizeReference ?? root);
    const size = bounds.getSize(vec());
    const measure = species.kind === 'fish' || species.kind === 'chiton' ? size.x : Math.max(size.x, size.z);
    const anatomy = new THREE.Group();
    [...root.children].forEach(child => anatomy.add(child));
    anatomy.scale.setScalar(1 / measure); root.add(anatomy);
    root.userData.normalization = 1 / measure;
    delete root.userData.sizeReference;
  }
  return root;
}

export function animateKelpOrganism(root, timeSec, environment = {}, anchorOverride) {
  const motion = root.userData.motion;
  if (!motion) return;
  if (motion.type === 'fish') {
    const phase = timeSec * 5 + root.userData.phase;
    motion.tail.rotation.y = Math.sin(phase) * .14;
    motion.anatomy.rotation.y = Math.sin(phase - .5) * .013;
  } else if (motion.type === 'urchin') {
    const up = vec(0, 1, 0), quaternion = new THREE.Quaternion();
    motion.records.forEach((record, i) => {
      const normal = record.normal.clone();
      normal.x += Math.sin(timeSec * .48 + i * .7) * .022;
      normal.z += Math.cos(timeSec * .39 + i * 1.2) * .022; normal.normalize();
      quaternion.setFromUnitVectors(up, normal);
      motion.matrix.compose(record.start, quaternion, vec(1, record.length, 1));
      motion.spines.setMatrixAt(i, motion.matrix);
    });
    motion.spines.instanceMatrix.needsUpdate = true;
    if (!motion.spines.boundingSphere) motion.spines.computeBoundingSphere();
  } else if (motion.type === 'kelp') {
    const anchor = anchorOverride ?? root.userData.anchor;
    if (!anchor) return;
    const flow = environment.deformationCurrentMps ?? environment.currentMps ?? .18;
    const targetFlow = environment.currentMps ?? .18;
    const previous = motion.lastGeometry;
    if (previous && previous.timeSec === timeSec && previous.lengthM === anchor.lengthM && previous.flow === flow && previous.targetFlow === targetFlow
      && previous.x === anchor.x && previous.y === anchor.y && previous.z === anchor.z && previous.phase === anchor.phase
      && previous.stipeRadiusM === anchor.stipeRadiusM && previous.leafWidthM === anchor.leafWidthM) return;
    motion.lastGeometry = { timeSec, lengthM: anchor.lengthM, flow, targetFlow, x: anchor.x, y: anchor.y, z: anchor.z,
      phase: anchor.phase, stipeRadiusM: anchor.stipeRadiusM, leafWidthM: anchor.leafWidthM };
    const [base, center, before, after, tangent, across, other, normal, position] = motion.vectors;
    const copy = (target, p) => target.set(p.x, p.y, p.z);
    copy(base, kelpStipePosition(anchor, 0, timeSec, environment));
    root.position.copy(base);
    const positions = motion.stem.geometry.attributes.position;
    for (let frond = 0; frond < motion.fronds; frond++) {
      across.set(1, 0, 0);
      for (let ring = 0; ring <= motion.stemRows; ring++) {
      const t = ring / motion.stemRows;
      copy(center, kelpStipePosition(anchor, t, timeSec, environment, frond));
      copy(before, kelpStipePosition(anchor, Math.max(0, t - .012), timeSec, environment, frond));
      copy(after, kelpStipePosition(anchor, Math.min(1, t + .012), timeSec, environment, frond));
      tangent.copy(after).sub(before).normalize();
      across.addScaledVector(tangent, -across.dot(tangent)).normalize();
      other.crossVectors(tangent, across).normalize();
      const radius = (anchor.stipeRadiusM ?? KELP_STIPE_RADIUS_M) * (1 - t * .34);
      for (let side = 0; side <= motion.stemSides; side++) {
        const a = side / motion.stemSides * TAU;
        position.copy(center).sub(base).addScaledVector(across, Math.cos(a) * radius).addScaledVector(other, Math.sin(a) * radius);
        positions.setXYZ(frond * (motion.stemRows + 1) * (motion.stemSides + 1) + ring * (motion.stemSides + 1) + side, position.x, position.y, position.z);
      }
      }
    }
    positions.needsUpdate = true; motion.stem.geometry.computeVertexNormals();
    const leafPositions = motion.blades.geometry.attributes.position, leafNormals = motion.blades.geometry.attributes.normal;
    for (let frond = 0; frond < motion.fronds; frond++) for (let leaf = 0; leaf < motion.leaves; leaf++) {
      const blade = frond * motion.leaves + leaf;
      for (let row = 0; row <= motion.leafRows; row++) {
        const t = row / motion.leafRows;
        // The exact analytic sheet frame is also the attached snail's support
        // normal. There is no independent renderer twist or animation clock.
        const frame = kelpLeafFrame(anchor, leaf, t, timeSec, environment, frond, motion.sheetFrame);
        copy(center, frame.position); motion.leafCenters[row].copy(center);
        copy(across, frame.across); copy(normal, frame.normal);
        const width = (anchor.leafWidthM ?? kelpLeafWidth(leaf)) * Math.pow(Math.sin(t * Math.PI), .62) * (.95 + Math.sin(t * 30 + leaf) * .04);
        for (const side of [-1, 1]) {
          position.copy(center).sub(base).addScaledVector(across, side * width * .5);
          const i = blade * (motion.leafRows + 1) * 2 + row * 2 + (side + 1) / 2;
          leafPositions.setXYZ(i, position.x, position.y, position.z); leafNormals.setXYZ(i, normal.x, normal.y, normal.z);
        }
      }
      const dimensions = kelpPneumatocystDimensions(leaf);
      tangent.copy(motion.leafCenters[1]).sub(motion.leafCenters[0]).normalize();
      position.copy(motion.leafCenters[0]).sub(base).addScaledVector(tangent, dimensions.lengthM / 2);
      motion.quaternion.setFromUnitVectors(before.set(0, 1, 0), tangent);
      other.set(dimensions.widthM / 2, dimensions.lengthM / 2, dimensions.widthM / 2);
      motion.matrix.compose(position, motion.quaternion, other); motion.bulbs.setMatrixAt(blade, motion.matrix);
    }
    leafPositions.needsUpdate = leafNormals.needsUpdate = true; motion.bulbs.instanceMatrix.needsUpdate = true;
    motion.stem.geometry.computeBoundingSphere(); motion.blades.geometry.computeBoundingSphere();
    motion.bulbs.computeBoundingSphere();
  }
}

export function disposeKelpOrganism(root) {
  if (!root?.userData.shared) return;
  root.traverse(item => { if (item.isInstancedMesh) item.dispose(); });
  for (const key of root.userData.shared) {
    const entry = cache.get(key);
    if (entry && --entry.count <= 0) { entry.value.dispose?.(); cache.delete(key); }
  }
  for (const item of root.userData.owned) item.dispose?.();
  root.userData.shared.clear(); root.userData.owned.length = 0;
  root.removeFromParent(); root.clear();
}
