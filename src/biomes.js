// Research packets and admission metadata; active presets live in sceneCatalog.js.
// Candidate taxa below are not all admitted to the renderer. All distances are metres.
// Source maxima and illustrative display ranges are deliberately separate.
import { speciesCatalog } from './species.js';

const checkedAt = '2026-10-03';
const source = (label, url, scope, access = 'direct') => ({ label, url, scope, access, checkedAt });

export const biomeSources = {
  shallowReef: source('NOAA — Shallow Coral Reef Habitat', 'https://www.fisheries.noaa.gov/national/habitat-conservation/shallow-coral-reef-habitat', '浅水造礁珊瑚的一般环境；不是所选场地的测量'),
  coralAnimal: source('NOAA — What are corals?', 'https://oceanservice.noaa.gov/education/tutorial_corals/coral01_intro.html', '珊瑚虫为动物，可捕食浮游食物'),
  kelpHabitat: source('NOAA — Iconic Kelp Forests', 'https://montereybay.noaa.gov/science/characterization/kelp-forests.html', 'Monterey 海带林：浅水岩底、巨藻、结构和海胆作用'),
  kelpLight: source('NOAA — What is a kelp forest?', 'https://oceanservice.noaa.gov/facts/kelp.html', '冷水、营养、光照和一般浅水限制'),
  oceanLight: source('NOAA — How far does light travel in the ocean?', 'https://oceanservice.noaa.gov/facts/light_travel.html', '一般光照分层；超过约 1000 m 无太阳光，不提供局部衰减系数'),
  marineSnow: source('MBARI — Ecology of marine snow', 'https://www.mbari.org/project/ecology-of-marine-snow/', '表层生产与向深海输送有机颗粒'),
  giantKelp: source('Monterey Bay Aquarium — Giant kelp', 'https://www.montereybayaquarium.org/animals-the-ocean/animals-a-to-z/giant-kelp', 'Macrocystis pyrifera：尺度、结构、光合和固着'),
  purpleUrchin: source('Monterey Bay Aquarium — Purple sea urchin', 'https://www.montereybayaquarium.org/animals-the-ocean/animals-a-to-z/purple-sea-urchin', 'Strongylocentrotus purpuratus：尺度、藻食、管足'),
  batStar: source('Monterey Bay Aquarium — Bat star', 'https://www.montereybayaquarium.org/animals-the-ocean/animals-a-to-z/bat-star', 'Patiria miniata：尺度、林底生境、杂食和管足'),
  giantKelpfish: source('Monterey Bay Aquarium — Giant kelpfish', 'https://www.montereybayaquarium.org/animals-the-ocean/animals-a-to-z/giant-kelpfish', 'Heterostichus rostratus：尺度、伪装和动物性食物'),
  brownTurbanSnail: source('Monterey Bay Aquarium — Brown turban snail', 'https://www.montereybayaquarium.org/animals-the-ocean/animals-a-to-z/brown-turban-snail', 'Tegula brunnea：尺度、冠层分布和食物'),
  gumbootChiton: source('Monterey Bay Aquarium — Gumboot chiton', 'https://www.montereybayaquarium.org/animals-the-ocean/animals-a-to-z/gumboot-chiton', 'Cryptochiton stelleri：尺度、外套和藻食'),
  seaPig: source('MBARI — Sea pig', 'https://www.mbari.org/animal/sea-pig/', 'Scotoplanes spp.：属层级的尺寸、深度、泥底和碎屑摄食'),
  crownedCucumber: source('MBARI — Crowned sea cucumber', 'https://www.mbari.org/animal/crowned-sea-cucumber/', 'Peniagone spp.：属层级尺寸、深度和摄食；本次直读失败，由网页索引核对', 'indexed'),
  rattail: source('MBARI — Rattail fish', 'https://www.mbari.org/animal/rattail-fish/', 'Macrouridae：科层级的尺寸、深度、近底活动和食物'),
  acornWorm: source('MBARI — Acorn worm', 'https://www.mbari.org/animal/acorn-worm/', 'Enteropneusta：纲层级的尺寸、深度和摄食；最大值不代表每种深海肠鳃类'),
  acornObservation: source('MBARI — A bountiful harvest of deep-sea acorn worms', 'https://www.mbari.org/news/a-bountiful-harvest-of-deep-sea-acorn-worms/', 'Station M 4000 m 泥面有约 15 cm 示例；另有夏威夷薄泥覆熔岩上超过 30 cm 形态和 Monterey 3500 m 漂移记录'),
  seaSpider: source('MBARI — Giant sea spider', 'https://www.mbari.org/animal/giant-sea-spider/', 'Colossendeis spp.：属层级的尺寸、深度、形态和动物性摄食'),
  spiderAnemone: source('MBARI — Sea spiders and pom-pom anemones', 'https://www.mbari.org/news/sea-spiders-and-pom-pom-anemones/', 'Monterey Canyon 约 2894 m 的海蜘蛛与海葵相互作用观测'),
  pomPomAnemone: source('MBARI — Pom-pom anemone', 'https://www.mbari.org/animal/pom-pom-anemone/', 'Liponema brevicorne：物种尺寸、深度、底质、形态和摄食'),
  excludedPinkUrchin: source('MBARI — Fragile pink sea urchin', 'https://www.mbari.org/animal/fragile-pink-sea-urchin/', 'Strongylocentrotus fragilis 主要资料深度 100–1000 m，排除于本包 3000–4000 m 展示'),
};

const links = (...ids) => ids.map((id) => ({ id, ...biomeSources[id] }));
const uncalibratedEnvironment = () => ({
  temperatureC: null,
  salinityPsu: null,
  dissolvedOxygenMgL: null,
  currentSpeedMPerS: null,
  lightAttenuationPerM: null,
  organicInputMassPerM2PerDay: null,
  populationDensityPerM2: null,
  note: '尚无指定地点、季节和采样数据；null 不是零。不得将视觉调参填作测量。',
});

const organism = (data) => ({
  referenceDepthM: null,
  verifiedBioluminescence: null,
  calibratedMovementMPerS: null,
  calibratedEcologicalRates: null,
  limitations: ['展示尺寸范围为实现选择，不是野外种群尺寸分布；行为规则不含已校准速率。'],
  ...data,
});

const shallowShapes = {
  fish: '保留物种体型、眼口位置和各鳍；尾柄驱动游动，侧扁体与长短比例不可只换颜色。',
  shrimp: '分节甲壳、腹部、长触须和多对步足；以小尺度清洁站活动为主。',
  crab: '小而宽的甲壳、螯和关节足；黑指珊瑚蟹贴近枝间，不放大成开阔沙地巨蟹。',
  cucumber: '长圆柱软体、低贴底和口部摄食区；不是高速游动的鱼体。',
  star: '辐射臂和腹侧管足；蓝海星缓慢贴面，不能用鱼类群游控制。',
  snail: '锥形螺壳、腹足和触角；尺寸指现有展示个体参考尺度。',
  coral: 'Acropora 枝状群体和细分枝，尺度为群体而非单个珊瑚虫。',
  clam: '成对有褶壳瓣和外套膜；固定于底，不以整体位移表现滤食。',
  algae: '贴于礁面的藻坪斑块，尺度为斑块，不生成海带形态。',
};

const reefOrganisms = speciesCatalog.map((entry) => organism({
  id: entry.id,
  commonName: entry.commonName,
  scientificName: entry.scientificName,
  identityLevel: entry.kind === 'algae' ? 'functional-group' : 'species',
  kind: entry.kind,
  guild: entry.guild,
  referenceSizeM: null,
  displaySizeM: { range: [entry.lengthM, entry.lengthM], measure: 'existing-display-reference', status: 'illustrative-selection' },
  shape: shallowShapes[entry.kind] ?? '沿用已审核的浅礁物种形态。',
  diet: entry.diet,
  behaviorRules: [entry.behavior],
  sourceLinks: entry.sources.map((item) => ({ ...item })),
  limitations: ['沿用 species.js 的现有展示尺度；资料没有在本包给出该物种尺寸上下限。', '现有群落为代表性组合，未按某一野外样方校准共现及密度。'],
}));

const kelpOrganisms = [
  organism({
    id: 'giant-kelp', commonName: '巨藻', scientificName: 'Macrocystis pyrifera', identityLevel: 'species', kind: 'kelp', guild: 'producer',
    referenceSizeM: { maximum: 30, idealMaximum: 53, measure: 'thallus-length', scope: '水族馆资料：常见上限约 30 m，理想条件可达 53 m；不是底到冠层的直立高度。' },
    displaySizeM: { range: [8, 18], measure: 'selected-thallus-length', status: 'illustrative-selection' },
    shape: '岩底固着器、柔性藻柄、叶片基部气囊、金褐叶片；冠层可在水面附近舒展。',
    diet: '光合作用与水中营养吸收；固着器不是吸收营养的植物根。',
    behaviorRules: ['固着器绑定岩底；藻柄随局部水流弯曲，叶片延迟摆动。', '叶片光照受冠层遮蔽；增长进入明确的长时间尺度，不在几分钟内成林。', '选取能达到冠层的藻柄长度时，先读取该株处实际水深；较短个体可留在林下。'],
    sourceLinks: links('giantKelp', 'kelpHabitat', 'kelpLight'),
  }),
  organism({
    id: 'purple-urchin', commonName: '紫海胆', scientificName: 'Strongylocentrotus purpuratus', identityLevel: 'species', kind: 'urchin', guild: 'grazer',
    referenceSizeM: { maximum: 0.07, measure: 'diameter', scope: '当前水族馆物种页约 7 cm across；不另推算刺长。' },
    displaySizeM: { range: [0.04, 0.07], measure: 'diameter', status: 'illustrative-selection' },
    shape: '小球状海胆壳、紫色可动棘和贴底管足；隐蔽岩孔与露面个体并存。',
    diet: '红藻、褐藻和绿藻。',
    behaviorRules: ['沿可爬岩面缓慢移动，在藻覆盖面或可达藻料处停留刮食。', '食物消耗影响局部藻覆盖；海胆荒漠作为长期变化结果，不能瞬间触发。'],
    sourceLinks: links('purpleUrchin', 'kelpHabitat'),
  }),
  organism({
    id: 'bat-star', commonName: '蝙蝠海星', scientificName: 'Patiria miniata', identityLevel: 'species', kind: 'star', guild: 'omnivore-scavenger',
    referenceSizeM: { maximum: 0.20, measure: 'arm-span', scope: '水族馆物种页上限约 20 cm across。' },
    displaySizeM: { range: [0.10, 0.18], measure: 'arm-span', status: 'illustrative-selection' },
    shape: '五条较短的三角臂与臂间蹼；自然斑驳橙红、紫等色，不套用蓝海星细长臂。',
    diet: '活或死亡的动植物材料；杂食和清道夫。',
    behaviorRules: ['贴在林底和岩面，以管足慢移。', '到达可食材料后停留，摄食可用腹面胃外翻的局部变化表现。'],
    sourceLinks: links('batStar'),
  }),
  organism({
    id: 'giant-kelpfish', commonName: '巨型海藻鱼（描述性中文名）', scientificName: 'Heterostichus rostratus', identityLevel: 'species', kind: 'fish', guild: 'small-animal-predator',
    referenceSizeM: { maximum: 0.61, measure: 'body-length', scope: '水族馆物种页上限约 61 cm。' },
    displaySizeM: { range: [0.20, 0.40], measure: 'body-length', status: 'illustrative-selection' },
    shape: '修长侧扁、近叶片轮廓的鱼身，绿褐或红色伪装，连续背鳍；保留头眼与口。',
    diet: '小型甲壳类、鱼和软体动物。',
    behaviorRules: ['在藻叶间悬停和短距离移位；采用孤立或分散个体，不默认成大鱼群。', '猎物进入可见范围后短距接近，藻柄作为遮挡和庇护。'],
    sourceLinks: links('giantKelpfish'),
  }),
  organism({
    id: 'brown-turban-snail', commonName: '褐色钟螺（描述性中文名）', scientificName: 'Tegula brunnea', identityLevel: 'species', kind: 'snail', guild: 'surface-grazer',
    referenceSizeM: { maximum: 0.025, measure: 'shell-size', scope: '水族馆物种页约 25 mm；不把该值扩大为大型贝壳。' },
    displaySizeM: { range: [0.015, 0.025], measure: 'shell-size', status: 'illustrative-selection' },
    shape: '小型褐色圆锥壳、深色腹足，壳可带附生藻膜；用微距镜头观察。',
    diet: '褐藻、苔藓虫和硅藻等附着食物。',
    behaviorRules: ['优先在巨藻冠层叶面缓慢爬行，路径跟随可达叶片表面。', '叶片弯曲时个体随附着点移动；用局部附着食物代理，不宣称完整食谱。'],
    sourceLinks: links('brownTurbanSnail'),
  }),
  organism({
    id: 'gumboot-chiton', commonName: '胶靴石鳖（描述性中文名）', scientificName: 'Cryptochiton stelleri', identityLevel: 'species', kind: 'chiton', guild: 'grazer',
    referenceSizeM: { maximum: 0.33, measure: 'body-length', scope: '水族馆物种页上限约 33 cm。' },
    displaySizeM: { range: [0.15, 0.28], measure: 'body-length', status: 'illustrative-selection' },
    shape: '低矮宽椭圆、砖红皮质外套覆盖八片壳板；腹侧宽足贴岩。',
    diet: '主要红藻，也可取食海莴苣与巨藻。',
    behaviorRules: ['贴附林底岩面缓慢爬行，以腹足保持接触。', '在附着藻面停留刮食；不可把八片壳板画成外露的典型小石鳖甲片。'],
    sourceLinks: links('gumbootChiton'),
  }),
];

const deepOrganisms = [
  organism({
    id: 'sea-pig-group', commonName: '海猪属类群', scientificName: 'Scotoplanes spp.', identityLevel: 'genus-group', kind: 'cucumber', guild: 'deposit-feeder',
    referenceDepthM: { range: [1000, 6000], scope: 'MBARI 属层级条目，不是单一物种的确认分布。' },
    referenceSizeM: { maximum: 0.17, measure: 'body-length', scope: 'MBARI 属层级上限约 17 cm。' },
    displaySizeM: { range: [0.08, 0.16], measure: 'body-length', status: 'illustrative-selection' },
    shape: '半透明淡粉软体、长支柱状管足使身体略离软泥，口部触手接近沉积物。',
    diet: '新鲜有机碎屑。',
    behaviorRules: ['支柱管足沿泥底步移，停在有机输入较高的斑块取食。', '口部动作与摄食事件同步；聚集是食物斑块响应，不安排同相绕圈。'],
    sourceLinks: links('seaPig', 'marineSnow'),
  }),
  organism({
    id: 'crowned-cucumber-group', commonName: '冠状海参属类群', scientificName: 'Peniagone spp.', identityLevel: 'genus-group', kind: 'cucumber', guild: 'deposit-feeder',
    referenceDepthM: { range: [220, 8600], scope: 'MBARI 属层级条目；本次来源核对由索引完成。' },
    referenceSizeM: { maximum: 0.30, measure: 'body-length', scope: 'MBARI 属层级上限约 30 cm。' },
    displaySizeM: { range: [0.12, 0.25], measure: 'body-length', status: 'illustrative-selection' },
    shape: '柔软海参体、腹侧管足和口部摄食触手的功能形态代理；具体背部突起的位置和比例仍须补核对影像。',
    morphologyReadiness: 'requires-reference-images',
    diet: '泥底有机碎屑。',
    behaviorRules: ['以贴底摄食为主要状态，触手探取沉积物。', '允许少量个体在食物匮乏后离底转移，再落底；游泳比例和速率未校准。'],
    sourceLinks: links('crownedCucumber'),
    limitations: ['MBARI 页本次直读失败，尺寸与水深由网页索引核对；接入前补读原页和具体形态影像。', '属级代表形态不是确定的 Peniagone 物种重建。'],
  }),
  organism({
    id: 'rattail-family', commonName: '鼠尾鳕科类群', scientificName: 'Macrouridae', identityLevel: 'family-group', kind: 'fish', guild: 'benthic-predator-scavenger',
    referenceDepthM: { range: [200, 4000], scope: 'MBARI 科层级汇总；不代表科内每个物种都跨越全段。' },
    referenceSizeM: { maximum: 1, measure: 'body-length', scope: 'MBARI 科条目上限 1 m。' },
    displaySizeM: { range: [0.35, 0.75], measure: 'body-length', status: 'illustrative-selection' },
    shape: '较大头眼、细长渐尖鼠尾和近底寻食姿态；代表形态可带颏须，不冒充具名种。',
    diet: '鱼、无脊椎动物和腐肉。',
    behaviorRules: ['低速近底巡游并转向局部食物线索，允许短时离底。', '嗅觉/触觉觅食作为简化感知；不将 ROV 灯锥设为唯一寻食依据。'],
    sourceLinks: links('rattail'),
  }),
  organism({
    id: 'deep-acorn-worm-group', commonName: '深海肠鳃类', scientificName: 'Enteropneusta', identityLevel: 'class-group', kind: 'worm', guild: 'deposit-feeder',
    referenceDepthM: { range: [0, 8100], scope: 'MBARI 纲层级岸边到深海汇总；选取深海形态，不能替代物种分布。' },
    referenceSizeM: { maximum: 2.5, example: 0.15, measure: 'body-length', scope: '2.5 m 是纲层级上限；Station M 4000 m 泥底有约 15 cm 示例，不能把夏威夷覆熔岩薄泥上的超过 30 cm 形态直接当成本地同种。' },
    displaySizeM: { range: [0.15, 0.25], measure: 'body-length', status: 'illustrative-selection' },
    shape: '柔软长条体、前端吻部与领部，身体贴泥；色彩及具体比例待所选泥底影像确定。',
    diet: '沉积物中的细菌、微小有机材料和碎屑；深处的藻源颗粒为沉降输入。',
    behaviorRules: ['沿泥面取食，留下缓慢形成的曲线或螺旋状排泄痕迹。', '可选的食物不足后离底漂移规则参考研究者的机制假说，不能标为已证实因果；漂移本身有观测。'],
    sourceLinks: links('acornWorm', 'acornObservation', 'marineSnow'),
    limitations: ['纲层级尺寸、分布非常宽；展示代表体不是已确认物种。', '显示范围为泥面约 15 cm 观测示例附近的实现选择，不是野外尺寸区间。'],
  }),
  organism({
    id: 'giant-sea-spider-group', commonName: '巨型海蜘蛛属类群', scientificName: 'Colossendeis spp.', identityLevel: 'genus-group', kind: 'sea-spider', guild: 'invertebrate-predator',
    referenceDepthM: { range: [2200, 4000], scope: 'MBARI 属层级条目。' },
    referenceSizeM: { maximum: 0.51, measure: 'leg-span', scope: 'MBARI 条目约 51 cm，度量为整体跨距，不能当作躯干长度。' },
    displaySizeM: { range: [0.20, 0.40], measure: 'leg-span', status: 'illustrative-selection' },
    shape: '很小躯干、八条细长关节足和长吻管；不是放大的陆生圆腹蜘蛛。',
    diet: '海葵、水螅、水母及其他无脊椎动物。',
    behaviorRules: ['长足分组支撑、缓慢跨过泥面。', '若实现捕食，用吻管接触合适无脊椎动物；与海葵的相互作用不能泛化为全部时间的必选行为。'],
    sourceLinks: links('seaSpider', 'spiderAnemone'),
  }),
  organism({
    id: 'pom-pom-anemone', commonName: '绒球海葵（描述性中文名）', scientificName: 'Liponema brevicorne', identityLevel: 'species', kind: 'anemone', guild: 'suspension-predator',
    referenceDepthM: { range: [100, 4100], scope: 'MBARI 物种页汇总，北太平洋泥底与岩石露头。' },
    referenceSizeM: { maximum: 0.30, measure: 'expanded-diameter', scope: 'MBARI 物种页上限约 30 cm across。' },
    displaySizeM: { range: [0.12, 0.28], measure: 'expanded-diameter', status: 'illustrative-selection' },
    shape: '淡粉、白或紫的柔软触手球；可膨为圆球或收缩成柱状，固定状态留出接底部分。',
    diet: '甲壳类及其他浮游动物。',
    behaviorRules: ['多数观察时间附底，触手随局部流动并截取经过的合适猎物。', '特定底流扰动时可脱离、滚动并再次附底；阈值未校准，不让全部个体持续滚动。'],
    sourceLinks: links('pomPomAnemone', 'spiderAnemone'),
  }),
];

export const biomeCatalog = [
  {
    id: 'shallow-reef', name: '热带浅礁', referenceRegion: '印度—西太平洋浅水礁坡与泻湖的代表性组合', integrationStatus: 'existing-prototype-reference',
    depthSelectionM: { range: [5, 15], status: 'illustrative-selection', note: '显示场域水深选择，不是全部物种的完整水深范围，也不是现有运行时参数。' },
    naturalLight: { sunlightAvailable: true, localPhotosynthesisAllowed: true, mode: 'surface-sunlight', notes: '自然太阳光与水体衰减；礁隙遮蔽，日夜改变摄食和可见度。' },
    terrain: ['浅色钙质砂斑', '礁体石灰岩与自然附生膜', '有尺度层次的枝状珊瑚和庇护缝隙'],
    observationRules: ['藻食者选择附着藻面，浮游摄食鱼位于合适水层，清洁者以清洁站为中心。', '底栖个体贴底并跟随局部地形；悬浮物随流，扬沙仅由底床扰动等明确原因触发。', '珊瑚为动物且具共生供能，不能将其等同于无条件生长的植物。'],
    exclusions: ['温带巨藻林', '深海热液烟囱', '跨洋区具名珊瑚混充', '无依据的统一高速鱼群行为'],
    uncalibratedEnvironment: uncalibratedEnvironment(),
    organisms: reefOrganisms,
    sourceLinks: links('shallowReef', 'coralAnimal', 'oceanLight'),
  },
  {
    id: 'kelp-forest', name: '温带海带林', referenceRegion: 'Monterey / 加州沿岸巨藻林的代表性组合', integrationStatus: 'integrated-prototype',
    depthSelectionM: { range: [8, 20], status: 'illustrative-selection', note: 'NOAA 一般海带林位于浅水岩底，多浅于 30 m；本包选 8–20 m，不是校准样方。' },
    naturalLight: { sunlightAvailable: true, localPhotosynthesisAllowed: true, mode: 'canopy-filtered-sunlight', notes: '光从水面进入，冠层产生随流摆动的遮蔽；能见度和叶色不能直接沿用热带蓝水。' },
    terrain: ['岩底与局部砂砾空隙', '附着岩石的巨藻固着器', '由林底到近水面冠层的垂直结构', '局部红藻等附着藻的食物斑块'],
    observationRules: ['藻柄摆动、叶片延迟响应和冠层遮光共同表达水流；不把所有株的相位锁死。', '林底刮食、冠层小螺、藻叶间伪装鱼分配到不同微生境。', '光和营养影响巨藻，海胆摄食影响覆盖；成长和林退化采用显式长期模型。'],
    exclusions: ['热带礁鱼目录直接复制', '造礁珊瑚林', '无底部固着器的悬浮巨藻', '分钟尺度新生完整森林'],
    uncalibratedEnvironment: uncalibratedEnvironment(),
    organisms: kelpOrganisms,
    sourceLinks: links('kelpHabitat', 'kelpLight', 'oceanLight'),
  },
  {
    id: 'deep-soft-bottom', name: '深海软底', referenceRegion: '东北太平洋深海泥底；Monterey 深水观测与 Station M 提供参考，非单一站位重建', integrationStatus: 'integrated-prototype-subset',
    depthSelectionM: { range: [3000, 4000], status: 'illustrative-selection', note: '六条来源汇总水深均覆盖此段；类群范围重叠不证明某次野外调查中全部共现。' },
    naturalLight: { sunlightAvailable: false, localPhotosynthesisAllowed: false, mode: 'no-sunlight', notes: '自然太阳光为零；可用有明确来源的观察器灯锥显示局部海床，不能生成全场蓝色环境光或阳光焦散。' },
    terrain: ['低起伏细粒软泥', '稀疏的爬行与摄食痕迹', '局部有机沉降斑块', '只有研究需要时增加少量岩石露头'],
    observationRules: ['颗粒有机输入来自上层沉降；这些动物不应被设为深海光合生产者。', '近底鱼、泥面沉积摄食者和海葵捕食者有不同生态位；不要统一为漂浮鱼群。', '以稀疏且局部的海雪与附底生命建立安静观察；灯光照出悬浮颗粒，不凭空增加食物。', '观察器贴近底床的明确扰动可产生局部泥云；触发阈值及沉降速率须标为视觉参数。', '未有本包物种的发光证据，不默认任何个体持续发光；verifiedBioluminescence 为 null 表示未查证。'],
    exclusions: ['太阳光、阳光焦散与光合巨藻', '热液烟囱、冷泉和鲸落作为普通泥底装饰', '未经物种与深度核对的深海珊瑚林', '100–1000 m 的粉红海胆混入此水深', '把属/科/纲标签显示成已确定物种'],
    uncalibratedEnvironment: uncalibratedEnvironment(),
    organisms: deepOrganisms,
    sourceLinks: links('oceanLight', 'marineSnow', 'acornObservation', 'excludedPinkUrchin'),
  },
];

export const biomeById = Object.fromEntries(biomeCatalog.map((biome) => [biome.id, biome]));

export const biomeModelNotes = {
  scope: '本文件仅准备独立生境研究数据；没有修改运行时、生物模型、菜单或渲染器。',
  units: '几何单位 m；depthSelectionM 为海面到局部海床的水深，不是相机 y 坐标。',
  sizeSemantics: 'referenceSizeM 是来源上限/实例；displaySizeM 是实现选择。measure 指明体长、跨距或藻体长度，不能互换。',
  identity: 'species 才是具名物种；genus-group / family-group / class-group / functional-group 必须保持可见类群标识。',
  calibration: 'null 表示尚未校准/未核查，不表示物理量为零。不得从来源的文字行为虚构运动速度、出生死亡率或密度。',
  cooccurrence: '名录是地理与水深相容的展示候选；没有证明所列生物在单一野外样方、季节或深度全部共现。',
  admission: '独立生境须先通过来源、形态尺度、光照、底质与生态位审核，再逐一接入；research-only 不代表已实现。',
};
