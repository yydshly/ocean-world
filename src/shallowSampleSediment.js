// Display sediment fields follow actual grass roots and reef feet. The index
// changes candidate lookup only; the original colour field is evaluated exactly.
export function sampleSedimentTints(model){
  const grassBins=new Map(),reefBins=new Map(),grassSpan=2.5,reefSpan=8;
  for(const root of model.grass){
    const key=`${Math.floor(root.x/grassSpan)},${Math.floor(root.z/grassSpan)}`;
    if(!grassBins.has(key))grassBins.set(key,[]);grassBins.get(key).push(root);
  }
  for(const rock of model.rocks){
    const co=Math.cos(rock.rotation),si=Math.sin(rock.rotation),entry={rock,co,si};
    // The field is supported only inside the rotated r < .7 ellipse. Include
    // boundary bins conservatively; the exact radius test still rejects them.
    const ex=.7*Math.hypot(rock.scale.x*co,rock.scale.z*si)+1e-9;
    const ez=.7*Math.hypot(rock.scale.x*si,rock.scale.z*co)+1e-9;
    for(let z=Math.floor((rock.z-ez)/reefSpan);z<=Math.floor((rock.z+ez)/reefSpan);z++)
      for(let x=Math.floor((rock.x-ex)/reefSpan);x<=Math.floor((rock.x+ex)/reefSpan);x++){
        const key=`${x},${z}`;if(!reefBins.has(key))reefBins.set(key,[]);reefBins.get(key).push(entry);
      }
  }
  return (x,z)=>{
    let grass=0;
    for(let bz=Math.floor(z/grassSpan)-1;bz<=Math.floor(z/grassSpan)+1;bz++)
      for(let bx=Math.floor(x/grassSpan)-1;bx<=Math.floor(x/grassSpan)+1;bx++)
        for(const root of grassBins.get(`${bx},${bz}`)??[])
          grass=Math.max(grass,Math.max(0,1-Math.hypot(root.x-x,root.z-z)/1.7));
    let reef=0;
    for(const {rock,co,si}of reefBins.get(`${Math.floor(x/reefSpan)},${Math.floor(z/reefSpan)}`)??[]){
      const dx=x-rock.x,dz=z-rock.z;
      const nx=(dx*co-dz*si)/rock.scale.x,nz=(dx*si+dz*co)/rock.scale.z,r=Math.hypot(nx,nz);
      if(r>.45&&r<.7)reef=Math.max(reef,Math.max(0,1-Math.abs(r-.52)/.18));
    }
    return {grass:grass*grass*(3-2*grass),reef};
  };
}
