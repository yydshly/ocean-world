// Two identifiable, finite v8 reef residents. Display sizes, clearances and
// rates are implementation choices, not measured field density or physiology.
const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) {
  Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const source = (url, label) => ({ url, label });
const food = component => ({ owner: 'reefGuild', stock: 'preyOrganicUnits', resourcePath: 'region.reefGuild.preyOrganicUnits',
  selectedFoodComponent: component, status: 'existing-unresolved-animal-nutrition-proxy-not-complete-natural-diet',
  visiblePreyKillImplemented: false, speciesResolvedFoodStock: false });
const envelope = (x, y, z, horizontalRadiusUnits) => ({ x, y, z, horizontalRadiusUnits,
  axes: 'forward-positive-x; up-positive-y; transverse-z',
  status: 'conservative-display-whole-form-and-bounded-animation-not-measured-anatomy' });
const footContacts = [.24, .12, 0, -.12, -.24].flatMap(x => [-1, 1].map(side => ({ x, y: 0, z: side * .48 })));
const descriptor = data => freeze({ regionalOnly: true, identityLevel: 'species-representative', taxonomicLevel: 'species',
  referenceRegion: '热带西太平洋浅珊瑚礁的有限代表组合', coOccurrenceStatus: 'representatives-not-a-local-field-survey',
  ecologicalRateStatus: 'uncalibrated-demonstration', calibratedMovementMPerS: null, calibratedEcologicalRates: null,
  naturalPopulationDensity: null, calibratedTemperatureC: null, calibratedSalinityPSU: null, calibratedOxygenMgPerL: null,
  displaySizeM: { range: data.sizeRangeM, measure: data.sizeMeasure, status: 'illustrative-selection' },
  admissionDepthM: { range: data.depthSelectionM, status: 'chosen-whole-model-depth-not-complete-natural-range' },
  limitations: ['程序造型、出生密度、运动及摄食速率未作野外校准；不是完整自然食物网或种群预测。',
    '使用已有未解析动物营养代理的选定分量；没有捕杀具体可见猎物，也不表示完整食谱。'],
  ...data, sourceLinks: data.sources.map(item => ({ ...item })) });

export const OCEAN_REEF_RESIDENT_SPECIES = freeze([
  descriptor({ id: 'coral-trout', commonName: '豹纹鳃棘鲈（珊瑚鳟）', scientificName: 'Plectropomus leopardus',
    scientificAuthor: '(Lacépède, 1802)', kind: 'fish', guild: 'reef-animal-predator', lengthM: .55,
    sizeRangeM: [.45, .65], sizeMeasure: 'total-length', depthSelectionM: [3, 18],
    sizeMeasureDefinition: '吻端至尾鳍最远端的全长；45–65厘米是展示选择，不将参考标准体长SL换算为TL。',
    referenceSizeM: { maximum: 1.20, measure: 'standard-length', convertedToDisplayTotalLength: false },
    referenceDepthM: { reportedRange: [3, 100], completeNaturalRange: false },
    colors: ['#a8664b', '#395e70', '#ccb28b'],
    normalizedEnvelope: envelope([-.54, .54], [-.25, .30], [-.24, .24], .60),
    support: { mode: 'whole-freewater-body-near-real-reef', rootReference: 'total-length-midpoint',
      pitchLimitRad: .10, minimumNormalY: .92, footContacts: [], wholeBodyDepthRequired: true, terrainClearanceRequired: true },
    animationBounds: { tailYawRad: .14, pectoralRollRad: .08, mouthGapUnits: .012 },
    description: '较厚的长形鱼体、宽嘴、完整背鳍和胸鳍，橙褐色鱼体带规律蓝斑，尾鳍近截形而非深叉鱼群尾。',
    diet: '自然主要摄食鱼类；本版只消费既有reefGuild.preyOrganicUnits中未解析动物性营养代理的选定分量，不把它称作实测鱼库存或完整鱼类捕食。',
    behavior: '在真实礁缘净空内短程缓游、停留和探食；不模拟产卵聚集、性转换或完整猎杀过程。',
    habitat: ['coral-reef-edge', 'near-reef-freewater'], feedingProxy: food('unresolved-animal-nutrition-component-for-a-natural-piscivore'),
    morphology: { form: 'thick-elongate-coral-trout-with-wide-mouth-and-round-blue-spots',
      normalizedMeasuredSize: 1, bodyMeasuredX: [-.5, .5], sizeAxis: 'snout-to-farthest-caudal-tip-x',
      clearanceIncludes: ['head', 'mouth', 'body', 'dorsal-fin', 'anal-fin', 'paired-fins', 'tail', 'bounded-fin-motion'] },
    sources: [source('https://fishesofaustralia.net.au/home/species/4518', 'Museums Victoria：P.leopardus完整形态、浅礁缓游、3–100米资料与单独标注的120cm SL参考'),
      source('https://eprints.jcu.edu.au/24127/', 'James Cook University原始食性研究：成年珊瑚鳟主要食鱼；未解析代理不等同完整鱼类食物网')] }),
  descriptor({ id: 'painted-spiny-lobster', commonName: '彩绘龙虾（描述性中文名）', scientificName: 'Panulirus versicolor',
    scientificAuthor: '(Latreille, 1804)', nameNote: '中文为描述性名称；物种以学名区分，不与锦绣龙虾P.ornatus混用。',
    kind: 'crustacean', guild: 'benthic-animal-consumer', lengthM: .26, sizeRangeM: [.22, .30],
    sizeMeasure: 'body-total-length-excluding-antennae', depthSelectionM: [3, 15],
    sizeMeasureDefinition: '前部躯体至尾扇末端的身体全长，不计长触角；触角另列入完整空间包络，不混用头胸甲长。',
    referenceSizeM: { maximumApproximate: .40, averageBelow: .30, measure: 'total-body-length', includesAntennae: false },
    referenceDepthM: { reportedRange: [0, 15], completeNaturalRange: false },
    colors: ['#567a64', '#ece7d8', '#292f30'],
    normalizedEnvelope: envelope([-.56, 2.25], [0, .55], [-.90, .90], 2.43),
    support: { mode: 'whole-foot-supported-reef-margin', rootReference: 'neutral-foot-plane', pitchLimitRad: 0,
      minimumNormalY: .92, footContacts, wholeBodyDepthRequired: true, terrainClearanceRequired: true },
    animationBounds: { antennaYawRad: .025, upperLegBendRad: .035, antennaMinimumYUnits: .12,
      footContactsStationary: true, antennaeIncludedInSizeMeasure: false },
    description: '绿蓝头胸甲、白色条带腹节与条纹步足，五对步足、尾扇和两根长浅色触角；没有螯龙虾那样的一对巨大螯。',
    diet: '本版选定底栖动物性营养分量，只消费当地已有未解析动物营养代理；未校准野外成年食谱，不宣称具体贝类或可见猎物捕杀。',
    behavior: '浅珊瑚礁的夜行代表，本版在真实礁脚底面有限爬行，日间停留；岩隙庇护只作近似，不宣称已有真实洞穴占据、蜕壳或繁殖。',
    substrate: ['stable-hard-reef-margin', 'stable-reef-foot-sediment'], habitat: ['shallow-coral-reef', 'reef-foot'],
    feedingProxy: food('unresolved-benthic-animal-nutrition-component'),
    morphology: { form: 'long-white-antennate-spiny-lobster-with-five-pairs-of-legs-segmented-abdomen-and-tail-fan',
      normalizedMeasuredSize: 1, bodyMeasuredX: [-.5, .5], sizeAxis: 'body-front-to-tail-fan-x', legPairCount: 5,
      longAntennaCount: 2, largeChelae: false, clearanceIncludes: ['carapace', 'abdomen', 'tail-fan', 'ten-walking-legs', 'two-long-antennae', 'bounded-animation'] },
    sources: [source('https://marine-lobsters.linnaeus.naturalis.nl/linnaeus_ng/app/views/species/taxon.php?epi=25&id=27999',
      'Naturalis所载原作者龙虾种目录：P.versicolor浅珊瑚礁、15米、夜行岩隙庇护与独立身体长度资料')] }),
]);

export const OCEAN_REEF_RESIDENT_IDS = freeze(OCEAN_REEF_RESIDENT_SPECIES.map(species => species.id));
export const oceanReefResidentsSpeciesById = freeze(Object.fromEntries(OCEAN_REEF_RESIDENT_SPECIES.map(species => [species.id, species])));
