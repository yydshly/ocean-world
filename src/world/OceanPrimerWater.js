import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { Refractor } from 'three/addons/objects/Refractor.js';

const TAU = Math.PI * 2, GRAVITY = 9.81;
const clamp = THREE.MathUtils.clamp;
const smooth = (a, b, value) => { const t = clamp((value - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const sunDirection = new THREE.Vector3(-.42, .52, -.73).normalize();
const windAngle = Math.atan2(.51, .86);
// A fixed, quiet wind-sea selection, inspired by directional wave spectra.
// No measured sea state, FFT, fluid solver or ecological forcing is inferred.
export const PRIMER_WATER_WAVES = Object.freeze([
  [.160, 52, 0], [.100, 32, .23], [.075, 20, -.29],
  [.045, 13, .12], [.027, 9, -.18], [.013, 6, .37],
].map(([amplitudeM, wavelengthM, offset], index) => {
  const k = TAU / wavelengthM, omega = Math.sqrt(GRAVITY * k * Math.tanh(k * 12));
  const angle = windAngle + offset;
  return Object.freeze({ amplitudeM, wavelengthM, periodSec: TAU / omega, k, omega,
    direction: Object.freeze([Math.cos(angle), Math.sin(angle)]), steepness: .24, phaseOffset: index * 1.71 });
}));
export const PRIMER_WATER_OPTICS = Object.freeze({
  absorptionRGB: Object.freeze([.135, .035, .016]), scatteringRGB: Object.freeze([.012, .018, .023]),
  refractiveIndex: 1.333, reflectionSize: 512, refractionSize: 512,
  status: 'RGB display approximation from wavelength-dependent water absorption; not measured site coefficients',
  references: Object.freeze([
    'https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-1-effective-water-simulation-physical-models',
    'https://doi.org/10.1111/j.1467-8659.2009.01618.x',
    'https://omlc.org/spectra/water/abs/pope97.html',
    'https://oceanservice.noaa.gov/facts/oceanblue.html',
  ]),
});

function seedPhase(seed) {
  if (!['number', 'string'].includes(typeof seed) || (typeof seed === 'number' && !Number.isFinite(seed)))
    throw new TypeError('Primer water seed must be finite or a string.');
  let hash = 2166136261;
  for (const character of `primer-water|${String(seed)}`) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4294967296 * TAU;
}
const validTime = time => {
  if (!Number.isFinite(time)) throw new TypeError('Primer water time must be finite seconds.');
  return Math.max(0, time);
};
function parametricWave(x, z, time, phase) {
  let px = x, pz = z, height = 0, jxx = 1, jxz = 0, jzz = 1, hx = 0, hz = 0;
  for (const wave of PRIMER_WATER_WAVES) {
    const [dx, dz] = wave.direction, angle = wave.k * (x * dx + z * dz) - wave.omega * time + phase + wave.phaseOffset;
    const sine = Math.sin(angle), cosine = Math.cos(angle), qa = wave.steepness * wave.amplitudeM;
    px += qa * dx * cosine; pz += qa * dz * cosine; height += wave.amplitudeM * sine;
    const shift = qa * wave.k * sine;
    jxx -= shift * dx * dx; jxz -= shift * dx * dz; jzz -= shift * dz * dz;
    hx += wave.amplitudeM * wave.k * dx * cosine; hz += wave.amplitudeM * wave.k * dz * cosine;
  }
  return { x: px, z: pz, height, jxx, jxz, jzz, hx, hz };
}

// Invert the horizontal Gerstner displacement: callers ask for an actual
// world-space water height, not the undeformed vertex parameter coordinate.
export function samplePrimerWaterSurface(x, z, timeSec, { seed = 55, seaLevelM = 0 } = {}) {
  if (![x, z, seaLevelM].every(Number.isFinite)) throw new TypeError('Primer water coordinates and sea level must be finite metres.');
  const time = validTime(timeSec), phase = seedPhase(seed);
  let qx = x, qz = z, state;
  for (let iteration = 0; iteration < 6; iteration++) {
    state = parametricWave(qx, qz, time, phase);
    const determinant = state.jxx * state.jzz - state.jxz * state.jxz;
    const ex = state.x - x, ez = state.z - z;
    qx -= (state.jzz * ex - state.jxz * ez) / determinant;
    qz -= (state.jxx * ez - state.jxz * ex) / determinant;
  }
  state = parametricWave(qx, qz, time, phase);
  const determinant = state.jxx * state.jzz - state.jxz * state.jxz;
  const gx = (state.hx * state.jzz - state.hz * state.jxz) / determinant;
  const gz = (state.hz * state.jxx - state.hx * state.jxz) / determinant;
  const inverseLength = 1 / Math.hypot(gx, 1, gz);
  return { heightM: seaLevelM + state.height, gradient: { x: gx, z: gz },
    normal: { x: -gx * inverseLength, y: inverseLength, z: -gz * inverseLength } };
}

export function primerCoastHeight(x, z, seed = 55) {
  if (![x, z].every(Number.isFinite)) throw new TypeError('Coast coordinates must be finite metres.');
  const phase = seedPhase(seed);
  const shoreline = 105 + 16 * Math.sin((z + 130) * .014 + phase) + 7 * Math.sin(z * .039 + 1.1);
  const inland = x - shoreline;
  if (inland < 0) return -8 + 8 * smooth(-82, 0, inland) + .10 * Math.sin(x * .19 + z * .13) * (1 - smooth(-35, 0, inland));
  const terrace = 13 * smooth(55, 125, inland) + 1.8 * (1 - Math.exp(-inland / 18));
  const strata = (1.2 * Math.sin(z * .074 + phase) + .65 * Math.sin(x * .22 + z * .11)) * smooth(8, 34, inland);
  const clefts = .85 * Math.abs(Math.sin(z * .135 + x * .04)) * smooth(10, 42, inland);
  return Math.min(42, inland * .080 + terrace + strata + clefts);
}

function waterGeometry(extentM) {
  const sectors = 160, radii = [];
  for (let r = 1; r <= 100; r++) radii.push(r);
  for (let i = 1; i <= 48; i++) radii.push(100 * (extentM / 100) ** (i / 48));
  const positions = [0, 0, 0], indices = [], normals = [0, 0, 1], spacing = [1];
  for (const radius of radii) for (let i = 0; i < sectors; i++) {
    const angle = i / sectors * TAU;
    positions.push(Math.cos(angle) * radius, Math.sin(angle) * radius, 0); normals.push(0, 0, 1);
    spacing.push(Math.max(1, radius * TAU / sectors));
  }
  for (let i = 0; i < sectors; i++) indices.push(0, 1 + i, 1 + (i + 1) % sectors);
  for (let ring = 0; ring < radii.length - 1; ring++) for (let i = 0; i < sectors; i++) {
    const a = 1 + ring * sectors + i, b = 1 + ring * sectors + (i + 1) % sectors, c = a + sectors, d = b + sectors;
    indices.push(a, c, b, b, c, d);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('primerSpacing', new THREE.Float32BufferAttribute(spacing, 1));
  geometry.setIndex(indices); geometry.computeBoundingSphere(); geometry.boundingSphere.radius += .6;
  return geometry;
}

const number = value => value.toFixed(10);
function waveGLSL() {
  return `
    uniform float time; uniform float primerPhase;
    void primerWave(vec2 q, float spacing, out vec3 displacement, out vec3 normal, out float unresolved) {
      displacement=vec3(0.0); vec3 tx=vec3(1.0,0.0,0.0); vec3 tz=vec3(0.0,0.0,1.0); unresolved=0.0;
      ${PRIMER_WATER_WAVES.map(w => `{
        vec2 d=vec2(${w.direction.map(number).join(',')});
        float theta=dot(q,d)*${number(w.k)}-time*${number(w.omega)}+primerPhase+${number(w.phaseOffset)};
        float keep=1.0-smoothstep(${number(w.wavelengthM / 4)},${number(w.wavelengthM / 2)},spacing);
        float a=${number(w.amplitudeM)},k=${number(w.k)},qa=a*${number(w.steepness)};
        float s=sin(theta),c=cos(theta);
        displacement+=keep*vec3(qa*d.x*c,a*s,qa*d.y*c);
        tx+=vec3(-qa*k*d.x*d.x*s,a*k*d.x*c,-qa*k*d.x*d.y*s);
        tz+=vec3(-qa*k*d.x*d.y*s,a*k*d.y*c,-qa*k*d.y*d.y*s);
        unresolved+=(1.0-keep)*a*a*k*k*.5;
      }`).join('\n')}
      normal=normalize(cross(tz,tx));
    }
  `;
}

const coastGLSL = `
  float band(float a,float b,float x){float v=clamp((x-a)/(b-a),0.0,1.0);return v*v*(3.0-2.0*v);}
  float primerCoast(vec2 p){
    float shoreline=105.0+16.0*sin((p.y+130.0)*.014+primerPhase)+7.0*sin(p.y*.039+1.1);
    float d=p.x-shoreline;
    if(d<0.0)return -8.0+8.0*band(-82.0,0.0,d)+.10*sin(p.x*.19+p.y*.13)*(1.0-band(-35.0,0.0,d));
    return min(42.0,d*.080+13.0*band(55.0,125.0,d)+1.8*(1.0-exp(-d/18.0))+
      (1.2*sin(p.y*.074+primerPhase)+.65*sin(p.x*.22+p.y*.11))*band(8.0,34.0,d)+
      .85*abs(sin(p.y*.135+p.x*.04))*band(10.0,42.0,d));
  }
`;

// Both the distant underwater background and the underside of the surface
// approach exactly this radiance along the same world-space viewing ray.
const underwaterRadianceGLSL = `
  vec3 primerVolumeRadiance(vec3 rayDirection,float rayDepthM,vec3 sourceLight){
    vec3 direction=normalize(rayDirection);
    float path=mix(30.0,9.0,smoothstep(-.25,.98,direction.y))+rayDepthM*.65;
    vec3 sigma=absorption+scattering;vec3 transmission=exp(-sigma*path);
    vec3 colour=sourceLight*(scattering/sigma)*(vec3(1.0)-transmission)*2.3;
    colour+=vec3(.19,.34,.42)*transmission*smoothstep(.24,.96,direction.y);
    return colour;
  }
`;

function waterMaterial(phase, nearshore, seaLevelM, reflectionMatrix, refractionMatrix, reflectionTexture, refractionTexture, volumeUniforms) {
  return new THREE.ShaderMaterial({ name: 'Primer shared spectral water', side: THREE.DoubleSide, transparent: false,
    uniforms: { time: { value: 0 }, primerPhase: { value: phase }, seaLevel: { value: seaLevelM }, nearshore: { value: nearshore ? 1 : 0 },
      reflectionMatrix: { value: reflectionMatrix }, refractionMatrix: { value: refractionMatrix },
      reflectionMap: { value: reflectionTexture }, refractionMap: { value: refractionTexture },
      absorption: { value: new THREE.Vector3(...PRIMER_WATER_OPTICS.absorptionRGB) },
      scattering: { value: new THREE.Vector3(...PRIMER_WATER_OPTICS.scatteringRGB) },
      observerDepth: volumeUniforms.depth, underwaterLightColour: volumeUniforms.lightColour,
      waterRadiance: { value: new THREE.Color('#0c7892') }, sunDirection: { value: sunDirection.clone() },
      viewer: { value: new THREE.Vector3() }, mediumBlend: { value: 0 }, hasReflection: { value: 0 } },
    vertexShader: `${waveGLSL()}
      uniform mat4 reflectionMatrix;uniform mat4 refractionMatrix;attribute float primerSpacing;
      varying vec3 vWorld;varying vec3 vNormal;varying vec4 vReflection;varying vec4 vRefraction;varying float vVariance;
      void main(){
        vec4 baseWorld=modelMatrix*vec4(position,1.0);vec3 move,n;float variance;
        primerWave(baseWorld.xz,primerSpacing,move,n,variance);vWorld=baseWorld.xyz+move;vNormal=n;vVariance=variance;
        vReflection=reflectionMatrix*vec4(position,1.0);vRefraction=refractionMatrix*vec4(position,1.0);
        gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.0);
      }`,
    fragmentShader: `${waveGLSL()} ${coastGLSL}
      uniform sampler2D reflectionMap;uniform sampler2D refractionMap;
      uniform vec3 absorption;uniform vec3 scattering;uniform vec3 waterRadiance;uniform vec3 sunDirection;uniform vec3 viewer;
      uniform float observerDepth;uniform vec3 underwaterLightColour;
      uniform float seaLevel;uniform float nearshore;uniform float mediumBlend;uniform float hasReflection;
      varying vec3 vWorld;varying vec3 vNormal;varying vec4 vReflection;varying vec4 vRefraction;varying float vVariance;
      ${underwaterRadianceGLSL}
      vec3 sky(vec3 d){return mix(vec3(.42,.58,.66),vec3(.11,.34,.52),pow(max(d.y,0.0),.45));}
      void main(){
        vec3 view=normalize(viewer-vWorld);float distanceToEye=length(viewer-vWorld);
        vec2 wind=vec2(.8602921,.5098011);
        float ripple=.024*cos(dot(vWorld.xz,wind)*8.5-time*4.0+primerPhase)+.014*cos(dot(vWorld.xz,vec2(.68,.73))*15.4-time*6.5);
        float ripple2=.018*sin(dot(vWorld.xz,wind)*11.2-time*4.9)+.012*sin(dot(vWorld.xz,vec2(.91,.41))*22.4-time*7.2+primerPhase);
        float micro=1.0-smoothstep(12.0,110.0,distanceToEye);
        vec3 n=normalize(vNormal+vec3(ripple,0.0,ripple2)*micro);float ndv=max(abs(dot(n,view)),.015);
        float fresnel=.02037+.97963*pow(1.0-ndv,5.0);
        vec2 reflectionUv=vReflection.xy/vReflection.w,refractionUv=vRefraction.xy/vRefraction.w;
        vec2 distortion=n.xz*.018/ndv;float rough=.002+sqrt(max(vVariance,0.0))*.06+smoothstep(14.0,240.0,distanceToEye)*.009;
        vec3 reflected=texture2D(reflectionMap,clamp(reflectionUv+distortion,vec2(.002),vec2(.998))).rgb*.40;
        reflected+=texture2D(reflectionMap,clamp(reflectionUv+distortion+vec2(rough,0.0),vec2(.002),vec2(.998))).rgb*.15;
        reflected+=texture2D(reflectionMap,clamp(reflectionUv+distortion-vec2(rough,0.0),vec2(.002),vec2(.998))).rgb*.15;
        reflected+=texture2D(reflectionMap,clamp(reflectionUv+distortion+vec2(0.0,rough),vec2(.002),vec2(.998))).rgb*.15;
        reflected+=texture2D(reflectionMap,clamp(reflectionUv+distortion-vec2(0.0,rough),vec2(.002),vec2(.998))).rgb*.15;
        reflected=mix(sky(reflect(-view,n)),reflected,hasReflection);
        float waterDepth=mix(85.0,max(0.0,seaLevel-primerCoast(vWorld.xz)),nearshore);
        float path=min(160.0,waterDepth/ndv);vec3 sigma=absorption+scattering;
        vec3 transmittance=exp(-sigma*path);
        vec3 refracted=texture2D(refractionMap,clamp(refractionUv-distortion*.6,vec2(.002),vec2(.998))).rgb;
        vec3 underwater=refracted*transmittance+waterRadiance*(vec3(1.0)-transmittance);
        float sunGlint=pow(max(dot(reflect(-sunDirection,n),view),0.0),mix(95.0,28.0,smoothstep(20.0,180.0,distanceToEye)));
        vec3 colour=mix(underwater,reflected,fresnel)+vec3(1.0,.91,.75)*sunGlint*.32;
        float shoreFoam=nearshore*(1.0-smoothstep(.20,1.35,waterDepth))*smoothstep(.15,.55,.5+.5*sin(dot(vWorld.xz,wind)*2.8-time*2.1));
        colour=mix(colour,vec3(.66,.72,.66),shoreFoam*.22);
        if(mediumBlend>.5){
          float totalReflection=step(1.0,1.333*1.333*(1.0-ndv*ndv));
          vec3 belowReflection=primerVolumeRadiance(reflect(-view,-n),observerDepth,underwaterLightColour);
          vec3 through=sky(refract(-view,-n,1.333));
          vec3 surfaceColour=mix(through,belowReflection,max(fresnel,totalReflection));
          vec3 volumeColour=primerVolumeRadiance(-view,observerDepth,underwaterLightColour);
          vec3 rayTransmission=exp(-sigma*distanceToEye);
          colour=surfaceColour*rayTransmission+volumeColour*(vec3(1.0)-rayTransmission);
        }
        gl_FragColor=vec4(colour,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` });
}

function positionOf(cameraOrPose, result) {
  if (cameraOrPose?.isCamera) cameraOrPose.getWorldPosition(result);
  else if (cameraOrPose?.position) result.set(cameraOrPose.position.x, cameraOrPose.position.y, cameraOrPose.position.z);
  else if (cameraOrPose) result.set(cameraOrPose.x, cameraOrPose.y, cameraOrPose.z);
  else throw new TypeError('Primer water update requires an actual camera or position-bearing pose.');
  if (![result.x, result.y, result.z].every(Number.isFinite)) throw new TypeError('Primer water observer must have finite coordinates.');
  return result;
}

export function createPrimerWater(scene, { seed = 55, seaLevelM = 0, extentM = 1600, nearshore = false, underwaterOnly = false } = {}) {
  if (!scene?.isScene) throw new TypeError('Primer water requires a Three.js Scene.');
  if (!Number.isFinite(seaLevelM) || !Number.isFinite(extentM) || extentM < 100 || extentM > 2400) throw new TypeError('Primer water extent must be 100–2400 metres and sea level finite.');
  const phase = seedPhase(seed), resources = new Set(), own = value => (resources.add(value), value);
  const previousBackground = scene.background, previousFog = scene.fog;
  const root = new THREE.Group(); root.name = 'Primer shared water and atmosphere'; scene.add(root);
  const sky = new Sky(); own(sky.geometry); own(sky.material); sky.scale.setScalar(6000); root.add(sky);
  sky.material.uniforms.turbidity.value = 2.7; sky.material.uniforms.rayleigh.value = 1.65;
  sky.material.uniforms.mieCoefficient.value = .003; sky.material.uniforms.mieDirectionalG.value = .8;
  sky.material.uniforms.sunPosition.value.copy(sunDirection).multiplyScalar(1000);
  const sun = new THREE.DirectionalLight('#fff2d7', 2.35); sun.position.copy(sunDirection).multiplyScalar(250); root.add(sun, sun.target);
  sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, {left: -22, right: 22, top: 20, bottom: -20, near: 1, far: 320});
  sun.shadow.bias = -.00025; sun.shadow.normalBias = .035;
  const ambient = new THREE.HemisphereLight('#b4d6df', '#1a3235', .75); root.add(ambient);
  const volumeMaterial = own(new THREE.ShaderMaterial({ name: 'Primer wavelength-dependent water volume', side: THREE.BackSide, depthWrite: false, transparent: true,
    uniforms: { depth: { value: 0 }, blend: { value: 0 }, absorption: { value: new THREE.Vector3(...PRIMER_WATER_OPTICS.absorptionRGB) },
      scattering: { value: new THREE.Vector3(...PRIMER_WATER_OPTICS.scatteringRGB) }, lightColour: { value: new THREE.Color('#7cbed0') } },
    // Background direction only: its radius must not intersect a chapter's
    // far plane (the existing shallow camera has a 180 metre far distance).
    vertexShader: 'varying vec3 d;void main(){d=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);gl_Position.z=gl_Position.w;}',
    fragmentShader: `uniform float depth;uniform float blend;uniform vec3 absorption;uniform vec3 scattering;uniform vec3 lightColour;varying vec3 d;
      ${underwaterRadianceGLSL}
      void main(){vec3 colour=primerVolumeRadiance(d,depth,lightColour);
        gl_FragColor=vec4(colour,blend);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` }));
  const volume = new THREE.Mesh(own(new THREE.SphereGeometry(200, 24, 16)), volumeMaterial); volume.renderOrder = -4;
  volume.name = 'Primer shared underwater absorption and scattering'; root.add(volume);
  const underwaterBackground = new THREE.Color('#15566b'), airBackground = new THREE.Color('#8cb8ce');
  const airFog = new THREE.FogExp2('#b2c8d2', .00055), underwaterFog = new THREE.FogExp2('#15566b', .016);
  const displayBackground = airBackground.clone(), displayFog = airFog.clone();
  const observer = new THREE.Vector3(0, seaLevelM + 5, 0);
  let water = null, reflector = null, refractor = null, disposed = false, time = 0, env = null, rendering = false, reflectionPasses = 0, refractionPasses = 0;
  if (!underwaterOnly) {
    const geometry = own(waterGeometry(extentM));
    reflector = new Reflector(geometry, {textureWidth: 512, textureHeight: 512, clipBias: .003});
    refractor = new Refractor(geometry, {textureWidth: 512, textureHeight: 512, clipBias: .003});
    for (const auxiliary of [reflector, refractor]) { own(auxiliary.material); own(auxiliary.getRenderTarget()); }
    const material = own(waterMaterial(phase, nearshore, seaLevelM, reflector.material.uniforms.textureMatrix.value,
      refractor.material.uniforms.textureMatrix.value, reflector.getRenderTarget().texture, refractor.getRenderTarget().texture, volumeMaterial.uniforms));
    water = new THREE.Mesh(geometry, material); water.isWater = true; water.name = 'Primer gentle swells and fine surface ripples';
    water.rotation.x = -Math.PI / 2; water.position.y = seaLevelM; root.add(water);
    water.onBeforeRender = (renderer, renderedScene, camera) => {
      if (disposed || rendering || env?.underwater) return;
      rendering = true; water.visible = false;
      reflector.matrixWorld.copy(water.matrixWorld); refractor.matrixWorld.copy(water.matrixWorld);
      const oldFog = scene.fog, oldSkyVisible = sky.visible, oldVolumeVisible = volume.visible;
      const oldTarget = renderer.getRenderTarget(), oldXr = renderer.xr.enabled, oldShadow = renderer.shadowMap.autoUpdate;
      const oldVolumeBlend = volumeMaterial.uniforms.blend.value;
      try {
        reflector.onBeforeRender(renderer, renderedScene, camera); reflectionPasses++;
        scene.fog = underwaterFog; sky.visible = false; volume.visible = true; volumeMaterial.uniforms.blend.value = 1;
        refractor.onBeforeRender(renderer, renderedScene, camera); refractionPasses++;
        material.uniforms.hasReflection.value = 1;
      } finally {
        scene.fog = oldFog; sky.visible = oldSkyVisible; volume.visible = oldVolumeVisible;
        volumeMaterial.uniforms.blend.value = oldVolumeBlend;
        renderer.xr.enabled = oldXr; renderer.shadowMap.autoUpdate = oldShadow; renderer.setRenderTarget(oldTarget);
        water.visible = true; rendering = false;
      }
    };
  }
  const sampleSurface = (x, z, at = time) => samplePrimerWaterSurface(x, z, at, {seed, seaLevelM});
  const environmentAt = position => {
    const p = positionOf(position, new THREE.Vector3()), surface = sampleSurface(p.x, p.z), signedDepth = surface.heightM - p.y;
    const depthM = Math.max(0, signedDepth), mediumBlend = underwaterOnly ? 1 : smooth(-.12, .22, signedDepth);
    const transmission = PRIMER_WATER_OPTICS.absorptionRGB.map((a, i) => Math.exp(-(a + PRIMER_WATER_OPTICS.scatteringRGB[i]) * depthM));
    return { depthM, underwater: underwaterOnly || signedDepth > 0, mediumBlend, seaLevelM, surfaceY: surface.heightM,
      background: mediumBlend > .5 ? '#15566b' : '#8cb8ce', fogColor: mediumBlend > .5 ? '#15566b' : '#b2c8d2',
      fogDensity: THREE.MathUtils.lerp(.00055, nearshore ? .021 : .016, mediumBlend),
      sunIntensity: 2.35 * Math.sqrt((transmission[0] + transmission[1] + transmission[2]) / 3),
      skyIntensity: .75 * Math.sqrt(transmission[2]), sunDirection: sunDirection.toArray(), transmissionRGB: transmission,
      naturalLight: (transmission[0] + transmission[1] + transmission[2]) / 3,
      lighting: 'shared sunlight with RGB absorption and scattering; illustrative water conditions',
      waterOptics: PRIMER_WATER_OPTICS };
  };
  const update = (timeSec, cameraOrPose) => {
    if (disposed) return false;
    time = validTime(timeSec); positionOf(cameraOrPose, observer); env = environmentAt(observer);
    sky.visible = !underwaterOnly && env.mediumBlend < 1; sky.position.copy(observer);
    volume.visible = underwaterOnly || env.mediumBlend > .001; volume.position.copy(observer);
    volumeMaterial.uniforms.depth.value = env.depthM; volumeMaterial.uniforms.blend.value = env.mediumBlend;
    volumeMaterial.uniforms.lightColour.value.setRGB(...env.transmissionRGB).multiply(new THREE.Color('#7cbed0'));
    sun.intensity = env.sunIntensity; ambient.intensity = env.skyIntensity;
    sun.color.setRGB(...env.transmissionRGB).multiply(new THREE.Color('#fff2d7'));
    sun.position.copy(observer).addScaledVector(sunDirection, 250); sun.target.position.copy(observer); sun.target.updateMatrixWorld();
    ambient.color.setRGB(.62 * env.transmissionRGB[0], .79 * env.transmissionRGB[1], env.transmissionRGB[2]);
    underwaterFog.density = nearshore ? .021 : .016;
    displayBackground.copy(airBackground).lerp(underwaterBackground, env.mediumBlend);
    displayFog.color.copy(airFog.color).lerp(underwaterFog.color, env.mediumBlend); displayFog.density = env.fogDensity;
    scene.background = displayBackground; scene.fog = displayFog;
    if (water) {
      water.material.uniforms.time.value = time; water.material.uniforms.viewer.value.copy(observer); water.material.uniforms.mediumBlend.value = env.mediumBlend;
    }
    root.updateMatrixWorld(true); return true;
  };
  update(0, {position: observer});
  return { root, sun, ambient, update, sampleSurface, environmentAt,
    diagnostics: () => ({ type: 'shared-primer-water-v1', seed, timeSec: time, seaLevelM, extentM, nearshore, underwaterOnly,
      disposed, depthM: env?.depthM, mediumBlend: env?.mediumBlend, macroWaves: PRIMER_WATER_WAVES.length,
      maximumSwellAmplitudeM: PRIMER_WATER_WAVES.reduce((sum, w) => sum + w.amplitudeM, 0),
      waterVertices: water?.geometry.attributes.position.count ?? 0, renderTargets: underwaterOnly ? 0 : 2,
      reflectionSize: underwaterOnly ? 0 : 512, refractionSize: underwaterOnly ? 0 : 512,
      reflectionPasses, refractionPasses, ownedResources: resources.size, noEcologicalForcing: true, optics: PRIMER_WATER_OPTICS,
      coordinateStatus: 'metres; shared global time and world-space phase; near-far geometry filters retain normal and slope variance' }),
    dispose() {
      if (disposed) return; disposed = true; root.removeFromParent(); root.clear();
      for (const resource of resources) resource.dispose(); resources.clear(); sun.shadow.dispose();
      if (scene.background === displayBackground) scene.background = previousBackground;
      if (scene.fog === displayFog) scene.fog = previousFog;
    } };
}
