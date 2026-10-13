// The rendered rock and every support query share these exact Float32 vertices.
// Profiles describe broad forms rather than surface texture or surveyed geology.
export const OCEAN_ROCK_SURFACE_VERSION = 2;
export const OCEAN_ROCK_PROFILES = Object.freeze(['mound', 'terrace', 'ridge']);
// New scene profiles have a separate identity: historic meshes and their
// three-profile registry must remain byte-for-byte compatible with old saves.
export const LIVING_SHALLOWS_ROCK_PROFILES = Object.freeze(['natural-a', 'natural-b', 'natural-c']);
// A separate identity for the finite sample; saved ocean profiles stay exact.
export const SHALLOW_SAMPLE_ROCK_PROFILES = Object.freeze(['sample-reef-a', 'sample-reef-b', 'sample-reef-c']);
// Authored live-slope substrate is separate from every saved or earlier sample
// profile. Its terraces are actual top triangles, never visual overhangs.
export const SHALLOW_SAMPLE_SLOPE_ROCK_PROFILES = Object.freeze(['sample-slope-a', 'sample-slope-b', 'sample-slope-c']);
const NATURAL_SECTORS = 32;
const NATURAL_RADII = Object.freeze([.065, .13, .22, .32, .43, .55, .67, .78, .89, 1]);
const SECTORS = 16;
const RADII = Object.freeze([.09, .18, .27, .34, .43, .5]);
const ANGLE = Math.PI * 2 / SECTORS;
const EPSILON = 1e-10;
const meshes = new Map();
const rockTransforms = new WeakMap();

function profileHeight(profile, x, z, ring) {
  const radius = Math.hypot(x, z);
  if (ring === RADII.length) return 0;
  if (profile === 'terrace') {
    // A broad upper platform, steep shoulder and a lower shelf.
    if (ring <= 3) return .86;
    const angle = Math.atan2(z, x);
    return ring === 4 ? .44 + .035 * Math.sin(angle) : .30 + .025 * Math.sin(angle * 2);
  }
  const dome = Math.sqrt(Math.max(0, 1 - (radius * 2) ** 2));
  if (profile === 'ridge') return dome * (.18 + .82 * Math.exp(-((z / .105) ** 2)));
  return dome;
}

function getMesh(profile) {
  if (meshes.get(profile)?.fieldScan) return meshes.get(profile);
  if (SHALLOW_SAMPLE_SLOPE_ROCK_PROFILES.includes(profile)) return getSampleSlopeMesh(profile);
  if (SHALLOW_SAMPLE_ROCK_PROFILES.includes(profile)) return getSampleReefMesh(profile);
  if (LIVING_SHALLOWS_ROCK_PROFILES.includes(profile)) return getNaturalMesh(profile);
  if (!OCEAN_ROCK_PROFILES.includes(profile)) throw new RangeError(`Unknown ocean rock profile: ${profile}`);
  if (meshes.has(profile)) return meshes.get(profile);
  const positions = [0, Math.fround(profileHeight(profile, 0, 0, 0)), 0], indices = [];
  for (let ring = 0; ring < RADII.length; ring++) for (let sector = 0; sector < SECTORS; sector++) {
    const angle = sector * ANGLE, x = Math.cos(angle) * RADII[ring], z = Math.sin(angle) * RADII[ring];
    positions.push(Math.fround(x), Math.fround(profileHeight(profile, x, z, ring + 1)), Math.fround(z));
  }
  const vertex = (ring, sector) => 1 + (ring - 1) * SECTORS + (sector % SECTORS);
  for (let sector = 0; sector < SECTORS; sector++) indices.push(0, vertex(1, sector + 1), vertex(1, sector));
  for (let ring = 2; ring <= RADII.length; ring++) for (let sector = 0; sector < SECTORS; sector++) {
    indices.push(vertex(ring - 1, sector), vertex(ring - 1, sector + 1), vertex(ring, sector));
    indices.push(vertex(ring - 1, sector + 1), vertex(ring, sector + 1), vertex(ring, sector));
  }
  const faces = [];
  for (let triangle = 0; triangle < indices.length / 3; triangle++) {
    const a = indices[triangle * 3] * 3, b = indices[triangle * 3 + 1] * 3, c = indices[triangle * 3 + 2] * 3;
    const abx = positions[b] - positions[a], aby = positions[b + 1] - positions[a + 1], abz = positions[b + 2] - positions[a + 2];
    const acx = positions[c] - positions[a], acy = positions[c + 1] - positions[a + 1], acz = positions[c + 2] - positions[a + 2];
    const nx = aby * acz - abz * acy, ny = abz * acx - abx * acz, nz = abx * acy - aby * acx;
    const length = Math.hypot(nx, ny, nz);
    faces.push({ a, b, c,
      denominator: (positions[b + 2] - positions[c + 2]) * (positions[a] - positions[c]) +
        (positions[c] - positions[b]) * (positions[a + 2] - positions[c + 2]),
      normal: Object.freeze({ x: nx / length, y: ny / length, z: nz / length }) });
  }
  const mesh = Object.freeze({ positions: Object.freeze(positions), indices: Object.freeze(indices) });
  const data = { mesh, faces };
  meshes.set(profile, data);
  return data;
}

function getNaturalMesh(profile) {
  if (meshes.has(profile)) return meshes.get(profile);
  const variant = LIVING_SHALLOWS_ROCK_PROFILES.indexOf(profile), phase = variant * 1.71;
  const rimRadius = angle => .5 * (.82 + .07 * Math.sin(angle * 3 + phase) +
    .05 * Math.cos(angle * 5 - phase) + .04 * Math.sin(angle * 2 + .9));
  const height = (x, z, radial) => {
    if (radial === 1) return 0;
    const u = x * 2, v = z * 2;
    const lobe = (cx, cz, sx, sz) => Math.exp(-(((u - cx) / sx) ** 2 + ((v - cz) / sz) ** 2));
    const ridge = variant === 1 ? .68 * lobe(-.12, .07, .72, .27) + .36 * lobe(.38, -.08, .30, .43) :
      variant === 2 ? .56 * lobe(.22, -.23, .43, .48) + .52 * lobe(-.30, .24, .47, .38) :
        .65 * lobe(-.19, .13, .49, .63) + .43 * lobe(.32, -.15, .38, .47);
    const grain = .045 * Math.sin(u * 17 + phase) * Math.cos(v * 13 - phase) +
      .025 * Math.sin((u + v) * 25);
    return Math.max(0, Math.min(1, (ridge + .10 + grain) * (1 - radial ** 3)));
  };
  const positions = [0, Math.fround(height(0, 0, 0)), 0], indices = [], angleStep = Math.PI * 2 / NATURAL_SECTORS;
  for (const radial of NATURAL_RADII) for (let sector = 0; sector < NATURAL_SECTORS; sector++) {
    const angle = sector * angleStep, radius = radial * rimRadius(angle), x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
    positions.push(Math.fround(x), Math.fround(height(x, z, radial)), Math.fround(z));
  }
  const vertex = (ring, sector) => 1 + (ring - 1) * NATURAL_SECTORS + sector % NATURAL_SECTORS;
  for (let sector = 0; sector < NATURAL_SECTORS; sector++) indices.push(0, vertex(1, sector + 1), vertex(1, sector));
  for (let ring = 2; ring <= NATURAL_RADII.length; ring++) for (let sector = 0; sector < NATURAL_SECTORS; sector++) {
    indices.push(vertex(ring - 1, sector), vertex(ring - 1, sector + 1), vertex(ring, sector));
    indices.push(vertex(ring - 1, sector + 1), vertex(ring, sector + 1), vertex(ring, sector));
  }
  const faces = [];
  for (let index = 0; index < indices.length; index += 3) {
    const [a, b, c] = indices.slice(index, index + 3).map(vertexIndex => vertexIndex * 3);
    const abx = positions[b] - positions[a], aby = positions[b + 1] - positions[a + 1], abz = positions[b + 2] - positions[a + 2];
    const acx = positions[c] - positions[a], acy = positions[c + 1] - positions[a + 1], acz = positions[c + 2] - positions[a + 2];
    const nx = aby * acz - abz * acy, ny = abz * acx - abx * acz, nz = abx * acy - aby * acx, length = Math.hypot(nx, ny, nz);
    faces.push({ a, b, c, denominator: (positions[b + 2] - positions[c + 2]) * (positions[a] - positions[c]) +
      (positions[c] - positions[b]) * (positions[a + 2] - positions[c + 2]),
      normal: Object.freeze({ x: nx / length, y: ny / length, z: nz / length }) });
  }
  const mesh = Object.freeze({ positions: Object.freeze(positions), indices: Object.freeze(indices), rimSectors: NATURAL_SECTORS });
  const data = { mesh, faces, natural: true, sectors: NATURAL_SECTORS, radii: NATURAL_RADII };
  meshes.set(profile, data);
  return data;
}

function getSampleReefMesh(profile) {
  if(meshes.has(profile))return meshes.get(profile);
  const variant=SHALLOW_SAMPLE_ROCK_PROFILES.indexOf(profile),phase=variant*1.71;
  const sectors=64,radii=Array.from({length:24},(_,i)=>(i+1)/24),positions=[],indices=[];
  // The same 32-sided original footprint, subdivided along its actual edges.
  const original=oceanRockMesh(LIVING_SHALLOWS_ROCK_PROFILES[variant]),rim=original.positions.length/3-32;
  const radiusAt=angle=>{
    const k=Math.min(31,Math.floor(angle/(Math.PI*2/32))),a=(rim+k)*3,b=(rim+(k+1)%32)*3,p=original.positions;
    const dx=Math.cos(angle),dz=Math.sin(angle);
    return (p[a]*p[b+2]-p[a+2]*p[b])/(dx*(p[b+2]-p[a+2])-dz*(p[b]-p[a]));
  };
  const height=(x,z,r)=>{
    if(r===1)return 0;
    // Sample-only reef shoulders: a high spine, eroded joints and a lower
    // apron. The real top triangles still define every attachment/support.
    const shoulder=Math.max(0,1-r**4)**.34;
    const axis=x*Math.sin(phase)+z*Math.cos(phase);
    const joint=Math.exp(-(((x*Math.cos(phase)-z*Math.sin(phase)-.075)/.033)**2));
    const spine=.28*Math.exp(-((axis/.19)**2));
    const shelves=.38+.14*Math.sin(x*8+phase)*Math.cos(z*6-phase);
    const erosion=.025*Math.sin(x*31+phase)*Math.cos(z*25);
    return Math.max(0,Math.min(1,(shelves+spine-.22*joint+erosion)*shoulder));
  };
  positions.push(0,Math.fround(height(0,0,0)),0);
  for(const r of radii)for(let k=0;k<sectors;k++){
    const angle=k*Math.PI*2/sectors,radius=r*radiusAt(angle),x=Math.cos(angle)*radius,z=Math.sin(angle)*radius;
    positions.push(Math.fround(x),Math.fround(height(x,z,r)),Math.fround(z));
  }
  const vertex=(ring,k)=>1+(ring-1)*sectors+k%sectors;
  for(let k=0;k<sectors;k++)indices.push(0,vertex(1,k+1),vertex(1,k));
  for(let ring=2;ring<=radii.length;ring++)for(let k=0;k<sectors;k++){
    indices.push(vertex(ring-1,k),vertex(ring-1,k+1),vertex(ring,k),vertex(ring-1,k+1),vertex(ring,k+1),vertex(ring,k));
  }
  const faces=[];
  for(let k=0;k<indices.length;k+=3){
    const [a,b,c]=indices.slice(k,k+3).map(i=>i*3),p=positions;
    const abx=p[b]-p[a],aby=p[b+1]-p[a+1],abz=p[b+2]-p[a+2],acx=p[c]-p[a],acy=p[c+1]-p[a+1],acz=p[c+2]-p[a+2];
    const nx=aby*acz-abz*acy,ny=abz*acx-abx*acz,nz=abx*acy-aby*acx,length=Math.hypot(nx,ny,nz);
    faces.push({a,b,c,denominator:(p[b+2]-p[c+2])*(p[a]-p[c])+(p[c]-p[b])*(p[a+2]-p[c+2]),normal:Object.freeze({x:nx/length,y:ny/length,z:nz/length})});
  }
  const mesh=Object.freeze({positions:Object.freeze(positions),indices:Object.freeze(indices),rimSectors:sectors});
  const data={mesh,faces,natural:true,sectors,radii};meshes.set(profile,data);return data;
}

function getSampleSlopeMesh(profile) {
  if (meshes.has(profile)) return meshes.get(profile);
  const variant = SHALLOW_SAMPLE_SLOPE_ROCK_PROFILES.indexOf(profile), phase = variant * 1.83;
  const sectors = 64, radii = Array.from({ length: 36 }, (_, i) => (i + 1) / 36);
  const positions = [], indices = [], step = Math.PI * 2 / sectors;
  const smooth = t => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); };
  const rimRadius = angle => .5 * (.88 + .045 * Math.sin(angle * 3 + phase) +
    .025 * Math.cos(angle * 5 - phase) + .025 * Math.sin(angle * 2 + .7));
  const height = (x, z, radial) => {
    if (radial === 1) return 0;
    // Broad supporting regions remain, but their shoulders wander along the
    // reef rather than describing parallel straight steps. Smooth low relief,
    // connected shallow grooves and a broken rear crest are real triangles;
    // there is no overhang or separate decorative shell above the support.
    // A continuous rising reef surface with interlocking heads replaces the
    // two staircase levels. The same surface carries colonies and residents.
    const axis = z + .055 * Math.sin(x * 9 + phase) + .022 * Math.sin(x * 18 - phase);
    const broadSupport = .34 + .40 * smooth((axis + .29) / .64);
    const along = .048 * Math.sin(x * 8.4 + phase)
      + .027 * Math.cos(x * 17.5 - phase * .7);
    const cross = .024 * Math.sin(axis * 12 + phase * .55);
    const lobe = (cx, cz, sx, sz) => Math.exp(-(((x - cx) / sx) ** 2 + ((z - cz) / sz) ** 2));
    const hummocks = .105 * lobe(-.23, -.13 + .035*Math.sin(phase), .14, .18)
      + .115 * lobe(.19, .16 + .035*Math.cos(phase), .17, .20)
      + .075 * lobe(.01, .30, .19, .14);
    const grooveAxis = .020 + .070 * Math.sin(z * 6 + phase);
    const groove = .035 * Math.exp(-(((x - grooveAxis) / .075) ** 2));
    const erosion = .005 * Math.sin(x * 31 + phase) * Math.cos(z * 22 - phase);
    const crestZ = .34 + .030 * Math.sin(x * 9 + phase) - .016 * Math.cos(x * 17 - phase);
    const crest = .074 * Math.exp(-(((z - crestZ) / .085) ** 2))
      * (.40 + .60 * Math.sin(x * 13 + phase) ** 2);
    const toe = smooth((1 - radial) / .23);
    return Math.max(0, Math.min(1, (broadSupport + along + cross + hummocks - groove + erosion + crest) * toe));
  };
  positions.push(0, Math.fround(height(0, 0, 0)), 0);
  for (const radial of radii) for (let sector = 0; sector < sectors; sector++) {
    const angle = sector * step, radius = radial * rimRadius(angle);
    const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
    positions.push(Math.fround(x), Math.fround(height(x, z, radial)), Math.fround(z));
  }
  const vertex = (ring, sector) => 1 + (ring - 1) * sectors + sector % sectors;
  for (let sector = 0; sector < sectors; sector++) indices.push(0, vertex(1, sector + 1), vertex(1, sector));
  for (let ring = 2; ring <= radii.length; ring++) for (let sector = 0; sector < sectors; sector++) {
    indices.push(vertex(ring - 1, sector), vertex(ring - 1, sector + 1), vertex(ring, sector),
      vertex(ring - 1, sector + 1), vertex(ring, sector + 1), vertex(ring, sector));
  }
  const faces = [];
  for (let index = 0; index < indices.length; index += 3) {
    const [a, b, c] = indices.slice(index, index + 3).map(i => i * 3), p = positions;
    const abx = p[b] - p[a], aby = p[b + 1] - p[a + 1], abz = p[b + 2] - p[a + 2];
    const acx = p[c] - p[a], acy = p[c + 1] - p[a + 1], acz = p[c + 2] - p[a + 2];
    const nx = aby * acz - abz * acy, ny = abz * acx - abx * acz, nz = abx * acy - aby * acx;
    const length = Math.hypot(nx, ny, nz);
    faces.push({ a, b, c, denominator: (p[b + 2] - p[c + 2]) * (p[a] - p[c]) +
      (p[c] - p[b]) * (p[a + 2] - p[c + 2]),
    normal: Object.freeze({ x: nx / length, y: ny / length, z: nz / length }) });
  }
  const mesh = Object.freeze({ positions: Object.freeze(positions), indices: Object.freeze(indices), rimSectors: sectors });
  const data = { mesh, faces, natural: true, sectors, radii };
  meshes.set(profile, data);
  return data;
}

export function oceanRockMesh(profile = 'mound') {
  return getMesh(profile).mesh;
}

// Finite-sample source meshes register explicitly. Historic profile generation
// and save identifiers are unchanged. The display and support share vertices.
export function registerFieldReefMesh(profile, positions, indices) {
  if(meshes.has(profile))return;
  if(!profile.startsWith('sample-field-'))throw Error('Field mesh must use a sample-only identity');
  const p=Float32Array.from(positions),ix=Uint32Array.from(indices),fieldFaces=new Float64Array(ix.length/3*12),cells=48;
  // These finite meshes have compact extents. A numeric grid avoids allocating
  // a coordinate string and hashing it for every triangle/cell pair. Bounds
  // come from the original vertices, including formations outside [-.5,.5].
  let minCellX=Infinity,maxCellX=-Infinity,minCellZ=Infinity,maxCellZ=-Infinity;
  for(let i=0;i<p.length;i+=3){
    const x=Math.floor((p[i]+.5)*cells),z=Math.floor((p[i+2]+.5)*cells);
    minCellX=Math.min(minCellX,x);maxCellX=Math.max(maxCellX,x);minCellZ=Math.min(minCellZ,z);maxCellZ=Math.max(maxCellZ,z);
  }
  const gridWidth=maxCellX-minCellX+1,gridHeight=maxCellZ-minCellZ+1;
  const bins=new Array(gridWidth*gridHeight);
  let faceCount=0;
  for(let k=0;k<ix.length;k+=3){
    const a=ix[k]*3,b=ix[k+1]*3,c=ix[k+2]*3;
    const abx=p[b]-p[a],aby=p[b+1]-p[a+1],abz=p[b+2]-p[a+2],acx=p[c]-p[a],acy=p[c+1]-p[a+1],acz=p[c+2]-p[a+2];
    let nx=aby*acz-abz*acy,ny=abz*acx-abx*acz,nz=abx*acy-aby*acx;
    const length=Math.hypot(nx,ny,nz),denominator=(p[b+2]-p[c+2])*(p[a]-p[c])+(p[c]-p[b])*(p[a+2]-p[c+2]);
    if(length<1e-12||Math.abs(denominator)<1e-12)continue;
    if(ny<0){nx=-nx;ny=-ny;nz=-nz;}
    const minX=Math.min(p[a],p[b],p[c]),maxX=Math.max(p[a],p[b],p[c]);
    const minZ=Math.min(p[a+2],p[b+2],p[c+2]),maxZ=Math.max(p[a+2],p[b+2],p[c+2]);
    // Conservative barycentric edge and Float32 transform margins. Bounds
    // only reject impossible triangles; arithmetic, ties and normals stay exact.
    const marginX=EPSILON*(2*(maxX-minX)+1)+Number.EPSILON*Math.max(Math.abs(minX),Math.abs(maxX))*32;
    const marginZ=EPSILON*(2*(maxZ-minZ)+1)+Number.EPSILON*Math.max(Math.abs(minZ),Math.abs(maxZ))*32;
    const face=faceCount++,offset=face*12;
    fieldFaces[offset]=a;fieldFaces[offset+1]=b;fieldFaces[offset+2]=c;fieldFaces[offset+3]=denominator;
    fieldFaces[offset+4]=minX-marginX;fieldFaces[offset+5]=maxX+marginX;fieldFaces[offset+6]=minZ-marginZ;fieldFaces[offset+7]=maxZ+marginZ;
    fieldFaces[offset+8]=nx/length;fieldFaces[offset+9]=ny/length;fieldFaces[offset+10]=nz/length;
    fieldFaces[offset+11]=Math.max(p[a+1],p[b+1],p[c+1])+EPSILON*(Math.abs(p[a+1])+Math.abs(p[b+1])+Math.abs(p[c+1]))*4;
    for(let z=Math.floor((Math.min(p[a+2],p[b+2],p[c+2])+.5)*cells);z<=Math.floor((Math.max(p[a+2],p[b+2],p[c+2])+.5)*cells);z++)
      for(let x=Math.floor((Math.min(p[a],p[b],p[c])+.5)*cells);x<=Math.floor((Math.max(p[a],p[b],p[c])+.5)*cells);x++){
        const key=(z-minCellZ)*gridWidth+x-minCellX;(bins[key]??=[]).push(face);
      }
  }
  // Query the highest possible faces first. Once their conservative upper
  // bound is below a hit, the remaining faces cannot support this point.
  // Keep original face IDs for exact normal selection at coincident surfaces.
  for(const bin of bins)if(bin)bin.sort((a,b)=>fieldFaces[b*12+11]-fieldFaces[a*12+11]||a-b);
  let radiusSq=0;for(let i=0;i<p.length;i+=3)radiusSq=Math.max(radiusSq,p[i]**2+p[i+2]**2);
  meshes.set(profile,{mesh:{positions:p,indices:ix},fieldFaces:fieldFaces.subarray(0,faceCount*12),bins,cells,minCellX,minCellZ,gridWidth,gridHeight,fieldScan:true,radiusSq});
}

function fieldBin(data,x,z){
  x-=data.minCellX;z-=data.minCellZ;
  return x>=0&&z>=0&&x<data.gridWidth&&z<data.gridHeight ? data.bins[z*data.gridWidth+x] : undefined;
}

function triangleSurface(data, triangle, x, z) {
  if(data.fieldScan){
    const f=data.fieldFaces,i=triangle*12,p=data.mesh.positions,a=f[i],b=f[i+1],c=f[i+2],denominator=f[i+3];
    const u=((p[b+2]-p[c+2])*(x-p[c])+(p[c]-p[b])*(z-p[c+2]))/denominator;
    const v=((p[c+2]-p[a+2])*(x-p[c])+(p[a]-p[c])*(z-p[c+2]))/denominator,w=1-u-v;
    if(u < -EPSILON || v < -EPSILON || w < -EPSILON)return null;
    return {height:u*p[a+1]+v*p[b+1]+w*p[c+1],normal:{x:f[i+8],y:f[i+9],z:f[i+10]}};
  }
  const face = data.faces[triangle], p = data.mesh.positions;
  const u = ((p[face.b + 2] - p[face.c + 2]) * (x - p[face.c]) +
    (p[face.c] - p[face.b]) * (z - p[face.c + 2])) / face.denominator;
  const v = ((p[face.c + 2] - p[face.a + 2]) * (x - p[face.c]) +
    (p[face.a] - p[face.c]) * (z - p[face.c + 2])) / face.denominator;
  const w = 1 - u - v;
  if (u < -EPSILON || v < -EPSILON || w < -EPSILON) return null;
  const height=u * p[face.a + 1] + v * p[face.b + 1] + w * p[face.c + 1];
  return { height: data.fieldScan?height:Math.max(0, Math.min(1,height)),
    normal: face.normal };
}

export function oceanRockSurface(profile = 'mound', x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) throw new RangeError('Rock surface coordinates must be finite.');
  const data = getMesh(profile);
  if (x * x + z * z > (data.fieldScan?data.radiusSq:.25) + 1e-7) return null;
  if(data.fieldScan){
    let top=null,topFace=Infinity;
    for(const face of fieldBin(data,Math.floor((x+.5)*data.cells),Math.floor((z+.5)*data.cells))??[]){
      // Barycentric edge tolerance permits a tiny extrapolation. Retain that
      // margin, including negative heights; this is not an approximate grid.
      const f=data.fieldFaces,i=face*12;
      if(top&&f[i+11]<top.height)break;
      if(x<f[i+4]||x>f[i+5]||z<f[i+6]||z>f[i+7])continue;
      const hit=triangleSurface(data,face,x,z);
      if(hit&&(!top||hit.height>top.height||(hit.height===top.height&&face<topFace))){top=hit;topFace=face;}
    }
    return top;
  }
  if (data.natural) return naturalSurface(data, x, z);
  const radius = Math.hypot(x, z);
  let angle = Math.atan2(z, x);
  if (angle < 0) angle += Math.PI * 2;
  const sector = Math.min(SECTORS - 1, Math.floor(angle / ANGLE));
  // Intersect the radial ray with the regular polygon's straight edges.
  const polygonRadius = radius * Math.cos(angle - (sector + .5) * ANGLE) / Math.cos(ANGLE * .5);
  if (polygonRadius > .5 + 1e-7) return null;
  let ring = RADII.findIndex(value => polygonRadius <= value);
  if (ring === -1) ring = RADII.length - 1;
  ring++;
  const queryCell = (cellRing, cellSector) => {
    if (cellRing < 1 || cellRing > RADII.length) return null;
    const wrapped = (cellSector + SECTORS) % SECTORS;
    if (cellRing === 1) return triangleSurface(data, wrapped, x, z);
    const first = SECTORS + (cellRing - 2) * SECTORS * 2 + wrapped * 2;
    return triangleSurface(data, first, x, z) || triangleSurface(data, first + 1, x, z);
  };
  const surface = queryCell(ring, sector);
  if (surface) return surface;
  // Float32 rounding can put a ring/sector boundary a few ulps to either side
  // of its polar locator. Only neighbouring cells need checking, not all faces.
  for (const dr of [-1, 0, 1]) for (const ds of [-1, 0, 1]) {
    if (dr === 0 && ds === 0) continue;
    const adjacent = queryCell(ring + dr, sector + ds);
    if (adjacent) return adjacent;
  }
  return null;
}

function naturalSurface(data, x, z) {
  const step = Math.PI * 2 / data.sectors, radius = Math.hypot(x, z);
  let angle = Math.atan2(z, x);
  if (angle < 0) angle += Math.PI * 2;
  const sector = Math.min(data.sectors - 1, Math.floor(angle / step)), p = data.mesh.positions;
  const rim = 1 + (data.radii.length - 1) * data.sectors;
  const a = (rim + sector) * 3, b = (rim + (sector + 1) % data.sectors) * 3;
  const dx = Math.cos(angle), dz = Math.sin(angle), denominator = dx * (p[b + 2] - p[a + 2]) - dz * (p[b] - p[a]);
  const edge = (p[a] * p[b + 2] - p[a + 2] * p[b]) / denominator;
  const fraction = radius / edge;
  if (fraction > 1 + 1e-7) return null;
  let ring = data.radii.findIndex(value => fraction <= value);
  if (ring === -1) ring = data.radii.length - 1;
  ring++;
  const query = (candidateRing, candidateSector) => {
    if (candidateRing < 1 || candidateRing > data.radii.length) return null;
    const wrapped = (candidateSector + data.sectors) % data.sectors;
    if (candidateRing === 1) return triangleSurface(data, wrapped, x, z);
    const first = data.sectors + (candidateRing - 2) * data.sectors * 2 + wrapped * 2;
    return triangleSurface(data, first, x, z) || triangleSurface(data, first + 1, x, z);
  };
  const own = query(ring, sector);
  if (own) return own;
  // Shared Float32 vertices can put a boundary on the adjacent polar cell.
  for (const dr of [-1, 0, 1]) for (const ds of [-1, 0, 1]) {
    if (dr || ds) { const adjacent = query(ring + dr, sector + ds); if (adjacent) return adjacent; }
  }
  return null;
}

export function oceanRockHeight(rock, worldX, worldZ) {
  if (!Number.isFinite(worldX) || !Number.isFinite(worldZ)) throw new RangeError('Rock world coordinates must be finite.');
  const rotation = rock.rotation ?? 0, { x: sx, y: sy, z: sz } = rock.scale;
  let transform = rockTransforms.get(rock);
  if (!transform || transform.rotation !== rotation || transform.sx !== sx || transform.sy !== sy || transform.sz !== sz) {
    if (!(sx > 0 && sy > 0 && sz > 0 && Number.isFinite(sx) && Number.isFinite(sy) && Number.isFinite(sz) &&
      Number.isFinite(rotation))) throw new RangeError('Rock scale and rotation must be finite, with positive scale.');
    transform = { rotation, sx, sy, sz, cos: Math.cos(rotation), sin: Math.sin(rotation), inverseX: 1 / sx, inverseZ: 1 / sz };
    rockTransforms.set(rock, transform);
  }
  const wx = worldX - rock.x, wz = worldZ - rock.z;
  const x = (wx * transform.cos - wz * transform.sin) * transform.inverseX;
  const z = (wx * transform.sin + wz * transform.cos) * transform.inverseZ;
  const surface = oceanRockSurface(rock.profile || 'mound', x, z);
  return surface ? rock.y + surface.height * sy : null;
}

// Conservative bound over the complete reserved movement disk. Thin scan
// fragments can be missed by any finite set of point/ring probes. Reject an
// overlap whenever an intersecting projected triangle could rise above the
// resident's original host, using the existing spatial index to keep it cheap.
export function fieldReefDiskMaxHeight(rock, worldX, worldZ, radius) {
  const data=getMesh(rock.profile);if(!data.fieldScan)return null;
  const co=Math.cos(rock.rotation??0),si=Math.sin(rock.rotation??0),dx=worldX-rock.x,dz=worldZ-rock.z;
  const x=(dx*co-dz*si)/rock.scale.x,z=(dx*si+dz*co)/rock.scale.z,r=radius/Math.min(rock.scale.x,rock.scale.z);
  if(Math.hypot(x,z)>r+.5)return null;
  const found=new Set(),cells=data.cells,p=data.mesh.positions,r2=r*r;
  for(let iz=Math.floor((z-r+.5)*cells);iz<=Math.floor((z+r+.5)*cells);iz++)for(let ix=Math.floor((x-r+.5)*cells);ix<=Math.floor((x+r+.5)*cells);ix++)
    for(const face of fieldBin(data,ix,iz)??[])found.add(face);
  const edgeHits=(a,b)=>{const vx=p[b]-p[a],vz=p[b+2]-p[a+2],length=vx*vx+vz*vz;
    const t=length?Math.max(0,Math.min(1,((x-p[a])*vx+(z-p[a+2])*vz)/length)):0;
    return (p[a]+vx*t-x)**2+(p[a+2]+vz*t-z)**2<=r2;
  };
  let highest=null;
  for(const id of found){const i=id*12,a=data.fieldFaces[i],b=data.fieldFaces[i+1],c=data.fieldFaces[i+2];
    if(!edgeHits(a,b)&&!edgeHits(b,c)&&!edgeHits(c,a)&&!triangleSurface(data,id,x,z))continue;
    const y=rock.y+Math.max(p[a+1],p[b+1],p[c+1])*rock.scale.y;
    highest=highest===null?y:Math.max(highest,y);
  }
  return highest;
}
