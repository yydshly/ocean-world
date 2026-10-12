const freeze = v => { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
const source = (url, label) => ({ url, label });
const support = (contacts, kind) => ({ mode: 'whole-mobile-benthos-on-real-substrate', footContacts: contacts,
  contactKind: kind, rootReference: 'actual-ventral-arm-or-tube-foot-contact-plane', minimumNormalY: .92, pitchLimitRad: .04,
  wholeBodyDepthRequired: true, terrainClearanceRequired: true });
function species(d) {
  return freeze({ regionalOnly: true, identityLevel: 'species-representative', taxonomicLevel: 'species',
    referenceRegion: '热带印度—西太平洋浅礁与沙地', coOccurrenceStatus: 'representatives-not-a-local-field-survey',
    kind: 'echinoderm', foodPool: 'resources.detritus', depthRangeM: d.depthSelectionM,
    displaySizeM: { range: d.sizeRangeM, measure: d.sizeMeasure, status: 'illustrative-selection' },
    admissionDepthM: { range: d.depthSelectionM, status: 'selected-whole-body-depth-not-complete-natural-range' },
    naturalPopulationDensity: null, calibratedMovementMPerS: null, calibratedEcologicalRates: null,
    calibratedTemperatureC: null, calibratedSalinityPSU: null, calibratedOxygenMgPerL: null,
    feedingProxy: { owner: 'resources', stock: 'detritus', resourcePath: 'region.resources.detritus',
      selectedFoodComponent: 'selected-unresolved-detrital-nutrition', status: 'existing-local-nutrition-proxy-not-complete-natural-diet',
      speciesResolvedFoodStock: false, visiblePreyKillImplemented: false },
    ecologicalRateStatus: 'uncalibrated-demonstration',
    limitations: ['数量、移动和摄食速率未野外校准。', '未模拟埋沙、真实礁缝藏身、繁殖、沉积物粒径或完整食谱。'],
    ...d, sourceLinks: d.sources.map(s => ({ ...s })) });
}
export const OCEAN_REEF_MOBILE_BENTHOS_SPECIES = freeze([
  species({ id: 'banded-brittle-star', commonName: '环纹蛇尾（描述性中文名）', scientificName: 'Ophiolepis superba', scientificAuthor: 'H.L. Clark, 1915',
    guild: 'reef-margin-detrital-forager', sizeMeasure: 'central-disc-diameter', lengthM: .024, sizeRangeM: [.020, .028],
    depthSelectionM: [3, 25], referenceSizeM: { maximumDiscDiameter: .03, maximumArmLength: .09, scope: 'WoRMS descriptive note, not a population distribution' },
    referenceDepthM: { reportedRange: null, completeNaturalRange: false, scope: 'lower littoral and deeper among boulders and coral; selected model depth' },
    habitat: ['real-bare-reef-margin-rock-or-sand-near-reef'],
    support: support(Array.from({ length: 5 }, (_, i) => [.66, .86].map(r => ({ x: r * Math.cos(i * Math.PI * 2 / 5), y: 0, z: r * Math.sin(i * Math.PI * 2 / 5) }))).flat(), 'ten-real-proximal-arm-ventral-samples-not-tube-feet'),
    normalizedEnvelope: { x: [-3.6, 3.6], y: [0, .26], z: [-3.6, 3.6], horizontalRadiusUnits: 5.10,
      axes: 'disc-diameter-in-xz; arms-radiate-in-xz; up-positive-y', status: 'conservative-complete-five-arms-spines-disc-and-bounded-gait' },
    morphology: { form: 'distinct-central-disc-five-long-jointed-banded-arms-and-small-lateral-spines', normalizedMeasuredSize: 1,
      discMeasuredX: [-.5, .5], sizeAxis: 'disc-diameter-excluding-arms', armCount: 5, anatomicalTubeFootWalking: false,
      clearanceIncludes: ['disc', 'all-five-arms', 'small-arm-spines', 'bounded-arm-motion'] },
    animationBounds: { distalArmYawRad: .035, proximalContactSamplesStationary: true }, colors: ['#b9a985', '#4d4135'],
    description: '中央体盘有深色放射纹，五条细长分节腕带环纹与小侧棘，区别于粗腕海星和羽星。',
    behavior: '选取低照度的礁缘外露觅食阶段，整身贴底有限移动，腕动画由真实移动/摄食驱动；白天休息并不等于已实现藏入石缝。',
    activitySelection: 'illustrative-low-light-foraging-window-not-calibrated-species-activity-curve',
    sources: [source('https://www.marinespecies.org/aphia.php?id=213464&p=taxdetails', 'WoRMS接受身份与描述：3厘米体盘、9厘米腕、环纹/体盘纹、石块与珊瑚生境'),
      source('https://faunaofindia.nic.in/PDFVolumes/records/100/03-04/0021-0060.pdf', '印度动物调查局原始珊瑚群落研究：O.superba体盘纹与礁栖，蛇尾底质/颗粒摄食'),
      source('https://pdfs.semanticscholar.org/4e23/7f17423989dc83eda99b355f40437ae9d1e1.pdf', 'Baluran 2019原始调查：包含O.superba的浅海蛇尾群落和碎屑营养；不是物种完整食谱')] }),
  species({ id: 'humble-sea-biscuit', commonName: '低平海饼（描述性中文名）', scientificName: 'Clypeaster humilis', scientificAuthor: '(Leske, 1778)',
    guild: 'soft-sand-detrital-forager', sizeMeasure: 'test-length-excluding-spines', lengthM: .095, sizeRangeM: [.080, .110],
    depthSelectionM: [3, 25], referenceSizeM: { maximum: null, scope: 'model test length selected; no claimed global maximum' },
    referenceDepthM: { reportedRange: null, completeNaturalRange: false, scope: 'shallow sand and seagrass sand patches; model depth chosen' },
    habitat: ['real-soft-sand-bed'],
    support: support([-.22, 0, .22].flatMap(x => [-.10, .10].map(z => ({ x, y: 0, z }))), 'six-real-oral-tube-foot-tip-samples-not-mouth-or-spines'),
    normalizedEnvelope: { x: [-.58, .58], y: [0, .22], z: [-.50, .50], horizontalRadiusUnits: .77,
      axes: 'test-length-positive-x; up-positive-y; width-z', status: 'conservative-complete-test-short-spines-tube-feet-and-bounded-motion' },
    morphology: { form: 'flattened-oval-sea-biscuit-five-petaloid-ambulacra-short-spines-and-oral-tube-feet', normalizedMeasuredSize: 1,
      testMeasuredX: [-.5, .5], sizeAxis: 'test-length-excluding-spines-x', noLunules: true,
      clearanceIncludes: ['whole-test', 'short-spines', 'oral-tube-feet', 'bounded-animation'] },
    animationBounds: { shortSpineFieldYawRad: .006, contactSamplesStationary: true }, colors: ['#81704b', '#ab9967'],
    description: '扁平椭圆硬壳、五个花瓣状步带、密短棘与腹侧管足；活体带棘，区别于漂白空壳。',
    behavior: '只在真实沙床贴底慢移和摄食，不让它爬上礁石；本版未模拟浅埋、翻砂、砂粒破碎或食物颗粒输送。',
    sources: [source('https://par.nsf.gov/servlets/purl/10402633', 'Mooi与Van Noordenburg 2021原始比较形态：海饼与真砂钱区别、花瓣步带、短棘/管足和C.humilis活体'),
      source('https://www.app.pan.pl/archive/published/app62/app003572017.pdf', 'Mancosu与Nebelsick 2017原始生态形态研究：C.humilis浅层沉积物生境'),
      source('https://www.enature.qa/specie/clypeaster-humilis/', 'Qatar e-Nature国家生物图鉴：颗粒有机物摄食、口侧管足、印度西太平洋分布')] })
]);
export const OCEAN_REEF_MOBILE_BENTHOS_IDS = freeze(OCEAN_REEF_MOBILE_BENTHOS_SPECIES.map(s => s.id));
export const REEF_MOBILE_SOFT_IDS = freeze(['humble-sea-biscuit']);
export const oceanReefMobileBenthosSpeciesById = freeze(Object.fromEntries(OCEAN_REEF_MOBILE_BENTHOS_SPECIES.map(s => [s.id, s])));
