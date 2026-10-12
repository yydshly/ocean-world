import preparedHabitats from './world/shallowPreparedHabitats.js';
import { oceanRockHeight } from './oceanRockShape.js';
import {naturalBankHeight} from './world/ShallowNaturalHabitat.js';

// A connected reef edge, with room for attached and crawling residents in
// front and a coral canopy behind. Coordinates are in metres, as are animals.
export function createSampleReefLedges(model, progress) {
  const view=model.path.getPointAt(progress(24));
  return [
    {x:view.x+3.1,z:view.z+2,scale:{x:5.5,y:1.4,z:3.3},profile:'natural-b',rotation:.17},
    {x:view.x-2.4,z:view.z+2.4,scale:{x:5.7,y:1.25,z:3.8},profile:'natural-a',rotation:-.24},
    {x:view.x+7.3,z:view.z+4.4,scale:{x:6.1,y:1.55,z:4.1},profile:'natural-c',rotation:.12},
  ].map((r,i)=>{
    naturalBankHeight(i,0,0);
    const width=r.scale.x;
    return {...r,id:`sample-resident-ledge-${i}`,fieldAsset:'natural-substrate',bankVariant:i,
      profile:`sample-field-natural-substrate-${i}-v2`,scale:{x:width,y:width,z:width},y:model.floor(r.x,r.z)-.06};
  });
}

export function arrangeSampleReefResidents(model, ledges, options={}) {
  const signature=JSON.stringify({revision:'contact-primary-sites-v1',rocks:model.rocks,agents:model.agents.map(a=>[a.id,a.sizeM,a.home])},(_,v)=>typeof v==='number'&&Number.isFinite(v)?Number(v.toFixed(8)):v);
  let hash=2166136261;for(let i=0;i<signature.length;i++)hash=Math.imul(hash^signature.charCodeAt(i),16777619);
  model.primaryHabitatSignature=`${signature.length}:${hash>>>0}`;
  const cached=options.prepared!==false&&preparedHabitats?.primary?.signature===model.primaryHabitatSignature?preparedHabitats.primary:null;
  model.preparedPrimaryHabitats=!!cached;model.primaryHabitatSites=[];
  const [front,left]=ledges, residents=[], fish=[], footprints=[];
  const take=(species,count,select=()=>true)=>model.agents.filter(a=>a.speciesId===species&&select(a)).slice(0,count);
  // A ring can miss a shallow cut inside an irregular scan. Validate the
  // complete swept disk before assigning a crawler's habitat.
  function completeFootprint(host,x,z,radius){
    for(let n=0;n<16;n++){
      const qx=x+radius*Math.cos(n*Math.PI/8),qz=z+radius*Math.sin(n*Math.PI/8),y=oceanRockHeight(host,qx,qz);
      if(y===null||y<model.floor(qx,qz)+.035||model.surface(qx,qz)>y+.01)return false;
    }
    for(let dx=-radius;dx<=radius;dx+=.045)for(let dz=-radius;dz<=radius;dz+=.045){
      if(dx*dx+dz*dz>radius*radius)continue;
      const qx=x+dx,qz=z+dz,y=oceanRockHeight(host,qx,qz);
      if(y===null||y<model.floor(qx,qz)+.035||model.surface(qx,qz)>y+.01)return false;
    }
    return true;
  }
  function place(a,host,x,z,motion=0) {
    const factor=a.speciesId==='painted-spiny-lobster'?2.3:a.speciesId==='spotted-reef-crab'?1.1:
      a.speciesId==='day-octopus'?.5:a.speciesId==='tube-sponge'?.4:.6;
    const radius=a.sizeM*factor+motion,desired={x:host.x+x,z:host.z+z};let best=null;
    const saved=cached?.sites.find(p=>p.agentId===a.id);let reused=false;
    if(saved){
      const savedHost=ledges.find(h=>h.id===saved.host);
      if(savedHost&&Math.abs(saved.r-radius)<1e-8&&!footprints.some(p=>Math.hypot(saved.x-p.x,saved.z-p.z)<radius+p.r+.025)&&completeFootprint(savedHost,saved.x,saved.z,radius)){
        best={x:saved.x,z:saved.z,r:radius,score:0};host=savedHost;reused=true;
      }
    }
    for(let ring=0;!reused&&ring<=20;ring++)for(let n=0;n<(ring?24:1);n++) {
      const angle=n*Math.PI/12,px=desired.x+ring*.10*Math.cos(angle),pz=desired.z+ring*.10*Math.sin(angle);
      if(footprints.some(p=>Math.hypot(px-p.x,pz-p.z)<radius+p.r+.025))continue;
      let low=Infinity,high=-Infinity,valid=true;
      for(let k=0;k<9;k++) {
        const theta=k*Math.PI/4,r=k===8?0:radius,qx=px+r*Math.cos(theta),qz=pz+r*Math.sin(theta);
        const y=oceanRockHeight(host,qx,qz);
        if(y===null||y<model.floor(qx,qz)+.035||model.surface(qx,qz)>y+.01){valid=false;break;}
        low=Math.min(low,y);high=Math.max(high,y);
      }
      if(!valid||!completeFootprint(host,px,pz,radius))continue;
      const score=ring*.10+(high-low)*2;
      if(!best||score<best.score)best={x:px,z:pz,r:radius,score};
    }
    if(!best){
      for(const alternate of ledges)if(alternate!==host){
        for(let dx=-1.6;dx<=1.6;dx+=.4)for(let dz=-.8;dz<=1.6;dz+=.4){
          const px=alternate.x+dx,pz=alternate.z+dz;
          if(footprints.some(p=>Math.hypot(px-p.x,pz-p.z)<radius+p.r+.025))continue;
          let valid=true,low=Infinity,high=-Infinity;
          for(let k=0;k<17;k++){
            const theta=k*Math.PI/8,r=k===16?0:radius,qx=px+r*Math.cos(theta),qz=pz+r*Math.sin(theta),y=oceanRockHeight(alternate,qx,qz);
            if(y===null||y<model.floor(qx,qz)+.035||model.surface(qx,qz)>y+.01){valid=false;break;}
            low=Math.min(low,y);high=Math.max(high,y);
          }
          if(valid&&(!best||high-low<best.score)&&completeFootprint(alternate,px,pz,radius)){best={x:px,z:pz,r:radius,score:high-low};host=alternate;}
        }
      }
    }
    if(!best)throw new Error(`No clear hard-bottom footprint for ${a.id}`);
    model.primaryHabitatSites.push({...best,agentId:a.id,host:host.id});
    footprints.push(best);a.home={x:best.x,z:best.z};a.host=host.id;residents.push(a);
  }
  function attached(species,points,host=front) {
    const members=take(species,points.length);
    members.forEach((a,i)=>{
      const [x,z]=points[i];place(a,host,x,z);a.heading=.35+i*.6;
    });
  }
  function crawling(species,points,host=front) {
    const members=take(species,points.length);
    members.forEach((a,i)=>{
      const [x,z]=points[i];
      a.radius=species==='day-octopus'?.18:.10;a.speed=species==='day-octopus'?.035:.025;
      a.phase=i*1.7;place(a,host,x,z,a.radius);
    });
  }
  attached('fluted-giant-clam',[[-.3,-.65],[.8,.5]]);
  attached('tropical-urchin',[[-1.25,.4],[-.5,.45]]);
  attached('tube-sponge',[[.25,.8]]);
  attached('shallow-feather-star',[[.6,-.4]],left);
  crawling('day-octopus',[[.9,-.45]]);
  crawling('spotted-reef-crab',[[-1.1,-.5],[1.8,.2]]);
  crawling('painted-spiny-lobster',[[1.1,-.75]],left);

  // Different reef fish have independent, compact patrols; they do not all
  // inherit the large water-column orbit. Dips are visible movement, not an
  // assertion that this finite sample consumes ecosystem food stocks.
  function patrol(species,count,lift,behavior,select=()=>true) {
    take(species,count,select).forEach((a,i)=>{
      a.home={x:front.x+(i-(count-1)/2)*.55,z:front.z-1.05+(i%2)*.42};
      a.phase=i*2.39996-24*a.speed;a.radius=.8;
      a.reefPatrol={x:.55+(i%2)*.2,z:.32,vertical:behavior==='dip'?.20:.10,behavior};
      a.lift=lift+(i%3)*.17;fish.push(a);
    });
  }
  patrol('copperband-butterflyfish',4,.55,'patrol');
  patrol('emperor-angelfish',3,1.15,'patrol');
  patrol('reef-parrotfish',5,.40,'dip',a=>a.home.x>-10);

  const anthias=take('lyretail-anthias',30);
  anthias.forEach((a,i)=>{
    const angle=i*2.39996,r=.85*Math.sqrt((i+.5)/anthias.length);
    a.schoolCenter={x:front.x+.9,z:front.z+.25};
    a.home={x:a.schoolCenter.x+Math.cos(angle)*r,z:a.schoolCenter.z+Math.sin(angle)*r};
    a.schoolOrbit={x:.38,z:.3};a.schoolFormation={forward:1,side:.65};
    a.schoolPhase=-24*a.speed;a.schoolVertical=(i%5)*.09;a.lift=.95;
  });
  fish.push(...anthias);

  const occupied=footprints;
  // Preserve clear animal footprints and patrol corridors. Colonies still
  // attach to real rock triangles, rather than being painted onto bare sand.
  for(let i=model.corals.length-1;i>=0;i--){const c=model.corals[i];
    if(occupied.some(p=>Math.hypot(c.x-p.x,c.z-p.z)<p.r+c.radius))model.corals.splice(i,1);
  }
  for(const [j,host] of ledges.entries())for(let i=0;i<12;i++) {
    const angle=i*2.39996+j*.7,r=.18+(i%3)*.06;
    const x=host.x+Math.cos(angle)*host.scale.x*r,z=host.z+Math.sin(angle)*host.scale.z*r;
    const width=.65+(i%4)*.22,height=.38+(i%3)*.18,radius=width*.52;
    if(occupied.some(p=>Math.hypot(x-p.x,z-p.z)<p.r+radius))continue;
    if(fish.some(a=>a.reefPatrol&&Math.hypot(x-a.home.x,z-a.home.z)<a.reefPatrol.x+radius+a.sizeM))continue;
    const y=oceanRockHeight(host,x,z);if(y===null||model.surface(x,z)>y+.01)continue;
    model.corals.push({x,y,z,host:host.id,form:['branching','fan','table'][i%3],width,height,radius,rotation:angle,tint:(i%3)/3});
  }
  model.reefCommunity={time:24,ledges,residents,fish};
}
