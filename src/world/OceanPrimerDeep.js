import * as THREE from 'three';
import { DeepSimulation } from '../deepSimulation.js';
import { deepSpeciesCatalog } from '../deepSpecies.js';
import { deepFloorHeight } from '../deepHabitat.js';
import { deepMidwaterLifeSpeciesCatalog } from '../deepMidwaterLifeSpecies.js';
import { oceanRockMesh } from '../oceanRockShape.js';
import { DeepOceanAnimals } from './DeepOceanAnimals.js';

export const OCEAN_PRIMER_DEEP_DURATION_SEC = 65;
const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;
const smooth = value => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t); };
const point = vector => ({ x: vector.x, y: vector.y, z: vector.z });
const mixPoint = (a, b, t) => ({ x: THREE.MathUtils.lerp(a.x, b.x, t),
  y: THREE.MathUtils.lerp(a.y, b.y, t), z: THREE.MathUtils.lerp(a.z, b.z, t) });
const timeInChapter = value => {
  if (!Number.isFinite(value)) throw new TypeError('Deep primer time must be finite seconds.');
  return clamp(value, 0, OCEAN_PRIMER_DEEP_DURATION_SEC);
};

function seededRandom(seed) {
  if (!['string', 'number'].includes(typeof seed) || (typeof seed === 'number' && !Number.isFinite(seed)))
    throw new TypeError('Deep primer seed must be a finite number or string.');
  let state = 2166136261;
  for (const character of `primer-deep|${typeof seed}:${seed}`) state = Math.imul(state ^ character.charCodeAt(0), 16777619);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ state >>> 15, state | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

// Preserve the old native local support throughout the animals' range. Only
// the surrounding finite scenery adds broad soft slopes and distant relief.
export function oceanPrimerDeepFloorHeight(x, z) {
  const outer = smooth((Math.hypot(x, z) - 4.4) / 8.5);
  const ridge = 2.9 * Math.exp(-(((z + 14) / 5.5) ** 2)) * (.72 + .28 * Math.sin(x * .17 + 1));
  const shoulder = 1.6 * Math.exp(-(((x + 13) / 5.3) ** 2)) * (.7 + .3 * Math.cos(z * .14));
  return deepFloorHeight(x, z) + outer * (ridge + shoulder + .15 * Math.sin(x * .28 + z * .19));
}

function makeTerrain(random) {
  const segments = 112, width = 64, row = segments + 1;
  const positions = [], colors = [], uvs = [], indices = [];
  const dark = new THREE.Color(0x6b6862), pale = new THREE.Color(0xa4a090);
  for (let iz = 0; iz <= segments; iz++) for (let ix = 0; ix <= segments; ix++) {
    const x = (ix / segments - .5) * width, z = (iz / segments - .5) * width;
    const y = oceanPrimerDeepFloorHeight(x, z);
    positions.push(x, y, z); uvs.push(x / 2, z / 2);
    const color = dark.clone().lerp(pale, clamp(.38 + .10 * Math.sin(x * .39 + z * .27) + .08 * y, 0, 1));
    colors.push(color.r, color.g, color.b);
    if (ix < segments && iz < segments) {
      const a = iz * row + ix, b = a + 1, c = a + row, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  const texels = new Uint8Array(128 * 128 * 4);
  for (let i = 0; i < texels.length; i += 4) {
    const value = 145 + Math.floor(random() * 48);
    texels[i] = texels[i + 1] = texels[i + 2] = value; texels[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(texels, 128, 128);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter; texture.needsUpdate = true;
  const material = new THREE.MeshStandardMaterial({ color: 0xd9d4c7, vertexColors: true,
    roughness: .98, metalness: 0, bumpMap: texture, bumpScale: .006 });
  const mesh = new THREE.Mesh(geometry, material); mesh.name = 'Finite deep soft bottom and surrounding slopes';
  mesh.userData.role = 'finite-scenery-not-biomass-or-surveyed-bathymetry';
  return { mesh, geometry, material, texture };
}

function makeOutcrops() {
  const root = new THREE.Group(); root.name = 'Sparse distant deep outcrops';
  const material = new THREE.MeshStandardMaterial({ color: 0x777775, roughness: .97, metalness: 0 });
  const geometries = ['mound', 'ridge'].map(profile => {
    const source = oceanRockMesh(profile), geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(source.positions, 3));
    geometry.setIndex(Array.from(source.indices)); geometry.computeVertexNormals();
    geometry.computeBoundingSphere(); return geometry;
  });
  const sites = [[-6.6, -3.6, 4.2, .9, 3.2], [-8.3, -8.7, 5.4, 1.4, 3.9],
    [6.8, -5.5, 4.4, 1.1, 3.2], [10.1, -11, 6, 1.6, 4.7], [-3.8, -11.7, 3.6, .8, 3.1],
    [12.4, 2.7, 4.5, 1.2, 3.3], [-11.7, 4.1, 3.5, .7, 2.8]];
  sites.forEach(([x, z, sx, sy, sz], index) => {
    const mesh = new THREE.Mesh(geometries[index % 2], material);
    mesh.position.set(x, oceanPrimerDeepFloorHeight(x, z) - .045, z);
    mesh.rotation.y = index * .71; mesh.scale.set(sx, sy, sz);
    mesh.userData.role = 'existing-rock-shape-finite-scenery'; root.add(mesh);
  });
  return { root, geometries, material, count: sites.length };
}

function makeMarineSnow(random) {
  const count = 480, positions = new Float32Array(count * 3), phases = new Float32Array(count), sizes = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (random() - .5) * 18; positions[i * 3 + 1] = random() * 8;
    positions[i * 3 + 2] = (random() - .5) * 18;
    phases[i] = random() * TAU; sizes[i] = .65 + random() * .6;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('snowPhase', new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute('snowSize', new THREE.BufferAttribute(sizes, 1));
  const uniforms = { timeSec: { value: 0 }, observerPosition: { value: new THREE.Vector3() },
    observerDirection: { value: new THREE.Vector3() }, lightOn: { value: 1 }, seabedView: { value: 0 } };
  const material = new THREE.ShaderMaterial({ uniforms, transparent: true, depthWrite: false,
    toneMapped: false, vertexShader: `
      uniform float timeSec; uniform vec3 observerPosition; uniform vec3 observerDirection;
      uniform float seabedView; attribute float snowPhase; attribute float snowSize;
      varying float illumination; varying float distanceToObserver;
      void main() {
        vec3 p = position;
        p.x += sin(timeSec * .035 + snowPhase) * .11 + timeSec * .005;
        p.y = mod(p.y - timeSec * (.013 + .004 * sin(snowPhase)) + 8.0, 8.0);
        p.y -= mix(3.8, .08, seabedView);
        vec3 toParticle = p - observerPosition;
        distanceToObserver = length(toParticle);
        illumination = smoothstep(.34, .72, dot(normalize(toParticle), observerDirection));
        vec4 view = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = clamp(snowSize * 5.0 / max(.7, -view.z), .8, 2.7);
        gl_Position = projectionMatrix * view;
      }`, fragmentShader: `
      uniform float lightOn; varying float illumination; varying float distanceToObserver;
      void main() {
        float radius = length(gl_PointCoord - vec2(.5));
        if (radius > .5) discard;
        float alpha = (1.0 - smoothstep(.15, .5, radius)) * illumination * lightOn * .38
          * exp(-distanceToObserver * .11);
        gl_FragColor = vec4(.73, .79, .79, alpha);
        #include <colorspace_fragment>
      }` });
  const mesh = new THREE.Points(geometry, material); mesh.name = 'Slowly falling observer-lit marine snow';
  mesh.frustumCulled = false;
  mesh.userData.role = 'display-only-marine-snow-not-food-ledger-or-particle-ingestion';
  return { mesh, geometry, material, uniforms, count };
}

function prepareNativeBottom(seed) {
  const surfaceSites = [[-1.8, -.5], [-.7, .1], [.35, .15], [1.4, -.9], [-1.3, .9],
    [-.25, -1.1], [1.6, .6], [2.5, -.5], [-2.4, -1.4], [-.45, 1.6], [.75, 1.7], [2.4, 1.5]];
  const anchors = [[-.9, -.8], [.6, .4], [1.9, -1.4], [-1.7, 1.7], [2.8, 1.3]].map(([x, z], i) =>
    ({ id: `primer-deep-anchor-${i + 1}`, x, y: deepFloorHeight(x, z), z }));
  const sim = new DeepSimulation(seed, { idPrefix: 'primer-deep-', surfaceSites, anchors, inletX: -4.5, outletX: 4.5 });
  const frames = [], capture = () => ({ timeSec: sim.timeSec,
    agents: structuredClone(sim.agents), metrics: { ...sim.metrics } });
  frames.push(capture());
  // One bounded preparation of this new local instance; no store, owner,
  // history restoration or old research-world controller is consulted.
  for (let step = 1; step <= 650; step++) {
    sim.step(.1); if (step % 5 === 0) frames.push(capture());
  }
  return { frames, stepCount: 650 };
}

const bottomPositions = [[5.9, 2.55, 6.5], [3.15, 1.25, 3.5], [-.1, .30, .80], [1.75, .92, 2.3]];
const bottomTargets = [[-.2, .10, -.4], [.25, .02, -.25], [.35, -.105, .15], [.6, .10, -.15]];
const curveOf = values => new THREE.CatmullRomCurve3(values.map(values => new THREE.Vector3(...values)), false, 'catmullrom', .45);

/** Two independent, representative observation locations, in local metres.
 * The 700m -> 3500m cut compresses travel time; it is not a vertical transect,
 * a co-occurrence census or a complete deep-ocean ecosystem simulation. */
export function createOceanPrimerDeep(scene, { seed = 55 } = {}) {
  if (!scene?.isScene) throw new TypeError('Deep primer requires its own Three.js Scene.');
  const random = seededRandom(seed), oldBackground = scene.background, oldFog = scene.fog;
  const root = new THREE.Group(); root.name = 'First ocean introduction: representative deep observations';
  Object.assign(root.userData, { role: 'independent-finite-primer-no-persistence', metres: true,
    durationSec: OCEAN_PRIMER_DEEP_DURATION_SEC, observationDepthsM: [700, 3500] });
  scene.add(root);
  const midwater = new DeepOceanAnimals(deepMidwaterLifeSpeciesCatalog), bottom = new DeepOceanAnimals(deepSpeciesCatalog);
  midwater.root.userData.role = 'finite-midwater-representatives-not-regional-ecology';
  bottom.root.userData.role = 'independent-native-local-bottom-not-research-owners';
  const bottomScenery = new THREE.Group(), terrain = makeTerrain(random), outcrops = makeOutcrops(), snow = makeMarineSnow(random);
  bottomScenery.name = '3500m representative soft-bottom observation location';
  bottomScenery.add(terrain.mesh, outcrops.root, bottom.root); root.add(midwater.root, bottomScenery, snow.mesh);
  const preparedAt = performance.now(), nativeBottom = prepareNativeBottom(seed), preparationMs = performance.now() - preparedAt;
  const nativeAgents = structuredClone(nativeBottom.frames[0].agents);
  const midAgents = [
    { id: 'primer-deep-helmet-jelly', speciesId: 'helmet-jelly', sizeM: .225, heading: 0, pitch: 0,
      position: { x: -.45, y: .35, z: 0 }, velocity: { x: .008, y: 0, z: 0 }, alive: true,
      localEnvironment: { currentMps: .045 }, state: 'representative-midwater-swimming' },
    { id: 'primer-deep-vampire-squid', speciesId: 'vampire-squid', sizeM: .115, heading: .12, pitch: 0,
      position: { x: .5, y: .16, z: -.55 }, velocity: { x: .01, y: 0, z: 0 }, alive: true,
      localEnvironment: { currentMps: .045 }, state: 'representative-midwater-drifting' },
  ];
  const lampTarget = new THREE.Object3D(), sideTarget = new THREE.Object3D();
  const lamp = new THREE.SpotLight(0xf2ede2, 16, 36, .93, .76, 2);
  const sideLamp = new THREE.SpotLight(0xdce7ee, 4, 28, 1.14, .85, 2);
  const fillLamp = new THREE.PointLight(0xdbe4e8, .2, 8, 2);
  lamp.target = lampTarget; sideLamp.target = sideTarget;
  for (const light of [lamp, sideLamp, fillLamp]) {
    light.castShadow = false; light.userData.illuminationRole = 'observer-artificial-light';
  }
  lamp.name = 'Observation vehicle forward lamp'; sideLamp.name = 'Observation vehicle wide lamp'; fillLamp.name = 'Observation vehicle close fill';
  root.add(lamp, sideLamp, fillLamp, lampTarget, sideTarget);
  const background = new THREE.Color(0x020910), fog = new THREE.FogExp2(0x020910, .075);
  const positionCurve = curveOf(bottomPositions), targetCurve = curveOf(bottomTargets);
  const direction = new THREE.Vector3();
  let disposed = false, clockSec = 0, activeFrame = nativeBottom.frames[0], currentLocation = 'midwater-700m';

  function environmentAt(input) {
    const t = timeInChapter(input), seabed = t >= 26;
    const transitionOpacity = t < 24 || t >= 28 ? 0 : t <= 26 ? smooth((t - 24) / 2) : 1 - smooth((t - 26) / 2);
    return { background: 0x020910, fogColor: 0x020910, fogDensity: seabed ? .032 : .075,
      depthM: seabed ? 3500 : 700, naturalLight: 0, observerLight: 1 - transitionOpacity,
      observerLightingStatus: 'uncalibrated-local-observation-vehicle-lamps',
      transitionOpacity, locationSwitch: t >= 24 && t < 28,
      scope: 'two-representative-observation-locations-time-compressed-cut' };
  }

  function cameraPose(input) {
    const t = timeInChapter(input);
    if (t < 26) {
      const p = smooth(clamp(t / 24, 0, 1));
      return { position: mixPoint({ x: -1.8, y: .52, z: 1.8 }, { x: .07, y: .36, z: 1.20 }, p),
        target: mixPoint({ x: -.43, y: .26, z: -.1 }, { x: .55, y: .16, z: -.5 }, p), fov: 47 };
    }
    const p = smooth(clamp((t - 28) / 37, 0, 1)), position = positionCurve.getPoint(p), target = targetCurve.getPoint(p);
    position.y = Math.max(position.y, oceanPrimerDeepFloorHeight(position.x, position.z) + .24);
    return { position: point(position), target: point(target), fov: 50 - 4 * Math.sin(p * Math.PI) };
  }

  function update(input) {
    if (disposed) return false;
    const t = timeInChapter(input), environment = environmentAt(t), pose = cameraPose(t);
    clockSec = t; currentLocation = t >= 26 ? 'soft-bottom-3500m' : 'midwater-700m';
    midwater.root.visible = t < 26; bottomScenery.visible = t >= 26;
    scene.background = background; scene.fog = fog; fog.density = environment.fogDensity;
    const before = Math.min(129, Math.floor(t * 2)), fraction = clamp(t * 2 - before, 0, 1);
    const a = nativeBottom.frames[before], b = nativeBottom.frames[before + 1]; activeFrame = fraction < .5 ? a : b;
    if (bottomScenery.visible) {
      for (let i = 0; i < nativeAgents.length; i++) {
        const agent = nativeAgents[i], first = a.agents[i], second = b.agents[i];
        Object.assign(agent, fraction < .5 ? first : second);
        agent.position = mixPoint(first.position, second.position, fraction);
        agent.velocity = mixPoint(first.velocity, second.velocity, fraction);
        const headingChange = Math.atan2(Math.sin(second.heading - first.heading), Math.cos(second.heading - first.heading));
        agent.heading = first.heading + headingChange * fraction;
        agent.timeSec = t; agent.localEnvironment = { currentMps: .06 };
      }
      bottom.update(nativeAgents, t);
    } else {
      midAgents[0].position = { x: -.45 + t * .008, y: .35 + .025 * Math.sin(t * .15), z: 0 };
      midAgents[1].position = { x: .5 + t * .006, y: .16 + .018 * Math.sin(t * .12 + 1), z: -.55 - t * .003 };
      for (const agent of midAgents) agent.timeSec = t;
      midwater.update(midAgents, t);
    }
    lamp.position.set(pose.position.x, pose.position.y, pose.position.z);
    sideLamp.position.copy(lamp.position).add(new THREE.Vector3(-.35, .12, .05));
    fillLamp.position.copy(lamp.position);
    lampTarget.position.set(pose.target.x, pose.target.y, pose.target.z);
    sideTarget.position.copy(lampTarget.position).add(new THREE.Vector3(-1.25, .05, -.7));
    const distance = clamp(lamp.position.distanceTo(lampTarget.position), .35, 9);
    lamp.intensity = distance * distance * 2.8 * environment.observerLight;
    sideLamp.intensity = distance * distance * .65 * environment.observerLight;
    fillLamp.intensity = .16 * Math.min(3, distance) ** 2 * environment.observerLight;
    direction.subVectors(lampTarget.position, lamp.position).normalize();
    snow.uniforms.timeSec.value = t; snow.uniforms.observerPosition.value.copy(lamp.position);
    snow.uniforms.observerDirection.value.copy(direction); snow.uniforms.lightOn.value = environment.observerLight;
    snow.uniforms.seabedView.value = bottomScenery.visible ? 1 : 0;
    root.updateMatrixWorld(true); return true;
  }

  function diagnostics() {
    const environment = environmentAt(clockSec), visibleAgents = currentLocation === 'midwater-700m' ? midAgents : nativeAgents;
    return { seed, timeSec: clockSec, durationSec: 65, disposed, currentLocation, depthM: environment.depthM,
      observationDepthsM: [700, 3500], sceneRole: root.userData.role,
      noPersistence: true, researchOwnersConnected: 0, naturalLight: 0, observerLight: environment.observerLight,
      transitionOpacity: environment.transitionOpacity, representativeAnimalCount: 18,
      visibleAnimalCount: visibleAgents.length,
      visibleSpecies: [...new Set(visibleAgents.map(agent => agent.speciesId))],
      animals: visibleAgents.map(agent => ({ id: agent.id, speciesId: agent.speciesId, sizeM: agent.sizeM,
        position: { ...agent.position }, state: agent.state })),
      nativeLocalModel: { preparationSteps: nativeBottom.stepCount, preparedFrames: nativeBottom.frames.length,
        preparationMs, sampleTimeSec: activeFrame.timeSec, ...activeFrame.metrics },
      marineSnowCount: snow.count, marineSnowRole: snow.mesh.userData.role, outcropCount: outcrops.count,
      terrainTriangles: terrain.geometry.index.count / 3, cameraPose: cameraPose(clockSec),
      limitations: ['代表性观察点，非共同样方或完整深海模拟。',
        '700米至3500米以短转场切换观察地点，非真实连续下潜。',
        '保留原模型的米制尺寸；局部动作和速率未按野外观测校准。',
        '海雪为灯照展示粒子，与原生局部食物账及实际摄入分开。',
        '本段中层使用观察灯；微弱自然光不作已标定渲染。'] };
  }

  function dispose() {
    if (disposed) return; disposed = true;
    midwater.dispose(); bottom.dispose();
    terrain.geometry.dispose(); terrain.material.dispose(); terrain.texture.dispose();
    outcrops.geometries.forEach(geometry => geometry.dispose()); outcrops.material.dispose();
    snow.geometry.dispose(); snow.material.dispose();
    if (scene.background === background) scene.background = oldBackground;
    if (scene.fog === fog) scene.fog = oldFog;
    root.removeFromParent(); root.clear(); nativeBottom.frames.length = 0; nativeAgents.length = 0;
  }

  update(0);
  return { root, durationSec: OCEAN_PRIMER_DEEP_DURATION_SEC, update, cameraPose, environmentAt, diagnostics, dispose };
}
