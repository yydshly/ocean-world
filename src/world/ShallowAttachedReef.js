import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {oceanRockHeight} from '../oceanRockShape.js';
import {shallowBenthicCoralGeometries} from './ShallowBenthicCorals.js';

// A whole low reef layer occupies exposed hard substrate between taller
// crowns. Each source colony is conformed to the actual host triangles;
// it is an authored adaptation, not a new scan or measured biological stock.
export function arrangeAttachedReef(model){
  const rows=[],path=Array.from({length:121},(_,i)=>model.path.getPointAt(i/120));
  const spaces=[...(model.slopeHabitats?.footprints??[]),...model.agents.filter(a=>a.mode==='crawl'||a.mode==='fixed').map(a=>({x:a.home.x,z:a.home.z,r:a.sizeM*(a.speciesId==='painted-spiny-lobster'?2.3:a.speciesId==='spotted-reef-crab'?1.1:.65)+(a.mode==='crawl'?a.radius:0)+.10}))];
  const assets=shallowBenthicCoralGeometries('cover'),hosts=model.rocks;
  for(let h=0;h<hosts.length;h++){
    const host=hosts[h],co=Math.cos(host.rotation),si=Math.sin(host.rotation);let accepted=0;
    for(let i=0;i<480&&accepted<26;i++){
      const a=i*2.39996+h*.7,r=Math.sqrt((i+.5)/480),dx=Math.cos(a)*host.scale.x*(host.fieldAsset?.62:.44)*r,dz=Math.sin(a)*host.scale.z*(host.fieldAsset?.62:.38)*r;
      const x=host.x+dx*co+dz*si,z=host.z-dx*si+dz*co,width=.78+.35*(.5+.5*Math.sin(i*7.13+h)),radius=width*.5;
      const y=oceanRockHeight(host,x,z);if(y===null||y<model.floor(x,z)+.07)continue;
      if(host.fieldAsset&&(y-host.y)/host.scale.y>.305)continue;
      if(path.some(p=>Math.hypot(x-p.x,z-p.z)<1.95+radius)||spaces.some(p=>Math.hypot(x-p.x,z-p.z)<p.r+radius+.04))continue;
      if(model.livingCoverComposition.naturalGaps.some(p=>Math.hypot(x-p.x,z-p.z)<p.r+radius))continue;
      if([...model.corals,...rows].some(c=>Math.hypot(x-c.x,z-c.z)<c.radius+radius+.025))continue;
      let valid=true;
      for(let j=0;j<12;j++){
        const px=x+radius*Math.cos(j*Math.PI/6),pz=z+radius*Math.sin(j*Math.PI/6),py=oceanRockHeight(host,px,pz);
        if(py===null||Math.abs(model.surface(px,pz)-py)>.015||py<model.floor(px,pz)+.025){valid=false;break;}
      }
      if(!valid||Math.abs(model.surface(x,z)-y)>.015)continue;
      const key=(h+i)%3===0?'table-1':'massive-1',rotation=i*1.713,height=width*assets[key].userData.sourceAspect;
      // Tight conservative top is filled from ALL displayed vertices below,
      // so fish navigation reserves the complete conformed crown, not a point.
      const row={host:host.id,x,y,z,key,width,height,radius,rotation,clearanceHeight:0};
      const g=conformAttachedColony(row,host,assets[key]);
      const p=g.attributes.position;
      for(let v=0;v<p.count;v++){
        if(p.getY(v)<model.surface(p.getX(v),p.getZ(v))-.001){valid=false;break;}
        row.clearanceHeight=Math.max(row.clearanceHeight,p.getY(v)-y);
      }
      g.dispose();if(!valid)continue;
      rows.push(row);accepted++;
    }
  }
  Object.values(assets).forEach(g=>g.dispose());model.attachedReef=rows;return rows;
}

export function conformAttachedColony(row,host,source){
  const g=source.clone(),p=g.attributes.position,co=Math.cos(row.rotation),si=Math.sin(row.rotation);
  for(let i=0;i<p.count;i++){
    const x=row.x+row.width*(p.getX(i)*co+p.getZ(i)*si),z=row.z+row.width*(-p.getX(i)*si+p.getZ(i)*co),y=oceanRockHeight(host,x,z);
    if(y===null)throw Error('Attached reef exceeded its complete hard host');
    p.setXYZ(i,x,y+.002+p.getY(i)*row.height,z);
  }
  g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();return g;
}
export function attachedReefMeshes(model){
  const assets=shallowBenthicCoralGeometries('cover'),hosts=new Map(model.rocks.map(r=>[r.id,r])),groups=new Map();
  for(const row of model.attachedReef??[]){
    const key=`${Math.floor(row.x/24)}/${row.key}`;if(!groups.has(key))groups.set(key,{key:row.key,parts:[]});
    groups.get(key).parts.push(conformAttachedColony(row,hosts.get(row.host),assets[row.key]));
  }
  const result=[...groups.values()].map(({key,parts})=>{const geometry=mergeGeometries(parts);parts.forEach(g=>g.dispose());geometry.computeBoundingSphere();return {key,geometry};});
  Object.values(assets).forEach(g=>g.dispose());return result;
}
