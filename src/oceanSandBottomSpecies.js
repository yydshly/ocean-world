// A finite soft-bottom community addition. Existing explicit variants and
// saved benthic v1/v2 owners retain their original populations and food.
const freeze = v => { if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
const source = (url, label) => ({ url, label });
const descriptor = data => freeze({
  regionalOnly: true, identityLevel: 'species', taxonomicLevel: 'species',
  referenceRegion: '热带印度—西太平洋浅海沙床和草甸边缘的代表组合',
  coOccurrenceStatus: 'representative-community-not-a-survey-reconstruction',
  ecologicalRateStatus: 'uncalibrated-demonstration', calibratedMovementMPerS: null,
  calibratedEcologicalRates: null, populationDensityPerM2: null,
  displaySizeM: { range: data.sizeRangeM, measure: data.sizeMeasure, status: 'illustrative-selection' },
  admissionDepthM: { range: data.depthSelectionM, status: 'illustrative-selection-not-complete-species-range' },
  substrate: ['sand', 'soft-sediment'], habitat: ['shallow-sand-bed', 'seagrass-edge'],
  limitations: ['只表现露出沙面的个体、贴底短距离活动与相对营养摄入；尚无埋沙、离底游泳、砂粒处理、可见捕杀或繁殖。',
    '尺寸、深度、数量、速度及摄食率均为实现选择，未据野外数据校准。'],
  ...data,
});
export const OCEAN_SAND_BOTTOM_SPECIES = freeze([
  descriptor({ id: 'leopard-flounder', commonName: '斑点豹鲆（描述性中文名）',
    scientificName: 'Bothus pantherinus', scientificAuthor: '(Rüppell, 1830)', kind: 'fish', guild: 'benthic-predator', lengthM: .22,
    sizeRangeM: [.18, .26], sizeMeasure: 'total-length', depthSelectionM: [3, 15], colors: ['#82765a', '#b9ad89', '#343022'],
    description: '扁平卵形鱼体，双眼同在向上的左侧；长背鳍和臀鳍围绕体缘，圆尾，眼侧有暗斑、浅色环斑及后部大黑斑。',
    diet: '底栖动物性食物；本版使用当地未分辨小动物营养库存，不消耗沙粒或假定已捕杀可见动物。',
    behavior: '在完整身体可支持的平缓软底露出、短移与停留；未模拟埋沙伪装、求偶和天然昼夜日程。',
    foodProxyStatus: 'existing-reef-guild-animal-organic-stock-not-rendered-prey-kills',
    morphology: { eyedSide: 'left-upward-at-rest', eyes: 2, caudalFin: 'rounded', longMarginalFins: ['dorsal', 'anal'] },
    sources: [source('https://fishesofaustralia.net.au/home/species/4687', 'Museums Victoria：接受名、左侧双眼、斑纹、沙泥生境、1–150m及30cm TL'),
      source('https://www.fao.org/4/y0870e/y0870e45.pdf', 'FAO pp3818–3819：物种形态与底栖动物食性；18–26cm为本版选择')],
  }),
  descriptor({ id: 'comb-sand-star', commonName: '梳棘沙海星（描述性中文名）',
    scientificName: 'Astropecten polyacanthus', scientificAuthor: 'Müller & Troschel, 1842', kind: 'starfish', guild: 'benthic-predator', lengthM: .08,
    sizeRangeM: [.06, .10], sizeMeasure: 'maximum-whole-arm-span', depthSelectionM: [3, 15], colors: ['#5b4859', '#b2a18b', '#c6b395'],
    description: '扁平的五条尖臂，沿臂缘排列梳齿状尖棘，紫褐色上表面与浅色口面；与既有粗壮礁海星轮廓不同。',
    diet: '动物性营养分量；本版只扣当地未分辨小动物库存，不把沙粒或珊瑚模型当作食物。',
    behavior: '在沙和粉砂支持的空隙贴底慢移；不模拟沙内猎物搜索、吞食过程或严格昼夜日程。',
    foodProxyStatus: 'existing-reef-guild-animal-organic-stock-not-complete-natural-diet',
    taxonomicCaveat: '采用博物馆命名形态代表；分子研究提示该形态种包含种复合群，不外推全部区域成员。',
    morphology: { arms: 5, marginalSpines: 'comb-like', tubeFootTips: 'pointed-without-sucker-discs' },
    sources: [source('https://australian.museum/learn/animals/sea-stars/sydney-seastars/astropecten-polyacanthus-mller-troschel-1842/', 'Australian Museum：100mm宽、五尖臂、梳棘、沙粉砂和0–185m；本版跨度是显示选择'),
      source('https://webstatic.niwa.co.nz/library/ARCtr2009-108.pdf', 'NIWA毒素食物链综述：A.polyacanthus参与小腹足类至大型腹足类链条；不推定完整食谱'),
      source('https://repository.si.edu/items/461af10f-ff51-4cbc-a586-81dfce8c532d', 'Zulliger & Lessios 2010原始分子研究：形态种复合群限制')],
  }),
  descriptor({ id: 'sandfish-sea-cucumber', commonName: '糙海参',
    scientificName: 'Holothuria scabra', scientificAuthor: 'Jaeger, 1833', kind: 'sea-cucumber', guild: 'deposit-feeder', lengthM: .22,
    sizeRangeM: [.18, .26], sizeMeasure: 'body-length', depthSelectionM: [3, 15], colors: ['#767368', '#aba89a', '#494941'],
    description: '背部隆起、腹面扁平的灰褐色体形，横向皱褶及短乳突，浅色腹面有管足，前腹口部有20条小触手。',
    diet: '摄入沙泥中的有机物；本版扣碎屑库存中的有机分量，不将矿物沙粒转成能量。',
    behavior: '选择草甸边缘和浅海沙泥空隙，露出沙面贴底慢移；尚无埋沙及沉积物翻动。',
    foodProxyStatus: 'existing-detritus-organic-stock-not-mineral-sand-mass',
    morphology: { oralTentacles: 20, ventrum: 'flattened-pale-with-podia', dorsum: 'wrinkled-short-papillae' },
    sources: [source('https://www.fao.org/4/i1918e/i1918e.pdf', 'FAO2012 pp80–81：接受名、皱褶、20口触手、沙泥草床、约40cm最大与24cm平均；不合并H.lessoni'),
      source('https://www.nparks.gov.sg/florafaunaweb/fauna/4/1/416', 'NParks：摄入沉积物有机物、沙滩及部分埋沙')],
  }),
]);
export const OCEAN_SAND_BOTTOM_IDS = freeze(OCEAN_SAND_BOTTOM_SPECIES.map(s => s.id));
export const oceanSandBottomSpeciesById = freeze(Object.fromEntries(OCEAN_SAND_BOTTOM_SPECIES.map(s => [s.id, s])));
export const sandBottomFoodPool = id => id === 'sandfish-sea-cucumber' ? 'detritus' : 'reefGuild.preyOrganicUnits';
export const sandBottomFoodScope = id => oceanSandBottomSpeciesById[id]?.foodProxyStatus;
