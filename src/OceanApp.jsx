import React, { useEffect, useRef, useState } from 'react';
import { ReefWorld } from './world/ReefWorld.js';
import { loadReefSkeletonScan } from './world/reefScanAssets.js';
import { sceneCatalogs, sceneDefinitions, livingShallowsSpeciesCatalog } from './sceneCatalog.js';
import { saveJson, saveVideo } from './capture.js';
import { PopulationWorkbench } from './PopulationWorkbench.jsx';
import { ResourceHistory } from './ResourceHistory.jsx';
import { AgeWorkbench } from './AgeWorkbench.jsx';
import { REEF_EXPLORATION_STOPS } from './reefExploration.js';
import { reefObservationReading } from './reefObservationReading.js';
import { OCEAN_OBSERVATION_LAYERS } from './oceanLayerNavigation.js';
import { DEEP_OCEAN_OBSERVATION_LAYERS } from './deepOceanNavigation.js';
import { createOceanExplorationMemory, OCEAN_OBSERVATION_POINT_LIMIT } from './oceanExplorationMemory.js';
import { LIVING_SHALLOWS_PROFILE, livingShallowsSeed } from './livingShallows.js';
import { loadLivingInputSeed, saveLivingInputSeed } from './livingWorldState.js';
import { DemoOverview } from './DemoOverview.jsx';
import { demoWorldMatches, navigateDemoEntry } from './demoNavigation.js';
import { DirectorPlayer } from './DirectorPlayer.jsx';
import { useDirectorTour } from './useDirectorTour.js';
import { directorSceneReady } from './directorReadiness.js';
import { observationEventCause } from './observationEventText.js';
import './ocean.css';

function LivingEcosystem({ecosystem,compact=false}){
  const roles={primaryProduction:'初级生产',grazing:'藻食',planktonFeeding:'浮游摄食',attachedFilterFeeding:'附着与滤食',predation:'捕食避敌',detritusFeeding:'碎屑利用',decomposition:'分解回流',...(ecosystem.turtleGrazing?{seagrassGrazing:'海草摄食'}:{})};
  const coverage=ecosystem.coverage||{},totals=ecosystem.processTotals||{};
  const content=<><div className="living-roles">{Object.entries(roles).map(([key,label])=><span key={key} data-active={!!coverage[key]}>{label}{coverage[key]?' · 已接入':key==='seagrassGrazing'?' · 尚无摄食记录':' · 暂缺'}</span>)}</div><p>累计摄食 {Number(totals.ingestion||0).toFixed(4)} · 碎屑分解 {Number(totals.decomposition||0).toFixed(4)}</p>{ecosystem.turtleGrazing&&<p>海龟累计摄入海草 {Number(ecosystem.turtleGrazing.seagrassGrazedUnits).toFixed(4)} · 活体 {ecosystem.turtleGrazing.aliveCount}</p>}{!compact&&<><p>营养库存 {Number(ecosystem.nutrients||0).toFixed(4)} · 动物有机库存 {Number(ecosystem.consumerOrganicUnits||0).toFixed(4)}</p><p>海草有机库存 {Number(ecosystem.plantOrganicUnits||0).toFixed(4)} · 摄食残余入碎屑 {Number(totals.feedingDetritus||0).toFixed(4)}</p><p>生产 {Number(totals.primaryProduction||0).toFixed(4)} · 系统输出 {Number(totals.systemOutput||0).toFixed(4)}</p>{ecosystem.reefGuild&&<p>底栖猎物代理库存 {Number(ecosystem.reefGuild.preyOrganicUnits||0).toFixed(4)} · 累计被摄入 {Number(ecosystem.reefGuild.proxyConsumedUnits||0).toFixed(4)}。小型猎物的碎屑支持是群体食物网近似，未代表捕杀可见个体。</p>}<p className="model-note">统计当前已加载区域的基础网络，使用相对物质单位；角色覆盖不表示每格都有所有生物。草床、珊瑚使用代表有机库存，浮游食物、微生物采用群体近似。{ecosystem.turtleGrazing?'已登记海龟参与海草摄食与有机收支；叶片外形暂不随库存缩小。':'此窗口海龟尚未登记到有机收支。'}繁殖、季节迁徙与卸载区域演化尚未实现。</p></>}</>;
  return compact?<details className="living-ecosystem"><summary>基础生态网络 · {Object.keys(roles).filter(key=>coverage[key]).length}/{Object.keys(roles).length} 类功能</summary>{content}</details>:<section className="resource-section living-ecosystem"><h3>基础生态网络</h3>{content}</section>;
}

const states={gliding:'滑游',schooling:'群游',foraging:'觅食',grazing:'啃食藻膜',fleeing:'避敌',hiding:'隐蔽',resting:'休息',cleaning:'清洁互动',filtering:'滤食','deposit-feeding':'沉积物摄食',ambushing:'潜伏',hunting:'追踪猎物',fixed:'附着生长',dead:'死亡','surface-searching':'沿底寻找食物','surface-grazing':'刮食附着藻','leaf-grazing':'叶面摄食','leaf-searching':'叶面寻食','kelp-hovering':'藻间悬停','approaching-prey':'接近食物','prey-feeding':'摄食小型食物',sheltering:'藻间庇护',scavenging:'寻找有机碎屑'};
Object.assign(states,{'sediment-probing':'探取沉积食物','approaching-detritus':'接近碎屑斑块','sediment-searching':'沿泥面寻食','bottom-probing':'近底探食','benthic-feeding':'摄食底栖材料','approaching-bottom-food':'接近底栖食物','near-bottom-searching':'近底寻食','attached-waiting':'附底等候','capturing-prey':'捕获悬浮食物'});
Object.assign(states,{'searching-anemone':'寻找海葵','approaching-anemone':'沿底接近海葵','proboscis-feeding':'吻管接触吸食','resting-satiated':'饱食停留','searching-no-prey':'附近暂无合适海葵'});
Object.assign(states,{'bottom-cruising':'近底巡游','approaching-kelp-drift':'接近林底藻料','drift-grazing':'摄食脱落藻料'});
Object.assign(states,{'prey-pool-feeding':'摄食动物猎物代理',searching:'寻找食物'});
Object.assign(states,{cruising:'水层巡游',drifting:'随流漂游','plankton-feeding':'摄食浮游食物'});
const turtleGrazingPhases={lifting:'上移避开草冠',approaching:'接近海草',aligning:'转向海草',descending:'下移接近叶片',grazing:'摄食海草',ascending:'离开海草'};
const animalActivity=agent=>agent.alive&&agent.state==='seagrass-cruising'&&agent.grazing?.version===1&&turtleGrazingPhases[agent.grazing.phase]||states[agent.state]||agent.state;

function TurtleObservation({agent}){
  if(agent.speciesId!=='green-turtle'||agent.grazing?.version!==1)return null;
  return <p className="regional-observation">成功取食 {agent.grazing.biteCount} 次 · 累计海草 {Number(agent.grazing.consumedUnits).toFixed(4)}<br/>嘴部接近现有叶片参考点才扣除当地海草库存，上浮呼吸优先。接触使用静态叶片几何近似，未模拟风动叶片碰撞、咬断或生理氧气。</p>;
}
const kinds={ray:'软骨鱼类',fish:'鱼类',shrimp:'甲壳类',crab:'甲壳类',cucumber:'棘皮动物',star:'棘皮动物',urchin:'棘皮动物',snail:'软体动物',chiton:'软体动物',coral:'珊瑚',clam:'软体动物',algae:'初级生产者',kelp:'大型褐藻'};
Object.assign(kinds,{anemone:'刺胞动物','sea-spider':'海蜘蛛类'});
Object.assign(kinds,{octopus:'头足类',squid:'头足类',jelly:'水母',sponge:'海绵动物',turtle:'海龟'});
const time=s=>`${String(Math.floor((s||0)/3600)).padStart(2,'0')}:${String(Math.floor((s||0)%3600/60)).padStart(2,'0')}:${String(Math.floor((s||0)%60)).padStart(2,'0')}`;
const percent=v=>`${Math.round((v||0)*100)}%`;
const sizeMeasureLabel=species=>({'expanded-diameter':'展开直径','disc-width':'盘宽','leg-span':'足跨距','arm-envelope':'水平腕展','carapace-width':'壳宽','bell-diameter':'钟径','total-length':'全长',height:'高度'}[species.sizeMeasure]||'');
const performanceCount=Number(new URLSearchParams(window.location.search).get('performance'))===120?120:null;
const conditionNames={currentMps:'水流速度',turbidity:'浑浊度',foodSupply:'食物补给',hour:'观察时刻',observerLight:'观察器照明'};
const eventLabel=label=>Object.entries(conditionNames).reduce((text,[key,name])=>text.replace(key,name),label.replaceAll('（描述性中文名）','').replace('实际摄食','局部摄食'));
const resourceNames={algae:'岩面附着藻',biofilm:'叶面藻膜',detritus:'海床有机碎屑',smallPrey:'藻间小型食物',kelpTissue:'巨藻组织',surfaceDetritus:'沉积有机碎屑',benthicAnimalFood:'底栖动物性食物',suspendedPrey:'动物性悬浮食物'};
resourceNames.kelpDrift='林底藻料';
const driftUnits=value=>Number(value||0)>0&&Number(value)<.000001?Number(value).toExponential(2):Number(value||0).toFixed(6);
const reefObservations=[
  {speciesId:'green-chromis',label:'雀鲷鱼群',minDistanceM:1.4,hint:'在主礁上方观察同伴的间距与转向，以及受到威胁时靠近珊瑚庇护的动作。'},
  {speciesId:'lined-tang',label:'倒吊觅食',minDistanceM:1.2,hint:'留意它沿礁面移动、接近硬底时摄食，以及遇到捕食者后的转向。'},
  {speciesId:'cleaner-wrasse',label:'清洁鱼',minDistanceM:1.1,hint:'在岩隙口观察它寻找较大的客户鱼；靠近合适的客户才会进入「清洁互动」。'},
  {speciesId:'black-cucumber',label:'海参沿底',minDistanceM:1.15,hint:'沿沙面观察它缓慢贴底移动。它以沉积物中的有机物为食，本场景用碎屑资源表示供能。'},
  {speciesId:'cleaner-shrimp',label:'岩隙小虾',minDistanceM:.5,hint:'留意岩隙口的触角与近底位置；客户鱼是否靠近取决于当下的群落活动。'},
];
const oceanHabitats={'authored-reef':'原礁区',reef:'礁丘',sand:'沙地',seagrass:'海草床',slope:'礁坡','authored-kelp':'原林区','kelp-forest':'巨藻林','kelp-clearing':'林间空地','kelp-rock':'岩底带','deep-soft-bottom':'沉积平原','deep-slope':'缓坡','deep-hard-bottom':'稀疏硬底'};
const oceanHabitatHints={
  'authored-reef':'原礁区是一个固定观察点，外围海域沿地形与生境逐渐展开。',
  reef:'珊瑚与岩面相邻；藻覆、礁脚和浅岩面形成不同生活空间。',
  seagrass:'草丛与开放沙隙交错，草叶随水流缓慢弯摆。',
  sand:'开阔沙面间有少量碎石，可留意动物的贴底活动。',
  slope:'水深增加，浅水珊瑚与海草覆盖减少；可留意礁面上方的鱼群与硬底上的缓慢活动。',
  'authored-kelp':'原林区保留为一个近距离观察点，外围林区沿海床展开。',
  'kelp-forest':'巨藻用固着器抓附岩面，气囊帮助藻体向上展开；林下、藻间与冠层提供不同的观察空间。',
  'kelp-clearing':'林间开放海床与碎石交错，可观察海星近底寻找食物。',
  'kelp-rock':'岩底上分布刮食动物，留意海胆与石鳖缓慢活动。',
  'deep-soft-bottom':'泥底与有机食物斑块交错，海猪属代表缓慢探取沉积食物，鼠尾鳕类近底寻找动物性食物。',
  'deep-slope':'沉积底沿缓坡与低丘起伏，动物使用同一实际底面，观察器沿底前行。',
  'deep-hard-bottom':'软底间有稀疏岩露头和碎石。绒球海葵代表可以分布在泥底及适宜硬底，不把所有动物塞进每格。',
};
const oceanCoverNames={rock:'岩体',coral:'珊瑚群',seagrass:'海草簇',rubble:'碎石',algae:'岩面藻覆',formation:'大型礁体',kelp:'景观巨藻',understory:'林底低层藻'};
const oceanSceneElementNames={stone:'不规则石块','plant-clump':'海草丛',bottle:'沉底瓶',driftwood:'沉木'};
const oceanSceneThemes={'reef-garden':'珊瑚岩礁','grass-meadow':'海草沙道','outer-slope':'外礁坡','open-sand':'开放沙地'};
const oceanHabitatElementNames={'coral-branch':'枝状珊瑚群','coral-table':'桌状珊瑚群','sea-fan':'海扇','grass-meadow':'宽叶草丛'};
const oceanLandformNames={mound:'低礁丘',terrace:'台地',ridge:'岩脊','natural-a':'自然低丘','natural-b':'自然礁脊','natural-c':'不规则礁石'};
const oceanHabitatLabel=(composition,fallback)=>composition?.primary
  ?[composition.primary,composition.secondary].filter(Boolean).map(id=>oceanHabitats[id]||id).join('／')
  :oceanHabitats[fallback]||fallback;
const oceanFlowLabel=vector=>!vector||Math.hypot(vector.x,vector.z)<.001?'静水'
  :`向${['东','东南','南','西南','西','西北','北','东北'][(Math.round(Math.atan2(vector.z,vector.x)/(Math.PI/4))+8)%8]}`;
const oceanActivityNames={...states,'deposit-feeding':'沿底觅食',filtering:'滤食状态',grazing:'礁面觅食'};
Object.assign(states,{'seagrass-cruising':'草床巡游',surfacing:'上浮换气',breathing:'水面呼吸',diving:'下潜'});
Object.assign(oceanActivityNames,{'seagrass-cruising':'草床巡游',surfacing:'上浮换气',breathing:'水面呼吸',diving:'下潜'});
kinds.turtle='海洋爬行动物';
// A UI preference, separate from ecological records and saved observation points.
function savedPause(){try{return localStorage.getItem('tidal-observation-paused-v1')==='true';}catch{return false;}}
const eventCause=event=>observationEventCause(event,resourceNames);
function Resource({label,value,color}){return <div className="resource"><span>{label}</span><div className="bar-track"><i style={{width:`${Math.min(100,Math.max(0,(value||0)*100))}%`,background:color}}/></div><b>{label==='平均能量'?percent(value):label==='林底藻料'?driftUnits(value):Number(value||0).toFixed(2)}</b></div>;}
function PredatorObservation({agent}){
  if(agent.speciesId!=='giant-sea-spider-group')return null;
  const intake=agent.lastPredation;
  return <p className="regional-observation">{intake?<>最近一次吸食：海葵体况 −{intake.removedUnits.toFixed(5)}，海蜘蛛 +{intake.gainUnits.toFixed(5)}。吻端距触手 {(intake.contactDistanceM*1000).toFixed(1)} 毫米。<br/></>:<>寻找附近海葵；成功接触后会在此记录双方体况变化。<br/></>}体况是无量纲条件能量，转移量与速率为模型示意。海葵保留为同一个体，触手损伤和再生尚未模拟。</p>;
}
function KelpDriftObservation({agent}){
  const intake=agent.lastDriftIntake;
  if(!intake)return null;
  return <p className="regional-observation">上次从林底落料点摄入 {driftUnits(intake.removedUnits)} 相对藻料。食物来自已有巨藻组织的脱落，实际接近才消耗库存；速率按模拟日计算，数值不代表真实重量。</p>;
}

function ReefGuildObservation({agent}){
  if(!agent.reefGuildIndividualVersion)return null;
  return <p className="regional-observation">{agent.speciesId==='tube-sponge'?'固定附着个体；摄食扣除当地浮游代理库存。':'摄食扣除小型底栖动物与动物残余代理库存；未模拟捕杀可见个体。'}<br/>位于实际礁石附近的生活空间。数量、速率和昼夜偏好为定性模型。</p>;
}

function OpenWaterObservation({agent}){
  if(!agent.openWaterLifeIndividualVersion)return null;
  return <p className="regional-observation">{agent.speciesId==='spotted-jelly'?'从当地浮游食物库存摄食；共生藻供能尚未模拟。':'消费小型游泳动物代理库存；未模拟捕杀可见鱼类。'}<br/>保持实际水层净空，水流与游动为有界近似。</p>;
}

function LivingDiscoveries({discoveries,world,ready,onTravel}){
  if(!discoveries)return null;
  return <details className="living-ecosystem living-discoveries"><summary>海底发现 · 已记录 {discoveries.recorded}</summary><p>靠近沉木或沉底瓶后留下近距记录。</p>{discoveries.nearby.length?discoveries.nearby.map(row=><button key={row.id} disabled={!ready} onClick={()=>onTravel?onTravel(row.id):world.current?.travelLivingDiscovery(row.id)}>前往{row.title}<span>{Math.round(row.distanceM)} m · {row.recorded?'已记录':'未靠近'}</span></button>):<p>附近暂无线索，沿沙道继续探索。</p>}{discoveries.status!=='saved'&&<p>发现记录暂留当前会话。</p>}</details>;
}

export function OceanApp(){
  const container=useRef(null),world=useRef(null),history=useRef([]),lastHistory=useRef(-1),recorder=useRef(null),chunks=useRef([]);
  const [snapshot,setSnapshot]=useState(null),[panel,setPanel]=useState(()=>new URLSearchParams(window.location.search).get('demo')==='all'?'demo':null),[selected,setSelected]=useState(null),[error,setError]=useState(null),[paused,setPaused]=useState(savedPause),[speed,setSpeed]=useState(1),[view,setView]=useState('wide'),[seed,setSeed]=useState('42'),[toast,setToast]=useState(''),[help,setHelp]=useState(false),[recording,setRecording]=useState(false);
  const [pendingDemo,setPendingDemo]=useState(null),[worldAttempt,setWorldAttempt]=useState(0);
  const closeDemo=()=>{director.stop();setPendingDemo(null);setPanel(null);};
  const [biome,setBiome]=useState(()=>{try{const saved=localStorage.getItem('tidal-observation-biome-v1');return ['reef','kelp','deep'].includes(saved)?saved:'reef';}catch{return 'reef';}});
  const [reefProfile,setReefProfile]=useState(()=>{try{return localStorage.getItem('tidal-shallows-profile-v1')==='legacy'?'legacy':LIVING_SHALLOWS_PROFILE;}catch{return LIVING_SHALLOWS_PROFILE;}});
  const livingSeedRef=useRef(loadLivingInputSeed()),legacySeedRef=useRef('42');
  const livingShallows=biome==='reef'&&reefProfile===LIVING_SHALLOWS_PROFILE&&!performanceCount;
  const continuousBiome=['reef','kelp','deep'].includes(biome);
  const homeLabel=livingShallows?'礁群入口':biome==='deep'?'原深海观察点':biome==='kelp'?'原林区':'原礁区',homeShort=livingShallows?'入口':biome==='deep'?'观察点':biome==='kelp'?'原林':'原礁';
  const [ecologyModel,setEcologyModel]=useState('foodweb');
  const [observationId,setObservationId]=useState(null);
  const [explorationIndex,setExplorationIndex]=useState(null);
  const [oceanToolsOpen,setOceanToolsOpen]=useState(!livingShallows);
  const memoryRef=useRef(null),lastMemoryWrite=useRef(-Infinity);
  const [explorationMemory,setExplorationMemory]=useState(null),[pointName,setPointName]=useState('');
  const memoryFor=(actualSeed,actualBiome=world.current?.biomeId||biome)=>{
    if(!memoryRef.current||!Object.is(memoryRef.current.seed,actualSeed)||memoryRef.current.biome!==actualBiome)
      memoryRef.current={seed:actualSeed,biome:actualBiome,store:createOceanExplorationMemory(actualSeed,{biome:actualBiome})};
    return memoryRef.current.store;
  };
  const publishMemory=(store,state)=>setExplorationMemory({...state,storageStatus:store.status});
  const rememberOcean=(reef=world.current,notify=true)=>{
    const observation=reef?.captureOceanObservation?.();
    if(!observation||reef.oceanEcologyResetting)return;
    const store=memoryFor(reef.sim.seed,reef.biomeId),result=store.remember(observation);
    lastMemoryWrite.current=performance.now();
    if(notify)publishMemory(store,result.state);
  };
  const speciesCatalog=livingShallows?livingShallowsSpeciesCatalog:sceneCatalogs[biome],definition=sceneDefinitions[biome];
  const togglePause=async()=>{
    const reef=world.current;if(!reef)return;
    try{await reef.setPaused(!reef.paused);}
    catch(error){setToast(error.message);}
    finally{if(world.current===reef){setPaused(reef.paused);try{localStorage.setItem('tidal-observation-paused-v1',String(reef.paused));}catch{}}}
  };
  const isDeep=biome==='deep';
  const communityUnit=isDeep?'类':'种';
  const navigationLayers=isDeep?DEEP_OCEAN_OBSERVATION_LAYERS:OCEAN_OBSERVATION_LAYERS;
  const worldReady=!error&&demoWorldMatches({biome,profile:biome==='reef'?(livingShallows?LIVING_SHALLOWS_PROFILE:'legacy'):undefined},world.current,snapshot);
  const ocean=snapshot?.ocean,oceanExploring=continuousBiome&&snapshot?.biomeId===biome&&ocean?.exploring;
  const oceanComposition=ocean?.localHabitat?.composition;
  const oceanCommunity=ocean?.localHabitat;
  const oceanLandforms=Object.entries(ocean?.localHabitat?.landform||{}).filter(([,count])=>count>0).sort((a,b)=>b[1]-a[1]);
  const localWater=ocean?.localWater;
  const oceanActivities=Object.entries(ocean?.localHabitat?.activityCounts||{}).filter(([,count])=>count>0).sort((a,b)=>b[1]-a[1]).slice(0,2);
  useEffect(()=>{
    const controller=new AbortController(),initialPaused=savedPause();let cancelled=false,reef=null,scan=null;
    const appliedSeed=livingShallows?livingSeedRef.current:legacySeedRef.current;
    setSeed(String(appliedSeed));
    world.current=null;setError(null);setSnapshot(null);setSelected(null);setObservationId(null);setExplorationIndex(null);setPaused(initialPaused);setSpeed(1);setView('wide');history.current=[];lastHistory.current=-1;
    if(continuousBiome){const store=memoryFor(livingShallows?livingShallowsSeed(appliedSeed):appliedSeed,biome);publishMemory(store,store.load());}
    const flush=()=>{if(!cancelled)rememberOcean(reef);};
    const hidden=()=>{if(document.visibilityState==='hidden')flush();};
    window.addEventListener('pagehide',flush);document.addEventListener('visibilitychange',hidden);
    const prepare=async()=>{
      try{
        if(biome==='reef'&&!livingShallows)scan=await loadReefSkeletonScan({signal:controller.signal});
        if(cancelled){scan?.dispose();return;}
        reef=new ReefWorld(container.current,s=>{
          if(cancelled)return;
          setSnapshot(s);if(s.metrics.timeSec-lastHistory.current>=2){lastHistory.current=s.metrics.timeSec;history.current=[...history.current.slice(-149),{...s.metrics}];}
          if(s.ocean?.exploring&&reef&&performance.now()-lastMemoryWrite.current>=2000)rememberOcean(reef);
        },id=>{if(!cancelled){setSelected(id);setObservationId(null);}},message=>{if(!cancelled)setError(message);},{biomeId:biome,mobileIndividuals:performanceCount,reefScanAsset:scan,seed:appliedSeed,paused:initialPaused,sceneProfile:livingShallows?LIVING_SHALLOWS_PROFILE:null});
        world.current=reef;
        window.__REEF__={snapshot:()=>reef.snapshot(),get sim(){return reef.sim;},get world(){return reef;}};
      }catch(e){
        reef?.dispose();scan?.dispose();
        if(!cancelled)setError(e.message);
      }
    };
    prepare();
    return()=>{
      rememberOcean(reef,false);
      cancelled=true;controller.abort();
      window.removeEventListener('pagehide',flush);document.removeEventListener('visibilitychange',hidden);
      if(recorder.current?.state==='recording')recorder.current.stop();
      reef?.dispose();scan?.dispose();
      if(world.current===reef)world.current=null;
      if(reef&&window.__REEF__?.world===reef)delete window.__REEF__;
    };
  },[biome,reefProfile,worldAttempt]);
  useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(''),4200);return()=>clearTimeout(t);},[toast]);
  const env=snapshot?.environment||{currentMps:.15,turbidity:.25,foodSupply:1,hour:10},m=snapshot?.metrics||{},agent=snapshot?.agents.find(a=>a.id===selected),species=speciesCatalog.find(s=>s.id===agent?.speciesId);
  const regionalEcology=ocean?.ecology,regionalMetrics=regionalEcology?.metrics;
  const ecosystem=regionalEcology?.ecosystem;
  const useRegionalMetrics=oceanExploring&&regionalMetrics?.activeRegions>0;
  const displayMetrics=useRegionalMetrics?{...regionalMetrics,...regionalMetrics.averageResources}:m;
  const regionalAgent=!!agent?.regionId;
  const localRegion=regionalEcology?.regions.find(region=>region.id===(agent?.regionId||ocean?.chunkId));
  const flowRegion=biome==='reef'&&useRegionalMetrics?regionalEcology.regions.find(region=>region.id===ocean?.chunkId):null;
  const foodFlow=flowRegion?.transport;
  const foodUnits=value=>Number(value||0).toFixed(6);
  const displayEvents=useRegionalMetrics?regionalEcology.events.slice(-3).reverse():snapshot?.events.slice(0,3)||[];
  const observation=biome==='reef'&&reefObservations.find(item=>item.speciesId===observationId&&item.speciesId===agent?.speciesId);
  const observationReading=observation?reefObservationReading(agent,snapshot):null;
  const exploration=biome==='reef'&&explorationIndex!==null?REEF_EXPLORATION_STOPS[explorationIndex]:null;
  const observationEntries=exploration?reefObservations.filter(item=>exploration.observationSpeciesIds.includes(item.speciesId)):reefObservations.slice(0,3);
  const atExplorationStop=exploration&&view===exploration.id&&snapshot?.camera&&snapshot.camera.position.every((v,i)=>Math.abs(v-exploration.position[i])<.15)&&snapshot.camera.target.every((v,i)=>Math.abs(v-exploration.target[i])<.15);
  const resourceSeries=isDeep?[['沉积碎屑','surfaceDetritus','#b7c698'],['底栖食物','benthicAnimalFood','#bbb2b9'],['悬浮食物','suspendedPrey','#8fbfc4']]:useRegionalMetrics?(biome==='kelp'?[['岩面附着藻','algae','#b7c698'],['叶面藻膜','biofilm','#b4bea2'],['藻间小型食物','smallPrey','#8fbfc4'],['海床碎屑','detritus','#bbb2b9'],['代表巨藻组织','kelpTissue','#a8b278']]:[['表面藻膜','algae','#b7c698'],['浮游资源','plankton','#8fbfc4'],['海床碎屑','detritus','#bbb2b9']]):[[biome==='kelp'?'藻类资源':'藻膜资源','algae','#b7c698'],[biome==='kelp'?'小型食物':'浮游资源',biome==='kelp'?'smallPrey':'plankton','#8fbfc4']];
  if(biome==='kelp'&&useRegionalMetrics&&regionalEcology.regions.some(r=>r.driftCommunityVersion===1))resourceSeries.push(['林底藻料','kelpDrift','#9b9064']);
  const toggle=p=>{director.stop();setPendingDemo(null);setPanel(old=>old===p?null:p);},setEnv=p=>world.current?.setEnvironment(p),setCamera=v=>{
    if(!world.current)return;
    if(v==='wide'&&world.current.oceanExploring){
      if(!world.current.setOceanOverview?.()){setToast('此处暂时无法安排安全全景；更新页面后可重试');return;}
      setView('wide');setSelected(null);setObservationId(null);setExplorationIndex(null);rememberOcean();return;
    }
    rememberOcean();setView(v);setSelected(null);world.current.select(null);setObservationId(null);setExplorationIndex(null);world.current.setView(v);
  };
  const explore=index=>{
    if(!worldReady||!world.current||!REEF_EXPLORATION_STOPS[index])return;
    rememberOcean();const stop=REEF_EXPLORATION_STOPS[index];
    setExplorationIndex(index);setSelected(null);setObservationId(null);setPanel(null);setHelp(false);setView(stop.id);
    world.current.select(null);world.current.setView(stop.id);
  };
  const observe=speciesId=>{
    if(!worldReady||!world.current)return;
    world.current.focusSpecies(speciesId,reefObservations.find(item=>item.speciesId===speciesId));
    const focused=world.current.snapshot();
    if(focused.selectedSpecies?.id!==speciesId||!focused.agents.some(a=>a.id===world.current.selectedId&&a.alive)){setToast('当前没有可观察的活体，请选择其他入口');return;}
    setObservationId(speciesId);setView('observation');setPanel(null);setHelp(false);
  };
  const reset=()=>{
    if(!world.current)return;
    let memoryCleared=true;
    if(continuousBiome)memoryCleared=memoryFor(world.current.sim.seed).clear().ok;
    world.current.reset(seed);
    if(livingShallows){livingSeedRef.current=world.current.inputSeed;if(!saveLivingInputSeed(livingSeedRef.current))setToast('种子仅在当前会话保留。');setSeed(String(livingSeedRef.current));}
    else legacySeedRef.current=world.current.inputSeed;
    if(continuousBiome){const store=memoryFor(world.current.sim.seed),result=store.clear();memoryCleared=result.ok&&memoryCleared;publishMemory(store,result.state);}
    setSelected(null);setObservationId(null);setExplorationIndex(null);setView('wide');history.current=[];lastHistory.current=-1;
    setToast(continuousBiome&&!memoryCleared?'当前会话已清空观察点；浏览器无法保存，刷新后可能恢复旧地点。':`种子 ${world.current.sim.seed}：已重建${continuousBiome?'海域及群落，清除回访状态与观察点':'初始群落'}`);
  };
  const startOcean=()=>{setPanel(null);setHelp(false);setSelected(null);setObservationId(null);setExplorationIndex(null);
    const reef=world.current;reef?.startOceanExploration();setView(reef?.setOceanOverview?.()?'wide':'ocean');};
  const returnReef=()=>{rememberOcean();setSelected(null);setObservationId(null);setExplorationIndex(null);setView('wide');world.current?.returnToReef();};
  const returnObservation=observation=>{
    if(worldReady){director.stop();setPendingDemo(null);}
    if(!worldReady||!world.current?.restoreOceanObservation?.(observation)){setToast('此观察点暂时无法返回');return;}
    setPanel(null);setHelp(false);setSelected(null);setObservationId(null);setExplorationIndex(null);setView('ocean');setOceanToolsOpen(false);
    rememberOcean();
  };
  const markObservation=()=>{
    const observation=world.current?.captureOceanObservation?.();if(!observation)return;
    const store=memoryFor(world.current.sim.seed);
    store.remember(observation);
    const result=store.mark(observation,pointName.trim()||`${oceanHabitatLabel(oceanComposition,ocean.habitat)}观察点`);
    publishMemory(store,result.state);
    if(result.point){setPointName('');setToast(result.ok?`已标记：${result.point.label}`:'地点仅保留在本次会话，浏览器暂时无法保存');}
    else setToast(result.reason==='full'?'观察点已满，请先移除一处':'此处暂时无法标记');
  };
  const removeObservation=id=>{
    const store=memoryFor(world.current.sim.seed),result=store.remove(id);publishMemory(store,result.state);
    if(!result.ok)setToast('已从本次手记移除，浏览器暂时无法保存');
  };
  const observeOceanLocal=speciesId=>{if(!world.current?.focusNearbyOceanAnimal(speciesId??null,ocean?.chunkId))setToast('本格当前没有该活体，请查看其他本格动物');};
  const observeKelpCommunity=stopId=>{
    if(!world.current?.focusKelpCommunity?.(stopId)){setToast('当前格暂未找到可整体观察的林缘群落，请继续探索');return;}
    setSelected(null);setObservationId(null);setExplorationIndex(null);setView('ocean');rememberOcean();
  };
  const record=()=>{
    if(recording){recorder.current?.stop();return;}
    const c=world.current?.renderer.domElement;
    if(!c?.captureStream||!window.MediaRecorder){setToast('浏览器不支持录像，可导出截图与实验数据');return;}
    director.stop();setPendingDemo(null);
    try{
      const stream=c.captureStream(30),mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(m=>MediaRecorder.isTypeSupported(m)),r=new MediaRecorder(stream,mime?{mimeType:mime,videoBitsPerSecond:2500000}:{});
      chunks.current=[];r.observationStart={selectedId:selected,snapshot:world.current?.snapshot()};
      r.ondataavailable=e=>{if(e.data.size)chunks.current.push(e.data);};
      r.onstop=async()=>{
        clearTimeout(r.stopTimer);stream.getTracks().forEach(t=>t.stop());setRecording(false);
        try{const name=`${biome}-observation-${Date.now()}`,end={selectedId:selected,snapshot:world.current?.snapshot()},file=await saveVideo(new Blob(chunks.current,{type:r.mimeType||'video/webm'}),name);await saveJson({schema:'tidal-observation-video-v1',video:file,mimeType:r.mimeType,start:r.observationStart,end},name+'-metadata');setToast(import.meta.env.DEV?`观察录像已保存：${file}`:`已请求下载录像与元数据：${file}，请查看下载列表`);}catch(e){setToast(e.message);}
      };
      r.onerror=()=>setToast('录像失败，请检查浏览器支持');
      r.start(1000);r.stopTimer=setTimeout(()=>{if(r.state==='recording')r.stop();},45000);recorder.current=r;setRecording(true);setToast('正在录制，点击结束；每段最长 45 秒');
    }catch(e){setToast(`录像暂不可用：${e.message}`);}
  };
  const exportExperiment=async()=>{try{const file=await saveJson({schema:'tidal-experiment-v1',biomeId:biome,seed:world.current?.sim.seed,timestamp:new Date().toISOString(),snapshot:world.current?.snapshot(),history:history.current},`${biome}-seed-${seed}`);setToast(import.meta.env.DEV?`实验数据已保存：${file}`:`已请求下载实验数据：${file}，请查看下载列表`);}catch(e){setToast(e.message);}};
  const captureScreenshot=async()=>{try{const file=await world.current?.downloadScreenshot();setToast(import.meta.env.DEV?`观察截图已保存：${file}`:`已请求下载截图：${file}，请查看下载列表`);}catch(e){setToast(e.message);}};
  const chooseDemo=choice=>{
    if(choice.directorToken===undefined)director.stop();
    if(recording&&['world','living-stop','kelp-stop','deep-stop','view','discoveries'].includes(choice.kind)){setToast('请先结束录像，再切换观察入口');return;}
    setPendingDemo(null);setHelp(false);
    if(choice.directorToken===undefined){
      if(choice.kind==='population'){setEcologyModel(choice.model);setPanel('population');return;}
      if(choice.kind==='panel'){setPanel(choice.panel);return;}
      if(choice.kind==='capture'){setPanel('capture');return;}
    }
    rememberOcean();setSelected(null);setObservationId(null);setExplorationIndex(null);setPanel(choice.directorToken===undefined?'demo':null);
    setPendingDemo(choice);
    if(choice.biome&&choice.biome!==biome){try{localStorage.setItem('tidal-observation-biome-v1',choice.biome);}catch{}setBiome(choice.biome);}
    if(choice.biome==='reef'&&choice.profile&&choice.profile!==reefProfile){try{localStorage.setItem('tidal-shallows-profile-v1',choice.profile);}catch{}setReefProfile(choice.profile);}
    if(error&&(!choice.biome||choice.biome===biome)&&(!choice.profile||choice.profile===reefProfile))setWorldAttempt(attempt=>attempt+1);
  };
  const director=useDirectorTour({worldRef:world,snapshot,worldReady,error,execute:chooseDemo,recording,paused,speed,
    onControls:(nextPaused,nextSpeed)=>{setPaused(nextPaused);setSpeed(nextSpeed);try{localStorage.setItem('tidal-observation-paused-v1',String(nextPaused));}catch{}},onNotice:setToast});
  const startDirector=()=>{setPendingDemo(null);setPanel(null);setHelp(false);director.start();};
  const stopDirector=()=>{director.stop();setPendingDemo(null);setPanel(null);};
  const travelDiscovery=id=>{director.stop();setPendingDemo(null);return world.current?.travelLivingDiscovery(id)??false;};
  const travelKelpBelt=id=>{director.stop();setPendingDemo(null);return world.current?.travelKelpForestBelt(id)??false;};
  const travelDeepBelt=id=>{director.stop();setPendingDemo(null);return world.current?.travelDeepSeascape(id)??false;};
  const observeLivingScene=async()=>{director.stop();setPendingDemo(null);try{if(!await world.current?.enterLivingVisualSample())setToast('当前海域尚未找到岩礁、草床和活体共同出现的观察段，可继续探索后再试。');}catch(error){setToast(error.message);}};
  const enterShallowScene=async()=>{director.stop();setPendingDemo(null);try{if(await world.current?.enterShallowSeascape())setToast('已进入浅海整景。沿“整景砂道 → 整景草床 → 整景外礁坡”航行，或用 WASD 自由探索。');else setToast('整景暂未就绪，或这里保留着已探索的海域，可以继续自由航行。');}catch(error){setToast(error.message);}};
  const enterKelpScene=async()=>{director.stop();setPendingDemo(null);try{if(await world.current?.enterKelpSeascape())setToast('已进入巨藻整景。沿“整景岩底 → 整景林间沙地 → 整景开放林缘”航行，或用 WASD 自由探索。');else setToast('整景暂未就绪，或这里保留着已探索的海域，可以继续自由航行。');}catch(error){setToast(error.message);}};
  useEffect(()=>{
    if(!pendingDemo||!worldReady||!demoWorldMatches(pendingDemo,world.current,snapshot))return;
    const choice=pendingDemo;
    if(choice.directorToken!==undefined){
      if(!director.state.active||choice.directorToken!==director.state.token){setPendingDemo(null);return;}
      director.prepareWorld(world.current,choice.directorToken);
      if(choice.kind==='local-life'&&!world.current.oceanExploring){world.current.startOceanExploration();return;}
      if(choice.kind==='local-life'&&!directorSceneReady(choice,world.current,snapshot))return;
    }
    setPendingDemo(null);
    if(choice.directorToken!==undefined&&['panel','population','capture'].includes(choice.kind)){
      if(choice.kind==='population'){setEcologyModel(choice.model);setPanel('population');}
      else setPanel(choice.kind==='capture'?'capture':choice.panel);
      director.applied(choice.directorToken);return;
    }
    const entered=navigateDemoEntry(choice,world.current,{movingDirector:choice.directorToken!==undefined,directorEntryPlan:choice.directorEntryPlan,playing:director.state.playing,playbackRate:director.state.playbackRate});
    if(!entered){
      setToast(choice.kind==='local-life'?'附近当前没有可观察的活体，可在图鉴中查看其他条目':'此观察点暂不可用，请选择其他入口');
      if(choice.directorToken!==undefined){
        if(choice.kind==='local-life')director.applied(choice.directorToken,true);
        else director.fail(choice.directorToken,'此观察点暂不可用，可重试或跳到下一步。');
      }
      return;
    }
    setView(choice.kind==='view'?choice.view:choice.kind==='world'&&biome==='reef'&&!livingShallows?'wide':'ocean');
    setOceanToolsOpen(false);setPanel(choice.kind==='discoveries'?'discoveries':null);rememberOcean();
    if(choice.directorToken!==undefined)director.applied(choice.directorToken);
  },[pendingDemo,snapshot,worldReady,biome,reefProfile,director.state.token,director.state.active]);
  return <main className={`ocean-app biome-${biome}${continuousBiome?' reef-experience':''}${view==='coral'?' close-habitat':''}${director.state.active||director.state.phase==='complete'?' director-active':''}`}>
    <DirectorPlayer state={director.state} steps={director.steps} onPause={director.pause} onResume={director.resume} onNext={director.next} onPrevious={director.previous} onSeek={director.seek} onPlaybackRateChange={director.setPlaybackRate} onStop={stopDirector} onRestart={startDirector}/>
    {panel==='demo'&&<DemoOverview onChoose={chooseDemo} onStartDirector={startDirector} onClose={closeDemo} worldReady={worldReady} recording={recording} currentBiome={biome} currentProfile={reefProfile} snapshot={worldReady?snapshot:null} pending={!!pendingDemo} notice={error?`海域加载失败：${error}。可选择其他海域或重试。`:pendingDemo?'正在进入所选观察入口…':''}/>}
    {panel==='discoveries'&&<aside className="side-panel glass" aria-label="浅海发现记录"><div className="panel-heading"><h2>浅海发现记录</h2><button onClick={closeDemo}>收起</button></div><p className="panel-intro">实际靠近沉木或沉底瓶后才会记录。以下入口沿海床前往线索。</p><LivingDiscoveries discoveries={ocean?.discoveries} world={world} ready={worldReady} onTravel={travelDiscovery}/></aside>}
    {panel==='capture'&&<aside className="side-panel glass" aria-label="截图录像与导出"><div className="panel-heading"><h2>截图录像与导出</h2><button onClick={closeDemo}>收起</button></div><p className="panel-intro">截图记录当前画面；录像每段最长 45 秒。实验数据包含当前海域快照和读数历史。</p><div className="experiment-presets"><button disabled={!worldReady} onClick={captureScreenshot}>保存当前截图</button><button disabled={!worldReady} onClick={record}>{recording?'结束并导出录像':'开始录像'}</button></div><button disabled={!worldReady} className="export-data" onClick={exportExperiment}>导出当前实验数据</button><p className="model-note">录像需要浏览器支持 MediaRecorder 和画布捕捉。线上文件由浏览器下载；请确认下载列表实际收到文件。截图与录像只包含 3D 画面。</p></aside>}
    {panel==='journal'&&continuousBiome&&<aside className="side-panel glass ocean-journal-panel" aria-label="探索手记">
      <div className="panel-heading"><div><p className="eyebrow">OBSERVATION NOTES</p><h2>探索手记</h2></div><button onClick={()=>setPanel(null)}>收起</button></div>
      <p className="panel-intro">记住途中发现的生活空间。返回时恢复观察位置和视线，动物按各自的状态继续活动。</p>
      <p className="journal-storage" role="status">{explorationMemory?.storageStatus==='session-only'?'浏览器暂时无法保存，仅本次会话可用':'地点保存在本机'} · {explorationMemory?.points.length||0} / {OCEAN_OBSERVATION_POINT_LIMIT} 个观察点</p>
      {explorationMemory?.last&&<div className="journal-last"><span>上次探索 · {oceanHabitats[explorationMemory.last.habitat]||'海域'} · 距{homeShort} {Math.round(Math.hypot(explorationMemory.last.position.x,explorationMemory.last.position.z))} m</span><button disabled={!worldReady} onClick={()=>returnObservation(explorationMemory.last)}>继续上次探索</button></div>}
      <form className="journal-mark" onSubmit={e=>{e.preventDefault();markObservation();}}>
        <label htmlFor="observation-point-name">观察点名称</label>
        <div><input id="observation-point-name" value={pointName} maxLength={32} placeholder={isDeep?'例如：沉积平原边缘':biome==='kelp'?'例如：巨藻林边缘':'例如：海草床边缘'} onChange={e=>setPointName(e.target.value)} disabled={!worldReady||!oceanExploring}/><button type="submit" disabled={!worldReady||!oceanExploring||(explorationMemory?.points.length||0)>=OCEAN_OBSERVATION_POINT_LIMIT}>标记此处</button></div>
        {!oceanExploring&&<p>进入大海后，可以标记当前观察位置。</p>}
        {(explorationMemory?.points.length||0)>=OCEAN_OBSERVATION_POINT_LIMIT&&<p>观察点已满，移除一处后可继续标记。</p>}
      </form>
      <ol className="journal-points">{explorationMemory?.points.map(point=><li key={point.id}>
        <strong>{point.label}</strong><p>{oceanHabitats[point.view.habitat]||'海域'} · {point.view.freeDepthM.toFixed(1)} m 深<br/>东向 {Math.round(point.view.position.x)} m · 南向 {Math.round(point.view.position.z)} m</p>
        <div><button disabled={!worldReady} aria-label={`返回观察点：${point.label}`} onClick={()=>returnObservation(point.view)}>返回观察点</button><button disabled={!worldReady} aria-label={`移除观察点：${point.label}`} onClick={()=>removeObservation(point.id)}>移除</button></div>
      </li>)}</ol>
      {!explorationMemory?.points.length&&<p className="journal-empty">还没有标记。找到想再看的{isDeep?'沉积平原、缓坡或岩露头':biome==='kelp'?'巨藻林、岩底或林间空地':'礁体、草床或开阔水域'}时，记下一个观察点。</p>}
    </aside>}
    <output id="reef-diagnostics" hidden>{snapshot?JSON.stringify({director:director.diagnostics,explorationMemory,sceneProfile:snapshot.sceneProfile,inputSeed:snapshot.inputSeed,worldClockSec:snapshot.worldClockSec,surfaceY:snapshot.surfaceY,ocean:snapshot.ocean,selectedAgentId:snapshot.selectedAgentId,runId:snapshot.runId,biomeId:snapshot.biomeId,wallSeconds:snapshot.wallSeconds,metrics:snapshot.metrics,environment:snapshot.environment,fps:snapshot.fps,actualFrameCount:snapshot.actualFrameCount,actualFrameSeconds:snapshot.actualFrameSeconds,overallMeanFPS:snapshot.overallMeanFPS,minFrameTimeMs:snapshot.minFrameTimeMs,maxFrameTimeMs:snapshot.maxFrameTimeMs,frameTimeBuckets:snapshot.frameTimeBuckets,focusObservation:snapshot.focusObservation,environmentAssets:snapshot.environmentAssets,drawCalls:snapshot.drawCalls,triangles:snapshot.triangles,hardware:snapshot.hardware,viewport:snapshot.viewport,camera:snapshot.camera,paused:snapshot.paused,speed:snapshot.speed,following:snapshot.following,initializationMs:snapshot.initializationMs,gpuWarmup:snapshot.gpuWarmup,visualTimeSec:snapshot.visualTimeSec,resourceInventory:snapshot.resourceInventory,landscapeCoralDetail:snapshot.landscapeCoralDetail,controlStartCount:snapshot.controlStartCount,errors:snapshot.errors}):'loading'}</output>
    <div ref={container} className="world-canvas"/>
    <header className="masthead"><div className="brand"><span className="brand-en">TIDAL</span><span className="brand-divider"/><span className="brand-cn">潮汐<span>海底观察站</span></span></div><nav aria-label="观察工具"><button className="demo-entry" disabled={recording} onClick={startDirector}>导演演示</button><button className={`demo-entry ${panel==='demo'?'active':''}`} onClick={()=>{director.stop();setPendingDemo(null);setHelp(false);setPanel('demo');}}>能力总览</button><button className={!panel?'active':''} onClick={closeDemo}>自由观察</button><button className={panel==='science'?'active':''} onClick={()=>toggle('science')}>环境实验</button><button className={panel==='population'?'active':''} onClick={()=>toggle('population')}>生态演化</button><button className={panel==='catalog'?'active':''} onClick={()=>toggle('catalog')}>生物图鉴 <small>{speciesCatalog.length}</small></button>{continuousBiome&&<button className={panel==='journal'?'active':''} onClick={()=>{setHelp(false);toggle('journal');}}>探索手记</button>}<button className="help-button" onClick={()=>{director.stop();setPendingDemo(null);setPanel(null);setHelp(!help);}}>操作说明</button></nav></header>
    <section className="location-label"><p className="eyebrow">{oceanExploring?'OPEN OCEAN · CONTINUOUS EXPLORATION':definition.eyebrow}</p><h1>{oceanExploring?(isDeep?'沿深海床探索':biome==='kelp'?'穿行巨藻林':livingShallows?'探索浅海生命':'向海洋深处探索'):biome==='reef'?definition.label:<>{definition.title}<br/>观察生命。</>}</h1><p className="location-sub">{biome!=='reef'&&definition.subtitle}<span>{isDeep?'观察器照明':'自然光'} · 安静观察</span></p></section>
    <div className="biome-switch"><label htmlFor="biome">观察生境</label><select id="biome" value={biome} disabled={recording||director.state.active} onChange={e=>{setPendingDemo(null);setPanel(null);setHelp(false);rememberOcean();try{localStorage.setItem('tidal-observation-biome-v1',e.target.value);}catch{}setBiome(e.target.value);}}>{Object.values(sceneDefinitions).map(d=><option key={d.id} value={d.id}>{d.label}</option>)}</select>{biome==='reef'&&!performanceCount&&<select aria-label="浅海世界" value={reefProfile} disabled={recording||director.state.active} onChange={e=>{setPendingDemo(null);rememberOcean();setPanel(null);setSelected(null);try{localStorage.setItem('tidal-shallows-profile-v1',e.target.value);}catch{}setReefProfile(e.target.value);}}><option value={LIVING_SHALLOWS_PROFILE}>浅海生态海域</option><option value="legacy">原浅礁观察区</option></select>}</div>
    {!snapshot&&!error&&<div className="loading-note">正在构建{definition.label}与生物群落…</div>}
    {error&&<div className="error-panel"><h2>场景暂时无法运行</h2><p>{error}</p><button onClick={()=>location.reload()}>重新加载</button></div>}
    {oceanExploring&&!panel&&!help&&!species&&<aside className={`reef-observation ocean-exploration${oceanToolsOpen?'':' ocean-tools-compact'}`} aria-label="海洋探索">
      <div className="observation-entry-heading"><span>海域随探索延展</span><div className="ocean-tools-heading-actions"><button onClick={returnReef}>返回{homeLabel}</button><button aria-expanded={oceanToolsOpen} aria-controls="ocean-exploration-tools" onClick={()=>setOceanToolsOpen(open=>!open)}>{oceanToolsOpen?'收起工具':'展开海域'}</button></div></div>
      <div className="ocean-position"><strong>{oceanSceneThemes[ocean.localHabitat?.sceneTheme]||oceanHabitatLabel(oceanComposition,ocean.habitat)}</strong><span>距{homeShort} {Math.round(livingShallows?ocean.distanceFromEntryM:ocean.distanceFromReefM)} m</span></div>
      {livingShallows&&ocean.routeStops&&<div className="living-route" aria-label="浅海探索路线">{ocean.routeStops.map((stop,index)=><button key={stop.id} disabled={!worldReady} onClick={()=>world.current?.travelLivingShallows(index)}>{stop.label}</button>)}</div>}
      {biome==='kelp'&&ocean.forestRouteStops?.length>0&&<div className="living-route" aria-label="巨藻林探索路线">{ocean.forestRouteStops.map(stop=><button key={stop.id} disabled={!worldReady||recording} onClick={()=>travelKelpBelt(stop.id)}>{stop.label}</button>)}</div>}
      {biome==='kelp'&&ocean.kelpSeascapeRouteStops?.length>0&&<div className="living-route" aria-label="巨藻整景探索路线">{ocean.kelpSeascapeRouteStops.map(stop=><button key={stop.id} disabled={!worldReady||recording} onClick={()=>travelKelpBelt(stop.id)}>{stop.label}</button>)}</div>}
      {biome==='deep'&&ocean.seascapeRouteStops?.length>0&&<div className="living-route" aria-label="深海生活带探索路线">{ocean.seascapeRouteStops.map(stop=><button key={stop.id} disabled={!worldReady||recording} onClick={()=>travelDeepBelt(stop.id)}>{stop.label}</button>)}</div>}
      {livingShallows&&ecosystem&&<LivingEcosystem ecosystem={ecosystem} compact/>}
      {livingShallows&&<><div className="living-guild" aria-label="开放水层观察">{[['yellowtail-fusilier','水层鱼群'],['reef-squid','礁鱿游动'],['spotted-jelly','漂游水母']].map(([id,label])=><button key={id} disabled={!worldReady||!regionalEcology?.agents.some(a=>a.speciesId===id&&a.alive)} onClick={()=>world.current?.focusNearbyOceanAnimal(id)}>{label}</button>)}</div><LivingDiscoveries discoveries={ocean.discoveries} world={world} ready={worldReady} onTravel={travelDiscovery}/></>}
      {livingShallows&&<div className="living-guild" aria-label="礁底生命观察">{[['day-octopus','礁底章鱼'],['spotted-reef-crab','底栖蟹'],['tube-sponge','附着海绵']].map(([id,label])=><button key={id} disabled={!worldReady||!regionalEcology?.agents.some(a=>a.speciesId===id&&a.alive)} onClick={()=>world.current?.focusNearbyOceanAnimal(id)}>{label}</button>)}</div>}
      {!oceanToolsOpen&&<p className="ocean-compact-reading">{oceanCommunity?.status==='loading'?'本格群落正在加载':`本格 ${oceanCommunity?.livingAnimals||0} 个活体 · ${oceanCommunity?.speciesCount||0} ${communityUnit}`}<span>拖动转向 · WASD移动</span></p>}
      <div className="ocean-travel-controls">{biome==='kelp'&&<button disabled={!worldReady||recording} onClick={enterKelpScene}>巨藻整景</button>}{livingShallows&&<><button disabled={!worldReady||recording} onClick={enterShallowScene}>浅海整景</button><button disabled={!worldReady||recording} onClick={observeLivingScene}>附近礁缘</button></>}<button onClick={()=>world.current?.toggleOceanCruise()}>{ocean.cruising?'停止巡航':'沿视线巡航'}</button>{ocean.travelling&&<button onClick={()=>world.current?.stopOceanTravel()}>停止移动</button>}{biome==='kelp'&&<button disabled={!worldReady||oceanCommunity?.status==='loading'} onClick={()=>observeKelpCommunity('community')}>观察林缘群落</button>}{biome==='kelp'&&oceanCommunity?.speciesIds?.includes('blue-rockfish')&&<button disabled={!worldReady} onClick={()=>world.current?.focusNearbyOceanAnimal('blue-rockfish',ocean.chunkId)}>观察林缘鱼群</button>}{biome==='kelp'&&oceanCommunity?.speciesIds?.includes('leopard-shark')&&<button disabled={!worldReady} onClick={()=>observeOceanLocal('leopard-shark')}>观察近底巡游</button>}{biome==='kelp'&&oceanCommunity?.speciesIds?.includes('purple-urchin')&&<button disabled={!worldReady} onClick={()=>observeOceanLocal('purple-urchin')}>观察海胆</button>}{biome==='kelp'&&oceanCommunity?.speciesIds?.includes('giant-kelpfish')&&<button disabled={!worldReady} onClick={()=>world.current?.focusNearbyOceanAnimal('giant-kelpfish',ocean.chunkId)}>观察藻间鱼</button>}{oceanCommunity?.speciesIds?.includes('reef-manta')&&<button disabled={!worldReady} onClick={()=>world.current?.focusNearbyOceanAnimal('reef-manta',ocean.chunkId)}>观察礁蝠鲼</button>}{oceanCommunity?.speciesIds?.includes('yellowtail-fusilier')&&<button disabled={!worldReady} onClick={()=>world.current?.focusNearbyOceanAnimal('yellowtail-fusilier',ocean.chunkId)}>观察水层鱼群</button>}{ocean?.localHabitat?.formations?.count>0&&<button disabled={!worldReady} onClick={()=>{if(!world.current?.focusNearbyOceanFormation())setToast('附近暂无完整礁脊组，请继续探索');}}>观察礁脊通道</button>}</div>
      {biome==='kelp'&&ocean.communityObservation&&<div className="ocean-travel-controls" role="group" aria-label="林缘整体观察">{ocean.communityObservation.stops.map(stop=><button key={stop.id} disabled={!worldReady} aria-pressed={ocean.communityObservation.activeStopId===stop.id} onClick={()=>observeKelpCommunity(stop.id)}>{stop.label}</button>)}</div>}
      {biome==='reef'&&oceanCommunity?.speciesIds?.includes('green-turtle')&&<div className="ocean-travel-controls"><button disabled={!worldReady} onClick={()=>observeOceanLocal('green-turtle')}>观察草床海龟</button></div>}
      {biome==='reef'&&ocean.localHabitat?.sceneElements?.elementIds.length>=3&&<div className="ocean-travel-controls"><button disabled={!worldReady} onClick={()=>{if(!world.current?.focusOceanScene())setToast('这里暂时没有可完整观察的海床组合，请继续探索');}}>观察海床组合</button></div>}
      {biome==='reef'&&ocean.localHabitat?.habitatScenes?.elementIds.length>0&&<div className="ocean-travel-controls ocean-habitat-entry"><button disabled={!worldReady} onClick={()=>{if(!world.current?.focusOceanHabitat())setToast('这里暂时没有安全的生境观察点，请继续探索');}}>观察当地生境</button></div>}
      {isDeep&&<div className="ocean-travel-controls"><button disabled={!worldReady||!oceanCommunity?.livingAnimals} onClick={()=>observeOceanLocal(null)}>观察近底生命</button>{oceanCommunity?.speciesIds?.includes('giant-sea-spider-group')&&<button disabled={!worldReady} onClick={()=>observeOceanLocal('giant-sea-spider-group')}>观察海蜘蛛</button>}</div>}
      <div className="ocean-layer-controls" role="group" aria-label="航行水层"><span>{isDeep?'近底高度':'航行水层'}<small>{ocean.observationLayer==='free'?'自由 · ':''}{localWater?.depthM?.toFixed(1)??'—'} m 深</small></span>{navigationLayers.map(layer=><button key={layer.id} disabled={!worldReady} aria-pressed={(ocean.observationLayer||'bed')===layer.id} onClick={()=>world.current?.setOceanObservationLayer(layer.id)}>{layer.label}</button>)}</div>
      <div id="ocean-exploration-tools" className="ocean-tools-body" hidden={!oceanToolsOpen}>
      <p className="ocean-coordinates">东向 {Math.round(ocean.worldPosition[0])} m · 南向 {Math.round(ocean.worldPosition[2])} m</p>
      {oceanComposition&&<p className="ocean-depth-range">本格海床约 {oceanComposition.minDepthM.toFixed(1)}–{oceanComposition.maxDepthM.toFixed(1)} m 深{oceanLandforms.length>0&&` · ${oceanLandformNames[oceanLandforms[0][0]]}为主`}</p>}
      {localWater&&<p className="ocean-water-reading">当地水流 {localWater.currentMps.toFixed(2)} m/s · {oceanFlowLabel(localWater.currentVector)} <span>能见约 {localWater.visibilityM.toFixed(1)} m</span></p>}
      <div className="ocean-chart" aria-label="周边海域，每格64米">{ocean.nearby.map(cell=><button key={`${cell.dx},${cell.dz}`} aria-label={cell.current?'当前位置':`探索${cell.dz<0?'北':cell.dz>0?'南':''}${cell.dx<0?'西':cell.dx>0?'东':''}侧海域`} aria-current={cell.current?'location':undefined} data-habitat={cell.composition?.primary||cell.habitat} disabled={cell.current||!worldReady} onClick={()=>world.current?.travelOcean(cell.dx,cell.dz)}><span>{oceanSceneThemes[cell.sceneTheme]||oceanHabitatLabel(cell.composition,cell.habitat)}</span>{cell.current&&<i>●</i>}</button>)}</div>
      <p className="ocean-map-caption">北 ↑ · 每格64 m · 点击邻格前往</p>
      <button className="ocean-life-entry" disabled={!worldReady||oceanCommunity?.status==='loading'||!oceanCommunity?.livingAnimals} onClick={()=>observeOceanLocal(null)}>观察本格生命 <span>{oceanCommunity?.status==='loading'?'本格加载中':`${oceanCommunity?.livingAnimals||0} 个活体 · ${oceanCommunity?.speciesCount||0} ${communityUnit} ↗`}</span></button>
      <p className="ocean-life-summary">{oceanCommunity?.status==='empty'?'本格暂无活体 · ':''}周边已加载 {regionalMetrics?.activeRegions||0}/9 格 · 共 {regionalMetrics?.alive||0} 个活体</p>
      {oceanCommunity?.status==='ready'&&oceanCommunity.representatives?.length>0&&<div className="ocean-life-representatives" aria-label="本格代表动物">{oceanCommunity.representatives.map(entry=><button key={entry.speciesId} disabled={!worldReady} title={`${entry.commonName} · ${entry.count}个活体`} aria-label={`观察本格${entry.commonName}，${entry.count}个活体`} onClick={()=>observeOceanLocal(entry.speciesId)}><span>{entry.commonName}</span><small>{entry.count} 个 <i aria-hidden="true">↗</i></small></button>)}</div>}
      {oceanActivities.length>0&&<p className="ocean-activity-reading">本格：{oceanActivities.map(([state,count])=>`${oceanActivityNames[state]||state} ${count}`).join(' · ')}</p>}
      <p className="ocean-help">拖动转向 · WASD移动 · Shift加速 · Q/E下潜与上浮</p>
      <details className="ocean-scope ocean-habitat-reading"><summary>当地生境与回访状态</summary>
        <p>{oceanHabitatHints[ocean.habitat]}</p>
        {oceanCommunity?.status==='loading'?<p>本格群落正在加载。</p>:oceanCommunity?.species?.length>0?<><p>本格记录的活体{isDeep?'代表类群':'物种'}与数量：</p><ul className="ocean-community-species">{oceanCommunity.species.map(entry=><li key={entry.speciesId}>{entry.commonName||'未收录类群'} <span>{entry.count} 个</span></li>)}</ul></>:<p>本格当前没有活体动物记录。</p>}
        {localWater&&<p>观察深度约 {ocean.worldPosition?Math.max(0,(snapshot?.surfaceY||8)-ocean.worldPosition[1]).toFixed(1):'—'} m，{isDeep?'没有自然光，只有观察器提供局部照明':'光照随水深减弱'}。浑浊为相对指数，能见距离是模型近似；漂移亮点不代表食物库存。</p>}
        {biome==='reef'&&<p>浮游食物随当地海流在已加载邻格之间移动，进入邻格后可供当地动物摄食。离开加载窗口的部分计为出口；未加载海域暂停演化。食物是每格充分混合的相对库存，输运与通路检查均为有限近似。</p>}
        <p>{isDeep?'三个入口在当前海床附近切换观察高度，约离底1.8、3.5和6米；沿途随海床起伏保持净空，不代表生态深度分层。观察灯、时钟与显示海雪不增加食物。':'水层入口在当前位置切换观察高度，巡航和邻格航行沿所选水层继续。中层取当地水深的中间位置，近水面约1.5米深；浅处或礁体附近会调整高度以保持净空。'}Q/E可自行选择深度。</p>
        {oceanLandforms.length>0&&<p>礁石地貌：{oceanLandforms.map(([profile,count])=>`${oceanLandformNames[profile]} ${count}`).join(' · ')}。邻格名称概括采样到的主要生境，格内仍有自然交错。</p>}
        <p>当前地图格的景观：{Object.entries(ocean.localHabitat?.cover||{}).filter(([,count])=>count>0).map(([kind,count])=>`${oceanCoverNames[kind]||kind} ${count}`).join(' · ')||'开阔海床'}。景观覆盖与动物资源分别记录。</p>
        {ocean.localHabitat?.sceneElements&&<p>本格新增的探索元素：{Object.entries(ocean.localHabitat.sceneElements.counts).map(([kind,count])=>`${oceanSceneElementNames[kind]} ${count}`).join(' · ')||'保持开阔海床'}。石块、海草丛和沉木在适宜的草床边缘组合出现，偶有灌水沉底的开口瓶；回访保留位置。</p>}
        {ocean.localHabitat?.habitatScenes&&<p>沿途生境：{oceanSceneThemes[ocean.localHabitat.sceneTheme]}。{Object.entries(ocean.localHabitat.habitatScenes.counts).map(([kind,count])=>`${oceanHabitatElementNames[kind]} ${count}`).join(' · ')||'保留开放的沉积海床'}。附着群落落在真实岩面，草丛落在适宜的海床；这些是景观覆盖，回访保留，不作为食物库存。</p>}
        {ocean.localHabitat?.formations?.count>0&&<p>外礁坡出现成组的大型礁体，礁脊之间保留开放通道。点击“观察礁脊通道”可到附近入口，自由转向或继续巡航。</p>}
        {oceanCommunity?.speciesIds?.includes('lyretail-anthias')&&<p>海金鱼在礁面上方群游并摄取浮游食物。{oceanCommunity.speciesIds.includes('blue-starfish')&&'蓝海星在硬底缓慢活动。'}群游动作与成功摄食记录分别显示，可用本格物种入口靠近观察。</p>}
        {oceanCommunity?.speciesIds?.includes('yellowtail-fusilier')&&<p>黄尾乌尾鮗在礁体上方的水层群游，摄食消耗当地浮游资源。点击“观察水层鱼群”可跟随同一条鱼穿行邻近海域。这里是大型鱼群的小组代表，数量、游速、巡游路线与低光活动为展示近似；未加载的海域暂停演化，回访时延续已保存状态。</p>}
        {oceanCommunity?.speciesIds?.includes('reef-manta')&&<p>礁蝠鲼在适宜的开阔礁区稀疏出现，约3米盘宽的个体以胸鳍缓慢滑游。浮游参考资源充足时进入滤食状态，成功摄食另有历史记录。它可在已加载的相邻海域间漫游，保留同一个体与摄食历史；离开活区后冻结。漫游路线是模型近似，尚未模拟季节迁徙、翻滚摄食或繁殖。</p>}
        {oceanCommunity?.speciesIds?.includes('green-turtle')&&<p>真实海草床上方偶见绿海龟代表。{localRegion?.turtleGrazingVersion===1?'它巡游寻找可达海草，接近叶片参考点后短暂取食，消耗当地代表海草有机库存；上浮呼吸优先于摄食。':'此区保留巡游和上浮呼吸，尚未登记海草摄食。'}卸载时保存并暂停。数量、速度、取食量与换气间隔为展示近似，尚未模拟生理氧气或繁殖。</p>}
        {biome==='kelp'&&<p>海胆和石鳖在岩面缓慢刮食，海星在林底寻找有机材料；巨型海藻鱼在藻间悬停并接近小型食物，褐色钟螺附在真实宿主叶面。每格只模拟少量代表宿主，其余巨藻为景观覆盖，数量不等于野外密度。</p>}
        {biome==='kelp'&&localRegion?.understorySceneryVersion===1&&<p>硬底上分布低层藻丛，与高层巨藻和林间空地形成分层。以 Pterygophora californica 为简化代表，高度约1～2米；数量与摆动为景观示意，尚未计入动物食物与巨藻生产。</p>}
        {biome==='kelp'&&localRegion?.driftCommunityVersion===1&&<p>代表巨藻的自然脱落量进入同岩林底藻料点，紫海胆接近后才摄入，食物来源与消耗分别记账。脱落仍按模拟日推进；可见薄叶段是局部落料的示意，不表示整株叶片数量或真实重量，也不代表完整漂落路径。</p>}
        {biome==='kelp'&&oceanCommunity?.speciesIds?.includes('leopard-shark')&&<p>豹鲨代表在浅水林缘与开阔海床稀疏巡游，按实际海床和附近藻株检查游动空间。当前只模拟本格内巡游；摄食、代谢与繁殖尚未接入，数量和速度为展示近似。</p>}
        {biome==='kelp'&&oceanCommunity?.speciesIds?.includes('blue-rockfish')&&<p>蓝岩鱼小群在林缘开放水层与已加载的相邻海域之间巡游，个别成员接近当地小型动物食物后摄食。跟随同一个体可以连续观察；弱光时活动降低，未加载海域保存并暂停演化。群体数量、路线与光响应是未校准的模型近似。</p>}
        {isDeep&&<p>海猪属代表缓慢接近沉积食物，鼠尾鳕科代表近底寻食，绒球海葵附底等候随底流经过的食物。摄食只消耗当地相对有机代理量；数量、食物斑块与地形是示意，尚未校准真实密度或远区演化。</p>}
        {isDeep&&oceanCommunity?.speciesIds?.includes('giant-sea-spider-group')&&<p>海蜘蛛属代表用八条细长足缓慢步行，吻端接触绒球海葵触手后才吸食体液。成功接触使海葵条件能量下降，并进入海蜘蛛的独立收支；双方保留身份。数量、速度和转移量是未校准的示意，尚未模拟触手损伤与再生。</p>}
        <p>外围群落随生境分布，离开的分区暂停演化，回访继续。{regionalMetrics?.persistenceStatus==='error'?'保存失败：回访状态可能丢失。':regionalMetrics?.persistenceStatus==='session-only'?'浏览器存储不可用，仅本次已加载区有效。':'状态定期保存在本机；重置将清除。'}</p>
      </details>
      </div>
    </aside>}
    {isDeep&&!oceanExploring&&!panel&&!help&&!species&&<aside className="reef-observation" aria-label="深海观察入口">
      <div className="observation-entry-heading"><span>观察近底生活</span></div>
      <button className="ocean-entry" disabled={!worldReady} onClick={startOcean}>探索深海 <span>沿沉积平原、缓坡与稀疏硬底持续前行 ↗</span></button>
      {explorationMemory?.last&&<button className="ocean-resume" disabled={!worldReady} onClick={()=>returnObservation(explorationMemory.last)}>继续上次探索 <span>{Math.round(Math.hypot(explorationMemory.last.position.x,explorationMemory.last.position.z))} m · {oceanHabitats[explorationMemory.last.habitat]||'海域'}</span></button>}
      <div className="observation-destinations">{speciesCatalog.filter(s=>!s.regionalOnly).map(s=><button key={s.id} disabled={!worldReady} onClick={()=>observe(s.id)}>{s.commonName}<span aria-hidden="true">↗</span></button>)}</div>
    </aside>}
    {biome==='kelp'&&!oceanExploring&&!panel&&!help&&!species&&<aside className="reef-observation" aria-label="海带林观察入口">
      <div className="observation-entry-heading"><span>观察林下生活</span></div>
      <button className="ocean-entry" disabled={!worldReady} onClick={startOcean}>探索海带林 <span>沿岩底、巨藻林与林间空地持续前行 ↗</span></button>
      {explorationMemory?.last&&<button className="ocean-resume" disabled={!worldReady} onClick={()=>returnObservation(explorationMemory.last)}>继续上次探索 <span>{Math.round(Math.hypot(explorationMemory.last.position.x,explorationMemory.last.position.z))} m · {oceanHabitats[explorationMemory.last.habitat]||'海域'}</span></button>}
      <div className="observation-destinations">{['giant-kelpfish','purple-urchin','bat-star'].map(id=><button key={id} disabled={!worldReady} onClick={()=>observe(id)}>{speciesCatalog.find(s=>s.id===id)?.commonName}<span aria-hidden="true">↗</span></button>)}</div>
    </aside>}
    {biome==='reef'&&!oceanExploring&&!panel&&!help&&(!species||observation)&&<aside className="reef-observation" aria-label="礁区观察入口">
      <div className="observation-entry-heading"><span>{exploration?`沿礁探索 · ${explorationIndex+1}/${REEF_EXPLORATION_STOPS.length}`:'观察礁间生活'}</span>{exploration||observation?<button onClick={()=>setCamera('wide')}>返回全景</button>:<button disabled={!worldReady} onClick={()=>explore(0)}>沿礁探索 ↗</button>}</div>
      {!exploration&&!observation&&<button className="ocean-entry" disabled={!worldReady} onClick={startOcean}>探索大海 <span>随行生成的礁丘、海草床与沙地 ↗</span></button>}
      {!exploration&&!observation&&explorationMemory?.last&&<button className="ocean-resume" disabled={!worldReady} onClick={()=>returnObservation(explorationMemory.last)}>继续上次探索 <span>{Math.round(Math.hypot(explorationMemory.last.position.x,explorationMemory.last.position.z))} m · {oceanHabitats[explorationMemory.last.habitat]||'海域'}</span></button>}
      {exploration&&<div className="reef-exploration">
        <div className="exploration-stops" aria-label="礁区探索地点">{REEF_EXPLORATION_STOPS.map((stop,index)=><button key={stop.id} disabled={!worldReady} aria-pressed={index===explorationIndex} onClick={()=>explore(index)}>{stop.label}</button>)}</div>
        {!observation&&<p>{exploration.hint}</p>}
        <div className="exploration-actions"><button disabled={explorationIndex===0||!worldReady} onClick={()=>explore(explorationIndex-1)}>上一站</button>{atExplorationStop&&!observation?<small>拖动自由探索</small>:<button disabled={!worldReady} onClick={()=>explore(explorationIndex)}>回到本站</button>}<button disabled={explorationIndex===REEF_EXPLORATION_STOPS.length-1||!worldReady} onClick={()=>explore(explorationIndex+1)}>下一站</button></div>
      </div>}
      <div className="observation-destinations">{observationEntries.map(item=><button key={item.speciesId} disabled={!worldReady||!snapshot?.agents.some(a=>a.speciesId===item.speciesId&&a.alive)} aria-pressed={observation?.speciesId===item.speciesId} onClick={()=>observe(item.speciesId)}>{item.label}<span aria-hidden="true">↗</span></button>)}</div>
      {observation&&<div className="observation-live"><div className="observation-live-heading"><strong>{species.commonName}</strong><span>{animalActivity(agent)}</span><small>{snapshot?.following?'跟随中':'视角已放开'}</small></div><p>{agent.alive?observation.hint:'此个体已死亡，可选择其他活体继续观察。'}</p>{observationReading&&<details className="observation-reading" key={agent.id}><summary>读懂此刻</summary><p><strong>{observationReading.label}</strong>{observationReading.explanation}</p><p className="reading-context">{observationReading.context}</p>{observationReading.experiment&&<button disabled={!worldReady} onClick={()=>setPanel('science')}>观察环境变化 ↗</button>}</details>}<div className="observation-live-actions">{agent.alive&&!snapshot?.following&&<button onClick={()=>world.current?.focusAgent(agent.id,observation)}>继续跟随</button>}<button onClick={()=>setObservationId(null)}>生物档案</button><small>{paused?'模拟已暂停':'状态随实时模拟变化'}</small></div></div>}
    </aside>}
    {biome==='reef'&&view==='skeleton'&&snapshot?.environmentAssets?.length>0&&!panel&&!species&&<aside className="scan-note glass" aria-label="死亡珊瑚骨架资料"><p className="eyebrow">CORAL SKELETON · USNM 229</p><h2>死亡珊瑚骨架</h2><p className="latin-name">Acropora cytherea</p><p>馆藏干骨骼扫描，保留原比例并排除人工展示底座。形态供近距离观察；场景安放为示意，不代表活体或现场调查。</p><a href={snapshot.environmentAssets[0].recordUrl} target="_blank" rel="noreferrer">查看 Smithsonian 馆藏资料</a></aside>}
    {biome==='reef'&&view==='coral'&&snapshot&&!panel&&!species&&<aside className="scan-note glass" aria-label="分枝珊瑚形态说明"><p className="eyebrow">CORAL · CLOSE OBSERVATION</p><h2>靠近分枝珊瑚</h2><p>观察枝端与侧面的珊瑚杯，以及覆盖枝体的组织。这里展示活体组织的形态近似，杯体大小和密度不是测量数据。</p></aside>}
    {panel==='population'&&(ecologyModel==='age'?<AgeWorkbench key={`age-${director.state.active?director.state.token:'manual'}`} onReady={()=>director.panelReady(director.state.token)} onFailure={problem=>director.fail(director.state.token,problem)} onClose={closeDemo} onToast={setToast} onModelChange={model=>{director.stop();setPendingDemo(null);setEcologyModel(model);}}/>:<PopulationWorkbench key={`foodweb-${director.state.active?director.state.token:'manual'}`} onReady={()=>director.panelReady(director.state.token)} onFailure={problem=>director.fail(director.state.token,problem)} onClose={closeDemo} onToast={setToast} onModelChange={model=>{director.stop();setPendingDemo(null);setEcologyModel(model);}}/>)}
    {help&&<section className="help-panel glass"><div className="panel-heading"><h2>慢下来，靠近一点。</h2><button onClick={()=>setHelp(false)}>关闭</button></div><dl>{[['鼠标拖动','转动视角，右键平移'],['滚轮 / 双指','靠近或远离观察对象'],['W A S D','平稳移动，Q / E 下潜与上浮'],['点击生物','查看档案，跟随当前个体'],['环境实验','改变条件，观察资源与行为']].map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl><p>预设观察点可随时返回。拖动视角会退出跟随。</p></section>}
    {panel==='science'&&<aside className="side-panel glass" aria-label="环境实验面板"><div className="panel-heading"><div><p className="eyebrow">FIELD EXPERIMENT</p><h2>环境实验</h2></div><button onClick={()=>setPanel(null)}>收起</button></div><p className="panel-intro">{oceanExploring?(isDeep?'滑块设置近底水流与外来食物供给。深海没有自然光，观察器照明只改变画面。':'滑块设置海域基准，沿途水况还随地形和水深变化。'):'一次改变一个条件，观察这个生境的资源与行为。'}</p>
      {oceanExploring&&localWater&&<p className="local-water-context">当前位置：水流 {localWater.currentMps.toFixed(2)} m/s · {oceanFlowLabel(localWater.currentVector)} · 相对浑浊 {percent(localWater.turbidity)}。光照代理 {percent(localWater.lightAtDepth)}。</p>}
      <div className="environment-controls">
        <label htmlFor="current"><span>水流速度 <b>{env.currentMps.toFixed(2)} m/s</b></span><input disabled={!worldReady} id="current" type="range" min="0" max="0.8" step="0.01" value={env.currentMps} onChange={e=>setEnv({currentMps:+e.target.value})}/><em>{biome==='reef'?'水流输送与游泳成本':'被动漂移与游动补偿'}</em></label>
        <label htmlFor="turbidity"><span>相对浑浊度 <b>{percent(env.turbidity)}</b></span><input disabled={!worldReady} id="turbidity" type="range" min="0" max="1" step="0.01" value={env.turbidity} onChange={e=>setEnv({turbidity:+e.target.value})}/><em>{isDeep?'仅改变观察衰减，本版摄食使用非视觉线索':'可见距离与水下光照'}</em></label>
        <label htmlFor="food"><span>{biome==='reef'?'外海浮游食物输入':'外部食物补给'} <b>{env.foodSupply.toFixed(1)} 倍</b></span><input disabled={!worldReady} id="food" type="range" min="0" max="3" step="0.1" value={env.foodSupply} onChange={e=>setEnv({foodSupply:+e.target.value})}/><em>{isDeep?'沉积、底栖和上游悬浮食物输入':biome==='kelp'?'小型食物、碎屑与能量收支':'改变浮游输入，不立即清空库存或停止藻膜光合'}</em></label>
        <label htmlFor="daylight"><span>{isDeep?'模拟时钟':'观察时刻'} <b>{String(Math.floor(env.hour)).padStart(2,'0')}:{String(Math.floor(env.hour%1*60)).padStart(2,'0')}</b></span><input disabled={!worldReady} id="daylight" type="range" min="0" max="23.9" step="0.1" value={env.hour} onChange={e=>setEnv({hour:+e.target.value})}/><em>{isDeep?'深海无太阳光，改变时钟不供生态能量':'日光与昼夜活动'}</em></label>
        {isDeep&&<label className="observer-light-control" htmlFor="observer-light"><span>观察器照明 <b>{env.observerLight?'开启':'关闭'}</b></span><input disabled={!worldReady} id="observer-light" type="checkbox" checked={!!env.observerLight} onChange={e=>setEnv({observerLight:Number(e.target.checked)})}/><em>相机附近的观察灯，不改变食物或动物体能。</em></label>}
      </div><div className="experiment-presets"><button disabled={!worldReady} onClick={()=>setEnv({currentMps:.65})}>增强水流</button><button disabled={!worldReady} onClick={()=>setEnv({turbidity:.85})}>增加浑浊</button><button disabled={!worldReady} onClick={()=>setEnv({foodSupply:0})}>停止补给</button><button disabled={!worldReady} onClick={()=>{setEnv({...definition.baseline});setToast('环境恢复基线，生物状态继续演化；重置可恢复初始状态');}}>基线环境</button></div>
      <section className="resource-section"><div className="section-heading"><h3>{useRegionalMetrics?`${regionalMetrics.activeRegions} 个活区 · 平均资源`:'生态状态'}</h3><span>可见距离 {Number(displayMetrics.visibilityM||0).toFixed(1)} m</span></div>{resourceSeries.map(([label,key,color])=><Resource key={key} label={label} value={displayMetrics[key]} color={color}/>)}<Resource label="平均能量" value={displayMetrics.averageEnergy} color="#e0c69b"/>{!useRegionalMetrics&&<ResourceHistory data={history.current} biome={biome}/>}<p className="legend"><span>{isDeep?'沉积碎屑':biome==='kelp'?'藻类':'藻膜'}</span><span>{isDeep?'悬浮食物':biome==='kelp'?'小型食物':'浮游资源'}</span><span>平均能量</span></p>{biome==='kelp'&&useRegionalMetrics&&regionalEcology.agents.some(a=>a.speciesId==='leopard-shark')&&<p className="model-note">平均能量只统计已接入能量收支的动物；豹鲨本轮仅展示巡游。</p>}{isDeep&&<p className="model-note">上方三类食物为相对有机代理量。悬浮物亮点仅展示海雪，数量不等于食物库存；本版没有太阳光或光合输入。</p>}</section>
      {biome==='reef'&&<p className="model-note">{livingShallows?'代表植物、动物、食物和碎屑使用相对有机物单位；摄食残余与分解接入同一基础网络。景观簇数量不等于生物量。已登记海龟接入海草有机库存，成功取食记录与动作状态分别显示。':useRegionalMetrics?'资源量为已加载分区的平均参考量，原礁另行统计。表面池合并藻膜与海星摄食的表面有机物代理；海草组织未参与收支。':'资源量统计整个原礁区，以相对参考量表示。水中亮点不代表食物库存。'}</p>}
      {livingShallows&&ecosystem&&<LivingEcosystem ecosystem={ecosystem}/>}
      {biome==='reef'&&useRegionalMetrics&&<section className="resource-section" aria-label="海流输送食物"><h3>海流输送食物</h3>{regionalMetrics?.planktonTransport?.enabled&&foodFlow?<><p>当前地图格 {flowRegion.id} · 最近 {Number(foodFlow.lastStepSec||0).toFixed(1)} 模拟秒</p><p>随流入格 {foodUnits(foodFlow.lastImportedUnits)} · 流往邻格 {foodUnits(foodFlow.lastTransferredOutUnits)} · 窗口出口 {foodUnits(foodFlow.lastBoundaryExportedUnits)}</p>{foodFlow.lastOverflowExportedUnits>0&&<p>容量溢出计为出口 {foodUnits(foodFlow.lastOverflowExportedUnits)}</p>}<p className="model-note">数值为相对食物量。邻格收到后可供当地动物摄食；暂停时保留最近一步记录。停止外部补给仍可有邻格来料，零水流停止跨格输运。水中亮点用于呈现悬浮物，数量不代表库存。</p></>:<p className="model-note">正在建立共同保存的食物记录；无法共同保存时，使用原局部食物模型。</p>}</section>}
      <section className="event-section"><h3>正在发生</h3><ul>{displayEvents.map((e,i)=><li key={`${e.timeSec}-${i}`}><time>{time(e.timeSec)}</time><strong>{eventLabel(e.label||e.title)}</strong><p>{eventCause(e)}</p></li>)}{!displayEvents.length&&<li>继续观察，行为事件将更新记录。</li>}</ul></section>
      <div className="seed-row"><label htmlFor="seed">随机种子</label><input disabled={!worldReady} id="seed" value={seed} inputMode="numeric" onChange={e=>setSeed(e.target.value)}/><button disabled={!worldReady} onClick={reset}>重置</button></div><button disabled={!worldReady} className="export-data" onClick={exportExperiment}>导出实验数据</button><p className="model-note">有资料依据的简化生态模型。资源为相对参考量，能量归一化为 0–1，浑浊度为相对指数；不用于野外种群预测。</p>
    </aside>}
    {panel==='catalog'&&<aside className="side-panel glass catalog-panel" aria-label="生物图鉴"><div className="panel-heading"><div><p className="eyebrow">LIFE UNDERWATER</p><h2>{isDeep?'认识深海软底生命':biome==='reef'?'认识礁区居民':'认识海带林居民'}</h2></div><button onClick={()=>setPanel(null)}>收起</button></div><p className="panel-intro">{oceanExploring?'选择当前活区中的动物，靠近它的生活空间。灰色条目在附近没有活体。':'选择一种生物，靠近它的生活空间。'}</p><div className="catalog-list">{speciesCatalog.map((s,i)=><button disabled={!worldReady||(!oceanExploring&&s.regionalOnly)||(oceanExploring&&!regionalEcology?.agents.some(a=>a.speciesId===s.id&&a.alive))} key={s.id} onClick={()=>{director.stop();setPendingDemo(null);setObservationId(null);if(oceanExploring)world.current?.focusNearbyOceanAnimal(s.id);else world.current?.focusSpecies(s.id);setPanel(null);}}><span className="catalog-number">{String(i+1).padStart(2,'0')}</span><span><strong>{s.commonName}</strong><em>{s.scientificName}</em></span><span className="catalog-kind">{kinds[s.kind]}</span></button>)}</div><p className="model-note">真实资料支持的生物档案。场景形态与行为为实时模拟近似。</p></aside>}
    {species&&!panel&&!observation&&<aside className="specimen-panel glass" aria-label="选中生物档案"><div className="panel-heading"><p className="eyebrow">OBSERVATION · {kinds[species.kind]}</p><button onClick={()=>{setSelected(null);setObservationId(null);world.current?.select(null);}}>关闭</button></div><h2>{species.commonName}</h2><p className="latin-name">{species.scientificName}</p>{regionalAgent&&<p className="regional-observation">分区 {agent.regionId} · {agent.mobileTimeSec!==undefined?'个体模拟':'区域模拟'} {time(agent.timeSec)}<br/>{species.id==='green-turtle'&&agent.grazing?.version!==1?'仅记录巡游和上浮呼吸；摄食、代谢与繁殖尚未模拟。':species.id==='leopard-shark'?'仅记录巡游；摄食、代谢与繁殖尚未模拟。':<>{typeof agent.lastFeedAt==='number'?`上次成功摄食：${Math.max(0,Math.floor(agent.timeSec-agent.lastFeedAt))} 模拟秒前`:'此个体尚无成功摄食记录'}。动作状态与摄食历史分别记录。</>}</p>}<div className="specimen-status"><span>{animalActivity(agent)}</span>{Number.isFinite(agent.energy)&&<span>能量 {percent(agent.energy)}</span>}<span>{agent.sizeM>=1?agent.sizeM.toFixed(1)+' m':(agent.sizeM*100).toFixed(0)+' cm'}{species.kind==='kelp'?' · 代表藻体':sizeMeasureLabel(species)?' · '+sizeMeasureLabel(species):''}</span></div><PredatorObservation agent={agent}/><KelpDriftObservation agent={agent}/><ReefGuildObservation agent={agent}/><OpenWaterObservation agent={agent}/><TurtleObservation agent={agent}/><p className="species-description">{species.description}</p><dl><div><dt>食性</dt><dd>{species.diet}</dd></div><div><dt>行为</dt><dd>{species.behavior}</dd></div></dl><div className="specimen-actions"><button onClick={()=>world.current?.focusAgent(agent.id)}>{snapshot?.following?'正在跟随':'跟随观察'}</button><button onClick={()=>setPanel('science')}>观察生态变化</button></div><details><summary>资料来源与模型说明</summary><p>{species.nameNote}形态、动作及状态是简化表示；{species.id==='green-turtle'?(agent.grazing?.version===1?'模拟巡游、静态叶片接触取食、换气和相对有机收支；未校准真实生理或摄食速率。':'此区只模拟巡游和上浮呼吸。'):species.id==='leopard-shark'?'本轮只模拟巡游。':'能量为归一化参考值。'}</p>{species.sources?.map((s,i)=><a key={i} href={typeof s==='string'?s:s.url} target="_blank" rel="noreferrer">{typeof s==='string'?'来源资料':s.label||'来源资料'}</a>)}</details></aside>}
    <footer className="observation-footer"><div className="scene-meta"><span className="live-dot"/>{paused?'观察已暂停':performanceCount&&biome==='reef'?'性能观察 · 120 初始移动个体':'实时生态模拟'}<small>种子 {world.current?.inputSeed??world.current?.sim.seed??seed} · {time(useRegionalMetrics?localRegion?.timeSec:m.timeSec)}{useRegionalMetrics?' · 当前分区':''}</small></div><div className="observation-controls" aria-label="观察控制"><div className="view-switch">{Object.entries(livingShallows?{wide:"全景",reef:"礁群",crevice:"沙道",seagrass:"草床",slope:"礁坡"}:definition.views).map(([id,label])=><button disabled={!worldReady} key={id} className={view===id?'selected':''} onClick={()=>setCamera(id)}>{oceanExploring&&id==='wide'?'海域全景':label}</button>)}</div><span className="control-separator"/><button disabled={!worldReady||director.state.active} onClick={togglePause}>{paused?'继续':'暂停'}</button><select disabled={!worldReady||director.state.active} aria-label="模拟时间速度" value={speed} onChange={e=>{setSpeed(+e.target.value);if(world.current)world.current.speed=+e.target.value;}}>{[1,4,12,60].map(n=><option key={n} value={n}>{n}×</option>)}</select><span className="control-separator"/><button disabled={!worldReady} onClick={captureScreenshot}>截图</button><button disabled={!worldReady} className={recording?'record-active':''} onClick={record}>{recording?'结束录像':'录像'}</button></div><div className="telemetry"><span>深度 {snapshot?.depthM?.toFixed(1)||'—'} m</span><small>{snapshot?.fps||'—'} FPS · {oceanExploring?regionalMetrics?.alive||0:snapshot?.agents.filter(a=>!a.regionId&&a.alive).length||0} {oceanExploring?'活区动物':'观察实体'}{performanceCount&&biome==='reef'? ' · '+(m.mobilePopulation||0)+' 移动活体':''}</small></div></footer>
    {isDeep&&!oceanExploring&&!selected&&!panel&&!help&&<p className="interaction-hint">拖动观察 · 滚轮靠近 · 点击生物</p>}{toast&&<div className="toast" role="status">{toast}</div>}
  </main>;
}




