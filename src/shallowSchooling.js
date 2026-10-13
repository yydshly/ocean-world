// A bounded neighbour-based shoal. The destination and disturbance are authored
// demonstration events; individual paths, splitting and recovery are solved.
export const SHALLOW_SCHOOLING_SECONDS = 60;
export const SHALLOW_SCHOOLING_PHASES = [
  {id:'schooling',start:0,end:8,title:'协同群游',detail:'留意鱼之间的间距和方向，群体由邻近同伴协调。'},
  {id:'splitting',start:8,end:28,title:'遇礁分流',detail:'鱼群接近现有礁头，从两侧寻找可通过的水层。'},
  {id:'merging',start:28,end:36,title:'通过后汇合',detail:'绕过礁头后，同伴的聚群作用让两支重新接近。'},
  {id:'disturbed',start:36,end:46,title:'局部受扰散开',detail:'一次演示扰动先影响近处成员，再通过邻居传播。'},
  {id:'regrouping',start:46,end:60,title:'重新聚集',detail:'扰动消退，鱼群恢复间距和一致的游动方向。'},
];
export function shallowSchoolingPhase(time){return SHALLOW_SCHOOLING_PHASES.find(p=>time<p.end)??SHALLOW_SCHOOLING_PHASES.at(-1);}

const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const WIDTH=9; // x,y,z,vx,vy,vz,heading,alarm,layer
const STEP=1/30,INTERVAL=6,MAX_TIME=240;
const copy=a=>new Float64Array(a);
const smooth=n=>{const u=clamp(n,0,1);return u*u*(3-2*u);};
function unit(x,y,z){const n=Math.hypot(x,y,z)||1;return [x/n,y/n,z/n];}
function centroid(a,count){const p={x:0,y:0,z:0};for(let i=0;i<count;i++){p.x+=a[i*WIDTH];p.y+=a[i*WIDTH+1];p.z+=a[i*WIDTH+2];}p.x/=count;p.y/=count;p.z/=count;return p;}

function heightField(model){
  // The finite local reef is sampled once from the SAME actual rock/coral
  // surface query used by the other animals. A slope-limited upper envelope
  // avoids abrupt vertical steps at grid boundaries. This sampled approximation
  // is checked against the actual meshes in acceptance;
  // it is not an exhaustive geometry proof. No triangle traversal runs per step.
  const minX=-49,maxX=-20,minZ=-17,maxZ=0,step=.30;
  const cols=Math.ceil((maxX-minX)/step)+1,rows=Math.ceil((maxZ-minZ)/step)+1;
  const values=new Float32Array(cols*rows);let checks=0;
  for(let z=0;z<rows;z++)for(let x=0;x<cols;x++){
    values[z*cols+x]=model.surface(minX+x*step,minZ+z*step,true);checks++;
  }
  const slope=.45;
  // Raise low samples, never lower the original surface. Sweeps carry a
  // bounded rise outward from reef peaks in both grid directions.
  for(let pass=0;pass<4;pass++){
    const reverse=pass%2,fromZ=reverse?rows-1:0,toZ=reverse?-1:rows,direction=reverse?-1:1;
    for(let z=fromZ;z!==toZ;z+=direction)for(let n=0;n<cols;n++){
      const x=reverse?cols-1-n:n,k=z*cols+x;let height=values[k];
      for(const [dx,dz]of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]]){
        const nx=x+dx,nz=z+dz;if(nx<0||nz<0||nx>=cols||nz>=rows)continue;
        height=Math.max(height,values[nz*cols+nx]-step*slope*Math.hypot(dx,dz));
      }
      values[k]=height;
    }
  }
  return {minX,maxX,minZ,maxZ,step,cols,rows,values,checks,
    height(x,z,radius=.19){
      const gx=clamp((x-minX)/step,0,cols-1.000001),gz=clamp((z-minZ)/step,0,rows-1.000001),ix=Math.floor(gx),iz=Math.floor(gz),u=gx-ix,v=gz-iz,k=iz*cols+ix;
      const lower=values[k]*(1-u)+values[k+1]*u,upper=values[k+cols]*(1-u)+values[k+cols+1]*u;
      return lower*(1-v)+upper*v+radius*slope*Math.SQRT2+.18;
    }};
}
function reefObstacles(model,field){
  // A conservative avoidance disk around an existing, actually visible reef
  // crown. This is a personal-space buffer, not an invented collision mesh.
  const reef=model.rocks?.find(r=>r.id==='sample-rock-0');
  if(!reef)return [];
  const radius=Math.min(2.45,Math.max(.8,Math.min(reef.scale.x,reef.scale.z)*.26));let top=-Infinity;
  for(let z=-radius;z<=radius;z+=field.step)for(let x=-radius;x<=radius;x+=field.step)
    if(x*x+z*z<radius*radius)top=Math.max(top,model.surface(reef.x+x,reef.z+z,true));
  return [{id:reef.id,x:reef.x,z:reef.z,radius,top,margin:.60}];
}
function destination(t){
  if(t<=60)return {x:-43+.235*t,z:-9,y:2.3};
  // Continue moving locally after the demonstrated sequence without a reset,
  // teleport or extra event. The initial derivative matches the approach.
  const a=(t-60)*.235/3;return {x:-28.9+3*Math.sin(a),z:-9+1.4*(1-Math.cos(a)),y:2.3};
}

/** Creation preserves all animal records. Call after their body envelopes exist. */
export function createShallowSchooling(model,options={}){
  const started=performance.now(),speciesId=options.speciesId??'blue-and-gold-fusilier';
  const agents=model.agents.filter(a=>a.speciesId===speciesId);
  if(!agents.length)return null;
  const field=heightField(model),obstacles=reefObstacles(model,field),count=agents.length;
  const initial=new Float64Array(count*WIDTH),radii=new Float64Array(count),bottoms=new Float64Array(count);
  agents.forEach((a,i)=>{
    const q=i*WIDTH,angle=i*2.39996323,rr=Math.sqrt((i+.5)/count);
    initial[q]=-44+1.4*rr*Math.cos(angle);initial[q+2]=-9+1.45*rr*Math.sin(angle);
    initial[q+8]=.55*Math.sin(i*1.61803398875);
    initial[q+1]=2.3+initial[q+8];initial[q+3]=.36;initial[q+6]=0;
    const condition=options.initialConditions?.find(row=>row.id===a.id);
    if(condition){
      if(condition.position)for(const [j,axis]of ['x','y','z'].entries())initial[q+j]=condition.position[axis];
      if(condition.velocity)for(const [j,axis]of ['x','y','z'].entries())initial[q+3+j]=condition.velocity[axis];
      initial[q+6]=Math.atan2(initial[q+5],initial[q+3]);
    }
    // Fish length is not a spherical radius: use a conservative lateral body
    // radius for same-species separation, and the actual envelope for terrain.
    radii[i]=a.sizeM*.36;bottoms[i]=a.clearance?.bottom??a.sizeM*.15;
    initial[q+1]=Math.max(initial[q+1],field.height(initial[q],initial[q+2],a.clearance?.radius??a.sizeM*.65)+bottoms[i]+.10);
  });
  const system={version:'local-neighbour-shoal-v1',model,speciesId,agents,count,field,obstacles,radii,bottoms,
    options:{neighbourRadius:2.4,separationStrength:2.8,alignmentStrength:1.25,cohesionStrength:.30,...options},
    fixedStepSec:STEP,checkpointIntervalSec:STEP*INTERVAL,maxTimeSec:MAX_TIME,
    initial,states:copy(initial),scratch:copy(initial),checkpoints:new Map([[0,copy(initial)]]),
    prepared:false,timeSec:0,stepIndex:0,prepareSteps:0,prepareMs:0,creationMs:performance.now()-started,
    threat:null,stats:{neighbourInteractions:0,supportProjections:0,collisionProjections:0,steps:0},lastUpdateMs:0};
  system.indexById=new Map(agents.map((a,i)=>[a.id,i]));return system;
}

function step(system,state,index,metrics){
  const count=system.count,o=system.options,h=STEP,t=index*h,goal=(o.guide??destination)(t),next=new Float64Array(state.length);
  if(index===Math.round(36/h)){
    const c=centroid(state,count);system.threat={x:c.x+1.35,y:c.y+.1,z:c.z+.15};
  }
  for(let i=0;i<count;i++){
    const q=i*WIDTH,x=state[q],y=state[q+1],z=state[q+2],vx=state[q+3],vy=state[q+4],vz=state[q+5];
    let sx=0,sy=0,sz=0,cx=0,cy=0,cz=0,avx=0,avy=0,avz=0,n=0,alarm=state[q+7]*Math.exp(-h/1.5);
    for(let j=0;j<count;j++)if(j!==i){
      const k=j*WIDTH,dx=state[k]-x,dy=state[k+1]-y,dz=state[k+2]-z,d2=dx*dx+dy*dy+dz*dz;
      if(d2>o.neighbourRadius*o.neighbourRadius)continue;
      n++;metrics.neighbourInteractions++;cx+=dx;cy+=dy;cz+=dz;avx+=state[k+3];avy+=state[k+4];avz+=state[k+5];
      const space=.65+.58*state[q+7];
      if(d2<space*space){const d=Math.sqrt(d2)||.001,weight=(space-d)/(space*d);sx-=dx*weight;sy-=dy*weight;sz-=dz*weight;}
      if(d2<.85*.85)alarm=Math.max(alarm,state[k+7]*.965);
    }
    const threat=system.threat;
    if(threat&&t>=36&&t<36.45&&Math.hypot(x-threat.x,y-threat.y,z-threat.z)<.90)alarm=1;
    let tx=goal.x-x,ty=goal.y+state[q+8]-y,tz=goal.z-z;
    const dist=Math.hypot(tx,tz),speed=.29+.23*clamp(dist/3,0,1)+.42*alarm;
    const [gx,,gz]=unit(tx,0,tz);
    const separation=o.separationStrength*(1+alarm),alignment=o.alignmentStrength*(1-.8*alarm),cohesion=o.cohesionStrength*(1-alarm);
    let ax=(gx*speed-vx)*1.5+sx*separation,ay=ty*.9-vy*1.9+sy*separation,az=(gz*speed-vz)*1.5+sz*separation;
    if(n){ax+=(avx/n-vx)*alignment+cx/n*cohesion;
      ay+=(avy/n-vy)*alignment+cy/n*cohesion;
      az+=(avz/n-vz)*alignment+cz/n*cohesion;}
    if(alarm>.01&&threat){const escape=unit(x-threat.x,y-threat.y,z-threat.z);ax+=escape[0]*alarm*1.4;ay+=escape[1]*alarm*.45;az+=escape[2]*alarm*1.4;}
    // Anticipate the actual crown. Left/right decisions are driven by spatial
    // position and terrain, never by a prescribed lane or individual index.
    for(const obstacle of system.obstacles)if(y<obstacle.top+obstacle.margin){
      const look=.65,px=x+vx*look,pz=z+vz*look,dx=px-obstacle.x,dz=pz-obstacle.z,d=Math.hypot(dx,dz),r=obstacle.radius+.3;
      if(d<r+1.05){const strength=clamp((r+1.05-d)/1.05,0,1)*2.4;
        const norm=unit(dx,0,dz);ax+=norm[0]*strength;az+=norm[2]*strength;
        // Slide around the crown instead of stopping nose-first against it.
        const side=dz>=0?1:-1;ax+=Math.abs(norm[2])*strength*.6;az+=-norm[0]*side*strength*.6;
      }
    }
    const al=Math.hypot(ax,ay,az),limit=2.6;if(al>limit){ax*=limit/al;ay*=limit/al;az*=limit/al;}
    let nvx=vx+ax*h,nvy=vy+ay*h,nvz=vz+az*h;
    const vl=Math.hypot(nvx,nvy,nvz),vlmax=.64+.42*alarm;if(vl>vlmax){nvx*=vlmax/vl;nvy*=vlmax/vl;nvz*=vlmax/vl;}
    next[q]=clamp(x+nvx*h,system.field.minX+.6,system.field.maxX-.6);
    next[q+1]=y+nvy*h;next[q+2]=clamp(z+nvz*h,system.field.minZ+.6,system.field.maxZ-.6);
    next[q+3]=nvx;next[q+4]=nvy;next[q+5]=nvz;next[q+7]=alarm;next[q+8]=state[q+8];
  }
  // Synchronous constraints remove overlap without allowing iteration order to
  // feed this step's steering. Any corrections are local, small body distances.
  for(let pass=0;pass<3;pass++){
    let corrected=false;
    for(let i=0;i<count;i++)for(let j=i+1;j<count;j++){
    const q=i*WIDTH,k=j*WIDTH,dx=next[k]-next[q],dy=next[k+1]-next[q+1],dz=next[k+2]-next[q+2],d=Math.hypot(dx,dy,dz),minimum=system.radii[i]+system.radii[j];
    if(d>=minimum)continue;metrics.collisionProjections++;corrected=true;
    const dir=unit(dx||.000001,dy,dz),amount=(minimum-d)*.505;
    for(let axis=0;axis<3;axis++){next[q+axis]-=dir[axis]*amount;next[k+axis]+=dir[axis]*amount;}
    }
    if(!corrected)break;
  }
  for(let i=0;i<count;i++){
    const q=i*WIDTH,a=system.agents[i],ground=system.field.height(next[q],next[q+2],a.clearance?.radius??a.sizeM*.65)+system.bottoms[i]+.07;
    if(next[q+1]<ground){next[q+1]=ground;next[q+4]=Math.max(0,next[q+4]);metrics.supportProjections++;}
    const heading=Math.atan2(next[q+5],next[q+3]),turn=Math.atan2(Math.sin(heading-state[q+6]),Math.cos(heading-state[q+6]));
    next[q+6]=state[q+6]+clamp(turn,-h*2.8,h*2.8);
  }
  metrics.steps++;return next;
}

/** Bake finite checkpoints in short CPU batches, overlapping existing loading. */
export async function prepareShallowSchooling(system,options={}){
  if(!system||system.prepared)return system;
  if(system.preparation)return system.preparation;
  system.preparation=(async()=>{
    const started=performance.now();let state=copy(system.initial);
    const stats={neighbourInteractions:0,supportProjections:0,collisionProjections:0,steps:0};
    const total=Math.round(MAX_TIME/STEP),yieldTask=options.yieldTask??(()=>new Promise(resolve=>setTimeout(resolve,0)));
    for(let index=0;index<total;index++){
      state=step(system,state,index,stats);
      if((index+1)%INTERVAL===0)system.checkpoints.set(index+1,copy(state));
      // A fixed four-second simulation batch yields between short CPU chunks.
      // One fixed step is only 38 squared neighbours; browser validation still
      // measures the actual longest frame rather than claiming a time budget.
      if((index+1)%120===0)await yieldTask();
    }
    system.prepareMs=performance.now()-started;system.prepareSteps=stats.steps;system.preparationStats=stats;
    system.prepared=true;resetShallowSchooling(system);return system;
  })();return system.preparation;
}

export function resetShallowSchooling(system){
  if(!system)return null;system.states=copy(system.initial);system.timeSec=0;system.stepIndex=0;system.pending=false;
  // The baked event point is retained for seeks into the escape/recovery window.
  system.stats={neighbourInteractions:0,supportProjections:0,collisionProjections:0,steps:0};return system;
}

/** Arbitrary forward/reverse seeks replay at most 0.2 seconds of fixed steps. */
export function updateShallowSchooling(system,time){
  if(!system)return null;const started=performance.now(),t=clamp(Number.isFinite(time)?time:0,0,MAX_TIME);
  const whole=Math.floor(t/STEP+1e-8),base=Math.floor(whole/INTERVAL)*INTERVAL,cached=system.checkpoints.get(base);
  if(!cached){system.pending=true;return system;} // Async preparation owns long seeks.
  let state=copy(cached),stats={neighbourInteractions:0,supportProjections:0,collisionProjections:0,steps:0};
  for(let index=base;index<whole;index++)state=step(system,state,index,stats);
  const alpha=clamp(t/STEP-whole,0,1);
  if(alpha>1e-8){const future=step(system,state,whole,stats);for(let q=0;q<state.length;q+=WIDTH){
    for(let j=0;j<6;j++)state[q+j]+=(future[q+j]-state[q+j])*alpha;
    state[q+6]+=Math.atan2(Math.sin(future[q+6]-state[q+6]),Math.cos(future[q+6]-state[q+6]))*alpha;
    state[q+7]+=(future[q+7]-state[q+7])*alpha;
  }}
  system.states=state;system.stats=stats;system.timeSec=t;system.stepIndex=whole;system.pending=false;system.lastUpdateMs=performance.now()-started;return system;
}

export function sampleShallowSchooling(system,agent){
  if(!system)return null;const i=typeof agent==='number'?agent:system.indexById.get(typeof agent==='string'?agent:agent.id);
  if(i===undefined||i<0||i>=system.count)return null;const q=i*WIDTH,a=system.states;
  return {position:{x:a[q],y:a[q+1],z:a[q+2]},velocity:{x:a[q+3],y:a[q+4],z:a[q+5]},heading:a[q+6],
    pitch:clamp(Math.atan2(a[q+4],Math.hypot(a[q+3],a[q+5])),-.18,.18),state:'swimming',
    activity:a[q+7]>.12?'school-escape':'school-coordination',alarm:a[q+7]};
}

export function shallowSchoolingDiagnostics(system){
  if(!system)return null;const a=system.states,count=system.count,center=centroid(a,count);let spread=0,minDistance=Infinity,minClearance=Infinity,alarmCount=0,alignment=0;
  let hx=0,hz=0,left=0,right=0,near=0;
  for(let i=0;i<count;i++){const q=i*WIDTH;spread+=(a[q]-center.x)**2+(a[q+1]-center.y)**2+(a[q+2]-center.z)**2;
    hx+=Math.cos(a[q+6]);hz+=Math.sin(a[q+6]);if(a[q+7]>.12)alarmCount++;
    minClearance=Math.min(minClearance,a[q+1]-system.field.height(a[q],a[q+2],system.agents[i].clearance?.radius??system.agents[i].sizeM*.65)-system.bottoms[i]);
    for(let j=i+1;j<count;j++){const k=j*WIDTH;minDistance=Math.min(minDistance,Math.hypot(a[q]-a[k],a[q+1]-a[k+1],a[q+2]-a[k+2])-system.radii[i]-system.radii[j]);}
    const o=system.obstacles[0];if(o&&Math.abs(a[q]-o.x)<o.radius+1.2){near++;if(a[q+2]<o.z-.65)left++;if(a[q+2]>o.z+.65)right++;}
  }
  alignment=Math.hypot(hx,hz)/count;
  return {version:system.version,phase:shallowSchoolingPhase(system.timeSec).id,timeSec:system.timeSec,count,center,
    spreadM:Math.sqrt(spread/count),alignment,alarmCount,minBodyGapM:minDistance,minTerrainClearanceM:minClearance,
    obstacleId:system.obstacles[0]?.id??null,split:{near,left,right},pending:system.pending,
    fixedStepSec:STEP,checkpointCount:system.checkpoints.size,checkpointBytes:system.checkpoints.size*system.initial.byteLength,
    steps:system.stats.steps,neighbourInteractions:system.stats.neighbourInteractions,supportProjections:system.stats.supportProjections,
    creationMs:system.creationMs,preparationMs:system.prepareMs,updateMs:system.lastUpdateMs,
    limits:'Neighbour coordination with an authored destination and one local disturbance; no predation, food web or whole-world collision simulation.'};
}
