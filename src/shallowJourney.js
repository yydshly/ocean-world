import * as THREE from 'three';

export const SHALLOW_JOURNEY_SECONDS = 240;
export const SHALLOW_JOURNEY_CHAPTERS = [
  {start:0,end:40,title:'礁谷 · 进入鱼群的家',habitat:'礁谷',detail:'沿活礁边缘慢行，看乌尾鮗在珊瑚上方成群经过。',life:'中层鱼群 / 附着珊瑚',focus:['blue-and-gold-fusilier']},
  {start:40,end:88,title:'礁边 · 上下都有生命',habitat:'礁谷',detail:'靠近礁边观察鱼群，再留意岩脚的小型居民。',life:'礁栖鱼 / 近底居民',focus:['unidentified-reef-fish']},
  {start:88,end:120,title:'沙道 · 礁与沙的交界',habitat:'沙道',detail:'顺着礁间开口进入沙道，观察鱼群与海床的高低关系。',life:'过境鱼群 / 碎屑底栖',focus:['doubleline-fusilier']},
  {start:120,end:164,title:'沙底 · 靠近慢行的动物',habitat:'沙道',detail:'降低视线，寻找贴底魟鱼、羊鱼和低空游动的乌贼。',life:'魟鱼 / 羊鱼 / 乌贼',focus:['blue-spotted-ray','reef-goatfish','reef-cuttlefish']},
  {start:164,end:210,title:'草床 · 海龟与兔鱼',habitat:'草床',detail:'沿草床边缘前行，观察海龟和草叶上方的小鱼。',life:'海龟 / 兔鱼 / 草床居民',focus:['hawksbill-turtle','white-spotted-rabbitfish']},
  {start:210,end:240,title:'草床外缘 · 回望这片海',habitat:'草床',detail:'在草床与开阔水层交界看鲹群经过；结束后可就地自由探索。',life:'鲹群 / 草床与礁缘',focus:['giant-trevally']},
];
export function shallowJourneyChapter(time){return SHALLOW_JOURNEY_CHAPTERS.find(c=>time<c.end)??SHALLOW_JOURNEY_CHAPTERS.at(-1);}

// A new observation route through the existing, fully resident habitat. Animal
// time remains real seconds: extending the route never slows animal movement.
export function createShallowJourney(model){
  const points=[[-42,2.4,0],[-40,1.8,1],[-37,1.5,0],[-33,1.5,-.8],[-27,1.6,-1],[-21,1.5,0],[-17,1.3,1],[-11,1.4,.5],[-2,1.5,-1],[3,1.3,-1],[6,1.15,0],[11,1.2,1],[19,1.4,3],[25,1.4,6],[30,1.5,8],[38,1.8,7],[45,2.1,5]].map(p=>new THREE.Vector3(...p));
  const curve=new THREE.CatmullRomCurve3(points,false,'centripetal');
  // Build a conservative, smooth clearance envelope once. No per-frame scan
  // of all terrain and no region/history task on this finite route.
  const samples=481,heights=[];
  for(let i=0;i<samples;i++){
    const p=curve.getPoint(i/(samples-1));let y=p.y;
    for(const [dx,dz]of [[0,0],[.6,0],[-.6,0],[0,.6],[0,-.6]])y=Math.max(y,model.surface(p.x+dx,p.z+dz,true)+.95);
    heights.push(y);
  }
  const safe=heights.map((_,i)=>Math.max(...heights.slice(Math.max(0,i-5),Math.min(samples,i+6)))+.15);
  const groups=SHALLOW_JOURNEY_CHAPTERS.map(c=>model.agents.filter(a=>c.focus.includes(a.speciesId)));
  return {seconds:SHALLOW_JOURNEY_SECONDS,length:curve.getLength(),curve,groups,
    view(time){
      const u=THREE.MathUtils.clamp(time/SHALLOW_JOURNEY_SECONDS,0,1),p=curve.getPoint(u),n=u*(samples-1),i=Math.min(samples-2,Math.floor(n));
      p.y=THREE.MathUtils.lerp(safe[i],safe[i+1],n-i);
      const tangent=curve.getTangent(u),target=p.clone().add(tangent.multiplyScalar(9));target.y=Math.max(model.floor(target.x,target.z)+.7,p.y-.8);
      SHALLOW_JOURNEY_CHAPTERS.forEach((c,index)=>{
        const fadeIn=THREE.MathUtils.smoothstep(time,c.start,c.start+12),fadeOut=1-THREE.MathUtils.smoothstep(time,c.end-10,c.end);
        const members=groups[index];if(!members.length||fadeIn*fadeOut===0)return;
        const center=new THREE.Vector3();for(const a of members)center.add(new THREE.Vector3(a.position.x,a.position.y,a.position.z));center.multiplyScalar(1/members.length);
        const distance=p.distanceTo(center);if(distance>18||distance<2)return;
        target.lerp(center,fadeIn*fadeOut*.82);
      });
      return {position:p,target};
    }
  };
}

export function constrainShallowExploration(model,position){
  const p=position.clone();p.x=THREE.MathUtils.clamp(p.x,-49,56);p.z=THREE.MathUtils.clamp(p.z,-7,17);
  let ground=model.surface(p.x,p.z,true);
  for(const [dx,dz]of [[.5,0],[-.5,0],[0,.5],[0,-.5]])ground=Math.max(ground,model.surface(p.x+dx,p.z+dz,true));
  p.y=Math.max(ground+.8,Math.min(p.y,10));return p;
}
