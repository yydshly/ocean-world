import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { Water } from 'three/addons/objects/Water.js';

const TAU = Math.PI * 2;
export const OCEAN_PRIMER_SURFACE_SWELLS = Object.freeze([
  Object.freeze({ amplitudeM: .24, wavelengthM: 34, periodSec: 7.8, direction: Object.freeze([.86, .51]) }),
  Object.freeze({ amplitudeM: .12, wavelengthM: 19, periodSec: 5.5, direction: Object.freeze([.98, -.20]) }),
  Object.freeze({ amplitudeM: .06, wavelengthM: 9.5, periodSec: 3.6, direction: Object.freeze([.64, .77]) }),
]);
const swellComponents = OCEAN_PRIMER_SURFACE_SWELLS.map(wave => ({ ...wave,
  direction: new THREE.Vector2(...wave.direction).normalize(), k: TAU / wave.wavelengthM, omega: TAU / wave.periodSec }));
const validTime = time => {
  if (!Number.isFinite(time)) throw new TypeError('Surface primer time must be finite seconds.');
  return THREE.MathUtils.clamp(time, 0, 45);
};
function phaseFor(seed) {
  if (!['string', 'number'].includes(typeof seed) || (typeof seed === 'number' && !Number.isFinite(seed)))
    throw new TypeError('Surface primer seed must be finite or a string.');
  let hash = 2166136261;
  for (const char of `primer-surface|${typeof seed}:${seed}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4294967296 * TAU;
}

// The CPU sampler and GPU shader share these metre/second wave components.
// This is gentle finite display motion, not a calibrated wave forecast.
export function sampleOceanPrimerSurface(x, z, time, { seed = 55 } = {}) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) throw new TypeError('Surface samples require finite metre coordinates.');
  const phase = phaseFor(seed), t = validTime(time), radius = Math.hypot(x, z);
  const u = THREE.MathUtils.clamp((radius - 220) / 630, 0, 1), envelope = 1 - u * u * (3 - 2 * u);
  const derivative = radius > 220 && radius < 850 ? -6 * u * (1 - u) / 630 : 0;
  let height = 0, dx = 0, dz = 0;
  for (const [i, wave] of swellComponents.entries()) {
    const angle = wave.k * (x * wave.direction.x + z * wave.direction.y) - wave.omega * t + phase + i * 1.71;
    height += wave.amplitudeM * Math.sin(angle);
    const slope = wave.amplitudeM * wave.k * Math.cos(angle);
    dx += slope * wave.direction.x; dz += slope * wave.direction.y;
  }
  return { heightM: height * envelope,
    gradient: { x: dx * envelope + height * derivative * (radius > 0 ? x / radius : 0),
      z: dz * envelope + height * derivative * (radius > 0 ? z / radius : 0) } };
}

export function oceanPrimerNearshoreHeight(x, z, seed = 55) {
  const phase = phaseFor(seed);
  const wx = x + 10 * Math.sin(z * .055 + phase) + 5 * Math.sin(z * .113 + 1.2);
  const wz = z + 8 * Math.sin(x * .048 + phase * .3);
  const main = 35 * Math.exp(-(((wx - 149) / 66) ** 2 + ((wz + 153) / 156) ** 2));
  const shoulder = 10 * Math.exp(-(((wx - 221) / 55) ** 2 + ((wz + 84) / 88) ** 2));
  const cove = 8 * Math.exp(-(((wx - 76) / 34) ** 2 + ((wz + 111) / 32) ** 2));
  const ridge = .17 * Math.sin(x * .052 + z * .041 + phase) + .09 * Math.cos(x * .091 - z * .027);
  return -8 + main * (1 + ridge) + shoulder - cove;
}

function waterGeometry() {
  // A single continuous mesh resolves the nearby swell without spending a
  // dense rectangular grid on the distant horizon. Geometry stays static.
  const sectors = 192, radii = [];
  for (let r = 2; r <= 220; r += 2) radii.push(r);
  for (let i = 1; i <= 28; i++) radii.push(220 * (1600 / 220) ** (i / 28));
  const positions = [0, 0, 0], normals = [0, 0, 1], indices = [];
  for (const radius of radii) for (let i = 0; i < sectors; i++) {
    const angle = i / sectors * TAU; positions.push(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
    normals.push(0, 0, 1);
  }
  for (let i = 0; i < sectors; i++) indices.push(0, 1 + i, 1 + (i + 1) % sectors);
  for (let ring = 0; ring < radii.length - 1; ring++) for (let i = 0; i < sectors; i++) {
    const a = 1 + ring * sectors + i, b = 1 + ring * sectors + (i + 1) % sectors;
    const c = a + sectors, d = b + sectors; indices.push(a, c, b, b, c, d);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3)); geometry.setIndex(indices);
  geometry.computeBoundingSphere(); geometry.boundingSphere.radius += .5;
  return geometry;
}

function addSwellShader(material, phase) {
  const number = n => n.toFixed(9);
  const components = swellComponents.map((w, i) => `
    {
      vec2 direction = vec2(${number(w.direction.x)}, ${number(w.direction.y)});
      float theta = dot(xz, direction) * ${number(w.k)} - time * ${number(w.omega)} + primerPhase + ${number(i * 1.71)};
      value.x += ${number(w.amplitudeM)} * sin(theta);
      value.yz += direction * ${number(w.amplitudeM * w.k)} * cos(theta);
    }`).join('\n');
  const functions = `
    uniform float primerPhase;
    vec3 primerSwell(vec2 xz) {
      vec3 value = vec3(0.0);
      ${components}
      float radius = length(xz);
      float u = clamp((radius - 220.0) / 630.0, 0.0, 1.0);
      float envelope = 1.0 - u * u * (3.0 - 2.0 * u);
      float derivative = radius > 220.0 && radius < 850.0 ? -6.0 * u * (1.0 - u) / 630.0 : 0.0;
      value.yz = value.yz * envelope + value.x * derivative * xz / max(radius, .001);
      value.x *= envelope;
      return value;
    }
  `;
  const beforeVertex = material.vertexShader, beforeFragment = material.fragmentShader;
  const vertexAnchor = 'mirrorCoord = modelMatrix * vec4( position, 1.0 );';
  const viewAnchor = 'vec4 mvPosition =  modelViewMatrix * vec4( position, 1.0 );';
  const normalAnchor = 'vec3 surfaceNormal = normalize( noise.xzy * vec3( 1.5, 1.0, 1.5 ) );';
  if (!beforeVertex.includes(vertexAnchor) || !beforeVertex.includes(viewAnchor) || !beforeFragment.includes(normalAnchor))
    throw new Error('Bundled Three Water shader changed; review swell integration against its actual source.');
  material.uniforms.primerPhase = { value: phase }; material.uniforms.size.value = 48;
  material.vertexShader = beforeVertex.replace('void main() {', `${functions}\nvoid main() {`)
    .replace(vertexAnchor, `${vertexAnchor}\nmirrorCoord.y += primerSwell(mirrorCoord.xz).x;`)
    .replace(viewAnchor, 'vec4 mvPosition = viewMatrix * worldPosition;');
  material.fragmentShader = beforeFragment.replace('void main() {', `${functions}\nvoid main() {`)
    .replace(normalAnchor, `vec2 swellSlope = primerSwell(worldPosition.xz).yz;
      vec2 smallRipple = vec2(
        .036 * cos(dot(worldPosition.xz, vec2(2.6, 1.1)) - time * 2.4),
        .026 * sin(dot(worldPosition.xz, vec2(-1.3, 3.5)) - time * 3.1));
      vec3 surfaceNormal = normalize(vec3(-swellSlope.x + noise.x * .30 + smallRipple.x,
        1.0, -swellSlope.y + noise.y * .30 + smallRipple.y));`)
    .replace('sunLight( surfaceNormal, eyeDirection, 100.0, 2.0, 0.5, diffuseLight, specularLight );',
      'sunLight( surfaceNormal, eyeDirection, 80.0, 1.15, 0.5, diffuseLight, specularLight );');
  material.needsUpdate = true;
}

// Original finite teaching scenery, metre scale. It never reads world history.
export function createOceanPrimerSurface(scene, { seed = 55 } = {}) {
  if (!scene?.isScene) throw new TypeError('Surface primer requires its own Three.js Scene.');
  const phase = phaseFor(seed), originalBackground = scene.background, originalFog = scene.fog;
  const root = new THREE.Group(); root.name = 'Primer: sea surface and nearshore'; scene.add(root);
  const resources = new Set(), own = value => (resources.add(value), value);
  const sky = new Sky(); sky.scale.setScalar(4000); root.add(sky);
  sky.material.uniforms.turbidity.value = 3.2; sky.material.uniforms.rayleigh.value = 2.2;
  sky.material.uniforms.mieCoefficient.value = .004; sky.material.uniforms.mieDirectionalG.value = .8;
  const sunDirection = new THREE.Vector3(-.42, .52, -.73).normalize();
  sky.material.uniforms.sunPosition.value.copy(sunDirection).multiplyScalar(1000);
  const sun = new THREE.DirectionalLight(0xfff3d6, 3); sun.position.copy(sunDirection).multiplyScalar(250);
  root.add(sun, new THREE.HemisphereLight(0xb9def0, 0x6c7b70, 2));
  const data = new Uint8Array(128 * 128 * 4);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const i = (y * 128 + x) * 4;
    data[i] = 128 + Math.round(16 * Math.sin(x * .43 + y * .19) + 7 * Math.cos(y * .63));
    data[i + 1] = 128 + Math.round(16 * Math.cos(y * .39 - x * .21) + 7 * Math.sin(x * .53));
    data[i + 2] = 253; data[i + 3] = 255;
  }
  const normals = own(new THREE.DataTexture(data, 128, 128)); normals.wrapS = normals.wrapT = THREE.RepeatWrapping;
  normals.minFilter = normals.magFilter = THREE.LinearFilter; normals.needsUpdate = true;
  const water = new Water(own(waterGeometry()), {
    textureWidth: 512, textureHeight: 512, waterNormals: normals, sunDirection,
    sunColor: 0xfff3d6, waterColor: 0x087f98, distortionScale: 1.65, fog: true,
  });
  water.name = 'Primer gentle swells and fine surface ripples';
  water.rotation.x = -Math.PI / 2; water.material.side = THREE.DoubleSide; root.add(water);
  addSwellShader(water.material, phase);
  // Water keeps its render target in a closure. Capture that one target at
  // first reflection so this chapter can release its framebuffer on exit.
  const reflect = water.onBeforeRender; let reflectionTarget = null;
  water.onBeforeRender = function(renderer, ...args) {
    if (reflectionTarget) return reflect.call(this, renderer, ...args);
    const proxy = new Proxy(renderer, { get(target, key) {
      if (key === 'setRenderTarget') return (renderTarget, ...rest) => {
        if (renderTarget?.texture === water.material.uniforms.mirrorSampler.value) reflectionTarget = renderTarget;
        return target.setRenderTarget(renderTarget, ...rest);
      };
      const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
    } });
    return reflect.call(this, proxy, ...args);
  };
  const bedGeometry = own(new THREE.PlaneGeometry(660, 660, 192, 192)); bedGeometry.rotateX(-Math.PI / 2);
  const positions = bedGeometry.attributes.position, colors = [];
  const sand = new THREE.Color('#c7ba8d'), rock = new THREE.Color('#6c7168'), grass = new THREE.Color('#5c7254');
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), z = positions.getZ(i);
    const y = oceanPrimerNearshoreHeight(x, z, seed);
    positions.setY(i, y);
    const variation = .5 + .5 * Math.sin(x * .09 + z * .071 + phase) * Math.cos(z * .048 - x * .033);
    const color = y < 2 ? sand.clone().lerp(rock, THREE.MathUtils.smoothstep(y, .4, 2) * .70) :
      rock.clone().lerp(grass, (.42 + .44 * variation) * (1 - THREE.MathUtils.smoothstep(y, 19, 34) * .5));
    color.multiplyScalar(.92 + .10 * variation);
    colors.push(color.r, color.g, color.b);
  }
  bedGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); bedGeometry.computeVertexNormals();
  const bed = new THREE.Mesh(bedGeometry, own(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .94 })));
  bed.name = 'Primer continuous irregular nearshore coast';
  root.add(bed);
  const boat = new THREE.Group(); boat.name = 'Primer fourteen metre reference boat';
  boat.position.set(-25, .15, 8); boat.rotation.y = -.35; root.add(boat);
  const white = own(new THREE.MeshStandardMaterial({ color: 0xe4e4d6, roughness: .5 }));
  const blue = own(new THREE.MeshStandardMaterial({ color: 0x254752, roughness: .58 }));
  const hull = new THREE.Mesh(own(new THREE.SphereGeometry(1, 48, 24)), white); hull.scale.set(1.75, 1.05, 7); boat.add(hull);
  const deck = new THREE.Mesh(own(new THREE.BoxGeometry(2.9, .22, 10.5)), white); deck.position.y = .65; boat.add(deck);
  const cabin = new THREE.Mesh(own(new THREE.BoxGeometry(2.2, 1.6, 3.7)), white); cabin.position.set(0, 1.4, -.3); boat.add(cabin);
  const window = new THREE.Mesh(own(new THREE.BoxGeometry(2.23, .65, 3.74)), blue); window.position.copy(cabin.position).add(new THREE.Vector3(0, .2, 0)); boat.add(window);
  const roof = new THREE.Mesh(own(new THREE.BoxGeometry(2.65, .18, 4.4)), white); roof.position.set(0, 2.28, -.3); boat.add(roof);
  const mast = new THREE.Mesh(own(new THREE.CylinderGeometry(.025, .025, 2, 8)), white); mast.position.set(0, 3.3, .4); boat.add(mast);
  const birdMaterial = own(new THREE.MeshBasicMaterial({ color: 0x35424a, side: THREE.DoubleSide })), birds = [];
  for (let i = 0; i < 7; i++) {
    const group = new THREE.Group(), wings = [];
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(own(new THREE.PlaneGeometry(1.15, .2)), birdMaterial);
      wing.position.x = side * .48; wing.rotation.x = Math.PI / 2; group.add(wing); wings.push(wing);
    }
    root.add(group); birds.push({ group, wings, phase: i * 1.63 });
  }
  const points = [[0, 5.2, 35], [-6, 4.8, 21], [-15, 3.4, 3], [-16, .8, -17], [-9, -2.3, -33], [-1, -4.3, -51]].map(p => new THREE.Vector3(...p));
  const targets = [[85, 3, -130], [65, 1, -110], [0, -.5, -60], [-5, -4, -43], [-3, -6.8, -54], [0, -7, -65]].map(p => new THREE.Vector3(...p));
  const path = new THREE.CatmullRomCurve3(points), targetPath = new THREE.CatmullRomCurve3(targets);
  const cameraPose = time => {
    const t = validTime(time) / 45, p = path.getPoint(t), target = targetPath.getPoint(t);
    return { position: { x: p.x, y: p.y, z: p.z }, target: { x: target.x, y: target.y, z: target.z }, fov: 54 };
  };
  const aboveBackground = new THREE.Color('#a8d9e5'), belowBackground = new THREE.Color('#347d91');
  const aboveFog = new THREE.FogExp2(0xc6dde1, .001), belowFog = new THREE.FogExp2(0x347d91, .027);
  let current = 0, disposed = false;
  const update = time => {
    if (disposed) return false;
    current = validTime(time); water.material.uniforms.time.value = current;
    const boatWave = sampleOceanPrimerSurface(boat.position.x, boat.position.z, current, { seed });
    boat.position.y = .15 + boatWave.heightM;
    boat.rotation.x = boatWave.gradient.z * .45; boat.rotation.z = -boatWave.gradient.x * .45;
    const pose = cameraPose(current), underwater = pose.position.y < sampleOceanPrimerSurface(pose.position.x, pose.position.z, current, { seed }).heightM;
    sky.visible = !underwater; scene.background = underwater ? belowBackground : aboveBackground;
    scene.fog = underwater ? belowFog : aboveFog;
    birds.forEach(({ group, wings, phase }, i) => {
      group.position.set(30 + Math.sin(current * .055 + phase) * 55, 12 + i * 1.2, -70 - Math.cos(current * .055 + phase) * 35);
      group.rotation.y = current * .055 + phase; wings[0].rotation.z = Math.sin(current * 2.5 + phase) * .25; wings[1].rotation.z = -wings[0].rotation.z;
    });
    root.updateMatrixWorld(true); return true;
  };
  update(0);
  return { root, update, cameraPose,
    environmentAt: time => ({ depthM: Math.max(0, -cameraPose(time).position.y), naturalLight: 1, location: '热带近岸海面 · 空间关系示意' }),
    diagnostics: () => ({ type: 'original-surface-teaching-scenery', seed, timeSec: current, seaLevelM: 0, nearshoreDepthM: 8,
      referenceBoatLengthM: 14, birds: 7, surfaceMotion: 'gpu-analytic-gentle-swells-and-fine-normal-ripples',
      maximumSwellAmplitudeM: .42, swellComponents: 3, waterVertices: water.geometry.attributes.position.count,
      waterTriangles: water.geometry.index.count / 3, reflection: 'Three-Water-planar-mean-sea-level-approximation',
      scope: 'finite-surface-and-nearshore-display-no-ecological-storage', disposed }),
    dispose() {
      if (disposed) return; disposed = true; scene.remove(root);
      for (const r of resources) r.dispose();
      if (reflectionTarget) reflectionTarget.dispose(); else water.material.uniforms.mirrorSampler.value.dispose();
      water.material.dispose(); sky.geometry.dispose(); sky.material.dispose(); root.clear();
      if (scene.background === aboveBackground || scene.background === belowBackground) scene.background = originalBackground;
      if (scene.fog === aboveFog || scene.fog === belowFog) scene.fog = originalFog;
    },
  };
}
