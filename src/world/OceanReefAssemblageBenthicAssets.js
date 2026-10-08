import * as THREE from 'three';
import { oceanReefAssemblageSpeciesById } from '../oceanReefAssemblageSpecies.js';

const TAU = Math.PI * 2, resources = new Map(), instances = new Set();
export const REEF_ASSEMBLAGE_BENTHIC_ASSET_VERSION = 1;
export const REEF_ASSEMBLAGE_BENTHIC_IDS = Object.freeze(['peacock-flounder', 'textile-cone', 'collector-urchin']);
export const isReefAssemblageBenthic = value => REEF_ASSEMBLAGE_BENTHIC_IDS.includes(typeof value === 'string' ? value : value?.id ?? value?.speciesId);
function share(root, key, make) {
  let row = resources.get(key);
  if (!row) { row = { value: make(), refs: 0 }; resources.set(key, row); }
  if (!root.userData.reefAssemblageBenthicResources.has(key)) { root.userData.reefAssemblageBenthicResources.add(key); row.refs++; }
  return row.value;
}
function builder() {
  const positions = [], colors = [], indices = [];
  const vertex = (p, color) => { const index = positions.length / 3; positions.push(...p); colors.push(...color); return index; };
  const face = (a, b, c) => indices.push(a, b, c);
  function ellipsoid(center, scale, color, sides = 24, rows = 12) {
    const start = positions.length / 3;
    for (let row = 0; row <= rows; row++) for (let side = 0; side <= sides; side++) {
      const latitude = Math.PI * row / rows, angle = TAU * side / sides;
      const p = [center[0] + Math.sin(latitude) * Math.cos(angle) * scale[0], center[1] + Math.cos(latitude) * scale[1], center[2] + Math.sin(latitude) * Math.sin(angle) * scale[2]];
      vertex(p, typeof color === 'function' ? color(...p) : color);
    }
    for (let row = 0; row < rows; row++) for (let side = 0; side < sides; side++) {
      const a = start + row * (sides + 1) + side, c = a + sides + 1;
      if (row) face(a, a + 1, c); if (row < rows - 1) face(a + 1, c + 1, c);
    }
  }
  function tube(points, radii, color, sides = 8) {
    const start = positions.length / 3;
    for (let row = 0; row < points.length; row++) {
      const p = new THREE.Vector3(...points[row]), tangent = new THREE.Vector3(...points[Math.min(row + 1, points.length - 1)])
        .sub(new THREE.Vector3(...points[Math.max(row - 1, 0)])).normalize();
      const u = new THREE.Vector3().crossVectors(tangent, Math.abs(tangent.y) > .9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize();
      const v = new THREE.Vector3().crossVectors(tangent, u), tint = typeof color === 'function' ? color(row) : color;
      for (let side = 0; side < sides; side++) vertex(p.clone().addScaledVector(u, Math.cos(side * TAU / sides) * radii[row])
        .addScaledVector(v, Math.sin(side * TAU / sides) * radii[row]).toArray(), tint);
    }
    for (let row = 0; row < points.length - 1; row++) for (let side = 0; side < sides; side++) {
      const a = start + row * sides + side, c = start + row * sides + (side + 1) % sides;
      face(a, c, a + sides); face(c, c + sides, a + sides);
    }
    for (const [row, reverse] of [[0, true], [points.length - 1, false]]) {
      const center = vertex(points[row], typeof color === 'function' ? color(row) : color);
      for (let side = 0; side < sides; side++) {
        const a = start + row * sides + side, next = start + row * sides + (side + 1) % sides;
        reverse ? face(center, next, a) : face(center, a, next);
      }
    }
  }
  return { vertex, face, ellipsoid, tube, finish() {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); g.setIndex(indices); g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere(); return g;
  } };
}
// This is the right blind skin of a fish, rather than a foot or leg assembly.
// Six real skin vertices are the native support samples; the upper left face is eyed.
const flounderSections = [[-.5,.145,.028],[-.46,.135,.03],[-.42,.115,.034],[-.38,.077,.039],[-.34,.05,.042],
  [-.30,.18,.058],[-.26,.23,.068],[-.20,.26,.077],[-.13,.282,.081],[-.06,.297,.084],[0,.30,.085],
  [.06,.294,.084],[.13,.279,.078],[.20,.264,.072],[.26,.25,.064],[.32,.213,.059],[.38,.157,.054],[.44,.082,.044],[.48,.034,.033],[.5,.005,.024]];
const blue = [.34,.53,.58], sand = [.52,.50,.38], pale = [.74,.72,.60];
function flounderTint(x, y, z) {
  if (y < .005) return pale;
  const blotch = [-.25,0,.26].some(cx => Math.hypot((x-cx)*1.2,z) < .025);
  if (blotch) return [.24,.26,.21];
  for (const [cx,cz,r] of [[-.23,.12,.027],[-.12,-.16,.023],[0,.18,.034],[.15,-.15,.029],[.26,.12,.022],[-.06,-.05,.022],[.13,.04,.027]]) {
    const d = Math.hypot(x-cx,z-cz); if (Math.abs(d-r) < .012) return blue;
  }
  return Math.sin(x*82+z*13)*Math.sin(z*79-x*12) > .35 ? [.60,.58,.45] : sand;
}
function flounderBody() {
  const b = builder(), bottom = [], top = [];
  flounderSections.forEach(([x,w,h],i) => {
    const inner = Math.min(.10,w*.52), half = Math.min(.05,w*.26);
    const zs = [-w,-w*.9,-w*.75,-w*.6,-inner,-half,0,half,inner,w*.6,w*.75,w*.9,w];
    bottom[i] = []; top[i] = [];
    zs.forEach((z,j) => {
      const y = .011 + (h-.011)*Math.sqrt(Math.max(0,1-(z/w)**2));
      bottom[i][j] = b.vertex([x,0,z],pale); top[i][j] = b.vertex([x,y,z],flounderTint(x,y,z));
    });
  });
  const rows = flounderSections.length, columns = top[0].length;
  for (let i=0;i<rows-1;i++) for(let j=0;j<columns-1;j++) {
    b.face(top[i][j],top[i+1][j+1],top[i+1][j]); b.face(top[i][j],top[i][j+1],top[i+1][j+1]);
    b.face(bottom[i][j],bottom[i+1][j],bottom[i+1][j+1]); b.face(bottom[i][j],bottom[i+1][j+1],bottom[i][j+1]);
  }
  for (let i=0;i<rows-1;i++) for(const j of [0,columns-1]) {
    const a=bottom[i][j],c=bottom[i+1][j],d=top[i+1][j],e=top[i][j];
    j===0 ? (b.face(a,e,d),b.face(a,d,c)) : (b.face(a,c,d),b.face(a,d,e));
  }
  for(const i of [0,rows-1]) for(let j=0;j<columns-1;j++) {
    const a=bottom[i][j],c=bottom[i][j+1],d=top[i][j+1],e=top[i][j];
    i===0 ? (b.face(a,c,d),b.face(a,d,e)) : (b.face(a,e,d),b.face(a,d,c));
  }
  return b.finish();
}
function flounderMedianFins() {
  const b=builder();
  for(const sign of [-1,1]) {
    const sections=flounderSections.slice(5,-2), start=[];
    for(const [x,w] of sections) {
      start.push([b.vertex([x,.016,sign*w],sand),b.vertex([x,.014,sign*(w+.045)],blue),b.vertex([x,.020,sign*w],sand),b.vertex([x,.019,sign*(w+.045)],pale)]);
    }
    for(let i=0;i<start.length-1;i++) { const a=start[i],c=start[i+1];
      b.face(a[0],c[0],c[1]); b.face(a[0],c[1],a[1]); b.face(a[2],c[3],c[2]); b.face(a[2],a[3],c[3]);
      b.face(a[1],c[1],c[3]);b.face(a[1],c[3],a[3]);
    }
  }
  return b.finish();
}
function flounderHead() {
  const b=builder();
  for(const [x,z] of [[.36,-.065],[.23,.11]]) {
    b.ellipsoid([x,.077,z],[.028,.022,.028],sand,16,8);
    b.ellipsoid([x+.004,.094,z],[.017,.009,.017],[.20,.24,.20],16,8);
    b.ellipsoid([x+.008,.101,z],[.008,.005,.010],[.05,.07,.07],12,8);
  }
  b.tube([[.477,.025,-.024],[.496,.027,0],[.477,.025,.024]],[.003,.003,.003],[.24,.25,.20]);
  return b.finish();
}
function flounderPectoral() {
  const b=builder(); b.ellipsoid([0,0,0],[.095,.004,.043],(x,y,z)=>Math.sin(x*170)>0?blue:sand,24,8); return b.finish();
}
function coneShell() {
  const b=builder(), sections=[[-.5,.34,0],[-.44,.343,.043],[-.38,.346,.078],[-.30,.34,.13],[-.22,.335,.235],[-.12,.318,.227],
    [0,.285,.202],[.12,.245,.17],[.24,.207,.137],[.37,.169,.09],[.5,.145,.055]], sides=60, start=[];
  for(const [x,cy,r] of sections) {
    const row=[];
    for(let i=0;i<=sides;i++) {
      const a=-Math.PI+.14+(TAU-.28)*i/sides, p=[x,cy+Math.cos(a)*r,Math.sin(a)*r];
      const u=(x+.5)*18, v=a/TAU*16, column=Math.floor(v), tx=u-Math.floor(u), tz=v-column;
      const triangle=tx < .82-Math.abs(tz-.5)*1.25, band=Math.abs(x+.06)<.06||Math.abs(x-.27)<.05;
      row.push(b.vertex(p,triangle ? [.84,.78,.63] : band ? [.40,.31,.18] : [.68,.44,.20]));
    }
    start.push(row);
  }
  for(let row=0;row<sections.length-1;row++) for(let i=0;i<sides;i++) {
    const a=start[row][i],c=start[row+1][i]; b.face(a,start[row][i+1],c); b.face(start[row][i+1],start[row+1][i+1],c);
  }
  // Genuine longitudinal open aperture: shell lips thicken inward, without a filled lower plate.
  for(const edge of [0,sides]) {
    const inner=sections.map(([x,cy,r])=>{const a=edge===0?-Math.PI+.14:Math.PI-.14;return b.vertex([x,cy+Math.cos(a)*Math.max(0,r-.009),Math.sin(a)*Math.max(0,r-.009)],[.48,.39,.25]);});
    for(let row=0;row<sections.length-1;row++) {b.face(start[row][edge],inner[row],inner[row+1]);b.face(start[row][edge],inner[row+1],start[row+1][edge]);}
  }
  return b.finish();
}
function coneSole() {
  const b=builder(), xs=[-.42,-.30,0,.30,.62], zs=[-.15,-.10,0,.10,.15], bottom=[],top=[];
  for(let i=0;i<xs.length;i++) { bottom[i]=[];top[i]=[];
    for(let j=0;j<zs.length;j++) {const z=zs[j]*(i===0||i===xs.length-1?.12:1);
      bottom[i][j]=b.vertex([xs[i],0,z],pale);top[i][j]=b.vertex([xs[i],.025+Math.sin(i*Math.PI/4)*.03,z],j%2?[.69,.64,.50]:[.77,.74,.62]);}
  }
  for(let i=0;i<4;i++)for(let j=0;j<4;j++) {b.face(top[i][j],top[i+1][j+1],top[i+1][j]);b.face(top[i][j],top[i][j+1],top[i+1][j+1]);
    b.face(bottom[i][j],bottom[i+1][j],bottom[i+1][j+1]);b.face(bottom[i][j],bottom[i+1][j+1],bottom[i][j+1]);}
  for(let i=0;i<4;i++)for(const j of [0,4]) {const a=bottom[i][j],c=bottom[i+1][j],d=top[i+1][j],e=top[i][j];j===0?(b.face(a,e,d),b.face(a,d,c)):(b.face(a,c,d),b.face(a,d,e));}
  for(const i of [0,4])for(let j=0;j<4;j++) {const a=bottom[i][j],c=bottom[i][j+1],d=top[i][j+1],e=top[i][j];i===0?(b.face(a,c,d),b.face(a,d,e)):(b.face(a,e,d),b.face(a,d,c));}
  return b.finish();
}
function coneHead() {
  const b=builder();b.ellipsoid([.52,.071,0],[.10,.042,.082],pale,20,10);
  for(const sign of [-1,1]) {b.tube([[.56,.083,sign*.056],[.68,.12,sign*.10],[.73,.115,sign*.14]],[.012,.008,.003],pale);
    b.ellipsoid([.68,.124,sign*.10],[.008,.005,.008],[.09,.09,.07],12,8);}
  b.tube([[.57,.072,.025],[.67,.077,.025],[.735,.088,.025]],[.017,.012,.004],[.55,.45,.31],12);
  return b.finish();
}
function coneSiphon() {
  const b=builder();b.tube([[0,0,0],[.14,.07,.01],[.28,.19,.015],[.41,.26,.018]],[.021,.018,.016,.014],i=>i===3?[.59,.29,.20]:pale,12);
  return b.finish();
}
function urchinTest() {
  const b=builder();b.ellipsoid([0,.47,0],[.5,.335,.5],(x,y,z)=>Math.cos(Math.atan2(z,x)*10)>.35?[.40,.34,.22]:[.20,.22,.17],40,24);return b.finish();
}
function urchinSpines() {
  const b=builder();
  for(let band=0;band<10;band++) for(let i=0;i<9;i++) {
    const a=band*TAU/10, t=.32+i*.267, p=new THREE.Vector3(Math.sin(t)*Math.cos(a)*.5,.47+Math.cos(t)*.335,Math.sin(t)*Math.sin(a)*.5);
    const n=new THREE.Vector3(p.x/.25,(p.y-.47)/(.335*.335),p.z/.25).normalize();
    b.tube([p.toArray(),p.clone().addScaledVector(n,.075).toArray(),p.clone().addScaledVector(n,.135).toArray()],[.009,.006,.001],band%3===0?[.62,.32,.18]:[.77,.72,.58],6);
  }
  return b.finish();
}
function urchinTubeFeet(s) {
  const b=builder();
  for(const p of s.support.footContacts) {
    const r=Math.hypot(p.x,p.z)*1.12, y=.47-.335*Math.sqrt(1-(r/.5)**2);
    b.tube([[p.x*1.12,y,p.z*1.12],[p.x*1.05,.058,p.z*1.05],[p.x,.012,p.z],[p.x,0,p.z]],[.010,.010,.009,0],i=>i===0?[.24,.18,.23]:[.61,.62,.56],8);
    b.ellipsoid([p.x,.002,p.z],[.015,.002,.015],[.58,.60,.52],12,6);
  }
  return b.finish();
}
function urchinMouth() {
  const b=builder();b.ellipsoid([0,.122,0],[.037,.010,.037],[.17,.17,.14],16,8);
  for(let i=0;i<5;i++)b.ellipsoid([.022*Math.cos(i*TAU/5),.112,.022*Math.sin(i*TAU/5)],[.007,.006,.007],pale,10,6);
  return b.finish();
}
function urchinPedicellaria() {
  const b=builder();b.tube([[0,0,0],[0,.039,0],[.008,.068,0]],[.005,.004,.003],[.42,.39,.29],6);
  for(let i=0;i<3;i++)b.tube([[.008,.065,0],[.008+.006*Math.cos(i*TAU/3),.079,.006*Math.sin(i*TAU/3)]],[.004,.001],pale,6);
  return b.finish();
}
function add(root,name,make,parent=root) {
  const mesh=new THREE.Mesh(share(root,`${root.userData.speciesId}:${name}:geometry`,make),share(root,`${root.userData.speciesId}:material`,()=>new THREE.MeshStandardMaterial({vertexColors:true,roughness:.83,metalness:0})));
  mesh.name=name;parent.add(mesh);return mesh;
}
export function createReefAssemblageBenthic(speciesOrId) {
  const id=typeof speciesOrId==='string'?speciesOrId:speciesOrId?.id??speciesOrId?.speciesId;
  if(!isReefAssemblageBenthic(id))throw new RangeError('Unknown reef assemblage benthic species.');
  const s=oceanReefAssemblageSpeciesById[id];
  if(!s||(typeof speciesOrId==='object'&&speciesOrId?.scientificName&&speciesOrId.scientificName!==s.scientificName))throw new RangeError('Conflicting reef assemblage species identity.');
  const root=new THREE.Group();root.name=s.commonName;
  Object.assign(root.userData,{speciesId:id,scientificName:s.scientificName,sizeMeasure:s.sizeMeasure,forwardAxis:'+X',rootReference:s.support.rootReference,
    normalizedEnvelope:structuredClone(s.normalizedEnvelope),supportContacts:structuredClone(s.support.footContacts),contactKind:s.support.contactKind,
    reefAssemblageBenthicResources:new Set(),reefAssemblageBenthicDisposed:false,independentAnimal:true,
    animationScope:'bounded appendage display; native controller owns root movement; skin/sole/podium samples do not reproduce calibrated gait, swimming, burial or prey capture'});
  instances.add(root);
  try {
    const motion={fins:[],siphons:[],spines:[],pedicellariae:[]};
    if(id==='peacock-flounder') {
      const body=add(root,'Complete flattened fish with pale right blind skin and patterned left face',flounderBody);
      Object.assign(body.userData,{bodyMeasuredX:[-.5,.5],contactTips:true,continuousBlindSkin:true});
      const fins=new THREE.Group();root.add(fins);add(root,'Long peripheral dorsal and anal ray fins',flounderMedianFins,fins);motion.fins.push(fins);
      add(root,'Asymmetric left-side eyes and small terminal mouth',flounderHead);
      const pectoral=new THREE.Group();pectoral.position.set(.21,.102,-.031);root.add(pectoral);add(root,'Ordinary short eyed-side pectoral fin',flounderPectoral,pectoral);motion.fins.push(pectoral);
      root.userData.anatomy={leftEyedFaceUp:true,blindSide:'right',actualBlindSkinSamples:6,groundLegCount:0,continuousBlindSkin:true,
        maleLongPectoralImplemented:false,realSwimmingImplemented:false,realBurialImplemented:false};
    } else if(id==='textile-cone') {
      const sole=add(root,'One continuous muscular sole with six actual samples',coneSole);Object.assign(sole.userData,{contactTips:true,continuousSole:true});
      const shell=add(root,'Relaxed horizontal pointed cone shell with triangular network and longitudinal aperture',coneShell);shell.userData.shellMeasuredX=[-.5,.5];shell.userData.longitudinalOpenAperture=true;
      add(root,'Soft head eye tentacles and short retracted proboscis',coneHead);
      const siphon=new THREE.Group();siphon.position.set(.55,.11,-.04);root.add(siphon);add(root,'Distinct long respiratory siphon',coneSiphon,siphon);motion.siphons.push(siphon);
      root.userData.anatomy={continuousSole:true,actualSoleSamples:6,groundLegCount:0,longRespiratorySiphon:true,shortRetractedProboscis:true,
        shellLengthExcludesSoftBody:true,shellStandingUpright:false,realBurialImplemented:false,venomPreyStrikeImplemented:false};
    } else {
      const test=add(root,'Raised globular test with five paired ambulacral bands',urchinTest);Object.assign(test.userData,{testMeasuredX:[-.5,.5],testMeasuredZ:[-.5,.5],testHeightUnits:.67});
      const spines=new THREE.Group();root.add(spines);const spineMesh=add(root,'Ten bands of short spines above the contact plane',urchinSpines,spines);spineMesh.userData.spinesNotFeet=true;motion.spines.push(spines);
      const feet=add(root,'Twelve ambulacral tube feet with true flattened suction tips',()=>urchinTubeFeet(s));Object.assign(feet.userData,{contactTips:true,tubeFootTips:true});
      const mouth=add(root,'Separate oral mouth and five teeth above the support plane',urchinMouth);mouth.userData.mouthNotFoot=true;
      for(let i=0;i<5;i++) {const p=new THREE.Group(),a=i*TAU/5;p.position.set(.11*Math.cos(a),.79,.11*Math.sin(a));root.add(p);add(root,`Small upper pedicellaria ${i}`,urchinPedicellaria,p);motion.pedicellariae.push(p);}
      root.userData.anatomy={shortSpineBands:10,ambulacralTubeFootSectors:5,actualTubeFootTips:12,spinesAreSupportPoints:false,mouthIsSupportPoint:false,
        testDiameterExcludesSpines:true,collectedSceneryImplemented:false,groundLegCount:0};
    }
    root.userData.motion=motion;root.updateMatrixWorld(true);return root;
  }catch(error){disposeReefAssemblageBenthic(root);throw error;}
}
export function animateReefAssemblageBenthic(root,agent={},timeSec=0) {
  if(!root?.userData?.motion||root.userData.reefAssemblageBenthicDisposed)return false;
  const t=Number.isFinite(timeSec)?timeSec:0,phase=Number.isFinite(root.userData.phase)?root.userData.phase:0,active=agent?.alive===false||agent?.state==='resting'?0:1,m=root.userData.motion;
  m.fins.forEach((p,i)=>{if(i===0)p.position.y=(Math.sin(t*.8+phase)+1)*.0025*active;else p.rotation.y=Math.sin(t*.61+phase)*.025*active;});
  m.siphons.forEach(p=>{p.rotation.y=Math.sin(t*.43+phase)*.02*active;});
  m.spines.forEach(p=>{p.rotation.y=Math.sin(t*.31+phase)*.02*active;});
  m.pedicellariae.forEach((p,i)=>{p.rotation.z=Math.sin(t*.57+phase+i)*.02*active;});
  return true;
}
export function disposeReefAssemblageBenthic(root) {
  if(!root?.userData||root.userData.reefAssemblageBenthicDisposed)return false;
  root.userData.reefAssemblageBenthicDisposed=true;instances.delete(root);
  for(const key of root.userData.reefAssemblageBenthicResources??[]) {const row=resources.get(key);if(row&&--row.refs===0){row.value.dispose();resources.delete(key);}}
  root.userData.reefAssemblageBenthicResources?.clear();root.removeFromParent();root.clear();return true;
}
export const reefAssemblageBenthicAssetStats=()=>({resources:resources.size,instances:instances.size});
