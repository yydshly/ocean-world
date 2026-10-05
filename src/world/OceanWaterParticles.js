import * as THREE from 'three';

const PARTICLE_COUNT = 240;
const HALF_WIDTH_M = 12;
const HALF_HEIGHT_M = 5;
const WATER_MARGIN_M = .04;
const clamp01 = value => THREE.MathUtils.clamp(value, 0, 1);
const wrap = value => ((value + HALF_WIDTH_M) % (HALF_WIDTH_M * 2) + HALF_WIDTH_M * 2) %
  (HALF_WIDTH_M * 2) - HALF_WIDTH_M;

function seedValue(seed) {
  if ((typeof seed !== 'string' && typeof seed !== 'number') || (typeof seed === 'number' && !Number.isFinite(seed))) {
    throw new TypeError('Water particle seed must be a string or finite number.');
  }
  let value = 2166136261;
  for (const character of `${typeof seed}:${seed}`) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  return value >>> 0;
}

/** A fixed display volume, not biomass, sediment transport or resuspension.
 * Positions are camera-local; cameraPosition is in logical world coordinates.
 * Drift uses wall seconds supplied by the caller and freezes while paused. */
export class OceanWaterParticles {
  constructor(scene, { seed = 42, surfaceY = 8 } = {}) {
    if (!scene?.add) throw new TypeError('Water particles require a Three.js scene.');
    if (!Number.isFinite(surfaceY)) throw new TypeError('Water surface height must be finite.');
    seedValue(seed);
    this.surfaceY = surfaceY;
    this._disposed = false;
    this._clockSec = 0;
    this._drift = { x: 0, z: 0 };
    this._currentVector = { x: 0, z: 0 };
    this._cameraPosition = { x: 0, y: 0, z: 0 };
    this._renderOrigin = { x: 0, z: 0 };
    this._uniforms = {
      drift: { value: new THREE.Vector2() },
      cameraY: { value: 0 },
      floorY: { value: -22 },
      surfaceY: { value: surfaceY },
      turbidity: { value: .25 },
      lightAtDepth: { value: .6 },
      blend: { value: 1 },
    };
    this._geometry = new THREE.BufferGeometry();
    this._geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PARTICLE_COUNT * 3), 3));
    this._geometry.setAttribute('pointScale', new THREE.BufferAttribute(new Float32Array(PARTICLE_COUNT), 1));
    this._material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      toneMapped: false,
      uniforms: this._uniforms,
      vertexShader: `
        uniform vec2 drift;
        uniform float cameraY;
        uniform float floorY;
        uniform float surfaceY;
        attribute float pointScale;
        varying float waterVisible;
        varying float viewDistance;
        void main() {
          vec3 p = position;
          p.xz = mod(p.xz + drift + vec2(${HALF_WIDTH_M}.0), vec2(${HALF_WIDTH_M * 2}.0)) - vec2(${HALF_WIDTH_M}.0);
          float worldY = cameraY + p.y;
          waterVisible = step(floorY + ${WATER_MARGIN_M}, worldY) * step(worldY, surfaceY - ${WATER_MARGIN_M});
          vec4 viewPosition = modelViewMatrix * vec4(p, 1.0);
          viewDistance = length(viewPosition.xyz);
          gl_PointSize = clamp(pointScale * 9.0 / max(0.6, -viewPosition.z), 0.65, 2.1);
          gl_Position = projectionMatrix * viewPosition;
        }`,
      fragmentShader: `
        uniform float turbidity;
        uniform float lightAtDepth;
        uniform float blend;
        varying float waterVisible;
        varying float viewDistance;
        void main() {
          float radius = length(gl_PointCoord - vec2(0.5));
          if (radius >= 0.5 || waterVisible < 0.5 || blend <= 0.0) discard;
          float edge = 1.0 - smoothstep(0.12, 0.5, radius);
          float depthFade = exp(-viewDistance * (0.035 + turbidity * 0.035));
          float opacity = (0.018 + turbidity * 0.072) * (0.2 + lightAtDepth * 0.8) * edge * depthFade * blend;
          vec3 color = vec3(0.62, 0.77, 0.74) * (0.35 + 0.65 * lightAtDepth);
          gl_FragColor = vec4(color, opacity);
          #include <colorspace_fragment>
        }`,
    });
    this.root = new THREE.Points(this._geometry, this._material);
    this.root.name = 'camera-local-ocean-water-particles';
    this.root.userData.oceanStreaming = true;
    this.root.userData.role = 'display-only-water-particles';
    this.root.frustumCulled = false;
    scene.add(this.root);
    this.reset(seed);
  }

  reset(seed = this.seed) {
    if (this._disposed) return false;
    let randomState = seedValue(seed);
    const random = () => {
      randomState += 0x6D2B79F5;
      let value = randomState;
      value = Math.imul(value ^ value >>> 15, value | 1);
      value ^= value + Math.imul(value ^ value >>> 7, value | 61);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
    const positions = this._geometry.attributes.position, sizes = this._geometry.attributes.pointScale;
    for (let index = 0; index < PARTICLE_COUNT; index++) {
      positions.setXYZ(index, (random() * 2 - 1) * HALF_WIDTH_M, (random() * 2 - 1) * HALF_HEIGHT_M,
        (random() * 2 - 1) * HALF_WIDTH_M);
      sizes.setX(index, .75 + random() * .5);
    }
    positions.needsUpdate = true;
    sizes.needsUpdate = true;
    this._geometry.computeBoundingBox();
    this._geometry.computeBoundingSphere();
    this.seed = seed;
    this._clockSec = 0;
    this._drift.x = this._drift.z = 0;
    this._currentVector.x = this._currentVector.z = 0;
    this._uniforms.drift.value.set(0, 0);
    return true;
  }

  update({ cameraPosition, renderOrigin = { x: 0, z: 0 }, dtSec = 0, paused = false,
    currentVector = { x: 0, z: 0 }, turbidity = .25, lightAtDepth = .6, floorY = -22, blend = 1 } = {}) {
    if (this._disposed) return false;
    if (![cameraPosition?.x, cameraPosition?.y, cameraPosition?.z, renderOrigin.x, renderOrigin.z].every(Number.isFinite)) {
      throw new TypeError('Particle camera and render origin must contain finite world coordinates.');
    }
    this._cameraPosition.x = cameraPosition.x;
    this._cameraPosition.y = cameraPosition.y;
    this._cameraPosition.z = cameraPosition.z;
    this._renderOrigin.x = renderOrigin.x;
    this._renderOrigin.z = renderOrigin.z;
    this.root.position.set(cameraPosition.x - renderOrigin.x, cameraPosition.y, cameraPosition.z - renderOrigin.z);
    this._currentVector.x = Number.isFinite(currentVector.x) ? currentVector.x : 0;
    this._currentVector.z = Number.isFinite(currentVector.z) ? currentVector.z : 0;
    const elapsed = !paused && Number.isFinite(dtSec) ? Math.max(0, dtSec) : 0;
    this._clockSec += elapsed;
    this._drift.x = wrap(this._drift.x + this._currentVector.x * elapsed);
    this._drift.z = wrap(this._drift.z + this._currentVector.z * elapsed);
    this._uniforms.drift.value.set(this._drift.x, this._drift.z);
    this._uniforms.cameraY.value = cameraPosition.y;
    this._uniforms.floorY.value = Number.isFinite(floorY) ? floorY : -22;
    this._uniforms.turbidity.value = Number.isFinite(turbidity) ? clamp01(turbidity) : .25;
    this._uniforms.lightAtDepth.value = Number.isFinite(lightAtDepth) ? clamp01(lightAtDepth) : .6;
    this._uniforms.blend.value = Number.isFinite(blend) ? clamp01(blend) : 1;
    return true;
  }

  get stats() {
    return {
      scope: 'display-only; not biomass or sediment resuspension',
      seed: this.seed,
      particleCount: PARTICLE_COUNT,
      geometryCount: this._disposed ? 0 : 1,
      materialCount: this._disposed ? 0 : 1,
      textureCount: 0,
      maxDrawCalls: 1,
      clockSec: this._clockSec,
      drift: { ...this._drift },
      currentVector: { ...this._currentVector },
      cameraPosition: { ...this._cameraPosition },
      renderOrigin: { ...this._renderOrigin },
      visible: this.root.visible && !this._disposed,
      clipping: { minY: this._uniforms.floorY.value + WATER_MARGIN_M, maxY: this.surfaceY - WATER_MARGIN_M },
      turbidity: this._uniforms.turbidity.value,
      lightAtDepth: this._uniforms.lightAtDepth.value,
      blend: this._uniforms.blend.value,
    };
  }

  dispose() {
    if (this._disposed) return;
    this._geometry.dispose();
    this._material.dispose();
    this.root.removeFromParent();
    this.root.visible = false;
    this._disposed = true;
  }
}
