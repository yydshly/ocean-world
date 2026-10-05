import { LIVING_SHALLOWS_ROUTE } from './livingShallowsGeneration.js';
import { LIVING_SHALLOWS_PROFILE } from './livingShallows.js';
import { OCEAN_OBSERVATION_LAYERS } from './oceanLayerNavigation.js';
import { DEEP_OCEAN_OBSERVATION_LAYERS } from './deepOceanNavigation.js';

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
};

// The first four IDs come from the generator. The seven additions match the
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
];

export const DEMO_LIVING_STOPS = Object.freeze(stops.map((stop, index) => entry({
  id: stop.id, number: String(index + 1).padStart(2, '0'), title: stop.label,
  description: stopHints[stop.id],
  action: { id: `stop-${stop.id}`, kind: 'living-stop', biome: 'reef', profile: LIVING_SHALLOWS_PROFILE, stopId: stop.id },
})));

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

export const demoNeedsSceneChange = choice => ['world', 'living-stop', 'view', 'discoveries'].includes(choice.kind);

export const DEMO_ACTIONS = Object.freeze([...DEMO_WORLDS, ...DEMO_LIVING_STOPS, ...DEMO_LEGACY_VIEWS,
  ...DEMO_CURRENT_TOOLS, ...DEMO_RECORD_TOOLS, ...DEMO_WORKBENCHES, ...demoLayerEntries('reef')].map(item => item.action));
