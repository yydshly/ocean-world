import {oceanRockMesh} from './oceanRockShape.js';
import {registerReefBanks,REEF_BANK_PROFILES,REEF_BANK_POCKETS} from './world/ShallowReefBank.js';

// Whole habitat reconstruction: the former broad smooth ramps no longer exist.
export function arrangeShallowReefSlope(model){
  registerReefBanks();
  const sectors=[{id:'near',xs:[-30,-23.2,-16.4,-9.6,-2.8,4]}, {id:'tail',xs:[36,42.4,48.8,55.2,61.6,68]}];
  const modules=[],route=Array.from({length:241},(_,i)=>model.path.getPointAt(i/240));
  for(const sector of sectors)for(const [i,x]of sector.xs.entries()){
    const variant=(i+(sector.id==='tail'?2:0))%4,width=10.4+.45*Math.sin(i*.9);
    const rock={id:`sample-live-slope-${sector.id}-${i}`,sampleSlope:true,slopeSector:sector.id,
      fieldAsset:'habitat-bank',bankVariant:variant,profile:REEF_BANK_PROFILES[variant],
      x,z:8.45+.18*Math.sin(i),rotation:.025*Math.sin(i*1.3),scale:{x:width,y:width,z:width}};
    const p=oceanRockMesh(rock.profile).positions,co=Math.cos(rock.rotation),si=Math.sin(rock.rotation);
    const world=(x,z)=>({x:rock.x+x*width*co+z*width*si,z:rock.z-x*width*si+z*width*co});
    const rim=[];for(let n=0;n<p.length;n+=3)if(p[n+1]<0)rim.push([p[n],p[n+2]]);
    const distance=()=>{
      let nearest=Infinity;
      // Same exact points and Math.hypot result, without two temporary arrays
      // per rim vertex or distances already ruled out by either axis.
      for(const [x,z]of rim){const p=world(x,z);for(const q of route){
        const dx=q.x-p.x,dz=q.z-p.z;if(Math.abs(dx)>nearest||Math.abs(dz)>nearest)continue;
        nearest=Math.min(nearest,Math.hypot(dx,dz));
      }}return nearest;
    };
    const gap=distance();if(gap<2.65)rock.z+=2.70-gap;
    rock.y=Math.min(...rim.map(([x,z])=>{const p=world(x,z);return model.floor(p.x,p.z);}))-.06;
    rock.habitatBenches=REEF_BANK_POCKETS.map(p=>({...world(p.x,p.z),halfX:p.radius*width*.57,halfZ:p.radius*width*.57,
      rotation:rock.rotation,localZ:p.z,level:p.level,host:rock.id}));
    rock.frontToeDistance=distance();modules.push(rock);
  }
  for(const [start,end]of [[8,16],[24,32],[48,56]])for(const rock of model.rocks.slice(start,end)){
    rock.z=Math.max(rock.z,10.5+1.15*Math.sin(rock.x*.39));rock.scale.y*=.60;rock.y=model.floor(rock.x,rock.z)-.06;
  }
  model.rocks.push(...modules);
  model.reefSlope={modules,sectors:sectors.map(s=>({id:s.id,fromX:s.xs[0],toX:s.xs.at(-1)})),
    physicalForm:'whole weathered coastal formations with eroded crevices and living coral spurs',
    structureRevision:7,placementChange:'old continuous ramps removed; reef geometry and resident spaces rebuilt together'};
  return modules;
}
