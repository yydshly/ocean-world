const freeze = v => { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
const source = (url, label) => ({ url, label });
function descriptor(d) {
  return freeze({ regionalOnly: true, referenceRegion: '热带印度—西太平洋浅礁',
    coOccurrenceStatus: 'representatives-not-a-local-field-survey', foodPool: 'resources.algae', depthRangeM: d.depthSelectionM,
    displaySizeM: { range: d.sizeRangeM, measure: d.sizeMeasure, status: 'illustrative-selection' },
    admissionDepthM: { range: d.depthSelectionM, status: 'selected-whole-body-depth-not-complete-natural-range' },
    naturalPopulationDensity: null, calibratedMovementMPerS: null, calibratedEcologicalRates: null,
    calibratedTemperatureC: null, calibratedSalinityPSU: null, calibratedOxygenMgPerL: null,
    feedingProxy: { owner: 'resources', stock: 'algae', resourcePath: 'region.resources.algae',
      selectedFoodComponent: 'selected-algal-nutrition-component-of-mixed-natural-diet',
      status: 'existing-local-nutrition-proxy-not-complete-natural-diet', speciesResolvedFoodStock: false, visiblePreyKillImplemented: false },
    ecologicalRateStatus: 'uncalibrated-demonstration',
    activitySelection: 'illustrative-low-light-exposed-foraging-phase-not-real-crevice-hiding',
    limitations: ['数量、移动与摄食速率未野外校准。', '仅取混合食谱的藻类营养成分，未实现完整食谱、繁殖、真实藏缝或毒刺交互。'],
    ...d, sourceLinks: d.sources.map(s => ({ ...s })) });
}
const support = (contacts, kind) => ({ mode: 'whole-mobile-benthos-on-real-substrate', footContacts: contacts,
  contactKind: kind, rootReference: 'actual-parapodium-or-tube-foot-tip-plane', minimumNormalY: .92, pitchLimitRad: .04,
  wholeBodyDepthRequired: true, terrainClearanceRequired: true });
export const OCEAN_REEF_GRAZERS_SPECIES = freeze([
  descriptor({ id: 'reef-fireworm', commonName: '礁栖火焰虫类群（描述性中文名）', scientificName: 'Eurythoe spp.',
    identityLevel: 'genus-representative', taxonomicLevel: 'genus', kind: 'worm', guild: 'selected-algal-component-omnivore',
    sizeMeasure: 'body-length-excluding-chaetae', lengthM: .10, sizeRangeM: [.08, .12], depthSelectionM: [3, 18],
    habitat: ['bare-reef-margin-real-rock-or-sand'],
    support: support([-.32, 0, .32].flatMap(x => [-.06, .06].map(z => ({ x, y: 0, z }))), 'six-real-parapodial-ventral-contact-samples-not-tube-feet'),
    normalizedEnvelope: { x: [-.60, .60], y: [0, .20], z: [-.15, .15], horizontalRadiusUnits: .619,
      axes: 'body-head-positive-x; up-positive-y; paired-parapodia-in-z', status: 'complete-selected-segmented-body-chaetae-gills-and-bounded-gait' },
    morphology: { form: 'flattened-segmented-polychaete-paired-parapodia-white-chaetae-and-small-dorsal-gills',
      normalizedMeasuredSize: 1, bodyMeasuredX: [-.5, .5], sizeAxis: 'body-length-excluding-chaetae-x',
      anatomicalTubeFootWalking: false, clearanceIncludes: ['whole-body', 'parapodia', 'chaetae', 'gills', 'sensory-appendages', 'bounded-gait'] },
    animationBounds: { bodySectionYawRad: .024, contactSamplesStationary: true }, colors: ['#a76559', '#d9d1b4'],
    description: '扁平分节体、成对疣足、浅色刚毛束和小鳃丛；与固着螺旋管虫区别明显。',
    behavior: '低照度时在裸露礁缘贴底慢爬，取当地已有藻类营养；白天休息不等于已经藏入石缝。',
    sources: [source('https://link.springer.com/article/10.1007/s10499-025-02407-9', '原始Eurythoe spp.培养/摄食研究：属级与复合种身份、分节刚毛、低照度活动及混合食谱'),
      source('https://www.sciencedirect.com/science/article/pii/S0141113623000065', 'Engel等2023原始同位素/脂肪酸实验：印尼来源E.complanata样本的藻类营养；不可推广为属级完整食谱')] }),
  descriptor({ id: 'long-spined-diadem-urchin', commonName: '长棘冠海胆（描述性中文名）', scientificName: 'Diadema setosum', scientificAuthor: '(Leske, 1778)',
    identityLevel: 'species-representative', taxonomicLevel: 'species', kind: 'echinoderm', guild: 'hard-surface-algal-grazer',
    sizeMeasure: 'test-diameter-excluding-spines', lengthM: .07, sizeRangeM: [.06, .08], depthSelectionM: [3, 18],
    habitat: ['actual-stable-bare-hard-reef-surface'],
    support: support(Array.from({ length: 6 }, (_, i) => ({ x: .24 * Math.cos(i * Math.PI / 3), y: 0, z: .24 * Math.sin(i * Math.PI / 3) })), 'six-real-oral-tube-foot-tip-samples-not-spine-support'),
    normalizedEnvelope: { x: [-3.3, 3.3], y: [0, 3.8], z: [-3.3, 3.3], horizontalRadiusUnits: 4.668,
      axes: 'test-diameter-in-xz; up-positive-y', status: 'complete-test-long-and-short-spines-anal-cone-tube-feet-and-bounded-gait' },
    morphology: { form: 'black-long-needle-spines-five-pale-interambulacral-spots-orange-anal-ring-and-blue-spots',
      normalizedMeasuredSize: 1, testMeasuredX: [-.5, .5], sizeAxis: 'test-diameter-excluding-spines',
      clearanceIncludes: ['test', 'all-long-spines', 'short-spines', 'anal-cone', 'tube-feet', 'bounded-motion'] },
    animationBounds: { spineFieldYawRad: .006, contactSamplesStationary: true }, colors: ['#181d22', '#c67836'],
    description: '细长深色针棘、五个浅色斑、橙色肛锥环及蓝色小点，区别于短棘集物海胆。',
    behavior: '低照度时在实际礁面慢移、刮食藻类营养；完整针棘包络也必须通过地形、植物和动物净空。',
    sources: [source('https://www.nmns.edu.tw/en/our-research/featured/Collection-E00423/', '国立自然科学博物馆标本：长棘、五浅色斑、肛锥环与点状蓝纹的物种辨识'),
      source('https://www.enature.qa/specie/diadema-setosum/', 'Qatar e-Nature国家图鉴：7厘米体壳参考、真实管足、礁面藻食与低照度活动')] })
]);
export const OCEAN_REEF_GRAZERS_IDS = freeze(OCEAN_REEF_GRAZERS_SPECIES.map(s => s.id));
export const oceanReefGrazersSpeciesById = freeze(Object.fromEntries(OCEAN_REEF_GRAZERS_SPECIES.map(s => [s.id, s])));
