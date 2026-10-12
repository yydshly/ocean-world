// New v3 candidates; old public school lists and saved v1/v2 owners stay fixed.
const freeze = v => { if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
const source = (url, label) => ({ url, label });
const descriptor = data => freeze({
  kind: 'fish', regionalOnly: true, identityLevel: 'species', taxonomicLevel: 'species',
  referenceRegion: '热带印度—西太平洋近岸水层与软底上方的代表组合',
  coOccurrenceStatus: 'representative-community-not-local-survey',
  ecologicalRateStatus: 'uncalibrated-demonstration', calibratedMovementMPerS: null, calibratedEcologicalRates: null, populationDensityPerM2: null,
  displaySizeM: { range: data.sizeRangeM, measure: 'total-length', status: 'illustrative-selection' },
  admissionDepthM: { range: data.depthSelectionM, status: 'whole-body-display-selection-not-full-natural-range' },
  schooling: { enabled: true, naturalCount: null, status: 'five-to-seven-real-individuals-not-measured-natural-school' },
  normalizedEnvelope: { x: [-.55,.55], y: [-.21,.23], z: [-.18,.18], horizontalRadiusUnits: .60,
    axes: 'forward-positive-x; up-positive-y; transverse-z', status: 'conservative-whole-body-and-fin-motion' },
  sizeMeasure: 'total-length', foodProxyStatus: 'selected-existing-owner-nutrition-not-full-natural-diet',
  limitations: ['同owner小群由独立保存的个体组成；没有自然大群、跨区迁移、繁殖或离线演化。',
    '数量、速度、身体比例、深度、夜间阈值和摄食率是显示选择，未野外校准。',
    '食物为已有相对营养库存，未解析真实鳃耙过滤、沙内猎物或可见捕杀。'],
  ...data,
});
export const OCEAN_COASTAL_SCHOOL_SPECIES = freeze([
  descriptor({ id: 'indian-mackerel', commonName: '印度鲭（描述性中文名）',
    scientificName: 'Rastrelliger kanagurta', scientificAuthor: '(Cuvier, 1816)', family: 'Scombridae', guild: 'water-column-planktivore', lengthM: .22,
    sizeRangeM: [.18,.26], depthSelectionM: [1,15], colors: ['#577e79','#bcc9c3','#888866'],
    description: '梭形银色鱼体、蓝绿色背部、横向金暗细带和背侧斑点；两枚分开的背鳍，第二背鳍与臀鳍后各有五枚小离鳍，短胸鳍及深叉尾。',
    diet: '取浮游生物营养；本版扣当地plankton库存，不声称已解析真实过滤或完整天然食谱。',
    behavior: '在实际净空水层协调转向与巡游；尚未复原自然大规模表层鱼群或完整昼夜日程。',
    habitat: ['coastal-pelagic-water'], activity: { selectedFeedingPhase: 'available-stock', status: 'no-strict-natural-diel-schedule-modelled' },
    feedingProxy: { owner: 'livingNetwork', stock: 'plankton', resourcePath: 'region.resources.plankton', selectedDietComponent: 'unresolved-plankton-organics' },
    referenceSizeM: { maximum: .35, commonRange: [.20,.25], measure: 'unspecified-length', note: '旧FAO尺寸段未明确TL/SL，不直接换算；本版18–26cm为显示全长选择。' },
    morphology: { form: 'fusiform-short-pectoral-forked-tail', eyes: 2, dorsalFins: 2, dorsalFinlets: 5, analFinlets: 5 },
    sources: [source('https://australian.museum/learn/animals/fishes/mouth-mackerel-rastrelliger-kanagurta/', 'Australian Museum：接受名、梭形、短胸鳍、离鳍、群游及浮游摄食'),
      source('https://www.fao.org/4/e9163e/e9163e4c.pdf', 'FAO SCOMBR Rast3：两侧离鳍、斑带、近岸大群与浮游食性；旧长度口径单列')],
  }),
  descriptor({ id: 'yellowstripe-scad', commonName: '黄带鲹（描述性中文名）',
    scientificName: 'Selaroides leptolepis', scientificAuthor: '(Cuvier, 1833)', family: 'Carangidae', guild: 'near-bottom-animal-consumer', lengthM: .14,
    sizeRangeM: [.11,.17], depthSelectionM: [1,15], colors: ['#7a9a94','#e2c467','#d0d8ce'],
    description: '侧扁银色鱼体，眼后通向尾柄的黄色纵带和上鳃盖黑斑；眼后部脂性眼睑、两枚分开的背鳍、细尾柄与叉尾。',
    diet: '小型无脊椎动物和小鱼；本版夜间扣当地openWaterLife动物性营养，未模拟实际捕杀或完整食谱。',
    behavior: '小群在软底上方的实际水层活动；整身下方须为软底，选取约2.2m离底出生与不超过3m的有限近底活动范围。夜间门槛是示范选择。',
    habitat: ['soft-bottom-coastal-water'], activity: { selectedFeedingPhase: 'night', status: 'illustrative-hour-or-light-threshold' },
    feedingProxy: { owner: 'openWaterLife', stock: 'preyOrganicUnits', resourcePath: 'region.openWaterLife.preyOrganicUnits', selectedDietComponent: 'unresolved-swimming-animal-organics' },
    referenceSizeM: { maximum: .22, common: .15, measure: 'total-length', separateFaoExaminedMaximum: .185, separateFaoMeasure: 'fork-length' },
    morphology: { form: 'compressed-yellow-band-black-opercular-spot', eyes: 2, dorsalFins: 2, adiposeEyelid: 'posterior-half-only', detachedFinlets: 0 },
    sources: [source('https://fishesofaustralia.net.au/home/species/2989', 'Museums Victoria：接受名、黄带与鳃盖黑斑、近岸沙泥底、群游及22cm TL'),
      source('https://www.fao.org/4/x2400e/x2400e55.pdf', 'FAO p2737：形态、软底大群、无脊椎和小鱼食性及夜间摄食；18.5cm为检视标本叉长')],
  }),
]);
export const OCEAN_COASTAL_SCHOOL_IDS = freeze(OCEAN_COASTAL_SCHOOL_SPECIES.map(s => s.id));
export const oceanCoastalSchoolSpeciesById = freeze(Object.fromEntries(OCEAN_COASTAL_SCHOOL_SPECIES.map(s => [s.id,s])));
