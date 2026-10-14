import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Stage 06: independent educational choreography, with no saved ecology.
// Original project-authored animal surfaces; no scan or third-party mesh is
// copied. Dimensions are metres. See assets/ocean-primer/animals/provenance.json.
export const OCEAN_PRIMER_PELAGIC_SECONDS = 80;
export const OCEAN_PRIMER_PELAGIC_SPECIES = Object.freeze([
  { id: 'humpback-whale', latin: 'Megaptera novaeangliae', lengthM: 13.8, count: 1 },
  { id: 'bottlenose-dolphin', latin: 'Tursiops truncatus', lengthM: 2.65, count: 6 },
]);
const TAU = Math.PI * 2, clamp = THREE.MathUtils.clamp;
const smooth = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);
const mix = THREE.MathUtils.lerp;
const colours = new Map();
const colour = hex => { if (!colours.has(hex)) colours.set(hex, new THREE.Color(hex)); return colours.get(hex); };
const vec = a => new THREE.Vector3(...a);
const point = v => ({ x: v.x, y: v.y, z: v.z });

function paint(g, skin, role = 0) {
  const p = g.attributes.position, rgb = new Float32Array(p.count * 3), roles = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    rgb.set(skin(p.getX(i), p.getY(i), p.getZ(i)).toArray(), i * 3); roles[i] = role;
  }
  g.setAttribute('color', new THREE.BufferAttribute(rgb, 3));
  g.setAttribute('cetaceanRole', new THREE.BufferAttribute(roles, 1));
  g.deleteAttribute('uv'); return g;
}

function skin(kind, x, y, z) {
  const whale = kind === 'whale';
  const upper = smooth(-.035, .035, y);
  const c = colour(whale ? '#c7c6b4' : '#bac5c3').clone()
    .lerp(colour(whale ? '#343e40' : '#647a80'), upper)
    .lerp(colour(whale ? '#202b31' : '#425f6a'), smooth(.035, .095, y) * .8);
  // Subtle irregular pigment is authored colour, not photographed skin.
  const mottling = Math.sin(x * 81 + Math.sin(z * 63)) * Math.sin(z * 119 + y * 74);
  c.multiplyScalar(1 + mottling * (whale ? .060 : .028));
  if (whale) {
    const white = (1 - smooth(-.055, .004, y)) * smooth(-.26, .12, x);
    c.lerp(colour('#d4d4c4'), white * .56);
    const pleat = Math.pow(.5 + .5 * Math.sin(Math.atan2(z, -y) * 76), 12);
    c.multiplyScalar(1 - pleat * .12 * white);
  }
  return c;
}

// A single closed radial body connects the broad head, trunk and peduncle.
// The dolphin's beak is part of the body profile rather than a separate cone.
function body(kind) {
  const whale = kind === 'whale';
  const stations = whale ? [
    [-.50, .001, .001, -.015], [-.44, .009, .017, -.010], [-.36, .021, .027, -.005],
    [-.24, .054, .049, .000], [-.10, .085, .069, .005], [.07, .098, .077, .004],
    [.23, .088, .081, -.002], [.35, .066, .075, -.013], [.44, .043, .059, -.020],
    [.49, .017, .024, -.025], [.50, .001, .001, -.025],
  ] : [
    [-.50, .001, .001, -.008], [-.43, .008, .012, -.005], [-.34, .020, .026, -.001],
    [-.23, .047, .045, .001], [-.08, .076, .064, .004], [.09, .087, .068, .006],
    [.23, .075, .061, .004], [.30, .061, .049, .003], [.35, .035, .033, -.010],
    [.37, .020, .024, -.019], [.45, .015, .019, -.022], [.49, .010, .012, -.022],
    [.50, .001, .001, -.022],
  ];
  const rows = whale ? 168 : 78, sectors = whale ? 64 : 40;
  const positions = [], indices = [];
  const sample = x => {
    let k = 0; while (k < stations.length - 2 && x > stations[k + 1][0]) k++;
    const a = stations[k], b = stations[k + 1], u = smooth(a[0], b[0], x);
    return [mix(a[1], b[1], u), mix(a[2], b[2], u), mix(a[3], b[3], u)];
  };
  for (let i = 0; i <= rows; i++) {
    const x = -.5 + i / rows, [ry, rz, cy] = sample(x);
    for (let j = 0; j <= sectors; j++) {
      const a = j / sectors * TAU, bottom = Math.max(0, -Math.sin(a));
      const pleat = whale ? .0012 * Math.cos(a * 38) * bottom ** 7 * smooth(-.15, .08, x) * (1 - smooth(.36, .48, x)) : 0;
      positions.push(x, cy + Math.sin(a) * (ry + pleat), Math.cos(a) * (rz + pleat));
      if (i < rows && j < sectors) {
        const k = i * (sectors + 1) + j, n = k + sectors + 1;
        indices.push(k, n, k + 1, k + 1, n, n + 1);
      }
    }
  }
  // Small caps complete the closed silhouette at both ends.
  for (const [i, reverse] of [[0, false], [rows, true]]) {
    const offset = positions.length / 3, x = -.5 + i / rows, [, , cy] = sample(x);
    positions.push(x, cy, 0);
    for (let j = 0; j < sectors; j++) {
      const k = i * (sectors + 1) + j;
      indices.push(...(reverse ? [offset, k + 1, k] : [offset, k, k + 1]));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setIndex(indices); g.computeVertexNormals();
  return paint(g, (x, y, z) => skin(kind, x, y, z));
}

// Closed, gently convex fin surfaces have smooth edges and real thickness.
function fin(outline, thickness, skinFn, role, divisions = 72) {
  const edge = new THREE.CatmullRomCurve3(outline.map(vec), true, 'centripetal').getPoints(divisions).slice(0, -1);
  const center = edge.reduce((sum, p) => sum.add(p), new THREE.Vector3()).multiplyScalar(1 / edge.length);
  const normal = new THREE.Vector3().crossVectors(vec(outline[1]).sub(vec(outline[0])), vec(outline[2]).sub(vec(outline[0]))).normalize();
  const positions = [], indices = [], rings = 8, count = edge.length;
  for (const side of [1, -1]) {
    const start = positions.length / 3, p = center.clone().addScaledVector(normal, thickness * side); positions.push(...p.toArray());
    for (let r = 1; r <= rings; r++) {
      const u = r / rings;
      for (const e of edge) positions.push(...center.clone().lerp(e, u).addScaledVector(normal, side * thickness * (1 - u * u)).toArray());
      for (let j = 0; j < count; j++) {
        const a = start + 1 + (r - 1) * count + j, b = start + 1 + (r - 1) * count + (j + 1) % count;
        const tris = r === 1 ? [start, a, b] : [a - count, a, b - count, b - count, a, b];
        if (side < 0) for (let k = 0; k < tris.length; k += 3) [tris[k + 1], tris[k + 2]] = [tris[k + 2], tris[k + 1]];
        indices.push(...tris);
      }
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setIndex(indices); g.computeVertexNormals();
  return paint(g, skinFn, role);
}

function ellipse(center, size, colourFn, role = 0, segments = 14, rows = 10) {
  const g = new THREE.SphereGeometry(1, segments, rows); g.scale(...size); g.translate(...center);
  return paint(g, colourFn, role);
}

function animalGeometry(kind) {
  const whale = kind === 'whale', parts = [body(kind)], skinFn = (x, y, z) => skin(kind, x, y, z);
  const finSkin = (x, y, z) => whale && Math.abs(z) > .09 ? colour(y < -.04 ? '#cfd4cc' : '#808e8c').clone().lerp(skinFn(x, y, z), .24) : skinFn(x, y, z);
  for (const side of [-1, 1]) {
    const outline = whale ? [
      [.23, -.022, side * .060], [.20, -.041, side * .119], [.11, -.063, side * .244],
      [.025, -.074, side * .338], [-.025, -.079, side * .361], [-.047, -.068, side * .333],
      [.005, -.044, side * .194], [.095, -.022, side * .071],
    ] : [
      [.20, -.027, side * .052], [.14, -.048, side * .121], [.04, -.061, side * .184],
      [-.035, -.061, side * .188], [.015, -.039, side * .126], [.085, -.025, side * .049],
    ];
    parts.push(fin(outline, whale ? .007 : .005, finSkin, 1, whale ? 90 : 48));
    // Lateral eyes remain small and recessed, with no white toy-eye spheres.
    const eye = whale ? [.346, .005, side * .071] : [.296, .015, side * .045];
    parts.push(ellipse(eye, whale ? [.0039, .0033, .0015] : [.0040, .0034, .0018], () => colour('#11242a').clone()));
    const mouthPoints = whale ? [[.20, -.028, side * .077], [.34, -.031, side * .072], [.44, -.031, side * .056], [.498, -.026, side * .009]]
      : [[.30, -.031, side * .037], [.365, -.032, side * .024], [.45, -.029, side * .018], [.496, -.024, side * .006]];
    const line = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(mouthPoints.map(vec)), whale ? 52 : 30, whale ? .0008 : .0010, 5, false);
    parts.push(paint(line, () => colour('#293b3e').clone()));
  }
  // A small rear dorsal hump contrasts with the dolphin's tall swept fin.
  const dorsal = whale ? [[-.18, .069, 0], [-.205, .106, 0], [-.255, .109, 0], [-.302, .048, 0], [-.25, .046, 0]]
    : [[.010, .085, 0], [-.035, .204, 0], [-.083, .209, 0], [-.097, .137, 0], [-.160, .064, 0], [-.080, .076, 0]];
  parts.push(fin(dorsal, whale ? .005 : .004, skinFn, 0, whale ? 56 : 44));
  const span = whale ? .175 : .167;
  const fluke = [[-.417, -.012, 0], [-.426, -.014, -span * .6], [-.445, -.018, -span], [-.478, -.015, -span * .82],
    [-.495, -.011, -span * .36], [-.474, -.010, 0], [-.495, -.011, span * .36], [-.478, -.015, span * .82],
    [-.445, -.018, span], [-.426, -.014, span * .6]];
  parts.push(fin(fluke, whale ? .0048 : .0037, skinFn, 2, whale ? 116 : 64));
  if (whale) {
    // Head tubercles are low skin bumps integrated into the visible profile.
    for (const [x, z] of [[.29, 0], [.345, 0], [.395, 0], [.43, 0], [.30, -.052], [.30, .052], [.38, -.046], [.38, .046], [.446, -.032], [.446, .032]]) {
      const y = x < .34 ? .073 : x < .41 ? .045 : .023;
      parts.push(ellipse([x, y, z], [.009, .005, .008], skinFn));
    }
    // Paired humpback blowholes sit above the front head.
    for (const z of [-.009, .009]) parts.push(ellipse([.275, .084, z], [.009, .0012, .004], () => colour('#1b2b30').clone()));
  } else {
    parts.push(ellipse([.225, .077, 0], [.012, .0014, .008], () => colour('#334c54').clone()));
  }
  const g = mergeGeometries(parts); parts.forEach(p => p.dispose());
  g.computeBoundingBox(); g.computeBoundingSphere();
  g.userData = { source: 'project-authored', calibrated: false, sizeMeasure: 'total-length', species: whale ? 'Megaptera novaeangliae' : 'Tursiops truncatus' };
  return g;
}

function animalMaterial(kind, clock, phase) {
  const whale = kind === 'whale', material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .56, metalness: 0, side: THREE.DoubleSide });
  material.onBeforeCompile = shader => {
    shader.uniforms.primerTime = clock; shader.uniforms.primerPhase = phase;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
attribute float cetaceanRole; uniform float primerTime; uniform float primerPhase;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
float tail=clamp((.02-position.x)/.47,0.0,1.0);
float wave=sin(primerTime*${whale ? '2.2' : '5.1'}+primerPhase+position.x*3.1);
transformed.y+=tail*tail*${whale ? '.031' : '.038'}*wave;
if(cetaceanRole>.5&&cetaceanRole<1.5)transformed.y+=pow(clamp(abs(position.z)/${whale ? '.36' : '.19'},0.0,1.0),1.5)*${whale ? '.018' : '.010'}*sin(primerTime*${whale ? '1.3' : '2.4'}+primerPhase);`);
  };
  material.customProgramCacheKey = () => `ocean-primer-${kind}-motion-v1`;
  material.userData = { authoredSkin: true, photographs: false, displayMotion: true };
  return material;
}

function seeded(seed) {
  let s = seed >>> 0;
  return () => { s += 0x6D2B79F5; let n = s; n = Math.imul(n ^ n >>> 15, n | 1); n ^= n + Math.imul(n ^ n >>> 7, n | 61); return ((n ^ n >>> 14) >>> 0) / 4294967296; };
}

export function oceanPrimerWhalePose(t) {
  t = clamp(t, 0, 80);
  const rise = smooth(2, 16, t), dive = smooth(22, 35, t), depth = mix(-9.6, -.72, rise) - dive * 8.3;
  const pitch = (smooth(3, 8, t) * (1 - smooth(11, 16, t)) * .11) - smooth(23, 27, t) * (1 - smooth(32, 37, t)) * .14;
  return { position: { x: -7 + t * .26, y: depth, z: -8 - t * .035 }, pitch, heading: -.07, breathing: t >= 17.5 && t <= 20.5 };
}

const podOffsets = [[0, 0, 0], [-2.8, -.6, -2.9], [-4.9, .1, 1.9], [-6.6, -1.1, -4.2], [-8.3, -.4, -.2], [-9.5, -1.4, 3.5]];
export function oceanPrimerDolphinPoses(t) {
  t = clamp(t, 0, 80);
  return podOffsets.map(([x, y, z], i) => ({ position: { x: -12 + t * .40 + x, y: -4.6 + y + Math.sin(t * .32 + i * 1.4) * .16, z: 3.6 + z + Math.sin(t * .035) * 1.2 }, heading: .08 + Math.cos(t * .035) * .04, pitch: Math.cos(t * .32 + i * 1.4) * .024 }));
}

export function createOceanPrimerPelagic(scene, { seed = 55 } = {}) {
  if (!scene?.isScene) throw new TypeError('OceanPrimerPelagic needs an independent THREE.Scene');
  const root = new THREE.Group(); root.name = 'Ocean primer / Caribbean representative cetaceans'; scene.add(root);
  const resources = new Set(), own = r => { resources.add(r); return r; }, clock = { value: 0 };
  let disposed = false, time = 0;
  root.userData = { educationalChoreography: true, noEcologyStorage: true, region: 'Caribbean', note: '加勒比海代表性观察场景，动物活动为科普编排；原创外形模型，非扫描。' };
  const sky = new THREE.HemisphereLight('#cbecef', '#1b5365', 1.6); root.add(sky);
  const sun = new THREE.DirectionalLight('#fff6e3', 2.5); sun.position.set(-25, 45, 30); root.add(sun);
  const fill = new THREE.DirectionalLight('#86c1d2', .55); fill.position.set(25, -2, -25); root.add(fill);
  const water = own(new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false,
    uniforms: { upper: { value: colour('#6cabbc').clone() }, lower: { value: colour('#0d3f60').clone() } },
    vertexShader: 'varying vec3 direction;void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'uniform vec3 upper;uniform vec3 lower;varying vec3 direction;void main(){float h=smoothstep(-.2,.9,normalize(direction).y);gl_FragColor=vec4(mix(lower,upper,h),1.);\n#include <colorspace_fragment>\n}' }));
  const dome = new THREE.Mesh(own(new THREE.SphereGeometry(240, 32, 18)), water); dome.renderOrder = -2; dome.name = 'Open water light gradient'; root.add(dome);
  const surfaceMaterial = own(new THREE.ShaderMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false,
    uniforms: { time: clock },
    vertexShader: 'uniform float time;varying vec3 sea;void main(){vec3 p=position;p.z+=.10*sin(p.x*.26+time*.71)+.055*sin(p.y*.31-time*.45);sea=p;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}',
    fragmentShader: 'uniform float time;varying vec3 sea;void main(){float ripple=pow(.5+.5*sin(sea.x*.39+sea.y*.31+time*.9),12.);vec3 c=gl_FrontFacing?vec3(.17,.48,.59):vec3(.47,.74,.79);gl_FragColor=vec4(c+ripple*.11,gl_FrontFacing?.62:.34);\n#include <colorspace_fragment>\n}' }));
  const surface = new THREE.Mesh(own(new THREE.PlaneGeometry(440, 440, 100, 100)), surfaceMaterial); surface.rotation.x = -Math.PI / 2; surface.name = 'Pelagic metre-scale sea surface'; root.add(surface);
  const whaleGeometry = own(animalGeometry('whale')), whaleMaterial = own(animalMaterial('whale', clock, { value: .2 }));
  const whale = new THREE.Mesh(whaleGeometry, whaleMaterial); whale.scale.setScalar(13.8); whale.name = '13.8 m humpback whale / original project model'; root.add(whale);
  const dolphinGeometry = own(animalGeometry('dolphin'));
  const dolphins = podOffsets.map((_, i) => { const mesh = new THREE.Mesh(dolphinGeometry, own(animalMaterial('dolphin', clock, { value: i * 1.31 }))); mesh.scale.setScalar(2.65); mesh.name = `2.65 m bottlenose dolphin ${i + 1}`; root.add(mesh); return mesh; });
  const random = seeded(seed), suspended = [];
  for (let i = 0; i < 320; i++) suspended.push((random() - .5) * 130, -random() * 35, (random() - .5) * 110);
  const dustGeometry = own(new THREE.BufferGeometry()); dustGeometry.setAttribute('position', new THREE.Float32BufferAttribute(suspended, 3));
  const particles = new THREE.Points(dustGeometry, own(new THREE.PointsMaterial({ color: '#adced5', size: .045, transparent: true, opacity: .28, depthWrite: false }))); particles.name = 'Sparse suspended display particles'; root.add(particles);
  const sprayPositions = [], sprayAges = [];
  for (let i = 0; i < 180; i++) { sprayPositions.push((random() - .5) * 1.1, random() * 2.8, (random() - .5) * 1.1); sprayAges.push(random()); }
  const sprayGeometry = own(new THREE.BufferGeometry()); sprayGeometry.setAttribute('position', new THREE.Float32BufferAttribute(sprayPositions, 3)); sprayGeometry.setAttribute('sprayAge', new THREE.Float32BufferAttribute(sprayAges, 1));
  const sprayMaterial = own(new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { time: clock, opacity: { value: 0 } },
    vertexShader: 'uniform float time;attribute float sprayAge;varying float fade;void main(){float age=fract(sprayAge+max(0.,time-17.5)*.37);vec3 p=position;p.y*=age;p.xz*=.25+age;fade=sin(age*3.14159);vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(140./max(1.,-mv.z),2.,12.);}',
    fragmentShader: 'uniform float opacity;varying float fade;void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;gl_FragColor=vec4(.85,.91,.92,(1.-r*r)*fade*opacity);\n#include <colorspace_fragment>\n}' }));
  const spray = new THREE.Points(sprayGeometry, sprayMaterial); spray.name = 'Brief humpback breath mist / authored display'; spray.visible = false; root.add(spray);

  const cameraPose = t => {
    t = clamp(t, 0, 80);
    const w = oceanPrimerWhalePose(t), pod = oceanPrimerDolphinPoses(t);
    const dolphinTarget = pod.reduce((center, animal) => center.add(vec(Object.values(animal.position))), new THREE.Vector3()).divideScalar(pod.length);
    const whaleTarget = vec(Object.values(w.position)).add(new THREE.Vector3(.6, .6, 0));
    const toPod = smooth(34, 43, t), returnView = smooth(65, 77, t);
    const target = whaleTarget.clone().lerp(dolphinTarget, toPod).lerp(whaleTarget.clone().lerp(dolphinTarget, .55), returnView);
    const surfaceVisit = smooth(9, 16, t) * (1 - smooth(22, 31, t));
    const aboveSea = mix(target.y + 3.4, 3.8, surfaceVisit);
    // A closer oblique view makes the complete pod the foreground subject;
    // parallax places the much larger whale to the side in the background.
    const distance = mix(mix(24, 10, toPod), 27, returnView);
    const position = target.clone().add(new THREE.Vector3(mix(mix(5.5, 8.5, toPod), 2.5, returnView), 0, distance)); position.y = mix(aboveSea, target.y + mix(2.3, 3.2, returnView), toPod);
    return { position: point(position), target: point(target), fov: 54, depthM: Math.max(0, -position.y) };
  };
  const environmentAt = t => {
    const pose = cameraPose(t), above = pose.position.y > .1;
    return { background: above ? '#7daec0' : '#0d3f60', fogColor: above ? '#7daec0' : '#155370', fogDensity: above ? .0016 : .012, depthM: pose.depthM, surfaceY: 0, lighting: 'blue-green natural daylight' };
  };
  const update = t => {
    if (disposed) return; time = clock.value = clamp(Number.isFinite(t) ? t : 0, 0, 80);
    const wp = oceanPrimerWhalePose(time); whale.position.set(wp.position.x, wp.position.y, wp.position.z); whale.rotation.set(0, wp.heading, wp.pitch, 'YXZ');
    const poses = oceanPrimerDolphinPoses(time);
    dolphins.forEach((mesh, i) => { const p = poses[i]; mesh.position.set(p.position.x, p.position.y, p.position.z); mesh.rotation.set(0, p.heading, p.pitch, 'YXZ'); });
    spray.visible = wp.breathing; sprayMaterial.uniforms.opacity.value = smooth(17.5, 18, time) * (1 - smooth(19.7, 20.5, time)) * .30;
    whale.updateMatrixWorld(true); spray.position.copy(new THREE.Vector3(.275, .086, 0).applyMatrix4(whale.matrixWorld));
    const pose = cameraPose(time), env = environmentAt(time); dome.position.set(pose.position.x, pose.position.y, pose.position.z);
    water.uniforms.upper.value.set(pose.position.y > 0 ? '#8cb9c9' : '#6cabbc');
    scene.background = new THREE.Color(env.background); scene.fog = new THREE.FogExp2(env.fogColor, env.fogDensity);
  };
  update(0);
  return {
    root, update, cameraPose, environmentAt,
    diagnostics: () => ({ kind: 'ocean-primer-pelagic', time, duration: 80, region: 'Caribbean representative observation', animals: 7, species: OCEAN_PRIMER_PELAGIC_SPECIES,
      authoredModels: true, sourceScans: false, naturalPopulationSimulation: false, whaleBreathing: spray.visible, externalAssets: 0,
      whaleTriangles: whaleGeometry.index.count / 3, dolphinTriangles: dolphinGeometry.index.count / 3,
      renderedAnimalTriangles: whaleGeometry.index.count / 3 + dolphins.length * dolphinGeometry.index.count / 3 }),
    dispose: () => { if (disposed) return; disposed = true; root.removeFromParent(); root.clear(); for (const resource of resources) resource.dispose(); resources.clear(); },
  };
}
