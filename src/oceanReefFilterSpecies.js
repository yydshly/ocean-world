const freeze = v => { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
const source = (url, label) => ({ url, label });
const contacts = [-.22, 0, .22].flatMap(x => [-.025, .025].map(z => ({ x, y: 0, z })));
function species(d) {
  return freeze({ regionalOnly: true, identityLevel: 'species-representative', taxonomicLevel: 'species',
    referenceRegion: '热带印度—西太平洋浅礁及礁湖', coOccurrenceStatus: 'representatives-not-a-local-field-survey',
    kind: 'bivalve', guild: 'attached-benthic-suspension-feeder', sizeMeasure: 'shell-length',
    foodPool: 'resources.plankton', depthRangeM: d.depthSelectionM,
    displaySizeM: { range: d.sizeRangeM, measure: 'shell-length', status: 'illustrative-selection' },
    admissionDepthM: { range: d.depthSelectionM, status: 'chosen-whole-model-depth-not-complete-natural-range' },
    ecologicalRateStatus: 'uncalibrated-demonstration', naturalPopulationDensity: null,
    calibratedMovementMPerS: null, calibratedEcologicalRates: null, calibratedTemperatureC: null, calibratedSalinityPSU: null, calibratedOxygenMgPerL: null,
    support: { mode: 'whole-attached-bivalve-on-real-hard-surface', contactKind: 'six-shell-support-samples-not-anatomical-feet',
      footContacts: contacts, rootReference: 'shell-support-plane', pitchLimitRad: .04, minimumNormalY: .92,
      wholeBodyDepthRequired: true, terrainClearanceRequired: true },
    normalizedEnvelope: { x: [-.54, .54], y: [0, .62], z: [-.39, .39], horizontalRadiusUnits: .68,
      axes: 'shell-length-positive-x; up-positive-y; transverse-z', status: 'conservative-complete-shell-mantle-and-bounded-opening-not-measured-anatomy' },
    morphology: { form: d.form, normalizedMeasuredSize: 1, bodyMeasuredX: [-.5, .5], sizeAxis: 'shell-length-x',
      clearanceIncludes: ['both-shell-valves', 'ribs-or-growth-scales', 'mantle', 'bounded-valve-opening'] },
    animationBounds: { valveOpeningRad: .06, mantleScaleFraction: .012 },
    feedingProxy: { owner: 'resources', stock: 'plankton', resourcePath: 'region.resources.plankton',
      selectedFoodComponent: 'unresolved-suspended-plankton-nutrition', status: 'existing-local-nutrition-proxy-not-calibrated-filtration',
      visiblePreyKillImplemented: false, speciesResolvedFoodStock: false, photosymbioticEnergyImplemented: false },
    diet: '本版从当地浮游营养代理扣款，不模拟粒径选择、真实滤水量或完整能量来源。',
    behavior: '固定在真实稳定礁面，随生态时钟有界开合与外套膜变化；不游动、不生成珍珠、不补死亡个体。',
    limitations: ['野外密度、摄食和呼吸速率未标定。', '未模拟足丝力学、繁殖、粒径选择或共生藻供能。'],
    ...d, sourceLinks: d.sources.map(s => ({ ...s })) });
}
export const OCEAN_REEF_FILTER_SPECIES = freeze([
  species({ id: 'fluted-giant-clam', commonName: '鳞砗磲', scientificName: 'Tridacna squamosa', scientificAuthor: 'Lamarck, 1819',
    lengthM: .30, sizeRangeM: [.24, .36], depthSelectionM: [3, 15], habitat: ['sheltered-shallow-reef-hard-surface'],
    referenceSizeM: { maximum: .54, measure: 'shell-length', scope: 'Maldives survey; not global maximum' },
    referenceDepthM: { reportedRange: [0, 15], completeNaturalRange: false, scope: 'Maldives sheltered reefs' },
    form: 'paired-thick-fluted-shells-six-broad-ribs-and-mottled-exposed-mantle', colors: ['#b5aa8d', '#44746b', '#877e67'],
    description: '成对厚壳、宽放射肋与鳞片，中央露出斑驳外套膜；天然共生藻供能尚未接入。',
    sources: [source('https://www.fao.org/4/ae451e/ae451e00.pdf', 'FAO BOBP/WP/72：马尔代夫礁面、约15米、壳长54厘米与砗磲生物学'),
      source('https://openknowledge.fao.org/server/api/core/bitstreams/f32d004b-6358-44f3-8242-b9d23e5346d0/content', 'FAO物种图鉴：两瓣壳、5–6宽肋、鳞片与斑驳外套膜'),
      source('https://researchonline.jcu.edu.au/76364/1/76364.pdf', 'James Cook University研究：鳞砗磲共生藻光合作用与生长')] }),
  species({ id: 'black-lip-pearl-oyster', commonName: '黑蝶贝', scientificName: 'Pinctada margaritifera', scientificAuthor: '(Linnaeus, 1758)',
    lengthM: .085, sizeRangeM: [.075, .095], depthSelectionM: [3, 18], habitat: ['shallow-reef-hard-attachment'],
    referenceSizeM: { maximum: .098, measure: 'shell-length', scope: 'FAO Kenya guide selection; not global maximum' },
    referenceDepthM: { reportedRange: null, completeNaturalRange: false, scope: 'source describes littoral/sub-littoral; model depth chosen, not a measured species range' },
    form: 'subcircular-paired-scaly-grey-brown-valves-dark-inner-margin-and-short-hinge', colors: ['#4d5047', '#b4b39e', '#303d36'],
    description: '近圆扁壳、同心生长鳞片、暗色内缘和短铰合部；显示固定浅礁代表。',
    sources: [source('https://www.fao.org/4/i2741e/i2741e.pdf', 'FAO肯尼亚海洋生物图鉴：近圆鳞壳、暗缘、浅水底栖与足丝附着'),
      source('https://agris.fao.org/search/en/providers/122535/records/65df4a077c7033e84bed4cf3', 'Pouvreau等1999原始研究：热带礁湖黑蝶贝滤食与粒径选择')] })
]);
export const OCEAN_REEF_FILTER_IDS = freeze(OCEAN_REEF_FILTER_SPECIES.map(s => s.id));
export const oceanReefFilterSpeciesById = freeze(Object.fromEntries(OCEAN_REEF_FILTER_SPECIES.map(s => [s.id, s])));
