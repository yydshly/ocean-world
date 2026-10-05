import * as THREE from 'three';

export const MEADOW_BEND_LIMIT = .05;

// The existing patch, terrain and physical crown stay authoritative. These
// buffers only ground its displayed shoots and orient them to the shared water.
export function meadowInstanceData(generator, water, element) {
  const c = Math.cos(element.rotation), s = Math.sin(element.rotation);
  const floor = (x, z) => generator.floorSurface(element.x + x * element.scale.x * c + z * element.scale.z * s,
    element.z - x * element.scale.x * s + z * element.scale.z * c).height;
  const ground = [[-.5, -.5], [.5, -.5], [-.5, .5], [.5, .5]]
    .map(([x,z]) => (floor(x,z) - element.y) / element.scale.y);
  const sampled = water.sample(element.x, element.z, { currentMps: .1 });
  const speed = sampled.currentMps, vector = sampled.currentVector;
  const direction = speed > 0 ? [vector.x / speed, vector.z / speed] : [1, 0];
  const flow = [direction[0] * c - direction[1] * s, direction[0] * s + direction[1] * c,
    speed / .1, ((element.x * .17 + element.z * .13) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2)];
  return { ground, flow };
}

export function meadowGroundOffset(rootX, rootZ, values) {
  const x = rootX + .5, z = rootZ + .5;
  return (values[0] * (1-x) + values[1] * x) * (1-z) + (values[2] * (1-x) + values[3] * x) * z;
}

export function meadowBend(flow, currentMps, timeSec, tip) {
  const strength = Math.min(1.2, Math.max(0, currentMps) * flow[2]) / 1.2;
  const amount = MEADOW_BEND_LIMIT * strength * (.82 + .18 * Math.sin(timeSec * .75 + flow[3])) * tip * tip;
  return [flow[0] * amount, flow[1] * amount];
}

export function createMeadowInstanceGeometry(prototype, elements, generator, water) {
  const geometry = new THREE.BufferGeometry();
  // Borrow immutable prototype arrays; own only the two small instance buffers.
  for (const [name, attribute] of Object.entries(prototype.attributes)) geometry.setAttribute(name, attribute);
  geometry.setIndex(prototype.index);
  const ground = new Float32Array(elements.length * 4), flow = new Float32Array(elements.length * 4);
  elements.forEach((element, index) => {
    const data = meadowInstanceData(generator, water, element);
    ground.set(data.ground, index * 4); flow.set(data.flow, index * 4);
  });
  geometry.setAttribute('meadowGround', new THREE.InstancedBufferAttribute(ground, 4));
  geometry.setAttribute('meadowFlow', new THREE.InstancedBufferAttribute(flow, 4));
  geometry.boundingBox = prototype.boundingBox.clone();
  geometry.boundingSphere = prototype.boundingSphere.clone();
  geometry.userData = { ...prototype.userData, meadowInstanceBuffers: true,
    groundingScope: 'four exact terrain probes; finite bilinear shoot-root approximation',
    currentScope: 'same coordinate water field; visual bending, no plant mechanics or biomass' };
  return geometry;
}

export function disposeMeadowInstanceGeometry(geometry) {
  // Do not dispose GPU buffers borrowed by the other active meadow owners.
  for (const name of Object.keys(geometry.attributes)) if (!['meadowGround','meadowFlow'].includes(name)) geometry.deleteAttribute(name);
  geometry.setIndex(null); geometry.dispose();
}

export const MEADOW_SHADER_DECLARATIONS = `
attribute vec2 rootXZ;
attribute vec4 meadowGround;
attribute vec4 meadowFlow;
uniform float oceanMeadowCurrent;
`;
export const MEADOW_SHADER_TRANSFORM = `
  vec2 meadowUV = rootXZ + vec2(0.5);
  float groundY = mix(mix(meadowGround.x, meadowGround.y, meadowUV.x),
    mix(meadowGround.z, meadowGround.w, meadowUV.x), meadowUV.y);
  // Uphill roots shorten to the old crown; downhill roots remain below it.
  transformed.y = groundY + position.y * (1.0 - max(0.0, groundY));
  float flowStrength = min(1.2, max(0.0, oceanMeadowCurrent) * meadowFlow.z) / 1.2;
  float flowPulse = 0.82 + 0.18 * sin(oceanGrassTime * 0.75 + meadowFlow.w);
  transformed.xz += meadowFlow.xy * 0.05 * flowStrength * flowPulse * position.y * position.y;
`;
