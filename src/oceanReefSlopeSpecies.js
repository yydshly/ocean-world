// A finite Indo-West Pacific habitat expansion, not a local field census.
const freeze = v => { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
const link = (url, label) => ({ url, label });
const contacts = [-.25, 0, .25].flatMap(x => [-.025, .025].map(z => ({ x, y: 0, z })));
function species(d) {
  const bottom = d.bottom === true;
  return freeze({ regionalOnly: true, identityLevel: 'species-representative', taxonomicLevel: 'species',
    referenceRegion: '热带印度—西太平洋外礁及沙砾坡缘', coOccurrenceStatus: 'representatives-not-a-local-field-survey',
    ecologicalRateStatus: 'uncalibrated-demonstration', calibratedMovementMPerS: null, calibratedEcologicalRates: null,
    naturalPopulationDensity: null, calibratedTemperatureC: null, calibratedSalinityPSU: null, calibratedOxygenMgPerL: null,
    kind: 'fish', sizeMeasure: 'total-length', foodPool: d.pool ?? 'reefGuild.preyOrganicUnits',
    displaySizeM: { range: d.sizeRangeM, measure: 'total-length', status: 'illustrative-selection' },
    admissionDepthM: { range: d.depthSelectionM, status: 'chosen-whole-model-depth-not-complete-natural-range' }, depthRangeM: d.depthSelectionM,
    support: { mode: bottom ? 'whole-soft-bed-body' : 'whole-freewater-body-near-real-reef',
      contactKind: bottom ? 'six-belly-and-fin-support-samples' : 'none-freewater', footContacts: bottom ? contacts : [],
      rootReference: bottom ? 'support-plane-total-length-midpoint' : 'total-length-midpoint',
      pitchLimitRad: bottom ? .04 : .10, minimumNormalY: .92, wholeBodyDepthRequired: true, terrainClearanceRequired: true },
    normalizedEnvelope: { x: [-.54, .54], y: bottom ? [0, .24] : [-.32, .38], z: bottom ? [-.20, .20] : [-.19, .19],
      horizontalRadiusUnits: .59, axes: 'forward-positive-x; up-positive-y; transverse-z',
      status: 'conservative-display-whole-form-and-bounded-animation-not-measured-anatomy' },
    animationBounds: { tailYawRad: .10, pectoralRollRad: bottom ? .025 : .06 },
    morphology: { form: d.form, normalizedMeasuredSize: 1, bodyMeasuredX: [-.5, .5], sizeAxis: 'snout-to-farthest-caudal-tip-x',
      clearanceIncludes: ['whole-body', 'head', 'mouth', 'eyes', 'all-fins', 'bounded-animation'] },
    feedingProxy: { owner: d.pool ? 'resources' : 'reefGuild', stock: d.pool ? 'plankton' : 'preyOrganicUnits',
      resourcePath: `region.${d.pool ?? 'reefGuild.preyOrganicUnits'}`, selectedFoodComponent: d.foodComponent,
      status: 'existing-selected-nutrition-proxy-not-complete-natural-diet', visiblePreyKillImplemented: false, speciesResolvedFoodStock: false },
    limitations: ['形态、种群密度、运动和摄食速率尚未作野外校准。', '没有真实捕猎、埋沙、洞穴遮蔽或物种级食物网。'],
    ...d, sourceLinks: d.sources.map(s => ({ ...s })) });
}
export const OCEAN_REEF_SLOPE_SPECIES = freeze([
  species({ id: 'bigscale-soldierfish', commonName: '大鳞兵鲷（描述性中文名）', scientificName: 'Myripristis berndti',
    scientificAuthor: 'Jordan & Evermann, 1903', guild: 'nocturnal-reef-planktivore', lengthM: .21, sizeRangeM: [.18, .24], depthSelectionM: [12, 35],
    referenceSizeM: { maximum: .30, measure: 'total-length' }, referenceDepthM: { reportedRange: [3, 159], completeNaturalRange: false },
    pool: 'resources.plankton', foodComponent: 'selected-unresolved-zooplankton-nutrition', colors: ['#a66056', '#b69755', '#352c2a'],
    form: 'deep-large-eyed-red-edged-scales-yellow-spiny-dorsal-fork-tail', description: '大眼深体、红色鳞缘、黄色棘背鳍、暗色鳃盖缘和叉尾。',
    diet: '自然为夜行浮游动物食者；本版只扣当地已有浮游营养代理。',
    behavior: '低光照才活动摄食；白天近礁停留，没有声称真实洞穴避光。', habitat: ['outer-reef', 'reef-slope-margin'],
    sources: [link('https://fishesofaustralia.net.au/home/species/1404', 'Museums Victoria：身份、形态、3–159m、30cm及夜行浮游食性'),
      link('https://www.cmar.csiro.au/caab/taxon_report.cfm?caab_code=37261006', 'CSIRO CAAB：接受名及命名作者')] }),
  species({ id: 'lunartail-bigeye', commonName: '月尾大眼鲷（描述性中文名）', scientificName: 'Priacanthus hamrur',
    scientificAuthor: '(Forsskal, 1775)', guild: 'reef-slope-small-animal-consumer', lengthM: .26, sizeRangeM: [.22, .30], depthSelectionM: [12, 35],
    referenceSizeM: { maximum: .40, measure: 'total-length' }, referenceDepthM: { reportedRange: [3, 250], completeNaturalRange: false },
    foodComponent: 'selected-unresolved-small-animal-nutrition', colors: ['#aa514b', '#d08d78', '#332b29'],
    form: 'compressed-red-bigeye-oblique-upturned-mouth-crescent-tail', description: '红色侧扁深体、显著大眼、斜向上口裂、后部较高背鳍及月形尾。',
    diet: '自然食小鱼、甲壳类和其他小动物；本版扣未解析动物营养。',
    behavior: '采用低光照活动、日间停留的示意规则；没有实际礁洞、天然群聚或昼夜摄食速率校准。', habitat: ['outer-reef-slope', 'lagoon-pinnacle'],
    sources: [link('https://fishesofaustralia.net.au/home/species/4462', 'Museums Victoria：身份、形态、外礁坡缘、日间遮蔽、食性与3–250m')] }),
  species({ id: 'banded-lizardfish', commonName: '环带狗母鱼（描述性中文名）', scientificName: 'Synodus dermatogenys',
    scientificAuthor: 'Fowler, 1912', guild: 'sand-margin-ambush-fish', bottom: true, lengthM: .20, sizeRangeM: [.17, .23], depthSelectionM: [12, 35],
    referenceSizeM: { maximum: .24, measure: 'total-length' }, referenceDepthM: { reportedRange: [1, 70], completeNaturalRange: false },
    foodComponent: 'selected-unresolved-fish-and-shrimp-nutrition', colors: ['#95836b', '#52483d', '#b4b6a3'],
    form: 'slender-bottom-body-broad-lizard-head-six-saddles-single-dorsal-adipose', description: '贴底细长体、宽扁头、背侧眼、六块鞍斑、单背鳍和小脂鳍。',
    diet: '自然食小鱼和虾；本版扣未解析动物营养，没有可见猎物捕杀。',
    behavior: '露在沙床上等待并短段转位；全身及六处腹鳍支撑点检查，未实现埋沙。', habitat: ['sand-rubble-reef-margin'],
    sources: [link('https://fishesofaustralia.net.au/home/species/4002', 'Museums Victoria：真实沙砾生境、形态、鱼虾食性与1–70m'),
      link('https://australian.museum/learn/animals/fishes/banded-lizardfish-synodus-dermatogenys/', 'Australian Museum：露出或部分埋沙的底栖行为')] }),
  species({ id: 'thousand-spot-sandperch', commonName: '千斑沙鲈（描述性中文名）', scientificName: 'Parapercis millepunctata',
    scientificAuthor: '(Günther, 1860)', guild: 'sand-rubble-bottom-fish', bottom: true, lengthM: .15, sizeRangeM: [.12, .18], depthSelectionM: [12, 30],
    referenceSizeM: { maximum: .18, measure: 'total-length' }, referenceDepthM: { reportedRange: [4, 30], completeNaturalRange: false },
    foodComponent: 'illustrative-unresolved-bottom-animal-nutrition-not-a-verified-species-diet', colors: ['#8f8871', '#494539', '#c9c8ad'],
    form: 'elongate-sandperch-two-rows-dark-blotches-long-dorsal-white-tail-patch', description: '细长贴底体、双排深色斑、长背鳍与尾中央白斑。',
    diet: '本版采用现有动物营养代理；所引来源未提供该种完整食谱，不宣称已验证。',
    behavior: '稳定沙床上停留与有限转位；没有繁殖、领地或完整自然行为。', habitat: ['seaward-reef-sand-rubble'],
    sources: [link('https://fishesofaustralia.net.au/home/species/749', 'Museums Victoria：身份、沙砾外礁、双排斑点、尾白斑、4–30m与18cm')] })
]);
export const OCEAN_REEF_SLOPE_IDS = freeze(OCEAN_REEF_SLOPE_SPECIES.map(s => s.id));
export const REEF_SLOPE_SAND_IDS = freeze(OCEAN_REEF_SLOPE_SPECIES.filter(s => s.bottom).map(s => s.id));
export const oceanReefSlopeSpeciesById = freeze(Object.fromEntries(OCEAN_REEF_SLOPE_SPECIES.map(s => [s.id, s])));
