import {oceanRockHeight} from './oceanRockShape.js';
import * as THREE from 'three';
import {shallowSampleCoralGeometries} from './world/shallowSampleCoralAssets.js';
export {sampleSedimentTints} from './shallowSampleSediment.js';

// Authored community composition, not measured reef cover or biological stocks.
// Seeded independently so this habitat pass does not resize existing animals.
function random(seed){let n=seed>>>0;return()=>{n+=0x6D2B79F5;let t=n;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}

function coverAnimalSpaces(model){
  return [...(model.slopeHabitats?.footprints??[]),...model.agents.filter(a=>a.sampleCommunityVisit!==undefined&&a.mode==='cruise')
    .map(a=>({x:a.home.x,z:a.home.z,r:a.radius+a.sizeM*.9,agentId:a.id}))];
}

export function arrangeShallowLivingCover(model){
  const rng=random(model.seed^0x5EA1C0),rows=[],occupied=new Map(),chapters=Array.from({length:5},()=>[]),slopeGroups=[],growthPatches=[],naturalGaps=[];
  const path=Array.from({length:121},(_,i)=>model.path.getPointAt(i/120));
  const observations=[model.path.getPointAt(.27),model.path.getPointAt(.89)];
  const hardResidents=model.reefCommunity?.residents??model.agents.filter(a=>a.mode==='fixed');
  const animalSpaces=coverAnimalSpaces(model);
  const clearAnimalSpace=(x,z,radius)=>!animalSpaces.some(p=>Math.hypot(x-p.x,z-p.z)<radius+p.r+.025)&&
    !hardResidents.some(a=>Math.hypot(x-a.home.x,z-a.home.z)<radius+a.sizeM*(a.speciesId==='painted-spiny-lobster'?2.3:a.speciesId==='spotted-reef-crab'?1.1:.65)+(a.mode==='crawl'?a.radius:0));
  function candidate(rock,x,z,form,width,height,slot,community){
    const y=oceanRockHeight(rock,x,z),radius=width*.52;
    if(y===null||Math.abs(model.surface(x,z)-y)>.015)return null;
    let distance=Infinity,nearest=0;
    for(let i=0;i<path.length;i++){const d=Math.hypot(x-path[i].x,z-path[i].z);if(d<distance){distance=d;nearest=i;}}
    if(distance<1.9+radius||distance>14||!clearAnimalSpace(x,z,radius)||naturalGaps.some(p=>Math.hypot(x-p.x,z-p.z)<radius+p.r))return null;
    // A narrow basal stem needs a stable real triangle patch. Full crown
    // clearance, including broad massive bases, is checked by the final fit.
    let low=Infinity,high=-Infinity;
    for(let i=0;i<8;i++){
      const px=x+width*.055*Math.cos(i*Math.PI/4),pz=z+width*.055*Math.sin(i*Math.PI/4),py=oceanRockHeight(rock,px,pz);
      if(py===null||Math.abs(model.surface(px,pz)-py)>.015)return null;
      low=Math.min(low,py);high=Math.max(high,py);
    }
    if(high-low>(form==='table'?Math.max(.065,width*.17):.065))return null;
    const c={x,y,z,form,width,height,radius,rotation:rng()*Math.PI*2,host:rock.id,tint:(Math.floor((slot%15)/5)+.5)/3,community};
    const chapter=Math.min(4,Math.floor(nearest*5/path.length)),focus=Math.min(...observations.map(p=>Math.hypot(x-p.x,z-p.z)));
    return {c,chapter,priority:distance+.18*focus+5*(high-low)};
  }
  // Free two-dimensional growth patches replace the two regular rows on each
  // real bench. Overlapping ellipses preserve a continuous living canopy;
  // varied crown heights, patch edges and a few bare hard-bottom pockets give
  // it a different silhouette from repeated garden beds. These are authored
  // display communities, not simulated recruitment or measured reef cover.
  const slopeHosts=model.rocks.filter(r=>r.sampleSlope&&!r.fieldAsset);
  for(const [hostIndex,rock]of slopeHosts.entries()){
    const co=Math.cos(rock.rotation),si=Math.sin(rock.rotation);
    for(const [benchIndex,bench]of (rock.habitatBenches??[]).entries())if((hostIndex+benchIndex)%4===0){
      const dx=(rng()-.5)*bench.halfX*.65,dz=(rng()-.5)*bench.halfZ*.6;
      naturalGaps.push({x:bench.x+dx*co+dz*si,z:bench.z-dx*si+dz*co,r:.30+rng()*.13,host:rock.id,bench:benchIndex});
    }
  }
  for(const [hostIndex,rock]of slopeHosts.entries()){
    const candidates=[],co=Math.cos(rock.rotation),si=Math.sin(rock.rotation);
    // The full exposed grade is a growth region, not only its two bench
    // search bands. Small source colonies form connected low cover across
    // the front face while the existing full-body reservations stay open.
    const frontId=`${rock.id}/bench-0/whole-grade`;
    const front={x:rock.x,z:rock.z-.08*rock.scale.z};
    const frontX=rock.scale.x*.43,frontZ=rock.scale.z*.34;
    growthPatches.push({id:frontId,host:rock.id,bench:0,dominant:'table',...front,radiusX:frontX,radiusZ:frontZ});
    for(let dart=0;dart<220;dart++){
      const a=dart*2.39996,r=Math.sqrt((dart+.5)/220),dx=Math.cos(a)*frontX*r,dz=Math.sin(a)*frontZ*r;
      const x=front.x+dx*co+dz*si,z=front.z-dx*si+dz*co;
      const form=dart%7===0?'branching':dart%11===0?'massive':'table';
      const width=.48+rng()*.48,height=form==='branching'?.42+rng()*.30:.20+rng()*.20;
      const row=candidate(rock,x,z,form,width,height,dart,frontId);
      if(row){row.c.growthPatch=frontId;row.priority-=.35;candidates.push(row);}
    }
    for(const [benchIndex,bench] of (rock.habitatBenches??[]).entries()){
      const halfX=bench.halfX,halfZ=bench.halfZ*1.45;
      for(let patchIndex=0;patchIndex<3;patchIndex++){
        const centreX=(patchIndex-1)*halfX*.66+(rng()-.5)*.48,centreZ=(rng()-.5)*halfZ*.5;
        const radiusX=1.50+rng()*.47,radiusZ=halfZ*(.78+rng()*.18);
        const patchId=`${rock.id}/bench-${benchIndex}/patch-${patchIndex}`,dominant=(hostIndex+benchIndex+patchIndex)%3===0?'table':'branching';
        const centre={x:bench.x+centreX*co+centreZ*si,z:bench.z-centreX*si+centreZ*co};
        growthPatches.push({id:patchId,host:rock.id,bench:benchIndex,dominant,...centre,radiusX,radiusZ});
        for(let dart=0;dart<48;dart++){
          const angle=rng()*Math.PI*2,r=Math.sqrt(rng()),localX=centreX+Math.cos(angle)*radiusX*r,localZ=centreZ+Math.sin(angle)*radiusZ*r;
          if(Math.abs(localX)>halfX||Math.abs(localZ)>halfZ*.94)continue;
          const x=bench.x+localX*co+localZ*si,z=bench.z-localX*si+localZ*co,choice=rng();
          const form=choice<.70?dominant:choice<.91?(dominant==='table'?'branching':'table'):choice<.97?'massive':'fan';
          // Larger inner crowns and smaller outer companions are composed as
          // a patch. Their dimensions remain metre-scale and are not trees.
          const width=form==='massive'?.72+rng()*.35:form==='fan'?.79+rng()*.32:.69+(1-r)*.40+rng()*.29;
          const tier=(benchIndex? .10:0)+(1-r)*.16;
          const height=form==='table'?.32+tier+rng()*.18:form==='massive'?.34+tier+rng()*.22:form==='fan'?.74+tier+rng()*.28:.60+tier+rng()*.29;
          const row=candidate(rock,x,z,form,width,height,patchIndex*32+dart,patchId);
          if(row){row.priority+=r*.09;row.c.growthPatch=patchId;candidates.push(row);}
        }
      }
    }
    // Attached foliose colonies also occupy the front grade. These are
    // tangent-rooted surfaces; a horizontal flower-bed test is inappropriate.
    // The complete near/far vertex fit below still rejects substrate crossings.
    const bench=rock.habitatBenches[0];
    for(let patchIndex=0;patchIndex<3;patchIndex++){
      const localX=(patchIndex-1)*bench.halfX*.7,localZ=-bench.halfZ*1.4;
      const centre={x:bench.x+localX*co+localZ*si,z:bench.z-localX*si+localZ*co};
      const patchId=`${rock.id}/bench-0/front-${patchIndex}`,radiusX=1.55,radiusZ=.90;
      growthPatches.push({id:patchId,host:rock.id,bench:0,dominant:'table',...centre,radiusX,radiusZ});
      for(let dart=0;dart<28;dart++){
        const a=rng()*Math.PI*2,r=Math.sqrt(rng()),dx=Math.cos(a)*radiusX*r,dz=Math.sin(a)*radiusZ*r;
        const row=candidate(rock,centre.x+dx*co+dz*si,centre.z-dx*si+dz*co,'table',.62+rng()*.42,.18,patchIndex*28+dart,patchId);
        if(row){row.c.growthPatch=patchId;candidates.push(row);}
      }
    }
    candidates.sort((a,b)=>a.priority-b.priority);slopeGroups.push(candidates);
  }
  // Gather the whole habitat before spending its finite display budget. The
  // backbone used to consume the cap before the close reef shoulders ran.
  for(const rock of model.rocks.filter(r=>!r.sampleSlope&&!r.fieldAsset)){
    const foreground=rock.id.startsWith('sample-resident-ledge-');
    const attempts=foreground?132:rock.id.includes('backbone')?90:44;
    const co=Math.cos(rock.rotation),si=Math.sin(rock.rotation),choice=rng(),main=choice<.50?'branching':choice<.82?'table':'massive';
    for(let slot=0;slot<attempts;slot++){
      const angle=slot*2.39996+rng()*.3,r=.07+.31*Math.sqrt((slot+.5)/attempts);
      const dx=Math.cos(angle)*rock.scale.x*r,dz=Math.sin(angle)*rock.scale.z*r,x=rock.x+dx*co+dz*si,z=rock.z-dx*si+dz*co;
      const width=foreground?.42+rng()*.36:.88+rng()*.84;
      // Each actual bommie has a dominant growth form and companions, rather
      // than randomly alternating unrelated shapes at every instance.
      const companion=slot%5===0,form=foreground?(slot%5?'table':'massive'):slot%17===0?'fan':companion?(main==='massive'?'table':'massive'):main;
      const height=form==='table'?.38+rng()*.32:form==='massive'?.42+rng()*.38:form==='fan'?.80+rng()*.40:.85+rng()*.55;
      const row=candidate(rock,x,z,form,width,height,slot,`${rock.id}/${Math.floor(x/2)},${Math.floor(z/2)}`);
      if(row)chapters[row.chapter].push(row);
    }
  }
  for(const candidates of chapters)candidates.sort((a,b)=>a.priority-b.priority);
  function select(groups,limit){
    const cursors=groups.map(()=>0);let pending=true;
    while(rows.length<limit&&pending){
      pending=false;
      for(let group=0;group<groups.length&&rows.length<limit;group++){
        const candidates=groups[group];
        while(cursors[group]<candidates.length){
          pending=true;
          const {c}=candidates[cursors[group]++],{x,z,radius}=c;
          let overlap=false;
          for(let bz=Math.floor((z-radius)/2);bz<=Math.floor((z+radius)/2);bz++)for(let bx=Math.floor((x-radius)/2);bx<=Math.floor((x+radius)/2);bx++)
            for(const other of occupied.get(`${bx},${bz}`)??[])if(Math.hypot(x-other.x,z-other.z)<(radius+other.radius)*.85)overlap=true;
          if(overlap)continue;
          rows.push(c);
          for(let bz=Math.floor((z-radius)/2);bz<=Math.floor((z+radius)/2);bz++)for(let bx=Math.floor((x-radius)/2);bx<=Math.floor((x+radius)/2);bx++){
            const bin=`${bx},${bz}`;if(!occupied.has(bin))occupied.set(bin,[]);occupied.get(bin).push(c);
          }
          break;
        }
      }
    }
  }
  // A finite canopy budget includes a reserved share for the continuous hard
  // slope, then fills the older visible shoulders fairly over the full route.
  select(slopeGroups,450);const slopeSelected=rows.length;
  select(chapters,650);
  model.livingCoverComposition={candidateBudget:650,slopeCandidates:slopeGroups.reduce((n,g)=>n+g.length,0),slopeSelected,otherSelected:rows.length-slopeSelected,
    layout:'irregular adjacent growth patches with bare hard-bottom pockets',growthPatches,naturalGaps};
  model.corals.splice(0,model.corals.length,...rows);
}

// One whole-family physical fit: orient the base to the actual supporting
// triangle grade, then test every crown vertex against the rendered hard bed.
// Failed sites take one smaller whole-colony attempt or are discarded.
export function fitShallowLivingCover(model){
  const assets=shallowSampleCoralGeometries(undefined,model.scannedReef),distant=shallowSampleCoralGeometries('distant',model.scannedReef),up=new THREE.Vector3(0,1,0),normal=new THREE.Vector3(),rotation=new THREE.Quaternion(),turn=new THREE.Quaternion(),matrix=new THREE.Matrix4(),point=new THREE.Vector3();
  const accepted=[],residents=model.reefCommunity.residents,animalSpaces=coverAnimalSpaces(model),naturalGaps=model.livingCoverComposition?.naturalGaps??[];
  const scanned={attempted:0,accepted:0,fallback:0,byAsset:{}};
  const path=Array.from({length:121},(_,i)=>model.path.getPointAt(i/120));
  for(const c of model.corals){
    // A spatial batch shares one crown variant; both variants still occur
    // along the route without doubling every form's draw in every 16m block.
    const patch=((Math.floor(c.x/3.8)*3+Math.floor(c.z/2.7))%8+8)%8;
    c.assetVariant=c.form==='fan'?0:c.form==='table'?patch%4:patch%2;
    const key=`${c.form}-${c.assetVariant}`,d=.015;
    const scanKey=model.scannedReef&&c.assetVariant===0?(c.form==='branching'?'scanned-pocillopora':c.form==='massive'?'scanned-diploastrea':null):null;
    const originalWidth=c.width,originalHeight=assets[key].userData.sourceAspect?c.width*assets[key].userData.sourceAspect:c.height;
    const hx=(model.surface(c.x+d,c.z)-model.surface(c.x-d,c.z))/(2*d),hz=(model.surface(c.x,c.z+d)-model.surface(c.x,c.z-d))/(2*d);
    normal.set(-hx,1,-hz).normalize();if(normal.y<(c.form==='table'?.45:.78))continue;
    rotation.setFromUnitVectors(up,normal).multiply(turn.setFromAxisAngle(up,c.rotation));
    let valid=false;
    // One source attempt family, then the original crown if the actual broad
    // scan base cannot fit. No relaxed burial or repeated geometry repair.
    const choices=scanKey?[scanKey,key]:[key];if(scanKey)scanned.attempted++;
    for(const choice of choices){
      c.width=originalWidth;c.height=choice===scanKey?originalWidth:originalHeight;
      const positions=[assets[choice].attributes.position,distant[choice].attributes.position];
      for(let attempt=0;attempt<2;attempt++){
      matrix.compose(new THREE.Vector3(c.x,c.y,c.z),rotation,new THREE.Vector3(c.width,c.height,c.width));
      let radius=0,top=0;valid=true;
      // Both real display LODs share this physical site and reservation. A
      // reduced crown is not guaranteed to be contained by its near geometry.
      for(const p of positions){
        for(let i=0;i<p.count;i++){
          point.fromBufferAttribute(p,i).applyMatrix4(matrix);
          const burial=p.getY(i)<=.18?.025:.001;
          if(point.y<model.surface(point.x,point.z)-burial){valid=false;break;}
          radius=Math.max(radius,Math.hypot(point.x-c.x,point.z-c.z));top=Math.max(top,point.y-c.y);
        }
        if(!valid)break;
      }
      if(valid){
        c.radius=radius+.012;c.clearanceHeight=top;c.supportNormal=normal.toArray();
        if(path.some(p=>Math.hypot(c.x-p.x,c.z-p.z)<1.9+c.radius)){valid=false;break;}
        if(residents.some(a=>Math.hypot(c.x-a.home.x,c.z-a.home.z)<c.radius+a.sizeM*(a.speciesId==='painted-spiny-lobster'?2.3:a.speciesId==='spotted-reef-crab'?1.1:.65)+(a.mode==='crawl'?a.radius:0))){valid=false;break;}
        if(animalSpaces.some(p=>Math.hypot(c.x-p.x,c.z-p.z)<c.radius+p.r+.025)){valid=false;break;}
        if(naturalGaps.some(p=>Math.hypot(c.x-p.x,c.z-p.z)<c.radius+p.r)){valid=false;break;}
        break;
      }
        c.width*=.72;c.height*=.72;
      }
      if(valid){
        if(choice===scanKey){c.scanAsset=scanKey;scanned.accepted++;scanned.byAsset[scanKey]=(scanned.byAsset[scanKey]??0)+1;}
        break;
      }
    }
    if(scanKey&&!c.scanAsset)scanned.fallback++;
    if(valid)accepted.push(c);
  }
  model.corals.splice(0,model.corals.length,...accepted);
  if(model.livingCoverComposition)model.livingCoverComposition.fittedSlope=accepted.filter(c=>c.host.startsWith('sample-live-slope-')).length;
  model.scannedCoverComposition=scanned;
  for(const family of [assets,distant])for(const g of Object.values(family))g.dispose();
}
