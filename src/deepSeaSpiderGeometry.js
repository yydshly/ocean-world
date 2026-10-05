// Colossendeis genus proxy. All lengths below are fractions of the maximum
// rest foot span, not the tiny trunk's length. These are authored references,
// not measurements or full articulated-body collision geometry.
export const DEEP_SEA_SPIDER_SPECIES_ID = 'giant-sea-spider-group';
export const SEA_SPIDER_BODY_LOCAL = Object.freeze({ x: 0, y: .11, z: 0 });
export const SEA_SPIDER_PROBOSCIS_BASE_LOCAL = Object.freeze({ x: .085, y: .11, z: 0 });
export const SEA_SPIDER_MOUTH_LOCAL = Object.freeze({ x: .32, y: .07, z: 0 });
export const DEEP_SEA_SPIDER_CONTACTS_LOCAL = Object.freeze(
  [28, 69, 111, 152].flatMap((degrees, pair) => [-1, 1].map(side => {
    const angle = degrees * Math.PI / 180;
    return Object.freeze({ x: Math.cos(angle) * .5, y: 0, z: Math.sin(angle) * .5 * side, pair, side });
  })),
);
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

export function seaSpiderLocalToWorld(agent, point) {
  const size = Math.max(.001, finite(agent?.sizeM, .3));
  const c = Math.cos(finite(agent?.heading)), s = Math.sin(finite(agent?.heading));
  return { x: finite(agent?.position?.x) + size * (point.x * c - point.z * s),
    y: finite(agent?.position?.y) + size * point.y,
    z: finite(agent?.position?.z) + size * (point.x * s + point.z * c) };
}

export function seaSpiderMouthWorld(agent) { return seaSpiderLocalToWorld(agent, SEA_SPIDER_MOUTH_LOCAL); }

export function seaSpiderReferencePose(agent, supportHeight) {
  const size = Math.max(.001, finite(agent?.sizeM, .3));
  const supplied = Array.isArray(agent?.contactPointsLocal) && agent.contactPointsLocal.length === 8
    ? agent.contactPointsLocal : null;
  const contacts = DEEP_SEA_SPIDER_CONTACTS_LOCAL.map((rest, index) => {
    const original = supplied?.[index];
    const point = { x: finite(original?.x, rest.x), y: finite(original?.y, rest.y), z: finite(original?.z, rest.z) };
    if (!supplied && typeof supportHeight === 'function') {
      const world = seaSpiderLocalToWorld(agent, point);
      point.y = (supportHeight(world.x, world.z) - finite(agent?.position?.y)) / size;
    }
    return point;
  });
  const legsLocal = contacts.map((foot, index) => {
    const rest = DEEP_SEA_SPIDER_CONTACTS_LOCAL[index];
    const hip = { x: .075 - rest.pair * .05, y: SEA_SPIDER_BODY_LOCAL.y, z: rest.side * .022 };
    const section = (along, height) => ({ x: hip.x + (foot.x - hip.x) * along,
      y: Math.max(height, foot.y + .035), z: hip.z + (foot.z - hip.z) * along });
    return [hip, section(.26, .19), section(.65, .17), section(.91, .052), { ...foot }];
  });
  return { contactPointsLocal: contacts, contactReferencesLocal: contacts,
    feetWorld: contacts.map(point => seaSpiderLocalToWorld(agent, point)), legsLocal,
    bodyLocal: { ...SEA_SPIDER_BODY_LOCAL }, bodyWorld: seaSpiderLocalToWorld(agent, SEA_SPIDER_BODY_LOCAL),
    mouthLocal: { ...SEA_SPIDER_MOUTH_LOCAL }, mouthWorld: seaSpiderMouthWorld(agent) };
}

// Sixteen actual outer-tip vertices captured from the unchanged canonical
// deepOrganisms.js liponema/representative-v1 Float32 template. They are a
// finite low-side contact proxy, not a bounding sphere or the whole crown.
// Each point is ring 4 / side 0 of its existing five-ring/six-sided tentacle.
export const ANEMONE_TENTACLE_REFERENCES_LOCAL = Object.freeze([
  [100, .1609896719455719, .23953117430210114, .46269428730010986],
  [103, -.27719181776046753, .22765251994132996, .42132872343063354],
  [105, .39695754647254944, .21934735774993896, .3140624761581421],
  [108, -.007211161311715841, .20828856527805328, .4675532877445221],
  [110, .4910157322883606, .1992051899433136, .05066188424825668],
  [113, .26867222785949707, .18532462418079376, .43697863817214966],
  [116, -.17647387087345123, .17461398243904114, .4612289071083069],
  [119, -.4508306384086609, .1655142605304718, .13384921848773956],
  [122, -.39516574144363403, .1504114270210266, -.2869170904159546],
  [124, -.3078981339931488, .14565196633338928, .3541087210178375],
  [127, -.5030222535133362, .12554781138896942, -.031025731936097145],
  [129, -.07355623692274094, .11860736459493637, .48971647024154663],
  [132, -.4025481641292572, .11472012102603912, .22248928248882294],
  [133, .14318165183067322, .11344974488019943, -.4261450469493866],
  [134, .1838025599718094, .10812367498874664, .4144654870033264],
  [135, -.43465524911880493, .09740333259105682, -.18975378572940826],
].map(([tentacleIndex, x, y, z]) => Object.freeze({ tentacleIndex, x, y, z, along: 1 })));

export function deepAgentStablePhase(id = '') {
  let hash = 2166136261;
  for (const char of String(id)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4294967296 * Math.PI * 2;
}

export function anemoneTentacleReferences(agent, timeSec = agent?.timeSec ?? 0, environment = agent?.localEnvironment ?? {}) {
  const t = finite(timeSec), phase = finite(agent?.phase, deepAgentStablePhase(agent?.id));
  const input = environment?.currentMps ?? 0;
  let worldX = typeof input === 'number' ? finite(input) : finite(input?.x);
  let worldY = typeof input === 'number' ? 0 : finite(input?.y);
  let worldZ = typeof input === 'number' ? 0 : finite(input?.z);
  const speed = Math.hypot(worldX, worldY, worldZ);
  if (speed > .5) { worldX *= .5 / speed; worldY *= .5 / speed; worldZ *= .5 / speed; }
  const c = Math.cos(finite(agent?.heading)), s = Math.sin(finite(agent?.heading));
  const flowX = clamp((worldX * c + worldZ * s) / .08, -1, 1);
  const flowZ = clamp((-worldX * s + worldZ * c) / .08, -1, 1);
  const nested = typeof agent?.state === 'object' && agent.state ? agent.state : {};
  const state = String(typeof agent?.state === 'string' ? agent.state : nested.name ?? '').toLowerCase();
  const eventTime = agent?.lastFeedAt ?? nested.lastFeedAt;
  const age = t - eventTime;
  const feeding = Number.isFinite(eventTime) && age >= 0 && age <= 5 ? Math.sin(age / 5 * Math.PI) ** 2 : 0;
  const contraction = clamp(finite(agent?.contraction, finite(nested.contraction, /retract|contract/.test(state) ? .8 : 0)), 0, 1);
  return ANEMONE_TENTACLE_REFERENCES_LOCAL.map(rest => {
    const id = rest.tentacleIndex;
    const sway = Math.sin(t * .48 + phase + id * .37) * .20 + .80;
    const active = Math.abs(Math.sin(id * .61 + finite(eventTime) * .21)) > .90 ? feeding : 0;
    const width = 1 - contraction * .33 - active * .050;
    const local = { x: Math.fround((rest.x + flowX * .020 * sway) * width),
      y: Math.fround(Math.max(.005, .008 + (rest.y - .008) * (1 - contraction * .34) - active * .011)),
      z: Math.fround((rest.z + flowZ * .020 * sway) * width) };
    const position = seaSpiderLocalToWorld(agent, local);
    return { ...position, id: `tentacle:${id}:tip`, referenceId: `tentacle:${id}:tip`, tentacleIndex: id, along: 1,
      local, pointLocal: local, position, pointWorld: position };
  });
}
