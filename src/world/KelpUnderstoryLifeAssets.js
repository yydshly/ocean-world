import * as THREE from 'three';
import { kelpUnderstoryLifeSpeciesCatalog, kelpUnderstoryLifeSpeciesById } from '../kelpUnderstoryLifeSpecies.js';

// Complete independent plant scenery or attached filter animal; all geometry
// shares source measurement and whole-form clearance. No legacy factory calls.
const TAU = Math.PI * 2, resources = new Map(), instances = new Set();
export const KELP_UNDERSTORY_LIFE_ASSET_VERSION = 1;
export const KELP_UNDERSTORY_LIFE_IDS = Object.freeze(kelpUnderstoryLifeSpeciesCatalog.map(s => s.id));
export const KELP_UNDERSTORY_LIFE_ENVELOPES = Object.freeze(Object.fromEntries(kelpUnderstoryLifeSpeciesCatalog.map(s => [s.id,
  Object.freeze({ sizeMeasure: s.sizeMeasure, horizontalRadius: s.normalizedEnvelope.horizontalRadiusUnits,
    minY: s.normalizedEnvelope.y[0], maxY: s.normalizedEnvelope.y[1], pitchLimit: s.maximumDisplayPitchRad,
    localBounds: Object.freeze({ minX: s.normalizedEnvelope.x[0], maxX: s.normalizedEnvelope.x[1],
      minZ: s.normalizedEnvelope.z[0], maxZ: s.normalizedEnvelope.z[1] }) })])));
export const isKelpUnderstoryLifeSpecies = id => KELP_UNDERSTORY_LIFE_IDS.includes(id);
export const isKelpUnderstoryLifePlant = id => kelpUnderstoryLifeSpeciesById[id]?.kind === 'kelp';
function share(root, key, make) {
  let row = resources.get(key); if (!row) { row = { value: make(), refs: 0 }; resources.set(key, row); }
  if (!root.userData.kelpUnderstoryLifeResources.has(key)) { root.userData.kelpUnderstoryLifeResources.add(key); row.refs++; }
  return row.value;
}
function builder() {
  const positions = [], colors = [], indices = [];
  const vertex = (p, c) => { const i = positions.length / 3; positions.push(...p); colors.push(...c); return i; };
  const face = (a, b, c) => indices.push(a, b, c);
  function body(profile, tint, sides = 24) {
    const start = positions.length / 3;
    for (const [x, y, z] of profile) for (let i = 0; i <= sides; i++) {
      const angle = TAU * i / sides; const point=[x, Math.cos(angle)*y, Math.sin(angle)*z];vertex(point,typeof tint==='function'?tint(...point):tint);
    }
    for (let r = 0; r < profile.length - 1; r++) for (let i = 0; i < sides; i++) {
      const a = start + r * (sides + 1) + i, b = a + sides + 1; face(a, b, a + 1); face(a + 1, b, b + 1);
    }
    for (const [r, reverse] of [[0, false], [profile.length - 1, true]]) {
      const point=[profile[r][0],0,0],c=vertex(point,typeof tint==='function'?tint(...point):tint);
      for (let i = 0; i < sides; i++) { const a = start + r * (sides + 1) + i; reverse ? face(c, a + 1, a) : face(c, a, a + 1); }
    }
  }
  function ellipsoid(center, scale, tint, sides = 16, rows = 8) {
    const start = positions.length / 3;
    for (let r = 0; r <= rows; r++) for (let i = 0; i <= sides; i++) {
      const lat = Math.PI * r / rows, angle = TAU * i / sides;
      vertex([center[0] + Math.sin(lat) * Math.cos(angle) * scale[0], center[1] + Math.cos(lat) * scale[1],
        center[2] + Math.sin(lat) * Math.sin(angle) * scale[2]], tint);
    }
    for (let r = 0; r < rows; r++) for (let i = 0; i < sides; i++) {
      const a = start + r * (sides + 1) + i, b = a + sides + 1;
      if (r) face(a, a + 1, b); if (r < rows - 1) face(a + 1, b + 1, b);
    }
  }
  function fin(points, tint, thickness = .003) {
    const start = positions.length / 3, n = points.length;
    for (const dz of [-thickness, thickness]) for (const p of points) vertex([p[0], p[1], p[2] + dz], tint);
    for (let i = 1; i < n - 1; i++) { face(start, start + i, start + i + 1); face(start + n, start + n + i + 1, start + n + i); }
    for (let i = 0; i < n; i++) { const a = start + i, b = start + (i + 1) % n; face(a, a + n, b); face(b, a + n, b + n); }
  }
  function tube(points, radii, tint, sides = 7, caps = [true,true]) {
    const start = positions.length / 3; let previous;
    for (let r = 0; r < points.length; r++) {
      const p = new THREE.Vector3(...points[r]), tangent = new THREE.Vector3(...points[Math.min(r + 1, points.length - 1)])
        .sub(new THREE.Vector3(...points[Math.max(r - 1, 0)])).normalize();
      let a = previous?.clone().addScaledVector(tangent, -previous.dot(tangent));
      if (!a || a.lengthSq() < 1e-7) a = new THREE.Vector3().crossVectors(tangent,
        Math.abs(tangent.y) > .9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0));
      a.normalize(); previous = a; const b = new THREE.Vector3().crossVectors(tangent, a);
      for (let i = 0; i < sides; i++) vertex(p.clone().addScaledVector(a, Math.cos(TAU * i / sides) * radii[r])
        .addScaledVector(b, Math.sin(TAU * i / sides) * radii[r]).toArray(), tint);
    }
    for (let r = 0; r < points.length - 1; r++) for (let i = 0; i < sides; i++) {
      const a = start + r * sides + i, b = start + r * sides + (i + 1) % sides; face(a, b, a + sides); face(b, b + sides, a + sides);
    }
    for (const [r, reverse] of [[0, false], [points.length - 1, true]]) {
      if(!caps[reverse?1:0])continue;
      const c = vertex(points[r], tint); for (let i = 0; i < sides; i++) {
        const a = start + r * sides + i, b = start + r * sides + (i + 1) % sides; reverse ? face(c, a, b) : face(c, b, a);
      }
    }
  }
  return { vertex, face, body, ellipsoid, fin, tube, finish() {
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.setIndex(indices);
    geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere(); return geometry;
  } };
}
function add(root, key, make, parent = root) {
  const geometry = share(root, `geometry/${root.userData.speciesId}/${key}`, make);
  const material = share(root, 'material/tissue', () => new THREE.MeshStandardMaterial({ color: 0xffffff,
    vertexColors: true, roughness: .8, metalness: 0, side: THREE.DoubleSide, emissive: 0, emissiveIntensity: 0 }));
  const mesh = new THREE.Mesh(geometry, material); mesh.name = key; mesh.castShadow = false; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}

const gold=[.48,.38,.15],pink=[.60,.37,.44],jointTint=[.34,.24,.30],orange=[.66,.37,.16],brown=[.48,.36,.24],dark=[.085,.060,.048];
function heldBase(root,radius,tint){return add(root,'fixed attached base',()=>{const b=builder();
  b.ellipsoid([0,.014,0],[radius,.014,radius],tint,20,6);return b.finish();});}
function bladeGeometry(start,end,halfWidth,tint){const b=builder(),rows=12,side=new THREE.Vector3(end[2]-start[2],0,start[0]-end[0]).normalize();
  if(side.lengthSq()<.5)side.set(0,0,1);
  for(let row=0;row<=rows;row++){const u=row/rows,width=halfWidth*Math.sin(Math.PI*u)**.65+.0007;
    for(const edge of[-1,0,1])b.vertex([start[0]+(end[0]-start[0])*u+side.x*width*edge,
      start[1]+(end[1]-start[1])*u+.025*Math.sin(Math.PI*u)*(1-Math.abs(edge)),
      start[2]+(end[2]-start[2])*u+side.z*width*edge],tint);}
  for(let r=0;r<rows;r++)for(let edge=0;edge<2;edge++){const a=r*3+edge;b.face(a,a+3,a+1);b.face(a+1,a+3,a+4);}return b.finish();}
function palm(root,p){
  p.base=add(root,'branched holdfast and straight unbranched woody stipe',()=>{const b=builder();
    b.ellipsoid([0,.012,0],[.075,.012,.075],brown,16,6);
    b.tube([[0,.018,0],[0,.31,0],[0,.56,0]],[.028,.018,.014],brown,10);
    for(let i=0;i<8;i++){const angle=i*TAU/8,x=Math.cos(angle),z=Math.sin(angle);b.tube([[0,.04,0],[x*.06,.022,z*.06],[x*.105,.007,z*.105]],[.019,.012,.006],brown,7);}
    return b.finish();});
  p.terminal=new THREE.Group();p.terminal.position.y=.56;root.add(p.terminal);
  add(root,'single long terminal linear blade',()=>bladeGeometry([0,0,0],[.10,.44,0],.055,gold),p.terminal);
  p.sporophylls=[];
  for(const side of[-1,1])for(let level=0;level<2;level++){const leaf=new THREE.Group();leaf.position.set(0,.52+level*.027,0);leaf.scale.x=side;leaf.userData.side=side;root.add(leaf);p.sporophylls.push(leaf);
    add(root,`whole lateral sporophyll ${level}`,()=>bladeGeometry([0,0,0],[.62-level*.06,.19+level*.025,(level?1:-1)*.21],.083,gold),leaf);}
  root.userData.anatomy={bodyForm:'woody-stiped-palm-kelp',unbranchedStipe:true,terminalBlades:1,lateralSporophylls:4,forkedHoldfast:true};
  root.userData.measureReferences={wholeHeight:1,baseY:0,highestBladeY:1,selection:'authored complete-height selection, not stipe length'};
}
function coralline(root,p){p.base=heldBase(root,.165,pink);p.fronds=[];
  for(let i=0;i<4;i++){const frond=new THREE.Group();frond.position.set(Math.cos(i*TAU/4)*.028,.025,Math.sin(i*TAU/4)*.028);frond.rotation.y=i*TAU/4;frond.userData.baseYaw=frond.rotation.y;root.add(frond);p.fronds.push(frond);
    add(root,'whole articulated forked coralline frond',()=>{const b=builder();
      const chain=(nodes,radius)=>{for(let n=0;n<nodes.length-1;n++){const a=new THREE.Vector3(...nodes[n]),end=new THREE.Vector3(...nodes[n+1]),delta=end.clone().sub(a),t=.09,side=new THREE.Vector3(-delta.y,delta.x,0).normalize(),width=radius*(1-n*.035);
        const q=(u,w)=>a.clone().addScaledVector(delta,u).addScaledVector(side,w).toArray();
        b.fin([q(t,-width*.28),q(.32,-width*1.4),q(.75,-width*1.6),q(1-t,-width*.28),q(1-t,width*.28),q(.75,width*1.6),q(.32,width*1.4),q(t,width*.28)],pink,.003);
        b.tube([a.toArray(),a.clone().addScaledVector(delta,t).toArray()],[radius*.29,radius*.29],jointTint,6);
        if(n===nodes.length-2)b.tube([end.clone().addScaledVector(delta,-t).toArray(),end.toArray()],[radius*.29,radius*.12],pink,6);}};
      chain([[0,0,0],[.01,.13,0],[.03,.26,0],[.025,.39,0],[.03,.52,0],[.02,.65,0],[.025,.78,0],[0,.89,0],[.025,.975,0]],.024);
      for(const side of[-1,1]){chain([[.03,.26,0],[side*.17,.39,.018],[side*.32,.51,.025],[side*.43,.63,.028]],.018);
        chain([[.03,.52,0],[side*.17,.64,-.028],[side*.31,.77,-.03],[side*.39,.89,-.035]],.016);
        chain([[.025,.78,0],[side*.14,.87,.016],[side*.24,.975,.028]],.013);}
      const geometry=b.finish();geometry.scale(1,.975/geometry.boundingBox.max.y,.48);geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;},frond);}
  root.userData.anatomy={bodyForm:'articulated-coralline-tuft',calcifiedSegments:true,thinFlattenedWingedIntergenicula:true,flexibleGenicula:true,forkedFronds:4};
  root.userData.measureReferences={erectBranchedHeight:1,baseY:0,highestBranchY:1};
}
function apertureGeometry(center,normal,outer,inner,tint){const b=builder(),n=new THREE.Vector3(...normal).normalize(),u=new THREE.Vector3().crossVectors(n,Math.abs(n.y)>.9?new THREE.Vector3(1,0,0):new THREE.Vector3(0,1,0)).normalize(),v=new THREE.Vector3().crossVectors(n,u),c=new THREE.Vector3(...center),sides=24;
  for(const radius of[outer,inner])for(let i=0;i<=sides;i++)b.vertex(c.clone().addScaledVector(u,Math.cos(TAU*i/sides)*radius).addScaledVector(v,Math.sin(TAU*i/sides)*radius).toArray(),tint);
  for(let i=0;i<sides;i++){b.face(i,i+1,sides+1+i);b.face(i+1,sides+2+i,sides+1+i);}return b.finish();}
function recessedPore(root,key,point,normal,radius){const group=new THREE.Group();group.position.set(point.x,point.y,point.z);root.add(group);
  const opening=add(root,key+' fixed visible aperture plane',()=>{const b=builder(),n=new THREE.Vector3(...normal).normalize(),u=new THREE.Vector3().crossVectors(n,Math.abs(n.y)>.9?new THREE.Vector3(1,0,0):new THREE.Vector3(0,1,0)).normalize(),v=new THREE.Vector3().crossVectors(n,u),center=b.vertex([0,0,0],dark);
    for(let i=0;i<=24;i++)b.vertex(u.clone().multiplyScalar(Math.cos(TAU*i/24)*radius).addScaledVector(v,Math.sin(TAU*i/24)*radius).toArray(),dark);for(let i=0;i<24;i++)b.face(center,i+1,i+2);return b.finish();},group);
  const rim=add(root,key+' bounded aperture rim',()=>apertureGeometry([0,0,0],normal,radius*1.36,radius,pink),group);
  return{group,opening,rim};}
function sponge(root,p,s){p.base=heldBase(root,.23,orange);const ref=s.foodCapturePointLocal??s.morphology.foodCapturePointLocal;
  p.body=add(root,'complete lobulate orange sponge with actual incurrent surface opening',()=>{const b=builder(),sides=40,lats=[.06,...Array.from({length:24},(_,r)=>(r+1)*Math.PI/25),Math.PI/2,Math.acos(.6),Math.PI].sort((a,c)=>a-c),target=new THREE.Vector3(ref.x,ref.y,ref.z);
    for(const lat of lats)for(let i=0;i<=sides;i++){const a=TAU*i/sides,x=.5*Math.sin(lat)*Math.cos(a),y=Math.max(.018,.5+.5*Math.cos(lat)),z=.5*Math.sin(lat)*Math.sin(a),bump=Math.sin(a*9+lat*4)*Math.sin(lat*13);
      b.vertex([x,y,z],bump>.36?[.72,.44,.21]:orange);}
    for(let r=0;r<lats.length-1;r++)for(let i=0;i<sides;i++){const a=r*(sides+1)+i,c=a+sides+1,angle=TAU*(i+.5)/sides,lat=(lats[r]+lats[r+1])*.5,mid=new THREE.Vector3(.5*Math.sin(lat)*Math.cos(angle),.5+.5*Math.cos(lat),.5*Math.sin(lat)*Math.sin(angle));
      if(mid.distanceTo(target)<.053)continue;b.face(a,c,a+1);b.face(a+1,c,c+1);}return b.finish();});
  p.capture=recessedPore(root,'incurrent ostium',ref,[.8,.6,0],.012);p.captureOrgan=p.capture.opening;
  p.outlet=add(root,'independent open upper osculum',()=>{const b=builder();const levels=[[.993,.031],[1.020,.028],[1.034,.026]],sides=24;
    for(const [y,r]of levels)for(const radius of[r,r*.67])for(let i=0;i<=sides;i++)b.vertex([Math.cos(TAU*i/sides)*radius,y,Math.sin(TAU*i/sides)*radius],orange);
    for(let l=0;l<levels.length-1;l++)for(let wall=0;wall<2;wall++)for(let i=0;i<sides;i++){const a=l*2*(sides+1)+wall*(sides+1)+i,c=a+2*(sides+1);b.face(a,a+1,c);b.face(a+1,c+1,c);}
    const a=2*2*(sides+1);for(let i=0;i<sides;i++){b.face(a+i,a+i+1,a+sides+1+i);b.face(a+i+1,a+sides+2+i,a+sides+1+i);}return b.finish();});
  root.userData.anatomy={bodyForm:'globular-puffball-sponge',incurrentOstium:true,outflowOsculum:true,mouth:false};
  root.userData.measureReferences={bodyDiameter:1,bodyMinX:-.5,bodyMaxX:.5,osculumExcludedFromDiameter:true};
}
function tunicate(root,p,s){p.base=heldBase(root,.062,brown);p.body=add(root,'long attachment stalk and longitudinally ribbed cylindrical ascidian body',()=>{const b=builder();
    b.tube([[0,.012,0],[0,.27,0],[0,.535,0]],[.032,.024,.031],brown,10);b.ellipsoid([0,.708,0],[.084,.183,.078],brown,24,12);
    for(let i=0;i<10;i++){const a=TAU*i/10;b.tube([[Math.cos(a)*.052,.568,Math.sin(a)*.047],[Math.cos(a)*.082,.706,Math.sin(a)*.076],[Math.cos(a)*.053,.846,Math.sin(a)*.048]],[.0045,.005,.004],pink,6);}
    b.tube([[.035,.83,0],[.085,.942,0],[.14,.936,0],[.14,.86,0]],[.033,.030,.029,.028],brown,12,[true,false]);
    b.tube([[-.031,.845,0],[-.035,.920,0],[-.035,.993,0]],[.027,.024,.023],brown,12,[true,false]);return b.finish();});
  const ref=s.foodCapturePointLocal??s.morphology.foodCapturePointLocal;p.capture=recessedPore(root,'fixed downturned inhalant siphon',ref,[0,-1,0],.024);p.captureOrgan=p.capture.opening;
  p.exhalant=recessedPore(root,'separate upright exhalant siphon',{x:-.035,y:.993,z:0},[0,1,0],.021);
  p.lobes=[];
  for(const [key,center,sign]of[['inhalant',ref,-1],['exhalant',{x:-.035,y:.993,z:0},1]])for(let i=0;i<4;i++){const a=TAU*i/4;
    const lobe=add(root,key+' four-lobed aperture '+i,()=>{const b=builder();b.ellipsoid([Math.cos(a)*.023,sign*.001,Math.sin(a)*.023],[.011,.006,.010],brown,12,6);return b.finish();},key==='inhalant'?p.capture.group:p.exhalant.group);p.lobes.push(lobe);}
  root.userData.anatomy={bodyForm:'stalked-ribbed-solitary-ascidian',stalkAtLeastBodyLength:true,siphons:2,inhalantDirection:'downturned',exhalantDirection:'upright',lobesPerSiphon:4,mouth:false};
  root.userData.measureReferences={totalHeightIncludingStalk:1,baseY:0,siphonEndY:1,stalkLength:.535,bodyLength:.366};
}
export function createKelpUnderstoryLifeAsset(speciesOrId){const id=typeof speciesOrId==='string'?speciesOrId:speciesOrId?.id,s=kelpUnderstoryLifeSpeciesById[id];if(!s)throw new TypeError('Unknown kelp understory representative.');
  const root=new THREE.Group(),parts={},point=s.foodCapturePointLocal??s.morphology?.foodCapturePointLocal;root.name=s.commonName;
  Object.assign(root.userData,{speciesId:id,scientificName:s.scientificName,kind:s.kind,sizeMeasure:s.sizeMeasure,phase:0,assetVersion:1,
    kelpUnderstoryLifeResources:new Set(),kelpUnderstoryLifeDisposed:false,localEnvelope:KELP_UNDERSTORY_LIFE_ENVELOPES[id],
    ...(point?{foodCapturePointLocal:{...point},capturePointLocal:{...point}}:{}),
    role:isKelpUnderstoryLifePlant(id)?'independent-scenery-not-simulated-biomass':'independent-attached-filter-animal',
    originConvention:'fixed attached base; +Y actual support normal and +X projected heading',morphologyStatus:'source-informed complete bounded authored form; display proportions and pore sizes are uncalibrated'});
  instances.add(root);try{if(id==='pterygophora-californica')palm(root,parts);else if(id==='calliarthron-cheilosporioides')coralline(root,parts);else if(id==='orange-puffball-sponge')sponge(root,parts,s);else tunicate(root,parts,s);
    root.userData.kelpUnderstoryLifeParts=parts;return root;}catch(error){disposeKelpUnderstoryLifeAsset(root);throw error;}}
export function animateKelpUnderstoryLifeAsset(root,nativeTimeSec,record={}){const p=root?.userData.kelpUnderstoryLifeParts;if(!p||root.userData.kelpUnderstoryLifeDisposed||record.alive===false)return;
  const time=Number.isFinite(nativeTimeSec)?nativeTimeSec:0,phase=Number.isFinite(record.phase)?record.phase:root.userData.phase??0,flow=THREE.MathUtils.clamp(record.localEnvironment?.currentMps??record.currentMps??0,0,1.2)/1.2;
  if(p.terminal){p.terminal.rotation.z=Math.sin(time*.43+phase)*.035*flow;p.sporophylls.forEach((leaf,i)=>{leaf.rotation.z=Math.sin(time*.37+phase+i)*.032*flow;});}
  if(p.fronds)p.fronds.forEach((frond,i)=>{frond.rotation.z=Math.sin(time*.51+phase+i)*.026*flow;});
  if(p.capture){const ingested=Number.isFinite(record.lastFeedAt)&&time>=record.lastFeedAt&&time-record.lastFeedAt<.8;const opening=ingested?1+Math.sin(time*1.2+phase)*.025:1;p.capture.rim.scale.setScalar(opening);}
  root.userData.kelpUnderstoryLifeLastTimeSec=time;}
export function disposeKelpUnderstoryLifeAsset(root){if(!root||root.userData.kelpUnderstoryLifeDisposed)return;root.userData.kelpUnderstoryLifeDisposed=true;
  for(const key of root.userData.kelpUnderstoryLifeResources??[]){const row=resources.get(key);if(row&&--row.refs<=0){row.value.dispose();resources.delete(key);}}root.userData.kelpUnderstoryLifeResources?.clear();instances.delete(root);root.removeFromParent();root.clear();}
export const kelpUnderstoryLifeAssetStats=()=>({resources:resources.size,instances:instances.size});
