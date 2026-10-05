import * as THREE from 'three';

const MAX_REGIONS = 9, MAX_PLANTS_PER_REGION = 32;
const ROLE = 'scenery-not-simulated-biomass';
const finite = value => Number.isFinite(value);

/** A metre-scale palm kelp outline: one woody stipe and six broad crown
 * blades. The whole animated prototype fits its declared radial envelope;
 * neither its vertex count nor its visual leaves represent tissue stock. */
function understoryGeometry() {
  const positions = [], colors = [], indices = [];
  const add = (x, y, z, color) => {
    const index = positions.length / 3;
    positions.push(x, y, z); colors.push(...color); return index;
  };
  const sides = 6, rows = 8;
  for (let row = 0; row <= rows; row++) {
    const fraction = row / rows, y = fraction * .63;
    const bend = .018 * fraction * fraction, radius = .028 - fraction * .008;
    for (let side = 0; side < sides; side++) {
      const angle = side * Math.PI * 2 / sides;
      add(bend + Math.cos(angle) * radius, y, Math.sin(angle) * radius, [.30, .25, .12]);
    }
  }
  for (let row = 0; row < rows; row++) for (let side = 0; side < sides; side++) {
    const a = row * sides + side, b = row * sides + (side + 1) % sides;
    indices.push(a, a + sides, b, b, a + sides, b + sides);
  }
  const base = add(0, 0, 0, [.30, .25, .12]);
  const crown = add(.018, .63, 0, [.30, .25, .12]);
  for (let side = 0; side < sides; side++) {
    indices.push(base, (side + 1) % sides, side);
    indices.push(crown, rows * sides + side, rows * sides + (side + 1) % sides);
  }
  for (let blade = 0; blade < 6; blade++) {
    const angle = blade * Math.PI / 3 + .13, dx = Math.cos(angle), dz = Math.sin(angle);
    const start = positions.length / 3;
    for (let row = 0; row <= 6; row++) {
      const u = row / 6, radius = .035 + .71 * u;
      const y = .63 + .27 * Math.sin(Math.PI * u * .90);
      const halfWidth = .084 * Math.sin(Math.PI * u) ** .7 + .001;
      for (const side of [-1, 0, 1]) {
        add(.018 + dx * radius - dz * halfWidth * side,
          y + (1 - Math.abs(side)) * .01 * Math.sin(Math.PI * u),
          dz * radius + dx * halfWidth * side,
          [.53 + blade % 2 * .035, .51 + blade % 3 * .012, .24]);
      }
    }
    for (let row = 0; row < 6; row++) for (let side = 0; side < 2; side++) {
      const a = start + row * 3 + side;
      indices.push(a, a + 3, a + 1, a + 1, a + 3, a + 4);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  // These are animation bounds, deliberately larger than the static shape.
  geometry.boundingBox = new THREE.Box3(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 1, 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, .5, 0), 1.5);
  return geometry;
}

function understoryMaterial() {
  const source = THREE.ShaderLib.standard, uniforms = THREE.UniformsUtils.clone(source.uniforms);
  uniforms.diffuse.value.setRGB(.89, .86, .72);
  uniforms.roughness.value = .91; uniforms.metalness.value = 0;
  uniforms.understoryTime = { value: 0 };
  uniforms.understoryFlow = { value: 0 };
  uniforms.understoryPhase = { value: 0 };
  const vertexShader = source.vertexShader
    .replace('#include <common>', `#include <common>
      uniform float understoryTime;
      uniform float understoryFlow;
      uniform float understoryPhase;`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        // Phase is derived from stable owner-local matrices, so rebasing
        // the root never changes an individual plant's deformation.
        float plantPhase = understoryPhase + instanceMatrix[3].x * .19 + instanceMatrix[3].z * .23
          + atan(-instanceMatrix[0].z, instanceMatrix[0].x);
        float taper = pow(clamp(position.y, 0.0, 1.0), 2.0);
        float flow = clamp(understoryFlow, 0.0, 1.2) / 1.2;
        vec2 sway = vec2(
          .044 * sin(understoryTime * .41 + plantPhase) + .014 * flow,
          .026 * sin(understoryTime * .29 + plantPhase * 1.17));
        // The maximum vector length is <.064 unit radii, with a fixed root.
        transformed.xz += sway * taper;
      #endif`);
  // ShaderMaterial explicitly uploads the three owner uniforms for each
  // draw while retaining one shared material and standard Three lighting.
  return new THREE.ShaderMaterial({
    name: 'Palm kelp understory', uniforms, vertexShader, fragmentShader: source.fragmentShader,
    defines: { STANDARD: '' }, lights: true, fog: true, vertexColors: true,
    side: THREE.DoubleSide,
  });
}

function validPlant(plant, regionId) {
  return typeof plant?.id === 'string' && plant.regionId === regionId && typeof plant.hostId === 'string' &&
    ['x', 'y', 'z', 'heightM', 'radiusM', 'phase'].every(key => finite(plant[key])) &&
    plant.heightM > 0 && plant.radiusM > 0;
}

/** Bounded scenery owned by the same loaded regions as the ecology. */
export class KelpUnderstory {
  constructor() {
    this.root = new THREE.Group(); this.root.name = 'Regional palm-kelp understory';
    Object.assign(this.root.userData, { oceanStreaming: true, role: ROLE, pickable: false });
    this.root.castShadow = false;
    this.geometry = understoryGeometry(); this.material = understoryMaterial();
    this.objects = new Map(); this.renderOrigin = { x: 0, z: 0 };
    this._transform = new THREE.Object3D(); this._disposed = false;
  }
  setRenderOrigin(origin) {
    if (this._disposed) return false;
    if (!finite(origin?.x) || !finite(origin?.z)) throw new TypeError('Understory render origin needs finite X/Z.');
    if (origin.x === this.renderOrigin.x && origin.z === this.renderOrigin.z) return false;
    this.renderOrigin = { x: origin.x, z: origin.z };
    this.root.position.set(-origin.x, 0, -origin.z); this.root.updateMatrixWorld(true); return true;
  }
  _remove(id) {
    const record = this.objects.get(id); if (!record) return;
    record.mesh.removeFromParent(); record.mesh.dispose(); this.objects.delete(id);
  }
  _load(region) {
    const plants = [], seen = new Set();
    for (const plant of region.understoryPlants ?? []) {
      if (plants.length >= MAX_PLANTS_PER_REGION) break;
      if (!validPlant(plant, region.id) || seen.has(plant.id)) continue;
      seen.add(plant.id); plants.push(plant);
    }
    if (!plants.length) return null;
    const mesh = new THREE.InstancedMesh(this.geometry, this.material, plants.length);
    mesh.name = `Palm-kelp understory ${region.id}`;
    Object.assign(mesh.userData, { oceanStreaming: true, role: ROLE, pickable: false,
      regionId: region.id, speciesId: 'pterygophora-californica-scenery', plantIds: plants.map(plant => plant.id) });
    mesh.castShadow = false; mesh.receiveShadow = true;
    // Owner-local instance translations stay precise during long exploration.
    const ox = finite(region.cx) ? region.cx * 64 : 0, oz = finite(region.cz) ? region.cz * 64 : 0;
    mesh.position.set(ox, 0, oz);
    for (let i = 0; i < plants.length; i++) {
      const plant = plants[i];
      this._transform.position.set(plant.x - ox, plant.y, plant.z - oz);
      this._transform.rotation.set(0, plant.phase, 0);
      this._transform.scale.set(plant.radiusM, plant.heightM, plant.radiusM);
      this._transform.updateMatrix(); mesh.setMatrixAt(i, this._transform.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox(); mesh.computeBoundingSphere();
    const record = { mesh, plantsRef: region.understoryPlants, timeSec: 0, flow: 0, phase: ox * .19 + oz * .23 };
    mesh.onBeforeRender = () => {
      this.material.uniforms.understoryTime.value = record.timeSec;
      this.material.uniforms.understoryFlow.value = record.flow;
      this.material.uniforms.understoryPhase.value = record.phase;
      this.material.uniformsNeedUpdate = true;
    };
    this.root.add(mesh); this.objects.set(region.id, record); return record;
  }
  update(regions, renderOrigin = this.renderOrigin) {
    if (this._disposed) return false;
    this.setRenderOrigin(renderOrigin);
    const selected = new Map();
    for (const region of regions ?? []) {
      if (selected.size >= MAX_REGIONS) break;
      if (typeof region?.id !== 'string' || !Array.isArray(region.understoryPlants) || selected.has(region.id)) continue;
      selected.set(region.id, region);
    }
    let changed = false;
    for (const id of this.objects.keys()) if (!selected.has(id)) { this._remove(id); changed = true; }
    for (const [id, region] of selected) {
      let record = this.objects.get(id);
      if (record && record.plantsRef !== region.understoryPlants) { this._remove(id); record = null; changed = true; }
      if (!record) { record = this._load(region); if (record) changed = true; }
      if (!record) continue;
      record.timeSec = finite(region.timeSec) ? region.timeSec : 0;
      record.flow = finite(region.localEnvironment?.currentMps) ? region.localEnvironment.currentMps : 0;
    }
    this.root.updateMatrixWorld(true); return changed;
  }
  get stats() {
    let plantCount = 0;
    for (const record of this.objects.values()) plantCount += record.mesh.count;
    return { activeRegions: this.objects.size, plantCount, drawCalls: this.objects.size,
      prototypeGeometries: this._disposed ? 0 : 1, prototypeMaterials: this._disposed ? 0 : 1,
      maxPlants: MAX_REGIONS * MAX_PLANTS_PER_REGION, maxActiveRegions: MAX_REGIONS,
      maxPlantsPerRegion: MAX_PLANTS_PER_REGION, role: ROLE, pickable: false,
      renderOrigin: { ...this.renderOrigin }, animationScope: 'regional-simulation-clock-bounded-display-sway' };
  }
  reset() { for (const id of [...this.objects.keys()]) this._remove(id); }
  dispose() {
    if (this._disposed) return;
    this.reset(); this._disposed = true; this.geometry.dispose(); this.material.dispose();
    this.root.clear(); this.root.removeFromParent();
  }
}
