// Two shallow Indo-Pacific representatives, not a surveyed natural assemblage.
const freeze = v => { if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
const faoRabbit = 'https://www.fao.org/4/y0870e/y0870e27.pdf';
const faoHardyhead = 'https://www.fao.org/4/x2400e/x2400e06.pdf';
const museumHardyhead = 'https://fishesofaustralia.net.au/home/species/4630';
const descriptor = data => freeze({
  regionalOnly: true, identityLevel: 'species-representative', taxonomicLevel: 'species', kind: 'fish',
  referenceRegion: '热带印度—西太平洋浅岸草床、沙岸及礁缘水层',
  coOccurrenceStatus: 'regional-representatives-not-a-local-field-survey',
  individualStatus: 'independent-simulated-individual-with-own-clock-and-organic-stock',
  sizeMeasure: 'total-length', sizeMeasureDefinition: '吻端至尾鳍最远端全长TL，未从标准体长SL或尾叉长FL换算。',
  ecologicalRateStatus: 'uncalibrated-demonstration', calibratedMovementMPerS: null,
  calibratedEcologicalRates: null, calibratedPopulationRates: null, populationDensityPerM2: null, naturalSchoolSize: null,
  temperatureRangeC: null, salinityRangePSU: null, oxygenRangeMgPerL: null,
  environmentToleranceStatus: 'unknown-not-species-tolerance-calibration', renderEmissionEnabled: false,
  displaySizeM: { range: data.sizeRangeM, measure: 'total-length', status: 'illustrative-selection' },
  admissionDepthM: { range: data.depthSelectionM, status: 'chosen-whole-body-water-depth-not-complete-natural-range' },
  support: { mode: 'whole-freewater-body-above-native-meadow-or-reef', rootReference: 'total-length-midpoint', wholeBodyDepthRequired: true, terrainClearanceRequired: true, pitchClearanceRequired: true },
  schooling: { enabled: true, naturalCount: null, displayGroupSizeStatus: 'five-to-seven-real-individual-demonstration-not-natural-school-density' },
  foodProxyStatus: 'selected-diet-component-in-existing-owner-stock-not-full-natural-diet',
  limitations: ['同owner有限群游，不复原自然大群、夜间分散、迁移或繁殖。', '模型比例、运动、昼夜阈值和摄食速率未野外校准。', '食物仍是已有owner相对营养库存，未解析叶面藻量、完整天然食谱或可见猎杀。'],
  ...data, sourceLinks: data.sources.map(s => s.url),
});
export const OCEAN_MEADOW_WATER_SPECIES = freeze([
  descriptor({
    id: 'white-spotted-rabbitfish', commonName: '白点兔鱼（描述性中文名）', scientificName: 'Siganus canaliculatus', scientificAuthor: '(Park, 1797)', family: 'Siganidae',
    guild: 'water-column-herbivore', modelRole: 'rabbitfish', lengthM: .19, sizeRangeM: [.16, .22], depthSelectionM: [1, 15],
    referenceSizeM: { maximum: .25, measure: 'total-length', note: 'FAO账户约25cm TL，通常至20cm；展示全长16–22cm。' },
    referenceDepthM: { reportedMaximum: 50, note: 'FAO浅岸至50m，草床周围常见；本模型选择1–15m完整身体水深。' },
    normalizedEnvelope: { x: [-.55, .55], y: [-.24, .26], z: [-.21, .21], horizontalRadiusUnits: .60, axes: 'forward-positive-x; up-positive-y; transverse-z', status: 'conservative-authored-whole-form-and-bounded-fin-motion' },
    colors: ['#798d7b', '#c3cdc4', '#d8e7e1'],
    description: '压扁的长椭圆鱼体、尖吻小口、银灰带绿背部与浅色圆斑；背臀鳍有棘，尾鳍有较浅的叉。',
    diet: '自然主要食底栖海藻，海草占较小分量；本版只消费已有algae库存，不把草叶装饰当食物。',
    feedingProxy: { owner: 'livingNetwork', stock: 'algae', resourcePath: 'region.resources.algae', selectedDietComponent: 'unresolved-algal-organic-nutrition', speciesResolvedFoodStock: false, visiblePreyKillImplemented: false },
    activity: { selectedFeedingPhase: 'day', thresholdStatus: 'illustrative-environment-hour-gate' },
    behavior: '草床附近独立个体协调转向、保持间距，白天消费藻类营养代理。',
    habitat: ['seagrass-associated-water-column', 'shallow-coastal-water', 'reef-flat-water'],
    morphology: { form: 'compressed-oval-pointed-snout-white-spotted-spinefoot', sizeAxis: 'snout-to-farthest-caudal-tip-x', normalizedMeasuredSize: 1, neutralMeasuredX: [-.5, .5], dorsalSpines: 13, analSpines: 7, wholeFormReference: { url: faoRabbit, location: 'S. canaliculatus account, p3633; Siganidae family p3627' } },
    sources: [{ url: faoRabbit, label: 'FAO / D. J. Woodland：具名物种形态、全长、生境、群游与藻食；科级背臀鳍棘计数' }],
  }),
  descriptor({
    id: 'hardyhead-silverside', commonName: '银带银汉鱼（描述性中文名）', scientificName: 'Atherinomorus lacunosus', scientificAuthor: '(Forster, 1801)', family: 'Atherinidae',
    guild: 'water-column-planktivore', modelRole: 'silverside', lengthM: .095, sizeRangeM: [.08, .11], depthSelectionM: [1, 15],
    referenceSizeM: { maximum: .25, measure: 'total-length', note: '当前Museums Victoria账户25cm TL；旧FAO约11cm length未注明TL/SL，单列不换算。展示8–11cm TL。', separateOldFaoLengthM: .11, separateOldFaoLengthMeasure: 'unspecified-length' },
    referenceDepthM: { reportedRange: [1, 39], note: '当前Museums Victoria账户；模型仅选择1–15m完整身体水深。' },
    taxonomicNote: '当前具名身份以Museums Victoria为准；1999 FAO涉及后续重描述的近似种复合群，不能把旧全部异名及分布当当前全部成员。',
    normalizedEnvelope: { x: [-.55, .55], y: [-.16, .16], z: [-.16, .16], horizontalRadiusUnits: .58, axes: 'forward-positive-x; up-positive-y; transverse-z', status: 'conservative-authored-whole-form-and-bounded-fin-motion' },
    colors: ['#779894', '#d2dfdc', '#5592a4'],
    description: '细长鱼体、大眼、宽银色侧带及蓝色上缘，两段分离背鳍和透明感叉尾。',
    diet: '旧FAO账户描述较大个体夜间食浮游卵、甲壳幼体等；本版夜间只消费已有plankton库存，不捕杀屏幕中的动物。',
    feedingProxy: { owner: 'livingNetwork', stock: 'plankton', resourcePath: 'region.resources.plankton', selectedDietComponent: 'unresolved-plankton-organic-nutrition', speciesResolvedFoodStock: false, visiblePreyKillImplemented: false },
    activity: { selectedFeedingPhase: 'night', thresholdStatus: 'illustrative-environment-hour-gate-from-older-account-not-current-field-calibration', naturalNightDispersionImplemented: false },
    behavior: '沙岸及草床礁缘上方有限群游；夜间消费浮游营养代理，未实现自然黄昏散群。',
    habitat: ['sandy-shore-water-column', 'inshore-pelagic', 'reef-margin-water-column'],
    morphology: { form: 'slender-large-eye-silver-band-two-separated-dorsals', sizeAxis: 'snout-to-farthest-caudal-tip-x', normalizedMeasuredSize: 1, neutralMeasuredX: [-.5, .5], dorsalFins: 2, wholeFormReference: { url: museumHardyhead, location: 'current named photo and diagnostic account' } },
    sources: [{ url: museumHardyhead, label: 'Museums Victoria / Fishes of Australia：当前身份、活体形态、沙岸礁缘群游与深度TL' }, { url: faoHardyhead, label: 'FAO旧账户p2125：相似形态与夜间食浮游生物，保留分类年代限制' }],
  }),
]);
export const OCEAN_MEADOW_WATER_IDS = freeze(OCEAN_MEADOW_WATER_SPECIES.map(s => s.id));
export const oceanMeadowWaterSpeciesById = freeze(Object.fromEntries(OCEAN_MEADOW_WATER_SPECIES.map(s => [s.id, s])));
