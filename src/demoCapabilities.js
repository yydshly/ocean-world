import { OCEAN_BIODIVERSITY_ROUTE_STOPS } from './oceanBiodiversityRoutes.js';
import { OCEAN_BENTHIC_LIFE_ROUTE_STOPS } from './oceanBenthicLifeRoutes.js';
import { OCEAN_MEADOW_LIFE_ROUTE_STOPS } from './oceanMeadowLifeRoutes.js';
import { OCEAN_SHOAL_LIFE_ROUTE_STOPS } from './oceanShoalLifeRoutes.js';
import { LIVING_SHALLOWS_ROUTE } from './livingShallowsGeneration.js';
import { LIVING_SHALLOWS_PROFILE } from './livingShallows.js';
import { OCEAN_OBSERVATION_LAYERS } from './oceanLayerNavigation.js';
import { DEEP_OCEAN_OBSERVATION_LAYERS } from './deepOceanNavigation.js';
import { SHALLOW_SEASCAPE_ROUTE_STOPS } from './livingShallowSeascape.js';
import { COASTAL_SEASCAPE_ROUTE_STOPS } from './livingCoastalSeascape.js';
import { REEF_VALLEY_REGION_ROUTE_STOPS } from './reefValleyRegion.js';
import { SEAGRASS_MEADOW_REGION_ROUTE_STOPS } from './seagrassMeadowRegion.js';
import { KELP_SEASCAPE_ROUTE_STOPS } from './kelpSeascape.js';
import { KELP_BENTHIC_LIFE_ROUTE_STOPS } from './kelpBenthicLifeRoutes.js';
import { KELP_UNDERSTORY_LIFE_ROUTE_STOPS } from './kelpUnderstoryLifeRoutes.js';
import { KELP_NEAR_BOTTOM_LIFE_ROUTE_STOPS } from './kelpNearBottomLifeRoutes.js';
import { KELP_WATER_LIFE_ROUTE_STOPS } from './kelpWaterLifeRoutes.js';
import { DEEP_WHOLE_SEASCAPE_ROUTE_STOPS } from './deepWholeSeascape.js';
import { DEEP_BENTHIC_LIFE_ROUTE_STOPS } from './deepBenthicLifeRoutes.js';
import { DEEP_HARD_LIFE_ROUTE_STOPS } from './deepHardLifeRoutes.js';
import { DEEP_MIDWATER_LIFE_ROUTE_STOPS } from './deepMidwaterLifeRoutes.js';
import { DEEP_WATER_LIFE_ROUTE_STOPS } from './deepWaterLifeRoutes.js';

const action = data => Object.freeze(data);
const entry = data => Object.freeze({ ...data, action: action(data.action) });

export const DEMO_WORLDS = Object.freeze([
  entry({ id: 'living-shallows', number: '01', title: '新浅海', tag: '礁群 · 草床 · 沙道',
    description: '看连续生成的海床、生境与实际群落，以及礁坡、砂盆和相邻地貌。',
    biome: 'reef', profile: LIVING_SHALLOWS_PROFILE,
    action: { id: 'world-living-shallows', kind: 'world', biome: 'reef', profile: LIVING_SHALLOWS_PROFILE } }),
  entry({ id: 'legacy-reef', number: '02', title: '原浅礁', tag: '固定观察点 · 外围海域',
    description: '看原礁区的珊瑚、鱼群和岩隙，再进入外围探索；另有珊瑚骨架观察。',
    biome: 'reef', profile: 'legacy',
    action: { id: 'world-legacy-reef', kind: 'world', biome: 'reef', profile: 'legacy' } }),
  entry({ id: 'kelp', number: '03', title: '海带林', tag: '林底 · 藻间 · 冠层',
    description: '看巨藻岩底、林间空地、林底落料与分布在不同空间的真实动物。',
    biome: 'kelp',
    action: { id: 'world-kelp', kind: 'world', biome: 'kelp' } }),
  entry({ id: 'deep', number: '04', title: '深海软底', tag: '沉积平原 · 缓坡 · 岩露头',
    description: '看观察器照明下的软底群落，近底觅食、附底等候与实际摄食记录。',
    biome: 'deep',
    action: { id: 'world-deep', kind: 'world', biome: 'deep' } }),
]);

const stopHints = {
  'seagrass-meadow-region':'接续礁谷的完整草甸、草缘沙沟、硬底岛与当地真实动物',
  'reef-valley-region': '连续探索礁墙、台地、分叉沙沟、草床边缘与真实水层群落，向外继续生成相邻海区',
  'coastal-life-belt': '连续走过礁群、砂道、草床与外坡，观察沿途真实生活空间与动物',
  'shoal-life-community': '进入真实水层鱼群和较大游弋动物的生活空间，群体中的每条鱼独立保存，组合由当地条件与记录决定',
  'meadow-life-community': '观察实际海草间的抓附生命、礁缘游动动物和砂地附着群落；当地组合由水深、底质与保存记录决定',
  'benthic-community': '沿沙地与礁底观察魟、羊鱼、宝螺和寄居蟹，实际组合由当地底质与水深决定',
  'biodiversity-reef': '普通探索中的礁缘丰富群落，观察团块珊瑚、附着生物与近底动物；当地组合随生境而变',
  'reef-garden': '珊瑚岩礁与相邻生活空间',
  'sand-channel': '礁群之间的开放沙道',
  'seagrass-meadow': '海草簇与沙地间隙',
  'outer-reef': '较深礁坡和上方水域',
  'ridge-gully': '成组礁脊之间的通道',
  'patch-reef': '分散礁丘与开放沙面',
  'meadow-edge': '草床和岩礁的交界',
  'shelf-rise': '实际海床抬升与坡面',
  'sand-basin': '下凹砂盆与周围海床',
  'connected-seascape': '四区共用的连续起伏',
  'seascape-transition': '相邻地貌与生境过渡',
  'habitat-belt-reef': '完整生活带中的礁丘、珊瑚群落与开放砂道',
  'habitat-belt-meadow': '相邻草床、软底生命与上方真实水层动物',
  'shallow-scene-reef': '浅海整景起点，观察成组岩礁、珊瑚与砂道的关系',
  'shallow-scene-sand': '沿共享海床观察宽砂道、碎石带与相邻礁肩',
  'shallow-scene-meadow': '观察宽草床、软底动物和上方游动生命',
  'shallow-scene-slope': '沿整景末段观察外礁缓坡、稀疏岩体与开放水层',
};

// The first four IDs come from the generator. The additions match the
// public routeStops in livingRidgeGeology.js; these are observation shortcuts,
// never a claim of ordinary travel or an assertion about saved terrain.
const stops = [...LIVING_SHALLOWS_ROUTE,
  { id: 'ridge-gully', label: '礁脊岩沟' },
  { id: 'patch-reef', label: '分散礁丘' },
  { id: 'meadow-edge', label: '草床边缘' },
  { id: 'shelf-rise', label: '海床缓坡' },
  { id: 'sand-basin', label: '宽缓砂盆' },
  { id: 'connected-seascape', label: '连续海床' },
  { id: 'seascape-transition', label: '相邻生境' },
  { id: 'habitat-belt-reef', label: '生活带：礁群沙道' },
  { id: 'habitat-belt-meadow', label: '生活带：草床水层' },
  ...SHALLOW_SEASCAPE_ROUTE_STOPS, ...OCEAN_BIODIVERSITY_ROUTE_STOPS, ...OCEAN_BENTHIC_LIFE_ROUTE_STOPS, ...OCEAN_MEADOW_LIFE_ROUTE_STOPS, ...OCEAN_SHOAL_LIFE_ROUTE_STOPS, ...COASTAL_SEASCAPE_ROUTE_STOPS, ...REEF_VALLEY_REGION_ROUTE_STOPS, ...SEAGRASS_MEADOW_REGION_ROUTE_STOPS,
];

export const DEMO_LIVING_STOPS = Object.freeze(stops.map((stop, index) => entry({
  id: stop.id, number: String(index + 1).padStart(2, '0'), title: stop.label,
  description: stopHints[stop.id],
  action: { id: `stop-${stop.id}`, kind: 'living-stop', biome: 'reef', profile: LIVING_SHALLOWS_PROFILE, stopId: stop.id,
    ...(stop.id==='seagrass-meadow-region'?{seagrassMeadowRegionEntry:true}:stop.id==='reef-valley-region'?{reefValleyRegionEntry:true}:stop.id==='coastal-life-belt'?{coastalLifeBeltEntry:true}:stop.id==='meadow-life-community'?{meadowLifeEntry:true}:stop.id==='shoal-life-community'?{shoalLifeEntry:true}:{}) },
})));

export const DEMO_KELP_STOPS = Object.freeze([
  entry({id:'forest-belt-interior',number:'01',title:'林缘生活带：巨藻群',description:'硬底高巨藻、低冠植物与真实林间动物',
    action:{id:'stop-forest-belt-interior',kind:'kelp-stop',biome:'kelp',stopId:'forest-belt-interior'}}),
  entry({id:'forest-belt-opening',number:'02',title:'林缘生活带：开放沙地',description:'相邻林缘、天然沉积空隙与上方水域',
    action:{id:'stop-forest-belt-opening',kind:'kelp-stop',biome:'kelp',stopId:'forest-belt-opening'}}),
  ...KELP_SEASCAPE_ROUTE_STOPS.map((stop,index)=>entry({id:stop.id,number:String(index+3).padStart(2,'0'),title:stop.label,
    description:({ 'kelp-scene-forest':'硬底高冠藻群、林下植物和真实动物',
      'kelp-scene-rockbed':'原生不规则岩底与林下生活空间',
      'kelp-scene-opening':'天然沉积空隙、林缘与藻间水层',
      'kelp-scene-outer':'稀疏林缘、开放海床与上方水域' })[stop.id],
    action:{id:`stop-${stop.id}`,kind:'kelp-stop',biome:'kelp',stopId:stop.id}})),
  ...KELP_BENTHIC_LIFE_ROUTE_STOPS.map((stop,index)=>entry({id:stop.id,number:String(index+7).padStart(2,'0'),title:stop.label,
    description:'沿原生岩底寻找红鲍、北方藻蟹、幼体海兔和附着海葵；当地组合由底质、水深与保存记录决定',
    action:{id:`stop-${stop.id}`,kind:'kelp-stop',biome:'kelp',stopId:stop.id,kelpBenthicLifeEntry:true}})),
  ...KELP_UNDERSTORY_LIFE_ROUTE_STOPS.map((stop,index)=>entry({id:stop.id,number:String(index+8).padStart(2,'0'),title:stop.label,
    description:'穿行林下岩面，观察棕榈状藻丛、分节珊瑚藻、团球海绵和带柄海鞘组成的实际附着群落',
    action:{id:`stop-${stop.id}`,kind:'kelp-stop',biome:'kelp',stopId:stop.id,kelpUnderstoryLifeEntry:true}})),
  ...KELP_NEAR_BOTTOM_LIFE_ROUTE_STOPS.map((stop,index)=>entry({id:stop.id,number:String(index+9).padStart(2,'0'),title:stop.label,
    description:'沿岩底与相邻沙地观察红岩蟹、褐斑岩鱼、角鲨和圆盘鳐的实际活动；当地组合由底质、水深与保存记录决定',
    action:{id:`stop-${stop.id}`,kind:'kelp-stop',biome:'kelp',stopId:stop.id,kelpNearBottomLifeEntry:true}})),
  ...KELP_WATER_LIFE_ROUTE_STOPS.map((stop,index)=>entry({id:stop.id,number:String(index+10).padStart(2,'0'),title:stop.label,
    description:'沿真实巨藻林缘的水层移动，观察群游竹荚鱼、乌贼、海荨麻和近底岩藻取食者，实际组合由当地条件及存档决定',
    action:{id:`stop-${stop.id}`,kind:'kelp-stop',biome:'kelp',stopId:stop.id,kelpWaterLifeEntry:true}})),

]);

export const DEMO_DEEP_STOPS = Object.freeze([
  entry({id:'deep-plain-community',number:'01',title:'深海生活带：沉积平原',description:'软泥底、实际底栖动物与近底觅食空间',
    action:{id:'stop-deep-plain-community',kind:'deep-stop',biome:'deep',stopId:'deep-plain-community'}}),
  entry({id:'deep-slope-outcrop',number:'02',title:'深海生活带：缓坡岩露头',description:'共享床面的宽缓坡、稀疏硬底和周围真实群落',
    action:{id:'stop-deep-slope-outcrop',kind:'deep-stop',biome:'deep',stopId:'deep-slope-outcrop'}}),
  ...DEEP_WHOLE_SEASCAPE_ROUTE_STOPS.map((stop,index)=>entry({id:stop.id,number:String(index+3).padStart(2,'0'),title:stop.label,
    description:({'deep-scene-plain':'连续软泥海床、沉积平原与实际底栖生命',
      'deep-scene-slope':'共享海床上的宽缓坡与近底生活空间',
      'deep-scene-outcrop':'实际岩露头、周围沉积底和真实群落',
      'deep-scene-outer':'碎石与开放海床，继续向外探索'})[stop.id],
    action:{id:`stop-${stop.id}`,kind:'deep-stop',biome:'deep',stopId:stop.id}})),
  ...DEEP_BENTHIC_LIFE_ROUTE_STOPS.map((stop,index)=>entry({id:stop.id,number:String(index+7).padStart(2,'0'),title:stop.label,
    description:'观察适合当地软泥底与水深的沉积物利用者和底栖爬行动物；当地组合由生境与保存记录决定',
    action:{id:`stop-${stop.id}`,kind:'deep-stop',biome:'deep',stopId:stop.id,deepBenthicLifeEntry:true}})),
  ...DEEP_HARD_LIFE_ROUTE_STOPS.map((stop,index)=>entry({id:stop.id,number:String(index+8).padStart(2,'0'),title:stop.label,
    description:'观察真实岩面上固定附着的海百合与黑珊瑚，以及随底流发生的悬浮摄食',
    action:{id:`stop-${stop.id}`,kind:'deep-stop',biome:'deep',stopId:stop.id,deepHardLifeEntry:true}})),
  ...DEEP_WATER_LIFE_ROUTE_STOPS.map((stop,index)=>entry({id:stop.id,number:String(index+9).padStart(2,'0'),title:stop.label,
    description:'观察带鳍章鱼与长体鼬鳚在真实海床上方缓游，以及接近原生底栖食物位置时的摄食',
    action:{id:`stop-${stop.id}`,kind:'deep-stop',biome:'deep',stopId:stop.id,deepWaterLifeEntry:true}})),
  ...DEEP_MIDWATER_LIFE_ROUTE_STOPS.map((stop,index)=>entry({id:stop.id,number:String(index+10).padStart(2,'0'),title:stop.label,
    description:'进入约700米水深的开放中层，观察水母、吸血乌贼与红糠虾的独立活动与悬浮摄食',
    action:{id:`stop-${stop.id}`,kind:'deep-stop',biome:'deep',stopId:stop.id,deepMidwaterLifeEntry:true}})),
]);

export const DEMO_LEGACY_VIEWS = Object.freeze([
  entry({ id: 'legacy-wide', title: '原浅礁全景', description: '回到固定礁区的整体观察视角',
    action: { id: 'legacy-wide', kind: 'view', biome: 'reef', profile: 'legacy', view: 'wide' } }),
  entry({ id: 'legacy-skeleton', title: '珊瑚骨架', description: '查看原浅礁中的珊瑚骨架模型',
    action: { id: 'legacy-skeleton', kind: 'view', biome: 'reef', profile: 'legacy', view: 'skeleton' } }),
]);

export const DEMO_CURRENT_TOOLS = Object.freeze([
  entry({ id: 'catalog', title: '当前生物图鉴', description: '目录、资料依据与当前可观察活体',
    action: { id: 'current-catalog', kind: 'panel', panel: 'catalog' } }),
  entry({ id: 'science', title: '环境实验', description: '光照、水流、资源与实际生态读数',
    action: { id: 'current-science', kind: 'panel', panel: 'science' } }),
  entry({ id: 'local-life', title: '当地主体', description: '寻找附近真实生物的整体观察空间',
    action: { id: 'current-local-life', kind: 'local-life' } }),
  entry({ id: 'discoveries', title: '浅海发现', description: '在新浅海查看沉木与沉底瓶的近距记录',
    action: { id: 'living-discoveries', kind: 'discoveries', biome: 'reef', profile: LIVING_SHALLOWS_PROFILE } }),
]);

export const DEMO_RECORD_TOOLS = Object.freeze([
  entry({ id: 'journal', title: '探索手记', description: '手动标记或返回当前海域的观察点',
    action: { id: 'current-journal', kind: 'panel', panel: 'journal' } }),
  entry({ id: 'capture', title: '截图与录像', description: '打开捕捉说明，再选择截图、录像或导出',
    action: { id: 'capture-guide', kind: 'capture' } }),
]);

export const DEMO_WORKBENCHES = Object.freeze([
  entry({ id: 'foodweb', title: '食物网对照', description: '查看独立功能群模型的基线、干预和物质账本',
    action: { id: 'population-foodweb', kind: 'population', model: 'foodweb' } }),
  entry({ id: 'age', title: '年龄结构实验', description: '查看独立种群模型中的年龄结构与长期变化',
    action: { id: 'population-age', kind: 'population', model: 'age' } }),
]);

export function demoLayerEntries(biome) {
  const layers = biome === 'deep' ? DEEP_OCEAN_OBSERVATION_LAYERS : OCEAN_OBSERVATION_LAYERS;
  return layers.map(layer => entry({ id: layer.id, title: layer.label,
    description: biome === 'deep' ? '观察器近底高度' : '当前水平位置的观察水层',
    action: { id: `layer-${layer.id}`, kind: 'layer', layer: layer.id },
  }));
}

export const demoNeedsSceneChange = choice => ['world', 'living-stop', 'kelp-stop', 'deep-stop', 'view', 'discoveries'].includes(choice.kind);

export const DEMO_ACTIONS = Object.freeze([...DEMO_WORLDS, ...DEMO_LIVING_STOPS, ...DEMO_KELP_STOPS, ...DEMO_DEEP_STOPS, ...DEMO_LEGACY_VIEWS,
  ...DEMO_CURRENT_TOOLS, ...DEMO_RECORD_TOOLS, ...DEMO_WORKBENCHES, ...demoLayerEntries('reef')].map(item => item.action));
