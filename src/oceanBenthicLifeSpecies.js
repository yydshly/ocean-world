// A finite regional admission catalog. Borrowed shells and clearance envelopes
// are display choices; sources do not calibrate ecology, density or motion.
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
};
const source = (url, label) => ({ url, label });
const envelope = (x, y, z, radius) => ({ x, y, z, horizontalRadiusUnits: radius,
  axes: 'forward-positive-x; up-positive-y; transverse-z',
  status: 'uncalibrated-conservative-display-clearance-not-measured-anatomy' });
const descriptor = data => freeze({
  regionalOnly: true, identityLevel: 'species', taxonomicLevel: 'species',
  referenceRegion: '热带印度—西太平洋浅礁、草床边缘和沙砾底的代表性组合',
  coOccurrenceStatus: 'representative-community-not-a-survey-reconstruction',
  ecologicalRateStatus: 'uncalibrated-demonstration',
  calibratedMovementMPerS: null, calibratedEcologicalRates: null,
  populationDensityPerM2: null, calibratedPopulationRates: null,
  displaySizeM: { range: data.sizeRangeM, measure: data.sizeMeasure, status: 'illustrative-selection' },
  admissionDepthM: { range: data.depthSelectionM, status: 'illustrative-selection-not-complete-species-range' },
  foodProxyStatus: 'unresolved-relative-organic-food-pool-not-complete-natural-diet',
  limitations: ['数量、位移、摄食和代谢系数未校准；不能解释为实测密度、种群预测或完整自然食物网。',
    '选定尺寸、水深与几何包络为有限实现选择；资料实例和参考上限另列，不能相互替代。'],
  ...data,
});

export const oceanBenthicLifeSpeciesCatalog = freeze([
  descriptor({
    id: 'tiger-cowrie', commonName: '虎斑宝贝', scientificName: 'Cypraea tigris',
    kind: 'mollusk', guild: 'benthic-predator', lengthM: .07,
    sizeRangeM: [.05, .09], sizeMeasure: 'shell-length', depthSelectionM: [3, 18],
    referenceSizeM: { example: .085, maximaBySource: [.14, .15], measure: 'shell-length',
      note: 'Lizard Island现场实例壳长8.5厘米；Redmap/CMFRI分别给14/15厘米参考上限。' },
    referenceDepthM: { reportedRanges: [[1, 10], [10, 40]],
      note: 'Redmap与CMFRI的不同资料范围；不是单一完整分布，也不是本场种群测量。' },
    normalizedEnvelope: envelope([-.52, .70], [0, .50], [-.33, .33], .8),
    colors: ['#ded6bd', '#392b23', '#a69476'],
    description: '卵形厚壳的浅色背面带深色圆斑，腹面有狭长齿缘壳口；身体可伸出外套膜和爬行足。',
    diet: '原始夜潜观察确认可捕食海绵；本版摄食未分辨的小型底栖动物/海绵有机代理库存，不代表专吃藻类或尸体。',
    behavior: '白天多在岩石或死珊瑚下藏身，夜间在底面短距离觅食；不推演产卵、捕食具体海绵或壳采集过程。',
    substrate: ['hard-reef', 'stable-rubble'], habitat: ['coral-reef', 'reef-sand-edge'],
    morphology: { form: 'spotted-oval-cowrie-shell-with-ventral-aperture', sizeAxis: 'shell-long-axis-x', footRootY: 0 },
    sources: [
      source('https://lifg.australian.museum/HotShot.html?hierarchyId=PVWrQCLG&resourceId=A3p1oQte', '澳大利亚博物馆Lizard Island现场记录：礁坪虎斑宝贝壳长8.5厘米'),
      source('https://www.redmap.org.au/species/2/209/', 'IMAS/Redmap：壳形、14厘米上限、珊瑚/沙底及1–10米资料范围'),
      source('https://eprints.cmfri.org.in/14906/1/Cypraea%20tigris.pdf', 'ICAR-CMFRI：印度—太平洋分布、10–40米资料范围、夜活与15厘米上限'),
      source('https://www.tandfonline.com/doi/full/10.1080/10236244.2019.1637701', '2019原始夜潜研究：虎斑宝贝捕食Rhabdastrella海绵'),
    ],
  }),
  descriptor({
    id: 'spotted-hermit-crab', commonName: '白斑寄居蟹', scientificName: 'Dardanus megistos',
    nameNote: '中文采用描述性名称；分类身份由拉丁学名确定。',
    kind: 'crustacean', guild: 'omnivore', lengthM: .08,
    sizeRangeM: [.06, .10], sizeMeasure: 'borrowed-shell-length', depthSelectionM: [3, 18],
    referenceSizeM: { shieldLengthExamples: [.0096, .0107], measure: 'shield-length',
      note: '2024原始标本使用盾板长；借用壳长6–10厘米是展示选择，未由盾板长换算，也不是蟹总长。' },
    referenceDepthM: { example: 10, habitatRange: 'intertidal-to-shallow-subtidal',
      note: '原始印度尼西亚标本为潮间/浅潮下生境；Mayotte原始夜潜记录10米。18米是保留浅海范围内的实现选择，不是实测界限。' },
    normalizedEnvelope: envelope([-.66, .98], [0, .80], [-.66, .66], 1.2),
    colors: ['#a64031', '#e3d2ae', '#382a22'],
    description: '红色足钳带黑缘白点，左钳较大，软腹藏在借用的螺壳内；壳与露出的足钳共同构成占位。',
    diet: '机会性杂食、拾食与捕食；原始菲律宾试验确认可捕食海参幼体。本版使用未分辨的小型底栖动物有机代理，不等同完整自然饮食或实际尸体。',
    behavior: '在沙砾、草床边缘或礁面借壳爬行；壳始终随同一个体移动，不模拟换壳、繁殖或具体海参捕食。',
    substrate: ['sand', 'stable-rubble', 'hard-reef'], habitat: ['reef-flat', 'seagrass-edge', 'shallow-subtidal'],
    morphology: { form: 'red-white-spotted-left-clawed-hermit-in-generic-gastropod-shell',
      borrowedShellX: [-.65, .35], borrowedShellIdentity: 'unresolved-gastropod-shell-display-proxy', footRootY: 0 },
    sources: [
      source('https://www.scielo.br/j/nau/a/PSZ83yDGf9M7M6577jBrNpQ/?lang=en', '2024原始分类调查：印度—西太平洋身份、红色白斑、盾板尺寸与浅海沙泥/草床/礁坪标本'),
      source('https://decapoda.nhm.org/pdfs/38885/38885-002.pdf', 'Poupin等Mayotte原始调查：D. megistos夜潜10米现场记录'),
      source('https://doi.org/10.1017/S0025315423000735', '2023原始菲律宾野外/水槽试验：借壳度量须与盾板长分开，可捕食海参幼体'),
    ],
  }),
  descriptor({
    id: 'blue-spotted-ray', commonName: '蓝斑条尾魟', scientificName: 'Taeniura lymma',
    kind: 'ray', guild: 'benthic-predator', lengthM: .30,
    sizeRangeM: [.25, .34], sizeMeasure: 'disc-width', depthSelectionM: [3, 20],
    referenceSizeM: { maximum: .35, measure: 'disc-width', otherSourceMaximumDiscWidth: .30,
      otherSourceMaximumTotalLength: .70,
      note: '2023官方报告盘宽约35厘米；澳大利亚博物馆列盘宽30厘米、全长70厘米。两尺度上限不证明同一动物或固定比例。' },
    referenceDepthM: { range: [0, 50], usualMaximum: 20, note: 'FRDC官方报告：多在近岸20米以内。' },
    normalizedEnvelope: envelope([-2.20, .60], [0, .20], [-.55, .55], 2.3),
    colors: ['#a2a27a', '#419fc0', '#e1d9b7'],
    description: '近底椭圆盘有亮蓝色斑点，尾侧有蓝条；盘宽与完整尾部占位分开，尾部不能从支持检测中删除。',
    diet: '底栖软体动物、多毛类、虾蟹等无脊椎动物；本版扣减未分辨的底栖动物有机代理，不把碎屑本身称为其完整食物。',
    behavior: '在开阔沙地、草床边缘和礁边近底滑行，白天可在岩檐或洞隙避蔽；未模拟潮汐集群、掘沙、毒刺互动或繁殖。',
    substrate: ['sand', 'stable-rubble'], habitat: ['reef-sand-edge', 'seagrass-edge', 'shallow-coastal-reef'],
    morphology: { form: 'oval-blue-spotted-disc-with-intact-ribbontail', sizeAxis: 'disc-width-z',
      clearanceIncludes: ['disc', 'intact-tail', 'bounded-fin-motion'], footRootY: 0 },
    sources: [
      source('https://www.fish.gov.au/docs/SharkReport/2023_FRDC_Taeniura_lymma_Final.pdf', 'FRDC官方2023物种报告：北澳/印度—太平洋、盘宽约35厘米、水深0–50米且通常≤20米'),
      source('https://australian.museum/learn/animals/fishes/bluespotted-fantail-ray-taeniura-lymma-forsskal-1775/', '澳大利亚博物馆：盘宽/全长不同口径及浅海蓝斑条尾魟身份'),
      source('https://fishesofaustralia.net.au/home/species/2030', 'Museums Victoria：沙地、草床和碎石觅食，底栖无脊椎食物与完整尾形'),
    ],
  }),
  descriptor({
    id: 'reef-goatfish', commonName: '点线羊鱼', scientificName: 'Parupeneus barberinus',
    nameNote: '中文采用描述性名称；对应Dot-and-dash Goatfish，拉丁学名作为分类身份。',
    kind: 'fish', guild: 'benthic-feeder', lengthM: .26,
    sizeRangeM: [.20, .32], sizeMeasure: 'total-length', depthSelectionM: [3, 22],
    referenceSizeM: { maximum: .50, commonlyTo: .30, measure: 'total-length', note: 'FAO条目给约50厘米全长上限、通常到30厘米。' },
    referenceDepthM: { range: [1, 100], note: '澳大利亚博物馆条目；本版只选择浅海部分。' },
    normalizedEnvelope: envelope([-.55, .55], [-.32, .25], [-.16, .16], .6),
    colors: ['#d3c9a8', '#443c2e', '#b2a66b'],
    description: '浅色细长鱼身有过眼暗带和尾柄黑斑，下颌一对触须在探砂时伸出；全长含尾，触须也进入净空包络。',
    diet: '用下颌触须在沙砾底找多毛类、甲壳类与小型软体动物；本版取未分辨的底栖动物有机代理，不声称纯碎屑食。',
    behavior: '白天近底探食，夜间可单独停在底面休息；短程觅食保持原个体身份，不模拟开挖新沙坑或完整群体迁移。',
    substrate: ['sand', 'stable-rubble'], habitat: ['reef-sand-edge', 'seagrass-edge', 'lagoon'],
    morphology: { form: 'pale-dark-striped-goatfish-with-two-chin-barbels', sizeAxis: 'total-length-x',
      clearanceIncludes: ['body', 'tail', 'extended-chin-barbels'] },
    sources: [
      source('https://www.fao.org/4/y0770e/y0770e39.pdf', 'FAO原作者物种鉴定资料：全长50厘米上限/常见30厘米，浅礁沙底与原始胃含物记录'),
      source('https://australian.museum/learn/animals/fishes/parupeneus-barberinus-lacpde-1801/', '澳大利亚博物馆：热带印度—太平洋、1–100米、白天探砂摄食/夜间独处休息'),
      source('https://fishesofaustralia.net.au/home/species/586', 'Museums Victoria：礁边/草床边沙砾底、点线体色与触须底栖摄食'),
    ],
  }),
]);

export const oceanBenthicLifeSpeciesById = freeze(Object.fromEntries(oceanBenthicLifeSpeciesCatalog.map(row => [row.id, row])));
