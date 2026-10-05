// Shared authored terrain in metres. Rendering and behavior use the same reef
// shoulders. The renderer samples this upper surface; triangle interpolation
// still approximates its continuous relief. Crevices stay open.
import { REEF_AUXILIARY_ROCKS } from './reefScenery.js';

export const REEF_ROCKS = [
  [-4.2,.58,-1.4,2.2,.9,1.7],[-3.2,.8,-3.5,2.5,1.2,1.9],
  [-5.2,.85,-5.6,2.3,1.2,1.8],[-5.8,.6,1.9,2.1,.8,1.5],
  [-7,.75,4.1,2.4,1,2],[4.8,.52,-4.8,2.1,.8,1.6],
  [6.9,.5,-7.2,2.8,.8,2.1],[2.4,.3,-2.55,.95,.5,.75],
  [.90,-.07,-3.08,.42,.16,.35],[2.05,.35,-2.55,1.4,.65,.9],
  [4.0,.45,1.3,1.7,.7,1.4],[5.6,.6,-1.2,2.1,.9,1.6],
];
// Legacy registry index: rock9 is now one continuous bed-connected ledge.
// Rock7 stays below sediment; rock8 is a low rear fragment, not a pillar.
export const REEF_BRIDGE_ROCK_INDEX = 9;
const REEF_HARD_SUBSTRATE_ROCKS=Object.freeze([...REEF_ROCKS,...REEF_AUXILIARY_ROCKS]);
export function floorHeight(x,z){return -.15+Math.sin(x*.39)*Math.sin(z*.32)*.13+Math.sin(z*1.45+x*.27)*.023;}

// Authored roughness, not a measured geological process. Values are metres;
// the ny² envelope gives a continuous join to the unmodified lower hemisphere.
export function reefRockRelief(nx,ny,nz,rock){
  if(ny<=0)return 0;
  const phase=rock[0]*1.73+rock[2]*.79;
  return ny*ny*(.055*Math.sin(nx*4.3+nz*2.7+phase)*Math.cos(nx*2.1-nz*3.9)
    +.027*Math.sin(nz*8.1+nx*6.3+phase*.7));
}

const smoothBand=(a,b,value)=>{
  const t=Math.max(0,Math.min(1,(value-a)/(b-a)));
  return t*t*(3-2*t);
};
const smootherBand=(a,b,value)=>{
  const t=Math.max(0,Math.min(1,(value-a)/(b-a)));
  return t*t*t*(t*(t*6-15)+10);
};
const ellipseKernel=(feature,nx,nz)=>{
  const dx=nx-feature.x,dz=nz-feature.z;
  const along=dx*feature.axisX+dz*feature.axisZ,across=-dx*feature.axisZ+dz*feature.axisX;
  return Math.exp(-(along*along/(feature.along*feature.along)+across*across/(feature.across*feature.across)));
};

// The authored shoulders retain their metre-scale outer envelope and seed
// identity. Shapes are fixed terrain, never additional simulation RNG draws.
// The shelf/crevice use their own shared height intervals; auxiliary small
// stones retain the previous ellipsoid.
const rockProfiles=REEF_ROCKS.map((rock,index)=>{
  const phase=rock[0]*1.73+rock[2]*.79,axis=rock[0]*.41-rock[2]*.29+index*.63;
  const shelfCap=index===REEF_BRIDGE_ROCK_INDEX,creviceSupport=index===7||index===8;
  const offsets=shelfCap?[.93,.77,.97,.67,.91,.75]:[.75,.82,.85,.79,.87,.77];
  const facets=offsets.map((offset,i)=>{
    const direction=axis+i*Math.PI/3+.055*Math.sin(index*1.17+i*1.41);
    return Object.freeze({x:Math.cos(direction),z:Math.sin(direction),distance:offset+.025*Math.sin(index*.91+i*1.63)});
  });
  const shoulderPlanes=facets.map((facet,i)=>Object.freeze({...facet,
    rise:[.86,1.23,1.08,.93,1.31,1.16][(i+index)%6]+.045*Math.sin(index*.83+i*1.71)}));
  // Nine broad shoulders retain the low-mound revision. The independently
  // authored shelf uses rounded erosional footprints rather than straight
  // fracture planes, which made its previous supports read as square pillars.
  const rounded=index<=6||index>=10;
  const roundedShoulders=rounded?[.18,2.27,4.48].map((offset,i)=>{
    const angle=axis+offset+.16*Math.sin(index*.71+i*1.19);
    const radius=[.51,.65,.59][i]+.025*Math.sin(index*.83+i*1.37),tilt=angle+.35*Math.sin(index*.51+i);
    return Object.freeze({x:Math.cos(angle)*radius,z:Math.sin(angle)*radius,axisX:Math.cos(tilt),axisZ:Math.sin(tilt),
      along:.27+.025*Math.cos(index*.63+i*1.41),across:.19+.025*Math.sin(index*.79+i*1.13),
      heightM:[.44,.31,.25][i]+.05*Math.sin(index*.91+i*1.73)});
  }):null;
  const gullies=rounded?[1.13,3.47].map((offset,i)=>{
    const angle=axis+offset+.13*Math.cos(index*.67+i),radius=.56+.03*Math.sin(index*.59+i*1.71);
    return Object.freeze({x:Math.cos(angle)*radius,z:Math.sin(angle)*radius,axisX:Math.cos(angle),axisZ:Math.sin(angle),
      along:.34,across:.115+.015*Math.cos(index*.73+i),depthM:.11+.025*Math.sin(index*.97+i*1.4)});
  }):null;
  const depressionAngle=axis+.71,radius=.23+.025*Math.sin(index*.89);
  const coreDepression=rounded?Object.freeze({x:Math.cos(depressionAngle)*radius,z:Math.sin(depressionAngle)*radius,
    axisX:Math.cos(axis-.22),axisZ:Math.sin(axis-.22),along:.28,across:.18,
    depthM:.07+.025*Math.sin(index*.77+.31)}):null;
  const erodedFootprint=shelfCap?{angle:-.10,along:.97,across:.90,biasX:.015,biasZ:-.012,lobes:.025}:
    index===7?{angle:.15,along:.98,across:.85,biasX:.055,biasZ:0,lobes:.025}:
    index===8?{angle:.18,along:.78,across:.98,biasX:0,biasZ:-.060,lobes:.030}:null;
  return Object.freeze({phase,axisX:Math.cos(axis),axisZ:Math.sin(axis),
    secondaryX:Math.cos(axis+1.93),secondaryZ:Math.sin(axis+1.93),
    saddleDepth:.14+.05*Math.cos(index*.91),transitionAngle:axis+index*.17,
    facets:Object.freeze(facets),shoulderPlanes:Object.freeze(shoulderPlanes),
    roundedShoulders:roundedShoulders?Object.freeze(roundedShoulders):null,gullies:gullies?Object.freeze(gullies):null,
    coreHeightRatio:rounded ? .55+.05*(1+Math.sin(index*.83+.45)):1,coreDepression,
    shapeKind:shelfCap?'continuousLedge':index===7?'buriedRemnant':index===8?'rearFragment':'lowMound',
    erodedFootprint:erodedFootprint?Object.freeze(erodedFootprint):null,
    supportFeatures:null});
});
const profileCache=new WeakMap();
export function reefRockProfile(rock){
  if(profileCache.has(rock))return profileCache.get(rock);
  const index=REEF_ROCKS.findIndex(candidate=>candidate===rock||candidate.every((value,i)=>value===rock[i]));
  const profile=index<0?null:rockProfiles[index];
  profileCache.set(rock,profile);
  return profile;
}

// Six unequal fracture planes define a broad broken rim, wholly within the
// previous ellipse. The core-to-rim map is monotone and has no overhangs.
function boundaryRadius(profile,nx,nz,radius){
  if(!profile||radius<1e-15)return 1;
  if(profile.erodedFootprint){
    const f=profile.erodedFootprint,angle=Math.atan2(nz,nx),c=Math.cos(angle-f.angle),s=Math.sin(angle-f.angle);
    const ellipse=1/Math.sqrt(c*c/(f.along*f.along)+s*s/(f.across*f.across));
    // A broad biased outline with rounded erosional lobes. There are no
    // straight chord walls; the envelope remains inside the original ellipse.
    return Math.max(.65,Math.min(1,ellipse*(.945+f.biasX*Math.cos(angle)+f.biasZ*Math.sin(angle)
      +f.lobes*Math.sin(3*angle+.41))));
  }
  let boundary=1;
  for(const facet of profile.facets){
    const projection=(nx*facet.x+nz*facet.z)/radius;
    if(projection>0)boundary=Math.min(boundary,facet.distance/projection);
  }
  return boundary;
}
const radialMap=(radius,boundary)=>radius*(1-(1-boundary)*smoothBand(.38,1,radius));
function canonicalRadius(profile,nx,nz,radius){
  if(!profile||radius<=.38)return radius;
  const boundary=boundaryRadius(profile,nx,nz,radius);
  if(radius>boundary+1e-9)return NaN;
  let lower=.38,upper=1;
  for(let i=0;i<20;i++){
    const middle=(lower+upper)/2;
    if(radialMap(middle,boundary)<radius)lower=middle;else upper=middle;
  }
  return (lower+upper)/2;
}

// Inputs are WORLD XZ normalized by the original ellipse, not canonical mesh
// coordinates. Padding is in these normalized units, used only for guards.
export function reefRockFootprintContains(rock,nx,nz,paddingNormalized=0){
  const radius=Math.hypot(nx,nz);
  return radius<=boundaryRadius(reefRockProfile(rock),nx,nz,radius)+paddingNormalized+1e-9;
}
export function reefRockCanonicalCoordinates(rock,nx,nz){
  const profile=reefRockProfile(rock),radius=Math.hypot(nx,nz),boundary=boundaryRadius(profile,nx,nz,radius);
  const canonical=canonicalRadius(profile,nx,nz,radius),inside=radius<=boundary+1e-9;
  const factor=radius>1e-15?canonical/radius:1;
  return {inside,nx:inside?nx*factor:null,nz:inside?nz*factor:null,radius:inside?canonical:null,
    worldRadius:radius,boundaryRadius:boundary};
}

// World-space height at normalized footprint coordinates. ny chooses the
// upper/lower branch; its magnitude is derived from XZ so model, camera and
// render geometry evaluate the identical height field. Bases and selected
// shoulder rims are authored sediment burial, not surveyed geology.
function fracturedShoulderHeight(rock,nx,cap,nz,worldNx,worldNz,r,angle,rim,original,profile){
  const u=worldNx*profile.axisX+worldNz*profile.axisZ,v=-worldNx*profile.axisZ+worldNz*profile.axisX;
  const crown=rock[1]+rock[4]+reefRockRelief(0,1,0,rock);
  let shoulder=1.25;
  for(const plane of profile.shoulderPlanes){
    shoulder=Math.min(shoulder,plane.rise*(1-(worldNx*plane.x+worldNz*plane.z)/plane.distance));
  }
  shoulder=Math.max(0,shoulder);
  const saddle=profile.saddleDepth*Math.exp(-(((u-.43)/.19)**2+((v+.16)/.24)**2))
    *smootherBand(0,.18,shoulder);
  const fractured=rim+(crown-rim)*shoulder-saddle+.35*reefRockRelief(nx,cap,nz,rock);
  const transitionEnd=.81+.085*Math.sin(angle-profile.transitionAngle)+.025*Math.cos(angle*2+profile.phase);
  return original+(fractured-original)*smootherBand(.38,transitionEnd,r);
}

function heightFromCanonical(rock,nx,ny,nz,worldNx,worldNz,bedSupported,profile){
  const [cx,cy,cz,sx,sy,sz]=rock,oldY=cy+sy*ny;
  if(!profile){
    if(ny>=0)return oldY+reefRockRelief(nx,ny,nz,rock);
    if(!bedSupported)return oldY;
    const weight=smoothBand(0,.45,-ny),buriedY=floorHeight(cx+nx*sx,cz+nz*sz)-.10;
    return oldY+Math.min(0,buriedY-oldY)*weight;
  }
  const rSquared=nx*nx+nz*nz,r=Math.min(1,Math.sqrt(rSquared)),cap=Math.sqrt(Math.max(0,1-rSquared));
  const original=cy+sy*cap+reefRockRelief(nx,cap,nz,rock);
  const angle=Math.atan2(nz,nx),floor=floorHeight(cx+worldNx*sx,cz+worldNz*sz);
  if(profile.shapeKind==='continuousLedge'){
    // One shell rises out of sediment on the right, without a separate lid or
    // two visible supports. Broad convex shoulders and one shallow worn hollow
    // define the crown; no additional material microtexture is introduced.
    const rim=floor-.020,edgeBlend=smootherBand(.87,1,r);
    const rightShoulder=.19*Math.exp(-(((worldNx-.39)/.62)**2+((worldNz+.12)/.67)**2));
    const rearShoulder=.075*Math.exp(-(((worldNx+.18)/.53)**2+((worldNz+.39)/.44)**2));
    const wornHollow=.12*Math.exp(-(((worldNx-.03)/.35)**2+((worldNz-.29)/.31)**2));
    let upper=rim+(.63+rightShoulder+rearShoulder-wornHollow)*(1-r*r*r*r);
    let lower=floor-.12+(rim-(floor-.12))*edgeBlend;
    // The offset crevice stays in WORLD coordinates. Moving the ledge center
    // does not move the authored x=1.35m passage into its bed-supported core.
    // Raised rim endpoints are the same on both branches, retaining closure.
    const worldX=cx+worldNx*sx,worldZ=cz+worldNz*sz;
    // The west side remains open all the way to its eroded rim. A bounded
    // channel mask fell back to sediment westward, leaving a thin false pillar.
    const passage=1-smootherBand(1.50,1.84,worldX);
    const erodedCeiling=.360+.030*Math.exp(-(((worldZ+2.5)/.70)**2));
    lower+=Math.max(0,erodedCeiling-lower)*passage;
    upper+=Math.max(0,erodedCeiling+.10*cap-upper)*passage;
    return ny<0?lower:upper;
  }
  if(profile.shapeKind==='buriedRemnant'){
    // Preserve the31-rock registry, but remove the old visible right pillar.
    // Both branches are genuinely below the shared sediment, not hidden meshes
    // with a different collision surface.
    const rim=floor-.045;
    return ny<0?rim-.075*cap:rim-.015*cap;
  }
  if(profile.shapeKind==='rearFragment'){
    const rim=floor-.020;
    if(ny<0)return floor-.10+(rim-(floor-.10))*smootherBand(.88,1,r);
    return rim+(.17+.045*Math.exp(-(((worldNx-.25)/.38)**2+((worldNz+.15)/.45)**2)))*(1-r*r*r*r);
  }
  const rim=floor+.045+.020*(.5+.5*Math.sin(angle*3+profile.phase))
    +.020*(.5+.5*Math.cos(angle*5-profile.phase*.7));
  const buriedRim=floor-.020+.005*Math.sin(angle*2+profile.phase);
  if(ny<0){
    if(!bedSupported)return rim-sy*cap;
    // The edge now starts near sediment, avoiding the old cy-high circular
    // wall and stretched conical skirt. Different rock faces retreat at
    // different rates while the sampled support footprint stays buried.
    const edgeBlend=.18+.025*Math.sin(angle*2+profile.phase);
    const lower=rim+(floor-.10-rim)*smoothBand(0,edgeBlend,cap);
    if(!profile.roundedShoulders||r<=.90+1e-12)return lower;
    // Start from the buried internal bed, not the old elevated outer rim.
    // Sharing this envelope with the upper edge prevents a thin crossed shell.
    return floor-.10+(buriedRim-(floor-.10))*smootherBand(.90,1,r);
  }
  if(profile.roundedShoulders){
    let shoulders=0,gullies=0;
    for(const feature of profile.roundedShoulders)shoulders+=feature.heightM*ellipseKernel(feature,worldNx,worldNz);
    for(const feature of profile.gullies)gullies+=feature.depthM*ellipseKernel(feature,worldNx,worldNz);
    // Connected low convex shoulders and broad concave channels replace the
    // former continuous tilted walls. Channels may disappear under sediment;
    // the floor beneath the solid shell remains at least 0.10 m deep.
    const exposed=floor+Math.max(-.04,shoulders-gullies)+.20*reefRockRelief(nx,cap,nz,rock);
    const transitionEnd=.78+.055*Math.sin(angle-profile.transitionAngle)+.025*Math.cos(angle*2+profile.phase);
    const depression=profile.coreDepression.depthM*ellipseKernel(profile.coreDepression,worldNx,worldNz)
      *smootherBand(.04,.15,r)*(1-smootherBand(.50,.74,r));
    const core=floor+(original-floor)*profile.coreHeightRatio-depression;
    // The blend starts inside the former protected crown. Keeping the old
    // r=.38 high plateau made the surrounding shoulder a smooth bare cliff.
    // This wide descent gives a low connected mound; all original metre-scale
    // footprint coordinates and the independent crevice interval stay fixed.
    const upper=core+(exposed-core)*smootherBand(.08,transitionEnd,r);
    // Both hemispheres meet 15–25 mm below the shared sediment surface. The
    // old complete dark lip is removed by geometry, not a material tint.
    return upper+(buriedRim-upper)*smootherBand(.90,1,r);
  }
  return fracturedShoulderHeight(rock,nx,cap,nz,worldNx,worldNz,r,angle,rim,original,profile);
}

export function reefRockSurfaceY(rock,nx,ny,nz,bedSupported=false){
  const profile=reefRockProfile(rock);
  if(!profile)return heightFromCanonical(rock,nx,ny,nz,nx,nz,bedSupported,profile);
  const radius=Math.sqrt(nx*nx+nz*nz),canonical=canonicalRadius(profile,nx,nz,radius);
  // Outside the fractured footprint there is no rock interval. The finite
  // fallback is sediment; all callers must check footprintContains first.
  if(!Number.isFinite(canonical))return floorHeight(rock[0]+nx*rock[3],rock[2]+nz*rock[5]);
  const factor=radius>.38?canonical/radius:1;
  return heightFromCanonical(rock,nx*factor,ny,nz*factor,nx,nz,bedSupported,profile);
}

// Inputs are CANONICAL sphere/disk coordinates. Both hemispheres use the same
// monotone footprint map; Y is evaluated directly, with no inverse round trip.
export function reefRockSurfacePoint(rock,nx,ny,nz,bedSupported=false){
  const profile=reefRockProfile(rock),radius=Math.hypot(nx,nz),canonical=Math.min(1,radius);
  const mapped=radialMap(canonical,boundaryRadius(profile,nx,nz,radius)),factor=radius>1e-15?mapped/radius:1;
  const worldNx=nx*factor,worldNz=nz*factor,canonicalFactor=radius>1?1/radius:1;
  return {x:rock[0]+worldNx*rock[3],y:heightFromCanonical(rock,nx*canonicalFactor,ny,nz*canonicalFactor,
    worldNx,worldNz,bedSupported,profile),z:rock[2]+worldNz*rock[5]};
}

export function habitatHeight(x,z){
  let h=floorHeight(x,z);
  for(const rock of REEF_HARD_SUBSTRATE_ROCKS){
    const [cx,cy,cz,sx,sy,sz]=rock,nx=(x-cx)/sx,nz=(z-cz)/sz,r=nx*nx+nz*nz;
    if(r<1&&reefRockFootprintContains(rock,nx,nz)){
      const ny=Math.sqrt(1-r);h=Math.max(h,reefRockSurfaceY(rock,nx,ny,nz));
    }
  }
  return h;
}

// Eight authored colony sites on the broad reef shoulders, clear of the sand
// channel and the narrow cleaner-shrimp arch. Offsets are normalized ellipse
// coordinates. Seed jitter stays near the crown and does not add random draws.
// A. muricata reef-slope/lagoon habitat: Corals of the World species factsheet.
// Solid attachment requirement is inferred from NOAA's general coral account:
// https://floridakeys.noaa.gov/corals/coralreefs.html (read 2026-10-03).
export const REEF_CORAL_ANCHORS=Object.freeze([
  [0,-.22,.12],[0,.27,-.08],[1,.23,-.12],[2,.08,.18],
  [3,-.15,.16],[4,.20,.10],[10,-.10,.14],[11,-.08,-.12],
].map(anchor=>Object.freeze(anchor)));

export function coralAttachmentPosition(index,jitterX,jitterZ){
  if(!Number.isInteger(index)||index<0||index>=REEF_CORAL_ANCHORS.length)throw new RangeError('Unknown authored coral attachment site.');
  if(!Number.isFinite(jitterX)||!Number.isFinite(jitterZ)||Math.abs(jitterX)>1+1e-12||Math.abs(jitterZ)>1+1e-12)throw new RangeError('Coral attachment jitter must be finite and in [-1,1].');
  const [rockIndex,ux,uz]=REEF_CORAL_ANCHORS[index],rock=REEF_ROCKS[rockIndex];
  const x=rock[0]+(ux+jitterX*.055)*rock[3],z=rock[2]+(uz+jitterZ*.055)*rock[5];
  return {x,y:habitatHeight(x,z)+.004,z};
}
