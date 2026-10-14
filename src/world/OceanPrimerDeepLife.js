import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DEEP_SEA_PIG_CONTACTS_LOCAL } from '../deepHabitat.js';

// Stage 07 original whole teaching kits. Measured axes and taxonomic levels
// remain those of the source catalog. This module never moves a population,
// invents intake, reads a store or modifies the original deep asset modules.
const TAU = Math.PI * 2;
export const OCEAN_PRIMER_DEEP_LIFE_IDS = Object.freeze(['helmet-jelly', 'vampire-squid', 'sea-pig-group', 'rattail-family', 'pom-pom-anemone']);
const SOURCES = Object.freeze({
  'helmet-jelly': 'https://www.montereybayaquarium.org/animals-the-ocean/animals-a-to-z/helmet-jelly',
  'vampire-squid': 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3479720/',
  'sea-pig-group': 'https://www.mbari.org/animal/sea-pig/',
  'rattail-family': 'https://www.mbari.org/animal/rattail-fish/',
  'pom-pom-anemone': 'https://www.mbari.org/animal/pom-pom-anemone/',
});
const vec = p => new THREE.Vector3(...p);
const owned = (root, resource) => { root.userData.primerOwned.add(resource); return resource; };
const smooth = THREE.MathUtils.smoothstep;
const stablePhase = id => { let hash = 2166136261; for (const c of id) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619); return (hash >>> 0) / 4294967296 * TAU; };

function tag(geometry, part = 0, phase = 0, along = () => 0, foot = -1) {
  const p = geometry.attributes.position, n = p.count;
  geometry.setAttribute('lifePart', new THREE.Float32BufferAttribute(Array(n).fill(part), 1));
  geometry.setAttribute('lifeOffset', new THREE.Float32BufferAttribute(Array(n).fill(phase), 1));
  geometry.setAttribute('lifeFoot', new THREE.Float32BufferAttribute(Array(n).fill(foot), 1));
  geometry.setAttribute('lifeAlong', new THREE.Float32BufferAttribute(Array.from({ length: n }, (_, i) => along(p, i)), 1));
  return geometry;
}
function colourGeometry(geometry, hex, variation = .025) {
  const p = geometry.attributes.position, rgb = new Float32Array(p.count * 3), c = new THREE.Color(hex);
  for (let i = 0; i < p.count; i++) {
    const shade = 1 + variation * Math.sin(p.getX(i) * 21 + p.getZ(i) * 17) * Math.cos(p.getY(i) * 19);
    rgb.set([c.r * shade, c.g * shade, c.b * shade], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(rgb, 3)); return geometry;
}
function ellipsoid(center, scale, tint, part = 0, phase = 0, detail = [24, 14]) {
  const g = new THREE.SphereGeometry(1, ...detail); g.scale(...scale); g.translate(...center);
  return colourGeometry(tag(g, part, phase), tint);
}
function tube(points, radius, tint, { part = 0, phase = 0, foot = -1, segments = 18, sides = 8, taper = .7 } = {}) {
  const path = new THREE.CatmullRomCurve3(points.map(vec)), g = new THREE.TubeGeometry(path, segments, radius, sides, false);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const u = uv.getX(i), centre = path.getPointAt(u), factor = 1 - (1 - taper) * u;
    p.setXYZ(i, centre.x + (p.getX(i) - centre.x) * factor,
      centre.y + (p.getY(i) - centre.y) * factor, centre.z + (p.getZ(i) - centre.z) * factor);
  }
  colourGeometry(tag(g, part, phase, (_, i) => uv.getX(i), foot), tint); g.computeVertexNormals();
  return g;
}
function axialBody(profile, tint, { centreY = 0, part = 1, vertical = false, rows = 64, sides = 48 } = {}) {
  const curve = new THREE.CatmullRomCurve3(profile.map(p => vec(p))), positions = [], uv = [], indices = [];
  for (let row = 0; row <= rows; row++) {
    const v = curve.getPoint(row / rows);
    for (let i = 0; i <= sides; i++) {
      const a = i / sides * TAU;
      if (vertical) positions.push(Math.cos(a) * v.y, v.x, Math.sin(a) * v.z);
      else positions.push(v.x, centreY + Math.sin(a) * v.y, Math.cos(a) * v.z);
      uv.push(i / sides, row / rows);
      if (row < rows && i < sides) { const j = row * (sides + 1) + i, k = j + sides + 1; indices.push(j, k, j + 1, j + 1, k, k + 1); }
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(indices); g.computeVertexNormals();
  return colourGeometry(tag(g, part, 0, p => 0), tint);
}
function membrane(points, tint, part = 0, phase = 0) {
  const positions = [], indices = [], uv = [];
  const path = new THREE.CatmullRomCurve3(points.map(vec), true), rows = 9, sides = 40;
  const centre = points.reduce((a, p) => a.add(vec(p)), new THREE.Vector3()).divideScalar(points.length);
  for (let r = 0; r <= rows; r++) for (let i = 0; i <= sides; i++) {
    const p = path.getPoint(i / sides).lerp(centre, 1 - r / rows);
    positions.push(p.x, p.y + Math.sin(r / rows * Math.PI) * .012, p.z); uv.push(i / sides, r / rows);
    if (r < rows && i < sides) { const a = r * (sides + 1) + i, b = a + sides + 1; indices.push(a, b, a + 1, a + 1, b, b + 1); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(indices); g.computeVertexNormals();
  return colourGeometry(tag(g, part, phase, (_,i) => uv[i*2+1]), tint);
}
function tissueMap(root, kind) {
  const size = 128, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const fine = Math.sin(x * 2.31 + y * 3.71) * Math.cos(y * .57 - x * .39);
    const broad = Math.sin(x * .10 + Math.sin(y * .06) * 2) * Math.cos(y * .08);
    const shade = .94 + broad * (kind === 'fish' ? .06 : .025) + fine * .013, i = (y * size + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = Math.max(0, Math.min(255, Math.round(shade * 255))); data[i + 3] = 255;
  }
  const map = owned(root, new THREE.DataTexture(data, size, size)); map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.generateMipmaps = true; map.minFilter = THREE.LinearMipmapLinearFilter; map.needsUpdate = true; return map;
}
const DEFORMATION = `
  if (lifePart > .5 && lifePart < 1.5) transformed.y += .003 * sin(lifeTime * .65 + lifePhase) * max(0.0, position.y);
  if (lifePart > 1.5 && lifePart < 2.5) {
    float tail = clamp((.24 - position.x) / .74, 0.0, 1.0);
    transformed.z += sin(lifeTime * 1.8 + lifePhase - tail * 5.0) * .028 * tail * tail;
  }
  if (lifePart > 2.5 && lifePart < 3.5) {
    float tip = lifeAlong * lifeAlong;
    transformed.x += sin(lifeTime * .7 + lifePhase + lifeOffset) * .019 * tip;
    transformed.z += (lifeFlow * .025 + cos(lifeTime * .58 + lifeOffset)) * .012 * tip;
  }
  if (lifePart > 3.5 && lifePart < 4.5) {
    int foot = int(lifeFoot + .5);
    transformed.y += lifeContactsY[foot] * lifeAlong;
    transformed.x += sin(lifeTime * .75 + lifePhase + lifeOffset) * .004 * sin(lifeAlong * 3.14159265);
  }
  if (lifePart > 4.5 && lifePart < 5.5) {
    transformed.x -= lifeFeed * .024 * lifeAlong;
    transformed.y += lifeFeed * .036 * lifeAlong;
  }
  if (lifePart > 5.5 && lifePart < 6.5) {
    float pulse = sin(lifeTime * 1.35 + lifePhase);
    transformed.xz *= 1.0 + .037 * pulse * (1.0 - clamp(position.y / 1.14, 0.0, 1.0));
    transformed.y *= 1.0 - .028 * pulse;
  }
  if (lifePart > 7.5 && lifePart < 8.5) transformed.y += sin(lifeTime * 1.35 + lifePhase + lifeOffset) * .06 * lifeAlong;
`;
function deformShader(material, uniforms) {
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
      attribute float lifePart; attribute float lifeAlong; attribute float lifeOffset; attribute float lifeFoot;
      uniform float lifeTime; uniform float lifePhase; uniform float lifeFeed; uniform float lifeFlow; uniform float lifeContactsY[12];`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${DEFORMATION}`);
  };
  material.customProgramCacheKey = () => 'ocean-primer-deep-life-v2-soft-pose';
}
function tissue(root, kind = 'soft', translucent = false) {
  const map = tissueMap(root, kind), material = owned(root, new THREE.MeshPhysicalMaterial({ color: 0xffffff,
    vertexColors: true, map, roughness: kind === 'fish' ? .66 : .58, metalness: 0,
    clearcoat: .05, clearcoatRoughness: .72, transmission: translucent ? .065 : 0,
    thickness: translucent ? .028 : 0, ior: 1.36, transparent: translucent,
    opacity: translucent ? .92 : 1, depthWrite: true, side: THREE.DoubleSide,
    emissive: 0, emissiveIntensity: 0 }));
  deformShader(material, root.userData.primerUniforms); return material;
}
function addBatch(root, pieces, material, name) {
  const geometry = owned(root, mergeGeometries(pieces)); pieces.forEach(g => g.dispose());
  geometry.computeBoundingBox(); geometry.computeBoundingSphere(); geometry.boundingSphere.radius += .12;
  const mesh = new THREE.Mesh(geometry, material); mesh.name = name; mesh.castShadow = mesh.receiveShadow = true;
  const depth = owned(root, new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide }));
  deformShader(depth, root.userData.primerUniforms); mesh.customDepthMaterial = depth; root.add(mesh); return mesh;
}

function pig(root, agent) {
  const flesh = tissue(root, 'soft', true), appendage = tissue(root, 'soft', true);
  const body = axialBody([[-.5,.002,.002],[-.43,.102,.124],[-.30,.153,.192],[-.1,.165,.213],
    [.12,.151,.197],[.32,.110,.149],[.43,.055,.095],[.5,.002,.002]], '#d9aca0', { centreY: .226 });
  addBatch(root, [body], flesh, 'Continuous translucent sea-pig body: measured length one');
  const limbs = [];
  DEEP_SEA_PIG_CONTACTS_LOCAL.forEach((end, index) => {
    const side = index % 2 ? 1 : -1, x = end.x;
    limbs.push(tube([[x,.21,side*.15],[x+.006,.15,side*.21],[end.x,.066,end.z-.01*side],[end.x,0,end.z]],
      .019, '#c9988e', { part: 4, phase: index * .63, foot: index, taper: .82, segments: 14 }));
  });
  for (const [i, p] of [[-.27,-1],[.10,-1],[-.21,1],[.26,1]].entries()) {
    const [x, side] = p; limbs.push(tube([[x,.355,side*.10],[x-.035,.48,side*.15],[x-.06,.63,side*.19]],
      .016, '#cfa597', { part: 3, phase: i, taper: .42 }));
  }
  addBatch(root, limbs, appendage, 'Twelve curved stilt tube feet and four soft dorsal papillae');
  const oral = [];
  for (let i = 0; i < 10; i++) { const a = i / 10 * TAU;
    oral.push(tube([[.438,.083,0],[.465,.055,Math.sin(a)*.024],[.477,.048,Math.sin(a)*.031]],
      .007, '#bc8175', { part: 5, phase: i, taper: .5, segments: 10 })); }
  addBatch(root, oral, appendage, 'Connected soft sediment-probing oral tentacles');
  root.userData.anatomy = { stiltFeet: 12, dorsalPapillae: 4, oralTentaclesSample: 10, morphologyProxy: true };
  root.userData.measureReferences = { bodyLength: 1, posteriorX: -.5, anteriorX: .5, appendageSampleNotTaxonDiagnostic: true };
  root.userData.footContacts = DEEP_SEA_PIG_CONTACTS_LOCAL.map(p => ({ ...p }));
  animateOceanPrimerDeepLife(root, 0, agent);
}
function fish(root) {
  const skin = tissue(root, 'fish'), fin = tissue(root, 'fish', true), eye = tissue(root, 'fish');
  const body = axialBody([[-.5,.002,.001],[-.4,.009,.006],[-.26,.026,.018],[-.08,.054,.035],
    [.08,.083,.052],[.24,.107,.065],[.34,.103,.064],[.43,.056,.043],[.5,.003,.005]],
  '#847b69', { centreY: .151, part: 2 });
  addBatch(root, [body], skin, 'Continuous heavy-headed rattail and slender tapering tail');
  const fins = [membrane([[.24,.245,0],[.15,.315,0],[-.02,.291,0],[-.21,.212,0],[-.44,.159,0],[-.12,.175,0]], '#7b7062', 2),
    membrane([[.10,.099,0],[-.01,.044,0],[-.30,.116,0],[-.46,.147,0],[-.10,.135,0]], '#837360', 2)];
  for (const side of [-1, 1]) fins.push(membrane([[.27,.153,side*.062],[.12,.15,side*.127],[-.02,.093,side*.12],[.18,.126,side*.068]], '#9c8d77', 8, side));
  addBatch(root, fins, fin, 'Soft continuous median fins and independent paired pectorals');
  const eyes = [];
  for (const side of [-1, 1]) {
    eyes.push(ellipsoid([.342,.188,side*.055],[.027,.027,.010], '#506878'),
      ellipsoid([.346,.190,side*.063],[.014,.019,.004], '#15252b'));
  }
  eyes.push(tube([[.44,.130,0],[.403,.105,0],[.377,.080,0]], .004, '#ad9880', { taper: .35, segments: 12 }));
  addBatch(root, eyes, eye, 'Proportional blue-grey eyes and short chin barbel');
  root.userData.anatomy = { bodyForm: 'family-level-long-tapered-rattail', pectoralFins: 2, longContinuousTail: true, forkedCaudalFin: false };
  root.userData.measureReferences = { bodyLength: 1, snoutX: .5, tailTipX: -.5 };
}
function anemone(root) {
  const flesh = tissue(root, 'soft', true), body = axialBody([[0,.14,.14],[.055,.25,.25],[.16,.29,.29],[.25,.24,.24],[.29,.10,.10]],
    '#bc9cac', { vertical: true, part: 1, rows: 40 });
  const tentacles = [];
  for (let i = 0; i < 88; i++) {
    const a = i * 2.3999632297, up = 1 - (i + .5) / 88 * 1.28, h = Math.sqrt(1 - up * up);
    const start = [Math.cos(a)*h*.22,.18+up*.15,Math.sin(a)*h*.22];
    const end = [Math.cos(a)*h*(.46+.02*Math.sin(i*1.73)),Math.max(.019,.18+up*(.30+.05*Math.sin(i*.71))),Math.sin(a)*h*(.46+.02*Math.sin(i*1.73))];
    const bent = [(start[0]+end[0])*.5+Math.sin(a)*.025,(start[1]+end[1])*.5+.033,(start[2]+end[2])*.5-Math.cos(a)*.023];
    tentacles.push(tube([start,bent,end], .013+.003*(.5+.5*Math.sin(i*.83)), i%3 ? '#cfafba' : '#aa879c',
      { part: 3, phase: i*.37, segments: 16, taper: .61 }));
    const cap = ellipsoid(end,[.009,.009,.009], '#c6a2b1',3,i*.37,[10,8]); cap.attributes.lifeAlong.array.fill(1); tentacles.push(cap);
  }
  const crown = mergeGeometries(tentacles); tentacles.forEach(g => g.dispose()); crown.computeBoundingBox();
  const factor = 1 / Math.max(crown.boundingBox.max.x-crown.boundingBox.min.x,crown.boundingBox.max.z-crown.boundingBox.min.z);
  crown.scale(factor,factor,factor);
  addBatch(root,[body,crown],flesh,'Soft irregular puff of curved round-ended tentacles and attached body');
  root.userData.anatomy = { softRoundEndedTentacles: 88, tentacleSampleNotDiagnostic: true, attachedBase: true, hardSpines: 0 };
  root.userData.measureReferences = { expandedNeutralDiameter: 1, attachmentRootY: 0 };
}
function jelly(root) {
  const gelatin = tissue(root, 'gelatinous', true), fringe = tissue(root, 'soft', true);
  const bell = axialBody([[0,.46,.46],[.075,.5,.5],[.14,.46,.46],[.20,.44,.44],[.34,.406,.406],
    [.52,.33,.33],[.72,.25,.25],[.91,.17,.17],[1.04,.085,.085],[1.12,.004,.004]], '#9a3540', { vertical:true,part:6,rows:72 });
  addBatch(root,[bell],gelatin,'Curved gelatinous coronate helmet bell with constricted crown margin');
  const pieces = [];
  for(let i=0;i<12;i++) {
    const a=i/12*TAU, length=1.46+.23*Math.sin(i*1.71), r=.45;
    pieces.push(tube([[Math.cos(a)*r,-.015,Math.sin(a)*r],
      [Math.cos(a+.04)*.59,-.40,Math.sin(a+.04)*.59],
      [Math.cos(a-.055)*.60,-.94,Math.sin(a-.055)*.60],
      [Math.cos(a+.09)*(.51+.05*Math.sin(i)),-length,Math.sin(a+.09)*(.51+.05*Math.sin(i))]],
    .022,'#aa4751',{part:3,phase:i*.62,segments:24,taper:.24}));
  }
  for(let i=0;i<16;i++){const a=i/16*TAU;
    pieces.push(ellipsoid([Math.cos(a)*.444,-.026,Math.sin(a)*.444],[.042,.052,.031],'#aa4450',3,i));}
  pieces.push(ellipsoid([0,-.08,0],[.115,.095,.115],'#853444'));
  addBatch(root,pieces,fringe,'Twelve differently curved complete marginal tentacles and sixteen soft lappets');
  root.userData.anatomy={marginTentacles:12,lappets:16,longOralArms:0,softBell:true};
  root.userData.measureReferences={bellDiameter:1,bellRimRootY:0,tentaclesExcludedFromBellDiameter:true};
}
function vampire(root) {
  const skin=tissue(root,'soft',true), web=tissue(root,'soft',true), eye=tissue(root,'fish');
  const mantle=axialBody([[-.5,.002,.002],[-.43,.20,.21],[-.25,.30,.31],[.02,.33,.33],[.28,.28,.28],[.5,.19,.20]],'#72494e',{rows:64});
  addBatch(root,[mantle,ellipsoid([.57,-.035,0],[.22,.22,.25],'#76484f')],skin,'Soft rounded measured mantle and connected broad head');
  const eyes=[];for(const side of[-1,1])eyes.push(ellipsoid([.57,.02,side*.233],[.095,.093,.025],'#52657b'),ellipsoid([.59,.023,side*.253],[.042,.055,.012],'#172532'));
  addBatch(root,eyes,eye,'Paired large proportionate cephalopod eyes');
  const fins=[];for(const side of[-1,1])fins.push(membrane([[-.34,.08,side*.22],[-.30,.12,side*.53],[-.03,.06,side*.60],[.16,.015,side*.36],[.08,.028,side*.23]],'#80535a',8,side));
  addBatch(root,fins,skin,'Two curved adult lateral fins');
  const pos=[],uv=[],idx=[],rows=18,sides=96;
  for(let r=0;r<=rows;r++)for(let i=0;i<=sides;i++){
    const u=r/rows,a=i/sides*TAU,radius=.13+u*.36,dx=.68+u*.80+.06*Math.sin(a*8)*u*u;
    pos.push(dx,Math.cos(a)*radius-.07,Math.sin(a)*radius);uv.push(i/sides,u);
    if(r<rows&&i<sides){const j=r*(sides+1)+i,k=j+sides+1;idx.push(j,k,j+1,j+1,k,k+1);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();
  colourGeometry(tag(g,3,0,(_,i)=>uv[i*2+1]),'#83535c');const arms=[g];
  for(let i=0;i<8;i++){const a=i/8*TAU;
    arms.push(tube([[.69,Math.cos(a)*.13-.07,Math.sin(a)*.13],[1.03,Math.cos(a)*.31-.07,Math.sin(a)*.31],
      [1.43,Math.cos(a)*.49-.07,Math.sin(a)*.49],[1.68,Math.cos(a)*.43-.10,Math.sin(a)*.43]],.042,'#83525c',{part:3,phase:i*.3,taper:.4,segments:20}));
  }
  addBatch(root,arms,web,'Continuous scalloped interbrachial membrane joining all eight complete soft arms');
  const filaments=[tube([[.66,.035,.19],[1.50,.045,.27],[2.7,.02,.22],[3.8,-.02,.16],[4.5,-.06,.12]],.008,'#bc8c83',{part:3,phase:1,taper:.30,segments:36}),
    tube([[.66,.0,-.19],[.74,-.07,-.29],[.52,-.12,-.38],[.35,-.08,-.28],[.54,-.025,-.21]],.008,'#bc8c83',{part:3,phase:2,taper:.35,segments:22})];
  addBatch(root,filaments,web,'One extended feeding filament and second complete retractile filament in a close coiled pose');
  root.userData.anatomy={arms:8,adultFins:2,retractileFilaments:2,extendedFilaments:1,clubTentacles:0,wholeInterbrachialWeb:true};
  root.userData.measureReferences={mantleLength:1,mantleBackX:-.5,mantleFrontX:.5,headArmsAndFilamentsExcluded:true};
}

export function createOceanPrimerDeepLife(species, agent = {}) {
  if (!species || !OCEAN_PRIMER_DEEP_LIFE_IDS.includes(species.id)) throw new TypeError('Unknown original primer deep-life representative.');
  const identities={'helmet-jelly':['Periphylla periphylla','species'],'vampire-squid':['Vampyroteuthis infernalis','species'],
    'sea-pig-group':['Scotoplanes spp.','genus-group'],'rattail-family':['Macrouridae','family-group'],'pom-pom-anemone':['Liponema brevicorne','species']};
  const expected=identities[species.id];
  if(species.scientificName!==expected[0]||species.identityLevel!==expected[1])throw new TypeError('Primer visual kit cannot promote or replace its source identity.');
  const root = new THREE.Group(); root.name = `Stage 07 whole life: ${species.commonName}`;
  const phase = stablePhase(agent.id ?? species.id), uniforms={lifeTime:{value:0},lifePhase:{value:phase},lifeFeed:{value:0},lifeFlow:{value:.06},lifeContactsY:{value:Array(12).fill(0)}};
  Object.assign(root.userData,{speciesId:species.id,agentId:agent.id,identityLevel:species.identityLevel,scientificName:species.scientificName,
    sizeMeasure:species.sizeMeasure??species.displaySizeM.measure,displaySizeRangeM:[...species.displaySizeM.range],
    role:'independent-original-whole-teaching-kit-not-a-population-controller',source:SOURCES[species.id],assetVersion:2,
    primerOwned:new Set(),primerUniforms:uniforms,phase,disposed:false,geometryLicense:'project-original; Three.js helpers MIT',
    motionStatus:'source-informed-bounded-display-pose; only native lastFeedAt drives feeding cue'});
  ({'sea-pig-group':pig,'rattail-family':fish,'pom-pom-anemone':anemone,'helmet-jelly':jelly,'vampire-squid':vampire})[species.id](root,agent);
  return root;
}
export function animateOceanPrimerDeepLife(root,timeSec,agent={}) {
  if(root.userData.disposed)return false;const u=root.userData.primerUniforms;
  u.lifeTime.value=Number.isFinite(timeSec)?timeSec:0;u.lifeFlow.value=agent.localEnvironment?.currentMps??.06;
  const age=Number.isFinite(agent.lastFeedAt)?timeSec-agent.lastFeedAt:-1;
  u.lifeFeed.value=age>=0&&age<=5?Math.sin(age/5*Math.PI)**2:0;
  for(let i=0;i<12;i++)u.lifeContactsY.value[i]=agent.contactPointsLocal?.[i]?.y??0;
  root.userData.lastNativeFeedAt=agent.lastFeedAt??null;return true;
}
export function disposeOceanPrimerDeepLife(root) {
  if(!root||root.userData.disposed)return;root.userData.disposed=true;
  for(const resource of root.userData.primerOwned)resource.dispose();root.userData.primerOwned.clear();root.removeFromParent();root.clear();
}
