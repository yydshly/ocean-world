// New fresh benthic palette. These are visible individual animals, not food
// parcels or decorative duplicates. Old v1 births keep their original palette.
const freeze = v => { if (v && typeof v === 'object' && !Object.isFrozen(v)) {
  Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
const source = (url, label) => ({ url, label });
const descriptor = data => freeze({
  regionalOnly: true, identityLevel: 'species', taxonomicLevel: 'species',
  referenceRegion: '热带印度—西太平洋浅海软底和海草边缘的代表组合',
  coOccurrenceStatus: 'representative-community-not-a-survey-reconstruction',
  ecologicalRateStatus: 'uncalibrated-demonstration', calibratedMovementMPerS: null,
  calibratedEcologicalRates: null, populationDensityPerM2: null,
  displaySizeM: { range: data.sizeRangeM, measure: data.sizeMeasure, status: 'illustrative-selection' },
  admissionDepthM: { range: data.depthSelectionM, status: 'illustrative-selection-not-complete-species-range' },
  foodProxyStatus: 'unresolved-relative-organic-food-pool-not-complete-natural-diet',
  substrate: ['sand', 'soft-sediment'], habitat: ['seagrass-edge', 'shallow-sand-bed'],
  limitations: ['只表现软底上露出的个体与短距离活动；尚无游泳、埋沙、脱壳、繁殖或可见猎物捕杀。',
    '本版尺寸、深度、数量和活动速度是实现选择，未据野外数据校准。'],
  ...data,
});
export const OCEAN_SMALL_BOTTOM_SPECIES = freeze([
  descriptor({ id: 'green-tiger-prawn', commonName: '绿虎对虾（描述性中文名）',
    scientificName: 'Penaeus (Eopenaeus) semisulcatus', scientificAuthor: 'De Haan, 1844',
    kind: 'crustacean', guild: 'benthic-omnivore', lengthM: .10,
    sizeRangeM: [.08, .12], sizeMeasure: 'total-body-length-excluding-antennae', depthSelectionM: [3, 15],
    colors: ['#777c54', '#4b4935', '#d2c7a0'],
    normalizedEnvelope: { x: [-.51, 1.13], y: [0, .36], z: [-.43, .43], horizontalRadiusUnits: 1.22 },
    description: '细长头胸甲、六节腹部与尾扇；额角、两对触须、五对胸足及五对腹肢完整，身体带深浅横带。',
    diet: '杂食性；本版仅取当地碎屑支持的未分辨有机营养，不代表完整天然食谱。',
    behavior: '选取草床边缘及相邻软底上的小体型个体；低照度短距离活动，白天停留。没有幼体迁移或海草叶上栖息模拟。',
    morphology: { abdominalSomites: 6, pereopodPairs: 5, chelatePereopodPairs: 3, pleopodPairs: 5, tailFan: true },
    sources: [source('https://www.marinespecies.org/aphia.php?p=taxlist&tName=Penaeus+semisulcatus', 'WoRMS当前接受名及作者'),
      source('https://www.fao.org/4/i2741e/i2741e01.pdf', 'FAO肯尼亚图鉴p16：分节形态、横带、斑带触角及沙泥生境'),
      source('https://doi.org/10.1016/S0022-0981(96)02722-0', '1997原始实验摘要：后期仔虾/早期幼虾对白天海草结构的选择；不外推本版8–12cm尺寸'),
      source('https://www.fao.org/4/e7995e/E7995E06.htm', 'FAO养殖生物目录：杂食性；旧作者写法不作分类依据')],
  }),
  descriptor({ id: 'flower-swimming-crab', commonName: '远海梭子蟹（花蟹）',
    scientificName: 'Portunus pelagicus', scientificAuthor: '(Linnaeus, 1758)',
    kind: 'crustacean', guild: 'benthic-predator', lengthM: .10,
    sizeRangeM: [.08, .12], sizeMeasure: 'carapace-width-including-lateral-spines', depthSelectionM: [3, 15],
    colors: ['#426c78', '#d2d3bc', '#52685b'],
    normalizedEnvelope: { x: [-.43, .80], y: [0, .40], z: [-.72, .72], horizontalRadiusUnits: 1.08 },
    description: '宽扁带侧齿的甲壳、长双螯、三对步足和一对末端桨状游泳足；选用蓝白花纹外观。',
    diet: '以动物性食物为主；本版只扣当地碎屑支持的未分辨底栖动物营养，不让它直接吃草或假定已捕杀对虾。',
    behavior: '露出沙面时在软底上短距离活动；保留桨足形态，此批尚无离底游泳与沙内隐藏。',
    morphology: { chelipedPairs: 1, walkingLegPairs: 3, swimmingLegPairs: 1, paddleLastPair: true },
    sources: [source('https://www.marinespecies.org/aphia.php?p=taxlist&tName=Portunus', 'WoRMS当前接受名；不合并其他P.pelagicus复合群成员'),
      source('https://www.nparks.gov.sg/florafaunaweb/fauna/1/2/1207', 'NParks：沙泥底、海草潟湖、宽甲长螯及末对桨足'),
      source('https://www.nparks.gov.sg/docs/default-source/sbwr-wetlands-newsletter/wetlands-newsletter--vol-7-no-1-apr-2000.pdf', 'NParks物种食性账户：鱼类等动物性食物')],
  }),
]);
export const OCEAN_SMALL_BOTTOM_IDS = freeze(OCEAN_SMALL_BOTTOM_SPECIES.map(s => s.id));
export const oceanSmallBottomSpeciesById = freeze(Object.fromEntries(OCEAN_SMALL_BOTTOM_SPECIES.map(s => [s.id, s])));
