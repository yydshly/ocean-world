import * as THREE from 'three';
import { createPrimerWater, samplePrimerWaterSurface, primerCoastHeight, PRIMER_WATER_WAVES } from './OceanPrimerWater.js';

export const OCEAN_PRIMER_SURFACE_SWELLS = PRIMER_WATER_WAVES;
export const sampleOceanPrimerSurface = samplePrimerWaterSurface;
export const oceanPrimerNearshoreHeight = primerCoastHeight;
export const OCEAN_PRIMER_COAST_TEXTURES = Object.freeze([
  Object.freeze({ role: 'rock', file: 'assets/coastal-rock/Diffuse.jpg', color: true }),
  Object.freeze({ role: 'normal', file: 'assets/coastal-rock/nor_gl.jpg', color: false }),
  Object.freeze({ role: 'roughness', file: 'assets/coastal-rock/rough.jpg', color: false }),
  Object.freeze({ role: 'sand', file: 'assets/sand-albedo.png', color: true }),
]);
const clamp = THREE.MathUtils.clamp;
const validTime = time => {
  if (!Number.isFinite(time)) throw new TypeError('Surface primer time must be finite seconds.');
  return clamp(time, 0, 45);
};

function coastMaterial() {
  const material = new THREE.MeshStandardMaterial({ color: '#d8d4c5', vertexColors: true, roughness: .96, metalness: 0 });
  const uniforms = { sandMap: { value: null }, rockScale: { value: .36 }, sandScale: { value: .30 }, seaLevel: { value: 0 } };
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = 'varying vec3 vCoastWorld;varying vec3 vCoastNormal;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
      vCoastWorld=(modelMatrix*vec4(transformed,1.0)).xyz;
      vCoastNormal=normalize(mat3(modelMatrix)*objectNormal);`);
    shader.fragmentShader = `varying vec3 vCoastWorld;varying vec3 vCoastNormal;
      uniform sampler2D sandMap;uniform float rockScale;uniform float sandScale;uniform float seaLevel;
      vec3 coastWeights(){vec3 w=pow(abs(normalize(vCoastNormal)),vec3(4.0));return w/max(dot(w,vec3(1.0)),.0001);}
      vec4 coastTexture(sampler2D image){vec3 p=vCoastWorld*rockScale,w=coastWeights();
        return texture2D(image,p.yz)*w.x+texture2D(image,p.xz)*w.y+texture2D(image,p.xy)*w.z;}
    ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      #ifdef USE_MAP
        float gentle=pow(max(vCoastNormal.y,0.0),4.0);
        float sandBand=(1.0-smoothstep(1.1,3.0,vCoastWorld.y))*gentle;
        vec4 stone=coastTexture(map);vec4 sand=texture2D(sandMap,vCoastWorld.xz*sandScale);
        diffuseColor*=mix(stone,sand,sandBand);
        float wet=1.0-smoothstep(.20,1.4,vCoastWorld.y-seaLevel);
        diffuseColor.rgb*=mix(1.0,.68,wet);
      #endif`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `
      #include <roughnessmap_fragment>
      float wetRough=1.0-smoothstep(.20,1.3,vCoastWorld.y-seaLevel);
      roughnessFactor=mix(roughnessFactor,max(.48,roughnessFactor*.65),wetRough);`);
  };
  material.customProgramCacheKey = () => 'primer-coast-cc0-rock-and-existing-sand-v1';
  material.userData = { source: 'assets/coastal-rock/provenance.json', license: 'CC0-1.0 for existing coastal rock maps',
    sand: 'existing project sand-albedo.png', scope: 'whole rocky/sandy coastal display; no vegetation or surveyed shoreline claim',
    projection: 'world metre triplanar rock / horizontal sand; original source images unchanged' };
  return material;
}

function coastGeometry(seed) {
  const width = 660, segments = 192, geometry = new THREE.PlaneGeometry(width, width, segments, segments);
  geometry.rotateX(-Math.PI / 2); const p = geometry.attributes.position, colors = [], uv = [];
  const sand = new THREE.Color('#c5baa0'), stone = new THREE.Color('#7c7b72');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), y = primerCoastHeight(x, z, seed); p.setY(i, y);
    const rockFraction = THREE.MathUtils.smoothstep(y, .25, 4.5);
    const variation = .94 + .06 * Math.sin(x * .20 + z * .17) * Math.cos(z * .13);
    const color = sand.clone().lerp(stone, rockFraction).multiplyScalar(variation);
    colors.push(color.r, color.g, color.b); uv.push(x * .36, z * .36);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere(); return geometry;
}

// Original finite coastal scene. It owns only display scenery and the shared
// water rig; loading the four existing image files never changes native ecology.
export function createOceanPrimerSurface(scene, { seed = 55 } = {}) {
  if (!scene?.isScene) throw new TypeError('Surface primer requires its own Three.js Scene.');
  const root = new THREE.Group(); root.name = 'Primer: sea surface and nearshore'; scene.add(root);
  const resources = new Set(), own = value => (resources.add(value), value);
  const waterRig = createPrimerWater(scene, {seed, seaLevelM: 0, extentM: 1600, nearshore: true});
  scene.remove(waterRig.root); root.add(waterRig.root);
  const material = own(coastMaterial()), bed = new THREE.Mesh(own(coastGeometry(seed)), material);
  bed.name = 'Primer continuous irregular nearshore coast'; bed.userData.role = 'whole-rock-sand-coast-not-smooth-green-hills';
  bed.receiveShadow = true; root.add(bed);
  const boat = new THREE.Group(); boat.name = 'Primer fourteen metre reference boat';
  boat.position.set(-18, .15, 2); boat.rotation.y = -1.07; root.add(boat);
  const white = own(new THREE.MeshStandardMaterial({ color: '#dadfd8', roughness: .54 }));
  const blue = own(new THREE.MeshStandardMaterial({ color: '#274f60', roughness: .52 }));
  const hull = new THREE.Mesh(own(new THREE.SphereGeometry(1, 48, 24)), white); hull.scale.set(1.75, 1.05, 7); boat.add(hull);
  const deck = new THREE.Mesh(own(new THREE.BoxGeometry(2.9, .22, 10.5)), white); deck.position.y = .65; boat.add(deck);
  const cabin = new THREE.Mesh(own(new THREE.BoxGeometry(2.2, 1.6, 3.7)), white); cabin.position.set(0, 1.4, -.3); boat.add(cabin);
  const window = new THREE.Mesh(own(new THREE.BoxGeometry(2.23, .65, 3.74)), blue); window.position.copy(cabin.position).add(new THREE.Vector3(0, .2, 0)); boat.add(window);
  const roof = new THREE.Mesh(own(new THREE.BoxGeometry(2.65, .18, 4.4)), white); roof.position.set(0, 2.28, -.3); boat.add(roof);
  const mast = new THREE.Mesh(own(new THREE.CylinderGeometry(.025, .025, 2, 8)), white); mast.position.set(0, 3.3, .4); boat.add(mast);
  boat.traverse(node => { if (node.isMesh) node.castShadow = true; });
  const birdMaterial = own(new THREE.MeshBasicMaterial({ color: '#35424a', side: THREE.DoubleSide })), birds = [];
  for (let i = 0; i < 7; i++) {
    const group = new THREE.Group(), wings = [];
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(own(new THREE.PlaneGeometry(1.15, .2)), birdMaterial);
      wing.position.x = side * .48; wing.rotation.x = Math.PI / 2; group.add(wing); wings.push(wing);
    }
    root.add(group); birds.push({group, wings, phase: i * 1.63});
  }
  const points = [[-18, 4.8, 42], [-12, 4.0, 22], [-8, 2.2, 2], [-12, .45, -18], [-9, -2.3, -33], [-1, -4.3, -51]].map(p => new THREE.Vector3(...p));
  const targets = [[5, .3, -75], [10, .05, -82], [-4, -.6, -54], [-5, -4, -43], [-3, -6.8, -54], [0, -7, -65]].map(p => new THREE.Vector3(...p));
  const path = new THREE.CatmullRomCurve3(points), targetPath = new THREE.CatmullRomCurve3(targets);
  const cameraPose = time => {
    const t = validTime(time) / 45, p = path.getPoint(t), target = targetPath.getPoint(t);
    return {position: {x: p.x, y: p.y, z: p.z}, target: {x: target.x, y: target.y, z: target.z}, fov: 54};
  };
  let current = 0, globalTime = 0, actualPose = cameraPose(0), disposed = false, texturePromise = null, textureStatus = 'unloaded';
  const update = (localSec, cameraOrPose = cameraPose(localSec), globalSec = localSec) => {
    if (disposed) return false;
    current = validTime(localSec); globalTime = globalSec; actualPose = cameraOrPose;
    waterRig.update(globalSec, cameraOrPose);
    const wave = waterRig.sampleSurface(boat.position.x, boat.position.z, globalSec);
    boat.position.y = .15 + wave.heightM; boat.rotation.x = wave.gradient.z * .45; boat.rotation.z = -wave.gradient.x * .45;
    birds.forEach(({group, wings, phase}, i) => {
      group.position.set(30 + Math.sin(current * .055 + phase) * 55, 12 + i * 1.2, -70 - Math.cos(current * .055 + phase) * 35);
      group.rotation.y = current * .055 + phase; wings[0].rotation.z = Math.sin(current * 2.5 + phase) * .25; wings[1].rotation.z = -wings[0].rotation.z;
    });
    root.updateMatrixWorld(true); return true;
  };
  const loadTextures = (baseUrl = '/', loader = new THREE.TextureLoader()) => {
    if (disposed) return Promise.reject(new Error('Surface primer was disposed before texture loading.'));
    if (texturePromise) return texturePromise;
    textureStatus = 'loading';
    texturePromise = (async () => {
      const base = `${baseUrl.replace(/\/?$/, '/')}`;
      const results = await Promise.allSettled(OCEAN_PRIMER_COAST_TEXTURES.map(item => loader.loadAsync(base + item.file)));
      const textures = results.filter(result => result.status === 'fulfilled').map(result => result.value);
      if (disposed || results.some(result => result.status === 'rejected')) {
        for (const texture of textures) texture.dispose(); textureStatus = disposed ? 'disposed' : 'error';
        throw new Error('Existing coastal rock/sand textures could not be installed; no replacement asset or automatic retry.');
      }
      const maps = {};
      results.forEach((result, i) => {
        const texture = own(result.value), item = OCEAN_PRIMER_COAST_TEXTURES[i];
        texture.colorSpace = item.color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.anisotropy = 4; maps[item.role] = texture;
      });
      material.map = maps.rock; material.normalMap = maps.normal; material.normalScale.set(.22, .22);
      material.roughnessMap = maps.roughness; material.userData.sandMap = maps.sand;
      const compile = material.onBeforeCompile;
      material.onBeforeCompile = shader => { compile(shader); shader.uniforms.sandMap.value = maps.sand; };
      material.needsUpdate = true; textureStatus = 'ready'; return {loaded: 4, files: OCEAN_PRIMER_COAST_TEXTURES.map(item => item.file)};
    })();
    return texturePromise;
  };
  update(0);
  return { root, sun: waterRig.sun, ambient: waterRig.ambient, waterRig, update, cameraPose, loadTextures,
    sampleSurface: waterRig.sampleSurface,
    environmentAt: () => ({...waterRig.environmentAt(actualPose), location: '热带近岸海面 · 岩砂海岸与共用水体示意'}),
    diagnostics: () => ({type: 'original-surface-shared-water-teaching-scenery', seed, timeSec: current, globalTimeSec: globalTime, seaLevelM: 0,
      nearshoreDepthM: 8, referenceBoatLengthM: 14, referenceBoatPosition: boat.position.toArray(), birds: 7,
      surfaceMotion: 'shared-gpu-gerstner-displacement-analytic-normals-and-filtered-slope-variance',
      maximumSwellAmplitudeM: waterRig.diagnostics().maximumSwellAmplitudeM, swellComponents: PRIMER_WATER_WAVES.length,
      waterVertices: waterRig.diagnostics().waterVertices, coastVertices: bed.geometry.attributes.position.count,
      coastRepresentation: 'continuous-stratified-rock-and-sand-no-green-gaussian-hills', textures: {status: textureStatus, files: OCEAN_PRIMER_COAST_TEXTURES.map(item => item.file)},
      water: waterRig.diagnostics(), disposed, noEcologyStorage: true}),
    dispose() {
      if (disposed) return; disposed = true; root.removeFromParent(); root.clear(); waterRig.dispose();
      for (const resource of resources) resource.dispose(); resources.clear();
    } };
}
