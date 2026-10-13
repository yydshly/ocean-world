import {livingKitCoralGeometries,mergeLivingColonies,LIVING_KIT_CORALS} from './ShallowLivingKit.js';
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {shallowBenthicCoralGeometries} from './ShallowBenthicCorals.js';
import {shallowOpenCoralGeometries} from './ShallowOpenCommunity.js';
import {shallowBranchingCoralGeometries} from './ShallowBranchingCorals.js';
import {naturalBankSubstrate,naturalBankHeight} from './ShallowNaturalHabitat.js';
import {registerFieldReefMesh} from '../oceanRockShape.js';

// Complete finite habitat assets. Real sediment gaps replace the old blanket
// ramp. Source colonies retain original UVs; whole eroded coastal formations replace the authored contact platforms.
export const REEF_BANK_PROFILES=Object.freeze(Array.from({length:4},(_,i)=>`sample-field-habitat-bank-${i}-v2`));
export const REEF_BANK_POCKETS=Object.freeze([
  {x:0,z:-.17,radius:.40,y:.092,level:'toe-bench'},
  {x:.12,z:.27,radius:.35,y:.172,level:'shoulder-bench'},
]);
const cache=new Map(),registered=new Set();

function bankTemplates(variant,detail='near'){
  const cacheKey=`${variant}/${detail}`;
  if(!cache.has(cacheKey)){
    const assets={...shallowBranchingCoralGeometries(detail),...shallowOpenCoralGeometries(detail),...shallowBenthicCoralGeometries(detail),...livingKitCoralGeometries(detail)};
    // Three living spurs surround a small foreground clearing. These are
    // complete colonies built into the habitat before animal placement.
    const crowns=[[-.29,-.18,.23,.038],[-.33,.03,.26,.042],[-.23,.17,.26,.048],
      [-.06,.30,.27,.052],[.17,.43,.24,.045],[.36,.30,.23,.041],
      [.33,.04,.25,.045],[.29,-.22,.23,.033],[-.46,.22,.22,.033],
      [-.34,.39,.24,.040],[-.04,.09,.23,.048],[.48,.16,.21,.032],
      [-.19,.41,.23,.044],[.03,.43,.23,.051],[-.44,-.03,.22,.030],
      [.41,-.12,.22,.032],[.07,.10,.22,.055],[.40,.43,.22,.032]];
    const recipes=[
      ['branching-1','branching-1','table-1','branching-0','branching-1','massive-1','branching-1','table-1'],
      ['massive-1','branching-1','table-1','massive-1','branching-1','branching-1','branching-0','table-1'],
      ['table-1','branching-1','massive-1','table-1','branching-0','branching-1','table-1','branching-1'],
      ['branching-1','massive-1','branching-0','table-1','table-1','branching-1','massive-1','branching-1']];
    // A few broad tables punctuate the continuous thickets, instead of a row
    // of identical umbrella silhouettes. Four whole-bank mosaics share sources.
    const tables=[[4,13],[6,9],[1,16],[3,11]][variant];
    const groups=new Map();
    crowns.forEach(([x,z,width,y],i)=>{
      const key=tables.includes(i)?'table-2':recipes[variant][i%8],g=assets[key].clone(),angle=i*2.39996+variant*.79;
      const w=width*(.88+.20*Math.sin(variant*2.1+i*1.7)),aspect=assets[key].userData.sourceAspect;
      g.scale(w,w*aspect,w);g.rotateY(angle);g.translate(x,(naturalBankHeight(variant,x,z)??y)-.018,z);
      if(!g.attributes.uv)g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count*2),2));
      if(!g.attributes.color)g.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count*3).fill(1),3));
      if(!LIVING_KIT_CORALS[key])g.clearGroups();if(!groups.has(key))groups.set(key,[]);groups.get(key).push(g);
    });
    const result={};for(const [key,parts]of groups){result[key]=LIVING_KIT_CORALS[key]?mergeLivingColonies(parts):mergeGeometries(parts);parts.forEach(g=>g.dispose());}
    result.substrate=naturalBankSubstrate(variant,detail);
    for(const g of Object.values(result)){g.computeBoundingBox();g.computeBoundingSphere();}
    Object.values(assets).forEach(g=>g.dispose());cache.set(cacheKey,result);
  }
  return cache.get(cacheKey);
}
export function reefBankGeometries(variant,detail='near'){
  return Object.fromEntries(Object.entries(bankTemplates(variant,detail)).map(([key,g])=>[key,g.clone()]));
}

export function registerReefBanks(){
  for(let variant=0;variant<4;variant++){
    const profile=REEF_BANK_PROFILES[variant];if(registered.has(profile))continue;
    // Registration only reads arrays. Avoid copying every complete reef just
    // to merge positions into its independent physical support index.
    const parts=Object.values(bankTemplates(variant));
    const plain=parts.map(g=>{const out=new THREE.BufferGeometry();out.setAttribute('position',g.attributes.position);out.setIndex(g.index);return out;});
    const merged=mergeGeometries(plain);registerFieldReefMesh(profile,merged.attributes.position.array,merged.index.array);
    [...plain,merged].forEach(g=>g.dispose());registered.add(profile);
  }
}
