import { speciesCatalog } from './species.js';
import { oceanBiodiversitySpeciesCatalog } from './oceanBiodiversitySpecies.js';
import { oceanBenthicLifeSpeciesCatalog } from './oceanBenthicLifeSpecies.js';
import { oceanMeadowLifeSpeciesCatalog } from './oceanMeadowLifeSpecies.js';
import { oceanSlopeSpeciesCatalog } from './oceanSlopeSpecies.js';
import { oceanPelagicSpeciesCatalog } from './oceanPelagicSpecies.js';
import { oceanMantaSpeciesCatalog } from './oceanMantaSpecies.js';
import { oceanTurtleSpeciesCatalog } from './oceanTurtleSpecies.js';
import { oceanReefGuildSpeciesCatalog } from './oceanReefGuildSpecies.js';
import { openWaterSpeciesCatalog } from './oceanOpenWaterSpecies.js';
import { kelpWaterSpeciesCatalog } from './kelpWaterSpecies.js';
import { kelpBenthicLifeSpeciesCatalog } from './kelpBenthicLifeSpecies.js';
import { kelpVisitorSpeciesCatalog } from './kelpVisitorSpecies.js';
import { biomeById } from './biomes.js';
import { DEFAULT_ENVIRONMENT as reefBaseline } from './simulation.js';
import { DEFAULT_ENVIRONMENT as kelpBaseline } from './kelpSimulation.js';
import { DEFAULT_ENVIRONMENT as deepBaseline, deepSpeciesCatalog } from './deepSimulation.js';
import { deepPredatorSpeciesCatalog } from './deepPredatorSpecies.js';
import { deepBenthicLifeSpeciesCatalog } from './deepBenthicLifeSpecies.js';
const kelpPacket=Object.values(biomeById).find(b=>b.id.includes('kelp'));
const kelp=(kelpPacket.organisms||kelpPacket.species).map(s=>({...s,commonName:s.commonName.replace('（描述性中文名）',''),nameNote:s.commonName.includes('（描述性中文名）')?'中文名为描述性译名，以学名辨认。':null,lengthM:(s.displaySizeM.range[0]+s.displaySizeM.range[1])/2,colors:s.kind==='kelp'?['#87754d']:['#829377'],description:s.shape,behavior:s.behaviorRules.join(' '),sources:s.sourceLinks}));
const deepBehaviors={
  'sea-pig-group':'管足贴泥慢移，口部接近有机碎屑后才摄食；没有统一巡游路径。',
  'rattail-family':'沿底寻找动物性食物线索，可达才摄食；耗尽后探索其它斑块。',
  'pom-pom-anemone':'附底等候，捕获随底流经过触手附近的动物性悬浮食物。',
  'giant-sea-spider-group':'沿海床缓慢寻找海葵；吻端接触实际触手后才吸食体液，海葵仍保留为同一个体。',
};
const deep=[...deepSpeciesCatalog,...deepPredatorSpeciesCatalog.map(s=>({...s,regionalOnly:true}))].map(s=>({...s,commonName:s.commonName.replace('（描述性中文名）',''),
  nameNote:(s.identityLevel==='genus-group'?'属层级代表模型，未辨认为具名物种。':s.identityLevel==='family-group'?'科层级代表模型，未辨认为具名物种。':'')+(s.commonName.includes('（描述性中文名）')?'中文名为描述性译名，以学名辨认。':''),
  description:s.shape,behavior:deepBehaviors[s.id],colors:s.kind==='fish'?['#796d67']:['#c4a0a1']}));
export const sceneCatalogs={reef:[...speciesCatalog,...oceanSlopeSpeciesCatalog,...oceanPelagicSpeciesCatalog,...oceanMantaSpeciesCatalog,...oceanTurtleSpeciesCatalog],kelp:[...kelp,...kelpWaterSpeciesCatalog,...kelpVisitorSpeciesCatalog,...kelpBenthicLifeSpeciesCatalog],deep:[...deep,...deepBenthicLifeSpeciesCatalog]};
export const livingShallowsSpeciesCatalog = Object.freeze([...sceneCatalogs.reef,...oceanReefGuildSpeciesCatalog,...openWaterSpeciesCatalog,...oceanBiodiversitySpeciesCatalog,...oceanBenthicLifeSpeciesCatalog,...oceanMeadowLifeSpeciesCatalog]);
export const sceneDefinitions={
  reef:{id:'reef',title:'在礁间，',label:'浅海珊瑚礁',eyebrow:'INDO-PACIFIC · SHALLOW REEF',subtitle:'热带浅海礁区',surfaceY:8,baseline:reefBaseline,views:{wide:'全景',reef:'礁边',coral:'珊瑚',skeleton:'骨架',crevice:'岩隙'}},
  kelp:{id:'kelp',title:'在林下，',label:'温带海带林',eyebrow:'MONTEREY · KELP FOREST',subtitle:'温带岩底与巨藻林',surfaceY:12,baseline:kelpBaseline,views:{wide:'全景',reef:'林下',canopy:'冠层',crevice:'岩底'}},
  deep:{id:'deep',title:'在深处，',label:'深海软底',eyebrow:'NORTHEAST PACIFIC · DEEP SOFT BOTTOM',subtitle:'3500 m · 深海软底示意',surfaceY:3500,observationDepthM:3500,baseline:deepBaseline,views:{wide:'全景',reef:'近底',crevice:'触手'}},
};

