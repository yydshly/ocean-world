// A display-only shallow sediment layer. It changes neither the shared floor
// triangles nor substrate records, habitat supports, food or animal state.
export const OCEAN_SAND_SURFACE_VERSION = 1;
export const OCEAN_SAND_SURFACE_PERIOD_M = 512;
const BIN_M = 8;
const clamp = value => Math.max(0, Math.min(1, value));
const smooth = (a, b, value) => { const t = clamp((value - a) / (b - a)); return t * t * (3 - 2 * t); };
const wrap = value => ((value % OCEAN_SAND_SURFACE_PERIOD_M) + OCEAN_SAND_SURFACE_PERIOD_M) % OCEAN_SAND_SURFACE_PERIOD_M;

/** Small logical metre coordinates, never camera/modelMatrix coordinates.
 * Noise and wave periods match the 512 m wrap, including owner boundaries. */
export function oceanSandSurfaceCoordinates(positions, owner) {
  const [cx, cz] = owner.split(',').map(Number), phaseX = wrap(cx * 64), phaseZ = wrap(cz * 64);
  const result = new Float32Array(positions.length / 3 * 2);
  for (let i = 0; i < positions.length / 3; i++) {
    result[i * 2] = positions[i * 3] + phaseX;
    result[i * 2 + 1] = positions[i * 3 + 2] + phaseZ;
  }
  return result;
}

/** Conservative envelopes of actual hard instances, including neighbour
 * owners. This masks hidden floor and collars; it does not invent hard stock. */
export function createOceanSandHardCoverIndex(generator, chunk) {
  const bins = new Map(), visited = new Set();
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    for (const element of generator.chunk(chunk.cx + dx, chunk.cz + dz).elements) {
      if (!['rock', 'formation'].includes(element.kind) || visited.has(element.id)) continue;
      visited.add(element.id);
      const radius = Math.hypot(element.scale.x, element.scale.z) * .5 + 1;
      const entry = { x: element.x, z: element.z, sx: element.scale.x, sz: element.scale.z,
        cos: Math.cos(element.rotation), sin: Math.sin(element.rotation),
        margin: 2 / Math.min(element.scale.x, element.scale.z) };
      for (let bz = Math.floor((element.z - radius) / BIN_M); bz <= Math.floor((element.z + radius) / BIN_M); bz++) {
        for (let bx = Math.floor((element.x - radius) / BIN_M); bx <= Math.floor((element.x + radius) / BIN_M); bx++) {
          const key = `${bx},${bz}`;
          if (!bins.has(key)) bins.set(key, []);
          bins.get(key).push(entry);
        }
      }
    }
  }
  return bins;
}

export function oceanSandHardCover(bins, x, z) {
  let cover = 0;
  for (const rock of bins.get(`${Math.floor(x / BIN_M)},${Math.floor(z / BIN_M)}`) || []) {
    const dx = x - rock.x, dz = z - rock.z;
    const rx = (dx * rock.cos - dz * rock.sin) / rock.sx, rz = (dz * rock.cos + dx * rock.sin) / rock.sz;
    cover = Math.max(cover, 1 - smooth(1, 1 + rock.margin, 2 * Math.hypot(rx, rz)));
  }
  return cover;
}

/** Original hard-bottom labels are excluded even without a raised instance.
 * Grass/rubble channels are real generated envelopes, not potential cover. */
export function oceanSandSurfaceMask(sample, hardCover, rootEnvelope, rubbleCover, target = [0, 0, 0]) {
  const soft = sample.substrate === 'sand' ? 1 : sample.substrate === 'mixed'
    ? 1 - smooth(.30, .52, sample.rockiness || 0) : 0;
  target[0] = (sample.depthM <= 25 ? soft : 0) * (1 - clamp(hardCover));
  target[1] = clamp(rootEnvelope);
  target[2] = clamp(rubbleCover);
  return target;
}

const DECLARATIONS = `
varying vec2 vOceanSandPosition;
varying vec3 vOceanSandMask;
float oceanSandHash(vec2 cell, float period) {
  cell = mod(cell, period);
  vec3 p = fract(vec3(cell.xyx) * .1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float oceanSandNoise(vec2 point, float period) {
  vec2 cell = floor(point), f = fract(point);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(oceanSandHash(cell, period), oceanSandHash(cell + vec2(1,0), period), f.x),
    mix(oceanSandHash(cell + vec2(0,1), period), oceanSandHash(cell + vec2(1,1), period), f.x), f.y);
}
// Unparametrized height-gradient bump in view space. Raw position and height
// derivatives keep amplitude in metres and avoid a tangent/normal-map define.
vec3 oceanSandNormal(vec3 viewPoint, vec3 surfaceNormal, float height, float facing) {
  vec3 sigmaX = dFdx(viewPoint), sigmaY = dFdy(viewPoint);
  vec3 r1 = cross(sigmaY, surfaceNormal), r2 = cross(surfaceNormal, sigmaX);
  float determinant = dot(sigmaX, r1) * facing;
  vec3 gradient = sign(determinant) * (dFdx(height) * r1 + dFdy(height) * r2);
  return normalize(max(abs(determinant), 1.0e-20) * surfaceNormal - gradient);
}
`;

/** Chain the original caustic/material hooks; the returned function restores
 * them when this renderer resets to a different world profile. */
export function applyOceanSandSurface(material) {
  const previousCompile = material.onBeforeCompile, previousCacheKey = material.customProgramCacheKey;
  const previousDisplay = material.userData.sandSurface;
  material.userData.sandSurface = { version: OCEAN_SAND_SURFACE_VERSION, periodM: OCEAN_SAND_SURFACE_PERIOD_M,
    scope: 'shallow soft-bottom appearance; bed triangles, hard supports and ecology unchanged',
    coordinates: 'immutable logical owner metres; no camera or floating-origin dependence',
    extraTextures: 0, physicalRelief: false };
  material.onBeforeCompile = function (shader, renderer) {
    previousCompile.call(this, shader, renderer);
    shader.vertexShader = `attribute vec2 oceanSandPosition;
attribute vec3 oceanSandMask;
varying vec2 vOceanSandPosition;
varying vec3 vOceanSandMask;
` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vOceanSandPosition = oceanSandPosition;
      vOceanSandMask = oceanSandMask;`);
    shader.fragmentShader = DECLARATIONS + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec2 sandPoint = vOceanSandPosition;
      float sandBroad = oceanSandNoise(sandPoint * .0625, 32.0);
      float sandCoarse = clamp(smoothstep(.32, .78, sandBroad) * .72 + vOceanSandMask.z * .65, 0.0, 1.0);
      float sandExposed = clamp(vOceanSandMask.x * (1.0 - vOceanSandMask.y * .96), 0.0, 1.0);
      float sandFootprint = max(length(dFdx(sandPoint)), length(dFdy(sandPoint)));
      float sandWaveVisible = 1.0 - smoothstep(.09, .38, sandFootprint);
      float sandGrainVisible = 1.0 - smoothstep(.025, .15, sandFootprint);
      float sandGrain = oceanSandNoise(sandPoint * 4.0, 2048.0);
      float sandPhase = 6.28318530718 * (sandPoint.x * 1.75 + sandPoint.y * .375)
        + oceanSandNoise(sandPoint * .125, 64.0) * 2.4;
      float sandRipple = sin(sandPhase);
      float sandHeight = sandRipple * .012 * sandExposed * (1.0 - sandCoarse * .75) * sandWaveVisible;
      vec3 sandTone = mix(vec3(1.06, 1.035, .975), vec3(.87, .855, .815), sandCoarse);
      sandTone *= 1.0 + (sandGrain - .5) * .10 * sandGrainVisible + sandRipple * .025 * sandWaveVisible;
      diffuseColor.rgb *= mix(vec3(1.0), sandTone, sandExposed);`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, .96 + sandCoarse * .035, sandExposed);`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      // Evaluate all derivatives before selection: divergent fragment branches
      // must not evaluate derivatives only on the exposed side of a mask.
      vec3 sandNormal = oceanSandNormal(-vViewPosition, normal, sandHeight, faceDirection);
      normal = normalize(mix(normal, sandNormal, step(.001, sandExposed) * step(.001, sandWaveVisible)));`);
  };
  material.customProgramCacheKey = function () { return `${previousCacheKey.call(this)}/ocean-sand-surface-v${OCEAN_SAND_SURFACE_VERSION}`; };
  material.needsUpdate = true;
  return () => {
    material.onBeforeCompile = previousCompile;
    material.customProgramCacheKey = previousCacheKey;
    if (previousDisplay === undefined) delete material.userData.sandSurface;
    else material.userData.sandSurface = previousDisplay;
    material.needsUpdate = true;
  };
}
