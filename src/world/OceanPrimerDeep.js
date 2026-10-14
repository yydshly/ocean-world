import * as THREE from 'three';
import { DeepSimulation } from '../deepSimulation.js';
import { deepSpeciesCatalog } from '../deepSpecies.js';
import { deepFloorHeight } from '../deepHabitat.js';
import { deepMidwaterLifeSpeciesCatalog } from '../deepMidwaterLifeSpecies.js';
import { oceanRockMesh, oceanRockHeight } from '../oceanRockShape.js';
import { deepBenthicLifeSpeciesCatalog } from '../deepBenthicLifeSpecies.js';
import { deepWaterLifeSpeciesCatalog } from '../deepWaterLifeSpecies.js';
import { deepHardLifeSpeciesCatalog } from '../deepHardLifeSpecies.js';
import { createDeepBenthicLifeAsset, animateDeepBenthicLifeAsset, disposeDeepBenthicLifeAsset } from './DeepBenthicLifeAssets.js';
import { createDeepWaterLifeAsset, animateDeepWaterLifeAsset, disposeDeepWaterLifeAsset } from './DeepWaterLifeAssets.js';
import { createDeepHardLifeAsset, animateDeepHardLifeAsset, disposeDeepHardLifeAsset } from './DeepHardLifeAssets.js';
import { createOceanPrimerDeepLife, animateOceanPrimerDeepLife, disposeOceanPrimerDeepLife } from './OceanPrimerDeepLife.js';

export const OCEAN_PRIMER_DEEP_DURATION_SEC = 65;
export const OCEAN_PRIMER_DEEP_BED_Y = -10;
export const OCEAN_PRIMER_DEEP_TRAVEL_WINDOW_SEC = Object.freeze([27,35]);
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
  return OCEAN_PRIMER_DEEP_BED_Y + deepFloorHeight(x, z) + outer * (ridge + shoulder + .15 * Math.sin(x * .28 + z * .19));
}

function makeTerrain(random) {
  const segments = 112, width = 64, row = segments + 1;
  const positions = [], colors = [], uvs = [], indices = [];
  const dark = new THREE.Color(0x6b6862), pale = new THREE.Color(0xa4a090);
  for (let iz = 0; iz <= segments; iz++) for (let ix = 0; ix <= segments; ix++) {
    const x = (ix / segments - .5) * width, z = (iz / segments - .5) * width;
    const y = oceanPrimerDeepFloorHeight(x, z);
    positions.push(x, y, z); uvs.push(x / 2, z / 2);
    const patch = Math.exp(-((x+.55)**2+(z+.55)**2)/1.8) * .17 + Math.exp(-((x-1.7)**2+(z-.9)**2)/.55)*.10;
    const color = dark.clone().lerp(pale, clamp(.38 + .10 * Math.sin(x * .39 + z * .27) + .08 * (y-OCEAN_PRIMER_DEEP_BED_Y), 0, 1));
    color.lerp(new THREE.Color(0x726452),patch);
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
  const mesh = new THREE.Mesh(geometry, material); mesh.name = 'Finite deep soft bottom and surrounding slopes'; mesh.receiveShadow = true;
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
  const sites = [[3.4, -2.9, 3.0, .58, 2.2], [-4.4, -3.8, 2.6, .38, 2.1],
    [6.4, -6.2, 4.4, .85, 3.2], [-8.2, -9, 5.4, 1.2, 3.9], [10.1, -11, 6, 1.6, 4.7]];
  const records = [];
  sites.forEach(([x, z, sx, sy, sz], index) => {
    const mesh = new THREE.Mesh(geometries[index % 2], material);
    mesh.position.set(x, oceanPrimerDeepFloorHeight(x, z) - .045, z);
    mesh.rotation.y = index * .71; mesh.scale.set(sx, sy, sz);
    mesh.userData.role = 'existing-rock-shape-finite-scenery'; mesh.castShadow=mesh.receiveShadow=true; root.add(mesh);
    records.push({x,z,y:mesh.position.y,profile:index%2?'ridge':'mound',rotation:mesh.rotation.y,scale:{x:sx,y:sy,z:sz}});
  });
  return { root, geometries, material, count: sites.length, records };
}

function makeMarineSnow(random) {
  const count = 560, positions = new Float32Array(count * 3), phases = new Float32Array(count), sizes = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (random() - .5) * 18; positions[i * 3 + 1] = random() * 8;
    positions[i * 3 + 2] = (random() - .5) * 18;
    phases[i] = random() * TAU; sizes[i] = .45 + random() ** 2 * 1.3;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('snowPhase', new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute('snowSize', new THREE.BufferAttribute(sizes, 1));
  const uniforms = { timeSec: { value: 0 }, observerPosition: { value: new THREE.Vector3() },
    observerDirection: { value: new THREE.Vector3() }, lightOn: { value: 1 }, seabedView: { value: 0 },floorY:{value:-10.2} };
  const material = new THREE.ShaderMaterial({ uniforms, transparent: true, depthWrite: false,
    toneMapped: false, vertexShader: `
      uniform float timeSec; uniform vec3 observerPosition; uniform vec3 observerDirection;
      uniform float seabedView; uniform float floorY; attribute float snowPhase; attribute float snowSize;
      varying float illumination; varying float distanceToObserver; varying float visibleInWater;
      void main() {
        vec3 p = position;
        p.x += sin(timeSec * .035 + snowPhase) * .11 + timeSec * .005;
        p.y = mod(p.y - timeSec * (.013 + .004 * sin(snowPhase)) + 8.0, 8.0);
        p.y -= 4.0;
        p += observerPosition;
        visibleInWater = seabedView > .5 ? step(floorY + .025, p.y) : 1.0;
        vec3 toParticle = p - observerPosition;
        distanceToObserver = length(toParticle);
        illumination = smoothstep(.18, .75, dot(normalize(toParticle), observerDirection));
        vec4 view = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = clamp(snowSize * 6.0 / max(.7, -view.z), .7, 3.8);
        gl_Position = projectionMatrix * view;
      }`, fragmentShader: `
      uniform float lightOn; varying float illumination; varying float distanceToObserver; varying float visibleInWater;
      void main() {
        float radius = length(gl_PointCoord - vec2(.5));
        if (radius > .5 || visibleInWater < .5) discard;
        float alpha = (1.0 - smoothstep(.15, .5, radius)) * illumination * lightOn * .54
          * exp(-distanceToObserver * .075);
        gl_FragColor = vec4(.73, .79, .79, alpha);
        #include <colorspace_fragment>
      }` });
  const mesh = new THREE.Points(geometry, material); mesh.name = 'Slowly falling observer-lit marine snow';
  mesh.frustumCulled = false;
  mesh.userData.role = 'display-only-marine-snow-not-food-ledger-or-particle-ingestion';
  mesh.userData.volumeRole = 'bounded-camera-local-size-and-distance-varied-scattering-proxy';
  return { mesh, geometry, material, uniforms, count };
}

function prepareNativeBottom(seed) {
  const surfaceSites = [[-1.8, -.5], [-.7, .1], [.35, .15], [1.4, -.9], [-1.3, .9],
    [-.25, -1.1], [1.6, .6], [2.5, -.5], [-2.4, -1.4], [-.45, 1.6], [.75, 1.7], [2.4, 1.5]];
  const anchors = [[-.9, -.8], [.9, .4], [2.4, 1.5]].map(([x, z], i) =>
    ({ id: `primer-deep-anchor-${i + 1}`, x, y: deepFloorHeight(x, z), z }));
  const sim = new DeepSimulation(seed, { idPrefix: 'primer-deep-', surfaceSites, seaPigSiteIndices:[0,1,2,5], anchors, inletX: -4.5, outletX: 4.5 });
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

const bottomPositions = [[4.8,-7.7,5.9],[2.2,-8.8,3.0],[-.2,-9.4,1.7],[2.1,-8.8,3.8]];
const bottomTargets = [[.2,-9.93,-.6],[.30,-9.98,-.2],[.4,-10.04,-.25],[.65,-9.93,-.7]];
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
  const midwater = new THREE.Group(), bottom = new THREE.Group(), coreObjects = new Map();
  midwater.name='700m whole middle-water representatives'; bottom.name='3500m whole native local bottom representatives';
  midwater.userData.role = 'finite-midwater-representatives-not-regional-ecology';
  bottom.userData.role = 'independent-native-local-bottom-not-research-owners';
  const bottomScenery = new THREE.Group(), terrain = makeTerrain(random), outcrops = makeOutcrops(), snow = makeMarineSnow(random);
  bottomScenery.name = '3500m representative soft-bottom observation location';
  bottomScenery.add(terrain.mesh, outcrops.root, bottom); root.add(midwater, bottomScenery, snow.mesh);
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
  const coreCatalogue=new Map([...deepSpeciesCatalog,...deepMidwaterLifeSpeciesCatalog].map(s=>[s.id,s]));
  for(const agent of [...midAgents,...nativeAgents]) {
    const object=createOceanPrimerDeepLife(coreCatalogue.get(agent.speciesId),agent);
    (midAgents.includes(agent)?midwater:bottom).add(object);coreObjects.set(agent.id,object);
  }
  const starSpecies=deepBenthicLifeSpeciesCatalog.find(s=>s.id==='abyssal-brittle-star');
  const octopusSpecies=deepWaterLifeSpeciesCatalog.find(s=>s.id==='abyssal-dumbo-octopus');
  const lilySpecies=deepHardLifeSpeciesCatalog.find(s=>s.id==='sea-lily-thalassocrinus');
  const lilyRock=outcrops.records[0],lilyBase={x:lilyRock.x+.06*lilyRock.scale.x*Math.cos(Math.PI/16),z:lilyRock.z+.06*lilyRock.scale.z*Math.sin(Math.PI/16)};
  const extras=[
    {id:'primer-deep-functional-brittle',speciesId:starSpecies.id,sizeM:.14,heading:.35,position:{x:-.2,y:0,z:-.7},
      object:createDeepBenthicLifeAsset(starSpecies),animate:animateDeepBenthicLifeAsset,dispose:disposeDeepBenthicLifeAsset,guild:'soft-sediment-opportunistic-benthic-activity'},
    {id:'primer-deep-functional-octopus',speciesId:octopusSpecies.id,sizeM:.075,heading:.2,position:{x:.45,y:0,z:-1.15},
      object:createDeepWaterLifeAsset(octopusSpecies),animate:animateDeepWaterLifeAsset,dispose:disposeDeepWaterLifeAsset,guild:'free-near-bottom-finned-swimmer'},
    {id:'primer-deep-functional-lily',speciesId:lilySpecies.id,sizeM:.135,heading:0,position:{x:lilyBase.x,y:0,z:lilyBase.z},
      object:createDeepHardLifeAsset(lilySpecies),animate:animateDeepHardLifeAsset,dispose:disposeDeepHardLifeAsset,guild:'fixed-hard-substrate-suspension-feeding-representative'},
  ];
  for(const extra of extras) {
    Object.assign(extra.object.userData,{agentId:extra.id,role:'additional-functional-display-proxy-not-native-food-or-population',
      sizeMeasure:extra.speciesId===starSpecies.id?'arm-span':extra.speciesId===lilySpecies.id?'arm-length':'mantle-length'});
    extra.object.traverse(mesh=>{if(mesh.isMesh){mesh.castShadow=true;mesh.receiveShadow=true;}});bottom.add(extra.object);
  }
  // Faint pre-existing, authored bed marks supply habitat context. They are
  // not native feeding events, reconstructed history or simulated sediment.
  const traceGeometry=new THREE.BufferGeometry(),tracePositions=[],traceIndices=[];
  for(const [curveIndex,[x,z,length]] of [[-.9,.7,1.1],[.4,-1.35,.8],[1.25,.85,.65]].entries()) {
    for(let i=0;i<=48;i++)for(const side of[-1,1]){
      const px=x+i/48*length,pz=z+Math.sin(i/48*TAU*1.2+curveIndex)*.052+side*.009;
      tracePositions.push(px,oceanPrimerDeepFloorHeight(px,pz)+.0007,pz);
      if(i<48&&side===-1){const a=curveIndex*98+i*2;traceIndices.push(a,a+2,a+1,a+1,a+2,a+3);}
    }
  }
  traceGeometry.setAttribute('position',new THREE.Float32BufferAttribute(tracePositions,3));traceGeometry.setIndex(traceIndices);traceGeometry.computeVertexNormals();
  const traceMaterial=new THREE.MeshStandardMaterial({color:0x584f44,roughness:1,transparent:true,opacity:.23,depthWrite:false});
  const traces=new THREE.Mesh(traceGeometry,traceMaterial);traces.name='Authored faint prior sediment traces';
  traces.userData.role='authored-preexisting-biogenic-trace-display-not-native-history-or-feeding';bottomScenery.add(traces);
  const lampTarget = new THREE.Object3D(), sideTarget = new THREE.Object3D();
  const lamp = new THREE.SpotLight(0xf2ede2, 16, 36, .93, .76, 2);
  const sideLamp = new THREE.SpotLight(0xdce7ee, 4, 28, 1.14, .85, 2);
  const fillLamp = new THREE.PointLight(0xdbe4e8, .2, 8, 2);
  lamp.target = lampTarget; sideLamp.target = sideTarget;
  for (const light of [lamp, sideLamp, fillLamp]) {
    light.castShadow = false; light.userData.illuminationRole = 'observer-artificial-light';
  }
  lamp.castShadow=true;lamp.shadow.mapSize.set(1024,1024);lamp.shadow.camera.near=.03;lamp.shadow.camera.far=36;
  lamp.shadow.bias=-.00004;lamp.shadow.normalBias=.001;lamp.shadow.radius=2;
  lamp.name = 'Observation vehicle forward lamp'; sideLamp.name = 'Observation vehicle wide lamp'; fillLamp.name = 'Observation vehicle close fill';
  root.add(lamp, sideLamp, fillLamp, lampTarget, sideTarget);
  const background = new THREE.Color(0x03101a), fog = new THREE.FogExp2(0x03101a, .06);
  const positionCurve = curveOf(bottomPositions), targetCurve = curveOf(bottomTargets);
  const direction = new THREE.Vector3();
  let disposed = false, clockSec = 0, activeFrame = nativeBottom.frames[0], currentLocation = 'midwater-700m';

  function environmentAt(input) {
    const t = timeInChapter(input), travelProgress=smooth((t-27)/8),seabed=t>=35;
    return { background: 0x03101a, fogColor: 0x03101a, fogDensity: THREE.MathUtils.lerp(.060,.035,travelProgress),
      depthM: THREE.MathUtils.lerp(700,3500,travelProgress), naturalLight: 0, observerLight: 1,
      observerLightingStatus: 'uncalibrated-local-observation-vehicle-lamps',
      transitionOpacity:0,locationSwitch:t>=27&&t<35,travelProgress,travelLabel:'观察器下潜快进：700米中层 → 3500米海床',
      observationLocation:seabed?'soft-bottom-3500m':t>=27?'time-compressed-observer-descent':'midwater-700m',
      scope: 'two-representative-observation-locations-time-compressed-observer-travel' };
  }

  function cameraPose(input) {
    const t = timeInChapter(input);
    if (t <= 27) {
      const p = smooth(clamp(t / 27, 0, 1));
      return { position: mixPoint({ x: -1.65, y: .62, z: 2.15 }, { x: .15, y: .48, z: 1.80 }, p),
        target: mixPoint({ x: -.32, y: .21, z: -.05 }, { x: .48, y: .16, z: -.42 }, p), fov: 50 };
    }
    if(t<35){const p=smooth((t-27)/8);
      return {position:mixPoint({x:.15,y:.48,z:1.80},point(positionCurve.getPoint(0)),p),
        target:mixPoint({x:.48,y:.16,z:-.42},point(targetCurve.getPoint(0)),p),fov:50};}
    const p = smooth(clamp((t - 35) / 30, 0, 1)), position = positionCurve.getPoint(p), target = targetCurve.getPoint(p);
    position.y = Math.max(position.y, oceanPrimerDeepFloorHeight(position.x, position.z) + .24);
    return { position: point(position), target: point(target), fov:50 };
  }

  function update(input,actualCamera=null,globalSec=null) {
    if (disposed) return false;
    const t = timeInChapter(input), environment = environmentAt(t), pose = cameraPose(t);
    clockSec = t; currentLocation = environment.observationLocation;
    midwater.visible = t < 35; bottomScenery.visible = t >= 27;
    scene.background = background; scene.fog = fog; fog.density = environment.fogDensity;
    const before = Math.min(129, Math.floor(t * 2)), fraction = clamp(t * 2 - before, 0, 1);
    const a = nativeBottom.frames[before], b = nativeBottom.frames[before + 1]; activeFrame = fraction < .5 ? a : b;
    {
      for (let i = 0; i < nativeAgents.length; i++) {
        const agent = nativeAgents[i], first = a.agents[i], second = b.agents[i];
        Object.assign(agent, fraction < .5 ? first : second);
        agent.position = mixPoint(first.position, second.position, fraction);
        agent.velocity = mixPoint(first.velocity, second.velocity, fraction);
        const headingChange = Math.atan2(Math.sin(second.heading - first.heading), Math.cos(second.heading - first.heading));
        agent.heading = first.heading + headingChange * fraction;
        agent.timeSec = t; agent.localEnvironment = { currentMps: .06 };
      }
    }
      midAgents[0].position = { x: -.45 + t * .008, y: .35 + .025 * Math.sin(t * .15), z: 0 };
      midAgents[1].position = { x: .5 + t * .006, y: .16 + .018 * Math.sin(t * .12 + 1), z: -.55 - t * .003 };
      for (const agent of midAgents) agent.timeSec = t;
    for(const agent of [...midAgents,...nativeAgents]){
      const object=coreObjects.get(agent.id);object.position.set(agent.position.x,agent.position.y+(midAgents.includes(agent)?0:OCEAN_PRIMER_DEEP_BED_Y),agent.position.z);
      object.scale.setScalar(agent.sizeM);object.rotation.set(0,-agent.heading,0);animateOceanPrimerDeepLife(object,t,agent);
    }
    for(const extra of extras){
      if(extra.speciesId===starSpecies.id){extra.position.x=-.2+t*.0025;extra.position.z=-.7+Math.sin(t*.07)*.025;extra.position.y=oceanPrimerDeepFloorHeight(extra.position.x,extra.position.z)+.002;}
      else if(extra.speciesId===octopusSpecies.id){extra.position.x=.45+Math.sin(t*.045)*.38;extra.position.z=-1.15-t*.002;extra.position.y=oceanPrimerDeepFloorHeight(extra.position.x,extra.position.z)+.44+Math.sin(t*.13)*.025;}
      else extra.position.y=oceanRockHeight(outcrops.records[0],extra.position.x,extra.position.z)+.001;
      extra.object.position.set(extra.position.x,extra.position.y,extra.position.z);extra.object.scale.setScalar(extra.sizeM);extra.object.rotation.set(0,-extra.heading,0);
      if(extra.speciesId!==octopusSpecies.id){
        const height=extra.speciesId===lilySpecies.id?(x,z)=>oceanRockHeight(lilyRock,x,z):oceanPrimerDeepFloorHeight,e=.0005;
        const dx=(height(extra.position.x+e,extra.position.z)-height(extra.position.x-e,extra.position.z))/(2*e);
        const dz=(height(extra.position.x,extra.position.z+e)-height(extra.position.x,extra.position.z-e))/(2*e);
        const up=new THREE.Vector3(-dx,1,-dz).normalize(),forward=new THREE.Vector3(Math.cos(extra.heading),0,Math.sin(extra.heading));
        forward.addScaledVector(up,-forward.dot(up)).normalize();const side=new THREE.Vector3().crossVectors(forward,up).normalize();
        extra.object.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(forward,up,side));
      }
      extra.animate(extra.object,t,{alive:true,velocity:extra.speciesId===lilySpecies.id?{x:0,y:0,z:0}:{x:.003,y:0,z:.001},localEnvironment:{currentMps:.06},lastFeedAt:null});
    }
    const lightPose=actualCamera?.position??actualCamera??pose.position;
    lamp.position.set(lightPose.x??pose.position.x,lightPose.y??pose.position.y,lightPose.z??pose.position.z);
    sideLamp.position.copy(lamp.position).add(new THREE.Vector3(-.35, .12, .05));
    fillLamp.position.copy(lamp.position);
    if(actualCamera?.getWorldDirection){actualCamera.getWorldDirection(direction);lampTarget.position.copy(lamp.position).addScaledVector(direction,3);}
    else lampTarget.position.set(pose.target.x, pose.target.y, pose.target.z);
    sideTarget.position.copy(lampTarget.position).add(new THREE.Vector3(-1.25, .05, -.7));
    const distance = clamp(lamp.position.distanceTo(lampTarget.position), .35, 9);
    lamp.intensity = distance * distance * 2.2 * environment.observerLight;
    sideLamp.intensity = distance * distance * .40 * environment.observerLight;
    fillLamp.intensity = .12 * Math.min(3, distance) ** 2 * environment.observerLight;
    direction.subVectors(lampTarget.position, lamp.position).normalize();
    snow.uniforms.timeSec.value = t; snow.uniforms.observerPosition.value.copy(lamp.position);
    snow.uniforms.observerDirection.value.copy(direction); snow.uniforms.lightOn.value = environment.observerLight;
    snow.uniforms.seabedView.value = t>=31 ? 1 : 0;snow.uniforms.floorY.value=oceanPrimerDeepFloorHeight(lamp.position.x,lamp.position.z);
    root.updateMatrixWorld(true); return true;
  }

  function diagnostics() {
    const environment = environmentAt(clockSec), enabledAgents = [...(midwater.visible?midAgents:[]),...(bottomScenery.visible?[...nativeAgents,...extras]:[])];
    return { seed, timeSec: clockSec, durationSec: 65, disposed, currentLocation, depthM: environment.depthM,
      observationDepthsM: [700, 3500], sceneRole: root.userData.role,
      noPersistence: true, researchOwnersConnected: 0, naturalLight: 0, observerLight: environment.observerLight,
      transitionOpacity:0,travelProgress:environment.travelProgress,travelLabel:environment.travelLabel,representativeAnimalCount:15,
      visibleAnimalCount:enabledAgents.length,visibleCountIsScreenCensus:false,
      visibleSpecies: [...new Set(enabledAgents.map(agent => agent.speciesId))],
      animals: enabledAgents.map(agent => ({ id: agent.id, speciesId: agent.speciesId, sizeM: agent.sizeM,
        position: { ...agent.position,y:agent.position.y+(nativeAgents.includes(agent)?OCEAN_PRIMER_DEEP_BED_Y:0) }, state: agent.state??'functional-display-proxy-no-native-feeding' })),
      originalWholeLifeKits:5,functionalExtraClasses:3,extraGuilds:extras.map(extra=>extra.guild),softTissueMotion:'gpu-bounded-source-informed-poses',
      contactShadows:lamp.castShadow,bedReferenceY:OCEAN_PRIMER_DEEP_BED_Y,authoredTracesRole:traces.userData.role,
      nativeLocalModel: { preparationSteps: nativeBottom.stepCount, preparedFrames: nativeBottom.frames.length,
        preparationMs, sampleTimeSec: activeFrame.timeSec, ...activeFrame.metrics },
      marineSnowCount: snow.count, marineSnowRole: snow.mesh.userData.role, outcropCount: outcrops.count,
      terrainTriangles: terrain.geometry.index.count / 3, cameraPose: cameraPose(clockSec),
      limitations: ['代表性观察点，非共同样方或完整深海模拟。',
        '700米至3500米为观察器航行快进示意，非真实连续下潜或实际测得速度。',
        '保留原模型的米制尺寸；局部动作和速率未按野外观测校准。',
        '海雪为灯照展示粒子，与原生局部食物账及实际摄入分开。',
        '本段中层使用观察灯；微弱自然光不作已标定渲染。'] };
  }

  function dispose() {
    if (disposed) return; disposed = true;
    for(const object of coreObjects.values())disposeOceanPrimerDeepLife(object);coreObjects.clear();extras.forEach(extra=>extra.dispose(extra.object));
    terrain.geometry.dispose(); terrain.material.dispose(); terrain.texture.dispose();
    outcrops.geometries.forEach(geometry => geometry.dispose()); outcrops.material.dispose();
    snow.geometry.dispose(); snow.material.dispose();
    traceGeometry.dispose();traceMaterial.dispose();lamp.shadow.dispose();
    if (scene.background === background) scene.background = oldBackground;
    if (scene.fog === fog) scene.fog = oldFog;
    root.removeFromParent(); root.clear(); nativeBottom.frames.length = 0; nativeAgents.length = 0;
  }

  update(0);
  return { root, durationSec: OCEAN_PRIMER_DEEP_DURATION_SEC, update, cameraPose, environmentAt, diagnostics, dispose };
}
