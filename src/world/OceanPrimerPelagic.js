import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createPrimerWater } from './OceanPrimerWater.js';
import { createPelagicMotion, deformPelagicVertex, PELAGIC_MOTION_VERSION } from './OceanPrimerPelagicMotion.js';

// Stage 06: independent educational choreography, with no saved ecology.
// Original project-authored animal surfaces; no scan or third-party mesh is
// copied. Dimensions are metres. See assets/ocean-primer/animals/provenance.json.
export const OCEAN_PRIMER_PELAGIC_SECONDS = 80;
export const OCEAN_PRIMER_PELAGIC_APPEARANCE_VERSION = 'pelagic-natural-body-skin-v2';
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
const bodyProfiles = {
  whale: [[-.50,.001,.001,-.010],[-.44,.010,.018,-.006],[-.34,.032,.033,-.001],[-.20,.067,.055,.006],
    [-.04,.104,.080,.008],[.12,.103,.086,.002],[.22,.081,.083,-.001],[.35,.049,.073,-.008],
    [.43,.024,.055,-.016],[.485,.009,.032,-.021],[.50,.001,.003,-.022]],
  dolphin: [[-.50,.001,.001,-.008],[-.43,.009,.013,-.004],[-.33,.025,.031,.001],[-.20,.058,.054,.006],
    [-.035,.086,.068,.012],[.13,.096,.072,.014],[.23,.077,.060,.018],[.30,.050,.043,.010],
    [.35,.020,.025,-.014],[.43,.014,.020,-.020],[.485,.009,.014,-.022],[.50,.001,.003,-.022]],
};
function profileAt(kind, x) {
  const rows = bodyProfiles[kind]; let k = 0; while (k < rows.length - 2 && x > rows[k + 1][0]) k++;
  const a = rows[k], b = rows[k + 1], span = b[0] - a[0], u = clamp((x - a[0]) / span, 0, 1);
  const tangent = (i, axis) => { const l = rows[Math.max(0, i - 1)], r = rows[Math.min(rows.length - 1, i + 1)]; return (r[axis] - l[axis]) / (r[0] - l[0]); };
  return [1,2,3].map(axis => (2*u**3-3*u**2+1)*a[axis]+(u**3-2*u**2+u)*span*tangent(k,axis)
    +(-2*u**3+3*u**2)*b[axis]+(u**3-u**2)*span*tangent(k+1,axis)).map((n,i)=>i<2?Math.max(.001,n):n);
}
const headTop = (kind, x, z = 0) => { const [ry,rz,cy] = profileAt(kind,x); return cy+ry*Math.sqrt(Math.max(0,1-(z/rz)**2)); };
export const PELAGIC_WHALE_NOSE_LOCAL = Object.freeze({x:.275,y:headTop('whale',.275)+.0018,z:0});

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
  const rows = whale ? 168 : 78, sectors = whale ? 64 : 40;
  const positions = [], indices = [];
  const sample = x => profileAt(kind,x);
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
      const y = headTop('whale',x,z)-.001;
      parts.push(ellipse([x, y, z], [.009, .005, .008], skinFn));
    }
    // Paired humpback blowholes sit above the front head.
    for (const z of [-.008, .008]) parts.push(ellipse([.275, headTop('whale',.275,z)+.0018, z], [.009, .0012, .0035], () => colour('#1b2b30').clone()));
  } else {
    parts.push(ellipse([.235, headTop('dolphin',.235)+.0012, 0], [.010, .0014, .006], () => colour('#334c54').clone()));
  }
  const g = mergeGeometries(parts); parts.forEach(p => p.dispose());
  g.computeBoundingBox(); g.computeBoundingSphere();
  g.userData = { source: 'project-authored', calibrated: false, sizeMeasure: 'total-length', species: whale ? 'Megaptera novaeangliae' : 'Tursiops truncatus' };
  return g;
}

function animalMaterial(kind, motionUniforms) {
  const whale = kind === 'whale', material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: whale?.58:.48, metalness: 0, side: THREE.DoubleSide });
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, motionUniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
attribute float cetaceanRole;
uniform float cetaceanPhase;uniform float cetaceanAmplitude;uniform float cetaceanStroke;
uniform float cetaceanFlukePitch;uniform float cetaceanPectoralPitch;uniform float cetaceanPectoralRoll;
varying vec3 cetaceanRest;
float bodyBend(float x){float w=clamp((-.12-x)/.36,0.,1.);return cetaceanAmplitude*w*w*sin(cetaceanPhase-(1.-w)*.75);}
vec3 cetaceanPose(vec3 p,float role){
  if(role>1.5){float a=-cetaceanFlukePitch*cos(cetaceanPhase);vec2 d=p.xy-vec2(-.44,-.012);p.xy=vec2(-.44,-.012)+mat2(cos(a),sin(a),-sin(a),cos(a))*d+vec2(0.,bodyBend(-.44));}
  else{p.y+=bodyBend(p.x);if(role>.5){float s=sign(p.z),rz=s*.055,w=smoothstep(.055,${whale?'.22':'.14'},abs(p.z));float a=(cetaceanPectoralPitch+s*cetaceanPectoralRoll+.022*cetaceanStroke*sin(cetaceanPhase))*s*w;vec2 d=vec2(p.y+.025,p.z-rz);vec2 q=mat2(cos(a),sin(a),-sin(a),cos(a))*d;p.yz=vec2(-.025,rz)+q;}}
  return p;
}`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
if(position.x<-.12||cetaceanRole>.5){vec3 n=normalize(objectNormal);vec3 tangent=normalize(cross(n,abs(n.y)<.8?vec3(0.,1.,0.):vec3(1.,0.,0.)));vec3 bitangent=cross(n,tangent);float e=.0005;
vec3 dt=cetaceanPose(position+tangent*e,cetaceanRole)-cetaceanPose(position-tangent*e,cetaceanRole);
vec3 db=cetaceanPose(position+bitangent*e,cetaceanRole)-cetaceanPose(position-bitangent*e,cetaceanRole);objectNormal=normalize(cross(dt,db));}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
cetaceanRest=position;transformed=cetaceanPose(position,cetaceanRole);`);
    if(shader.fragmentShader)shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
varying vec3 cetaceanRest;`).replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
float skinVariation=.5+.5*sin(cetaceanRest.x*113.+sin(cetaceanRest.z*97.))*sin(cetaceanRest.y*139.+cetaceanRest.z*83.);
roughnessFactor=clamp(roughnessFactor+(skinVariation-.5)*.085,.35,.72);`);
  };
  material.customProgramCacheKey = () => `ocean-primer-${kind}-integrated-motion-v2`;
  material.userData = { authoredSkin: true, photographs: false, displayMotion: true, appearanceVersion:OCEAN_PRIMER_PELAGIC_APPEARANCE_VERSION,posedNormals:true };
  return material;
}

function seeded(seed) {
  let s = seed >>> 0;
  return () => { s += 0x6D2B79F5; let n = s; n = Math.imul(n ^ n >>> 15, n | 1); n ^= n + Math.imul(n ^ n >>> 7, n | 61); return ((n ^ n >>> 14) >>> 0) / 4294967296; };
}

let referenceMotion;
export function oceanPrimerWhalePose(t) { return (referenceMotion??=createPelagicMotion()).whaleAt(t); }
export function oceanPrimerDolphinPoses(t) { return (referenceMotion??=createPelagicMotion()).dolphinsAt(t); }

export function createOceanPrimerPelagic(scene, { seed = 55 } = {}) {
  if (!scene?.isScene) throw new TypeError('OceanPrimerPelagic needs an independent THREE.Scene');
  const root = new THREE.Group(); root.name = 'Ocean primer / Caribbean representative cetaceans'; scene.add(root);
  const resources = new Set(), own = r => { resources.add(r); return r; }, clock = { value: 0 }, motion = createPelagicMotion();
  const water = createPrimerWater(scene,{seed,seaLevelM:0,extentM:1600});
  let disposed = false, time = 0, globalTime = 285, currentWhale, currentDolphins, noseClearanceM = -Infinity;
  const surfaceAt = (x,z,t) => water.sampleSurface(x,z,globalTime-time+t);
  root.userData = { educationalChoreography: true, noEcologyStorage: true, region: 'Caribbean', note: '加勒比海代表性观察场景，动物活动为科普编排；原创外形模型，非扫描。' };
  const uniforms = () => Object.fromEntries(['Phase','Amplitude','Stroke','FlukePitch','PectoralPitch','PectoralRoll'].map(key=>[`cetacean${key}`,{value:0}]));
  const whaleUniforms=uniforms(),dolphinUniforms=Array.from({length:6},uniforms);
  const applyMotion = (values,pose) => {for(const key of ['Phase','Amplitude','Stroke','FlukePitch','PectoralPitch','PectoralRoll'])values[`cetacean${key}`].value=pose[key[0].toLowerCase()+key.slice(1)];};
  const whaleGeometry = own(animalGeometry('whale')), whaleMaterial = own(animalMaterial('whale', whaleUniforms));
  const whale = new THREE.Mesh(whaleGeometry, whaleMaterial); whale.scale.setScalar(13.8); whale.name = '13.8 m humpback whale / original project model'; root.add(whale);
  const dolphinGeometry = own(animalGeometry('dolphin'));
  const dolphins = Array.from({length:6},(_, i) => { const mesh = new THREE.Mesh(dolphinGeometry, own(animalMaterial('dolphin', dolphinUniforms[i]))); mesh.scale.setScalar(2.65); mesh.name = `2.65 m bottlenose dolphin ${i + 1}`; root.add(mesh); return mesh; });
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
    const w = motion.whaleAt(t,surfaceAt), pod = motion.dolphinsAt(t);
    const dolphinTarget = pod.reduce((center, animal) => center.add(vec(Object.values(animal.position))), new THREE.Vector3()).divideScalar(pod.length);
    const whaleTarget = vec(Object.values(w.position)).add(new THREE.Vector3(.6, .6, 0));
    const toPod = smooth(34, 43, t), returnView = smooth(65, 77, t);
    const target = whaleTarget.clone().lerp(dolphinTarget, toPod).lerp(whaleTarget.clone().lerp(dolphinTarget, .55), returnView);
    const surfaceVisit = smooth(10, 16, t) * (1 - smooth(23, 32, t));
    const aboveSea = mix(target.y + 3.4, 3.8, surfaceVisit);
    // A closer oblique view makes the complete pod the foreground subject;
    // parallax places the much larger whale to the side in the background.
    const distance = mix(mix(24, 13, toPod), 53, returnView);
    const position = target.clone().add(new THREE.Vector3(mix(mix(5.5, 8.5, toPod), 2.5, returnView), 0, distance)); position.y = mix(aboveSea, target.y + mix(2.3, 3.2, returnView), toPod);
    return { position: point(position), target: point(target), fov: 54, depthM: Math.max(0, surfaceAt(position.x,position.z,t).heightM-position.y) };
  };
  const environmentAt = input => {
    const position = typeof input==='number'?cameraPose(input).position:input?.position??input??cameraPose(time).position;
    return {...water.environmentAt(position),lighting:'shared blue-green natural daylight'};
  };
  const update = (t,actualCamera=null,globalSec=285+t) => {
    if (disposed) return; time = clock.value = clamp(Number.isFinite(t) ? t : 0, 0, 80);
    globalTime=Number.isFinite(globalSec)?Math.max(0,globalSec):285+time;
    currentWhale=motion.whaleAt(time,surfaceAt);currentDolphins=motion.dolphinsAt(time);
    const wp=currentWhale;whale.position.set(wp.position.x,wp.position.y,wp.position.z);whale.quaternion.fromArray(wp.quaternion);applyMotion(whaleUniforms,wp);
    dolphins.forEach((mesh,i)=>{const p=currentDolphins[i];mesh.position.set(p.position.x,p.position.y,p.position.z);mesh.quaternion.fromArray(p.quaternion);applyMotion(dolphinUniforms[i],p);});
    whale.updateMatrixWorld(true);spray.position.copy(new THREE.Vector3(PELAGIC_WHALE_NOSE_LOCAL.x,PELAGIC_WHALE_NOSE_LOCAL.y,0).applyMatrix4(whale.matrixWorld));
    const actualSurface=water.sampleSurface(spray.position.x,spray.position.z,globalTime);noseClearanceM=spray.position.y-actualSurface.heightM;
    spray.visible=wp.breathingWindow&&noseClearanceM>.025;sprayMaterial.uniforms.opacity.value=spray.visible?smooth(18,18.25,time)*(1-smooth(20.1,21,time))*.30:0;
    water.update(globalTime,actualCamera??cameraPose(time).position);
  };
  update(0);
  return {
    root, update, cameraPose, environmentAt,
    updatePresentation:(actualCamera,globalSec=globalTime)=>{if(!disposed)water.update(globalSec,actualCamera);},
    sampleSurface:(x,z,t=globalTime)=>water.sampleSurface(x,z,t),
    motionAt:(t)=>({whale:motion.whaleAt(t,surfaceAt),dolphins:motion.dolphinsAt(t)}),
    posedAnimalBounds:()=>[whale,...dolphins].map((mesh,i)=>{
      mesh.updateMatrixWorld(true);const p=mesh.geometry.attributes.position,role=mesh.geometry.attributes.cetaceanRole,pose=i===0?currentWhale:currentDolphins[i-1],box=new THREE.Box3();
      for(let k=0;k<p.count;k++)box.expandByPoint(deformPelagicVertex(new THREE.Vector3().fromBufferAttribute(p,k),role.getX(k),pose,i===0?'whale':'dolphin').applyMatrix4(mesh.matrixWorld));return {name:mesh.name,box};}),
    diagnostics: () => ({ kind: 'ocean-primer-pelagic', time, duration: 80, region: 'Caribbean representative observation', animals: 7, species: OCEAN_PRIMER_PELAGIC_SPECIES,
      authoredModels: true, sourceScans: false, naturalPopulationSimulation: false, whaleBreathing: spray.visible, noseClearanceM,globalTime, externalAssets: 0,
      appearanceVersion:OCEAN_PRIMER_PELAGIC_APPEARANCE_VERSION,motion:motion.diagnostics(),whaleMotion:currentWhale,dolphinMotion:currentDolphins,water:water.diagnostics(),
      whaleTriangles: whaleGeometry.index.count / 3, dolphinTriangles: dolphinGeometry.index.count / 3,
      renderedAnimalTriangles: whaleGeometry.index.count / 3 + dolphins.length * dolphinGeometry.index.count / 3 }),
    dispose: () => { if (disposed) return; disposed = true;water.dispose();root.removeFromParent(); root.clear(); for (const resource of resources) resource.dispose(); resources.clear(); },
  };
}
