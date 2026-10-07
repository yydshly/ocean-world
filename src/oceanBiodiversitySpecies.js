// Finite, independent shallow-community admission catalog. Existing authored
// catalogs and saved populations must not be reinterpreted by these additions.
// Sources support identity, scale and qualitative ecology, not model rates.
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};
const source = (url, label) => ({ url, label });
const descriptor = data => freeze({
  regionalOnly: true,
  identityLevel: 'species',
  taxonomicLevel: 'species',
  referenceRegion: '热带西太平洋浅礁；大堡礁与邻近印度—西太平洋物种资料的代表性组合',
  coOccurrenceStatus: 'representative-community-not-a-survey-reconstruction',
  ecologicalRateStatus: 'uncalibrated-demonstration',
  calibratedMovementMPerS: null,
  calibratedEcologicalRates: null,
  populationDensityPerM2: null,
  displaySizeM: { range: data.sizeRangeM, measure: data.sizeMeasure, status: 'illustrative-selection' },
  admissionDepthM: { range: data.depthSelectionM, status: 'illustrative-selection-not-complete-species-range' },
  limitations: ['数量、位移、摄食、代谢和生产系数是未校准的展示代理；不代表实测密度或野外预测。',
    '展示尺寸是来源尺度内的实现选择；群落组合不证明同一野外样方共现。'],
  ...data,
});

export const oceanBiodiversitySpeciesCatalog = freeze([
  descriptor({
    id: 'biodiversity-massive-coral', commonName: '团块滨珊瑚类群代表', scientificName: 'Porites lobata s.l.',
    identityLevel: 'species-complex', taxonomicLevel: 'species-complex', kind: 'coral', guild: 'photosymbiotic',
    lengthM: .8, sizeRangeM: [.55, 1.1], sizeMeasure: 'colony-diameter', depthSelectionM: [3, 18],
    referenceSizeM: { reportedGreaterThan: 4, measure: 'colony-diameter', note: '资料记载群体可超过4米；不是本场展示尺寸或最大值。' },
    referenceDepthM: null,
    colors: ['#a18d6b', '#c1ac85', '#8e795d'],
    nameNote: 'Corals of the World 将 P. lobata 标为复合种；此处是广义团块形态代表，未做具体种的骨骼或分子鉴定。',
    description: '固着硬底的半球或盔状群体，表面连续、浅奶油至棕色；常见于后礁、泻湖和部分岸礁。',
    diet: '共生藻光合供能，并可捕获小型浮游动物；本版使用注明口径的群体有机库存和悬浮食物代理。',
    behavior: '保持同一硬底附着点，不能在分钟尺度凭空生成大群体；不把装饰团块数量解释为测量生物量。',
    substrate: ['hard-reef'], habitat: ['back-reef', 'lagoon', 'fringing-reef'],
    morphology: { form: 'massive-hemispherical-lobed', fixedRoot: true },
    sources: [
      source('https://www.coralsoftheworld.org/species_factsheets/species_factsheet_summary/porites-lobata/', 'Corals of the World：团块形态、群体尺度、后礁生境及复合种说明'),
      source('https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2024.1303681/full', '原始研究：P. lobata 共生光合与异养供能'),
      source('https://www.sciencedirect.com/science/article/abs/pii/S0022098108004814', 'Palardy等原始研究：P. lobata 的浮游动物摄食'),
    ],
  }),
  descriptor({
    id: 'biodiversity-grape-algae', commonName: '葡萄蕨藻', scientificName: 'Caulerpa racemosa',
    kind: 'algae', guild: 'producer', lengthM: .28, sizeRangeM: [.18, .36], sizeMeasure: 'patch-diameter', depthSelectionM: [3, 18],
    referenceSizeM: { frondHeightRange: [.01, .05], branchletDiameterRange: [.002, .004], measure: 'upright-frond-height',
      note: 'Smithsonian实地指南中的芽高和小枝直径；斑块直径另为实现选择，不是单细胞个体体长。' },
    referenceDepthM: { example: 15, note: 'Lizard Island外侧Day Reef岩壁记录；单次观测不是完整水深范围。' },
    colors: ['#5f7340', '#8b9652', '#46663e'],
    description: '低矮匍匐茎贴附底面，向上长出小型葡萄状分枝；使用浅礁具名绿藻，不套用巨藻林形态。',
    diet: '光合作用与溶解营养吸收；本版的生产量受实际库存和光照代理约束。',
    behavior: '斑块保持底面附着，短芽可随流轻摆；不模拟瞬间侵占整礁或未核实的特定食物配对。',
    substrate: ['hard-reef', 'stable-rubble'], habitat: ['reef-rock-surface'],
    morphology: { form: 'creeping-stolon-with-grape-branchlets', fixedRoot: true, shootHeightM: [.02, .05], branchletDiameterM: [.002, .004] },
    sources: [
      source('https://lifg.australian.museum/HotShot.html?resourceId=UJqXwxh2', '澳大利亚博物馆Lizard Island现场记录：C. racemosa，Day Reef约15米'),
      source('https://striresearch.si.edu/taxonomy-training/wp-content/uploads/sites/31/2020/03/PASI_platessmall_2009.pdf', 'Smithsonian藻类实地指南：匍匐茎、1–5厘米芽与2–4毫米葡萄状小枝'),
      source('https://manoa.hawaii.edu/lifesciences/ReefAlgae/caulerpa.htm', '夏威夷大学Caulerpa检索表：葡萄蕨藻分枝诊断'),
    ],
  }),
  descriptor({
    id: 'tropical-urchin', commonName: '长刺刺冠海胆', scientificName: 'Diadema setosum',
    kind: 'urchin', guild: 'grazer', lengthM: .30, sizeRangeM: [.24, .38], sizeMeasure: 'full-spine-span', depthSelectionM: [3, 18],
    referenceSizeM: { testDiameterMaximum: .08, spineLengthMaximum: .30, measure: 'test-diameter-and-single-spine-length',
      note: '海胆壳直径和单刺长度是两种尺度；显示sizeM指含刺整体跨距，不把刺长当作壳直径。' },
    referenceDepthM: null,
    colors: ['#29272b', '#504543', '#c9804c'],
    description: '小壳体、细长黑刺和肛锥橙环；Lizard Island有Porites旁记录，区别于当地更常见的D. savignyi。',
    diet: '刮食硬底藻面等附着材料；实际食谱并非纯藻，本版仅接入明确的表面食物代理，未模拟珊瑚侵蚀。',
    behavior: '以管足贴底缓慢移动，白天偏向岩隙庇护、低光时觅食；相位和速率不是野外校准结果。',
    substrate: ['hard-reef', 'stable-rubble'], habitat: ['reef-crevice', 'algal-hard-surface'],
    morphology: { form: 'small-test-long-needle-spines-orange-anal-ring', testDiameterM: [.05, .075] },
    sources: [
      source('https://lifg.australian.museum/Group.html?groupId=Fg2ZK5TA&hierarchyId=PVWrQCLG', '澳大利亚博物馆Lizard Island：壳径8厘米、刺长30厘米上限及夜行庇护'),
      source('https://www.sciencedirect.com/science/article/pii/S0025326X13007455', 'Qiu等原始研究：D. setosum 藻食、珊瑚摄食与生物侵蚀的区别'),
    ],
  }),
  descriptor({
    id: 'feather-duster', commonName: '羽冠管虫（描述性中文名）', scientificName: 'Sabellastarte spectabilis',
    kind: 'worm', guild: 'attached-filter', lengthM: .055, sizeRangeM: [.05, .06], sizeMeasure: 'crown-diameter', depthSelectionM: [5, 18],
    referenceSizeM: { crownDiameterRange: [.05, .06], bodyLengthExample: .165, bodyWidthExample: .018,
      measure: 'crown-diameter', note: '韩国国立馆资料的冠幅与身体实例，不把管内身体长度当成展开冠幅。' },
    referenceDepthM: { range: [5, 20], note: '韩国国立馆资料中的亚潮带岩隙生境范围，非GBR样方测量。' },
    colors: ['#aa987b', '#634e48', '#d2c4a7'],
    nameNote: '中文名为描述性译名；名义种对应西太平洋资料，不宣称展示颜色即可现场鉴定。',
    description: '管体附于岩石或大型附着动物间隙，伸出带浅棕深棕条带的羽冠；冠与管内分节体尺度分别保留。',
    diet: '截取经过羽冠的悬浮有机小颗粒；使用局部悬浮食物池代理，不将视觉亮点直接计作食物。',
    behavior: '保持原管口，食物经过时展开滤食、受扰动时收冠；不让整只管虫在沙面游走。',
    substrate: ['hard-reef-crevice'], habitat: ['subtidal-rock-crevice'],
    morphology: { form: 'banded-radiolar-crown-and-attached-tube', fixedRoot: true },
    sources: [
      source('https://www.mbris.kr/pub/marine/tsearch/tsearchDetail.do?spcTxnId=270000015800', '韩国国立海洋生物资源馆：S. spectabilis冠幅、身体尺度及5–20米岩隙附管'),
      source('https://www.cmar.csiro.au/data/caab/family_list.cfm?category_code=22&family_code=83&seq=0', 'CSIRO澳大利亚水生生物名录：Sabellastarte spectabilis'),
      source('https://www.gfbs-home.de/fileadmin/user_upload/ode2mods/ode/ode10/ode10_0351/article.pdf', 'Capa等原始分类研究：菲律宾模式标本、西太平洋种界与形态鉴定局限'),
      source('https://collections.museumsvictoria.com.au/species/8516', 'Museums Victoria：Sabellastarte属滤取浮游/颗粒及种间辨识局限'),
    ],
  }),
  descriptor({
    id: 'sand-goby', commonName: '蓝带砂虾虎鱼（描述性中文名）', scientificName: 'Valenciennea strigata',
    kind: 'fish', guild: 'benthic-feeder', lengthM: .13, sizeRangeM: [.10, .16], sizeMeasure: 'total-length', depthSelectionM: [3, 18],
    referenceSizeM: { maximum: .18, measure: 'total-length' }, referenceDepthM: { range: [1, 25] },
    colors: ['#c5c1aa', '#d1b46a', '#7294a0'],
    nameNote: '中文名为描述性译名，以学名辨认。',
    description: '淡灰体、黄头、眼下蓝带与细长背鳍前棘；栖于清澈泻湖外侧、向海礁的沙砾底邻近。',
    diet: '从含入口中的砂中筛取小型无脊椎动物；本版使用明确标识的底栖小猎物代理，不把无机砂当食物。',
    behavior: '近沙面悬停、短距寻食后回到家域；自然有成对与筑穴，本版不声称已模拟真实挖洞或繁殖。',
    substrate: ['sand', 'sand-rubble'], habitat: ['clear-lagoon-edge', 'seaward-reef-sediment'],
    morphology: { form: 'yellow-head-blue-cheek-band-pale-elongate-goby', fishAxis: '+X' },
    sources: [source('https://fishesofaustralia.net.au/home/species/179', 'Museums Victoria：V. strigata，18厘米、1–25米、砂中小猎物、GBR分布')],
  }),
  descriptor({
    id: 'reef-parrotfish', commonName: '太平洋绿鳍鹦嘴鱼（描述性中文名）', scientificName: 'Chlorurus spilurus',
    kind: 'fish', guild: 'surface-scraper', lengthM: .26, sizeRangeM: [.20, .32], sizeMeasure: 'total-length', depthSelectionM: [3, 18],
    referenceSizeM: { maximum: .37, measure: 'total-length' }, referenceDepthM: { range: [1, 30] },
    colors: ['#748779', '#ae9f7b', '#756468'],
    nameNote: '澳大利亚本土/GBR使用C. spilurus；C. sordidus对应红海/印度洋成员，不能直接互换。中文名为描述性译名。',
    description: '展示终期的绿褐体、较钝圆头、鹦嘴状口与绿胸鳍；只选一个生命阶段外观，不混用不同阶段。',
    diet: '刮取礁面基质中的微生物与其他有机材料，也有珊瑚摄食记录；本版表面食物池是合并代理，未核实专食葡萄蕨藻。',
    behavior: '在可达硬底邻近巡游并短时下探刮食；不宣称已重现珊瑚咬痕、骨骼侵蚀或性别转换。',
    substrate: ['hard-reef', 'stable-rubble'], habitat: ['shallow-reef-hard-surface'],
    morphology: { form: 'terminal-phase-blunt-head-beak-green-brown-parrotfish', fishAxis: '+X' },
    sources: [
      source('https://fishesofaustralia.net.au/home/species/5300', 'Museums Victoria：C. spilurus的GBR种名、终期颜色、37厘米与1–30米'),
      source('https://link.springer.com/article/10.1007/s00338-026-02925-9', '2026原始同位素研究：C. spilurus的表面微生物营养，不能等同纯宏藻食'),
      source('https://pmc.ncbi.nlm.nih.gov/articles/PMC7807759/', '原始实验和实地研究：C. spilurus 对P. lobata的珊瑚摄食'),
    ],
  }),
  descriptor({
    id: 'shallow-anemone', commonName: '壮丽海葵（描述性中文名）', scientificName: 'Radianthus magnifica',
    synonymScientificNames: ['Heteractis magnifica'], kind: 'anemone', guild: 'photosymbiotic-predator',
    lengthM: .42, sizeRangeM: [.25, .60], sizeMeasure: 'oral-disc-diameter', depthSelectionM: [3, 12],
    referenceSizeM: { maximum: 1, tentacleLengthMaximum: .10, measure: 'oral-disc-diameter' },
    referenceDepthM: { shallowOccurrenceBelowM: 1, note: '2024指南有不足1米礁坪记录；不是仅分布在此深度。' },
    colors: ['#8b8170', '#a9a588', '#847481'],
    nameNote: 'WoRMS现接受Radianthus magnifica；Heteractis magnifica为旧组合名，GBR宿主资料常沿用旧名。',
    description: '足盘直接附着坚固硬底，上方露出柔软柱体和密集指状触手口盘；浅热带礁上显露位置的代表。',
    diet: '共生光合和接触触手的动物性食物；本版光合份额与悬浮小猎物为未校准代理。',
    behavior: '保持真实硬底根部，局部触手随流与摄食状态变化；同一海葵可作为已核实的小丑鱼宿主。',
    substrate: ['hard-reef'], habitat: ['prominent-reef-rock', 'patch-reef'],
    morphology: { form: 'exposed-column-with-digitiform-tentacles', fixedRoot: true, tentacleLengthM: [.04, .08] },
    hostForSpeciesIds: ['clown-anemonefish'],
    sources: [
      source('https://www.marinespecies.org/aphia.php?id=290090&p=taxdetails', 'WoRMS：Heteractis magnifica为Radianthus magnifica的旧组合名'),
      source('https://zenodo.org/records/13760333', 'Titus等2024原始分类/实地指南：R. magnifica口盘、触手、硬底附着和分布'),
      source('https://zenodo.org/records/13745824', 'Titus等2024海葵实地指南：宿主海葵与共生生物背景'),
      source('https://australian.museum/learn/animals/fishes/eastern-clown-anemonefish-amphiprion-percula/', '澳大利亚博物馆：GBR外礁A. percula与H. magnifica的宿主配对'),
    ],
  }),
  descriptor({
    id: 'clown-anemonefish', commonName: '眼斑双锯鱼', scientificName: 'Amphiprion percula',
    kind: 'fish', guild: 'host-associated-omnivore', lengthM: .065, sizeRangeM: [.05, .075], sizeMeasure: 'total-length', depthSelectionM: [3, 12],
    referenceSizeM: { museumMaximum: .08, fieldGuideMaximum: .11, measure: 'total-length', note: '两个博物馆条目报告不同上限；显示选择不超过7.5厘米。' },
    referenceDepthM: { range: [1, 12] }, colors: ['#ba7847', '#ddd8c6', '#403b34'],
    description: '橙体、三道带黑缘的白带与黑鳍缘；采用GBR/美拉尼西亚的A. percula，不能用A. ocellaris混充。',
    diet: '藻类和浮游动物；在已有宿主邻近接入当地表面/浮游食物代理，不从宿主存在本身凭空获得食物。',
    behavior: '仅在同一实际已存活壮丽海葵邻近短距活动、回到其庇护；没有宿主就不新建此鱼，不模拟繁殖或性别转换。',
    substrate: ['living-anemone-host'], habitat: ['anemone-refuge'],
    morphology: { form: 'orange-three-white-black-edged-bars', fishAxis: '+X' },
    requiredHostSpeciesIds: ['shallow-anemone'], hostRelationship: 'source-verified-refuge-association',
    sources: [
      source('https://australian.museum/learn/animals/fishes/eastern-clown-anemonefish-amphiprion-percula/', '澳大利亚博物馆：GBR分布、1–12米、8厘米、藻/浮游食性及H. magnifica宿主'),
      source('https://lifg.australian.museum/Group.html?groupId=A4s0lk94&hierarchyId=CEJQQmVx', 'Lizard Island实地条目：A. percula与R. magnifica配对及11厘米上限'),
    ],
  }),
]);

export const oceanBiodiversitySpeciesById = freeze(Object.fromEntries(
  oceanBiodiversitySpeciesCatalog.map(species => [species.id, species])));
