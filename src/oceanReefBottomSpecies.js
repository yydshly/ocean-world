const freeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const source=(url,label)=>({url,label});
const species=d=>freeze({regionalOnly:true,identityLevel:'species-representative',taxonomicLevel:'species',
 referenceRegion:'热带印度—太平洋礁面与礁缘底栖代表组合',coOccurrenceStatus:'representatives-not-local-field-survey',
 calibratedMovementMPerS:null,calibratedEcologicalRates:null,populationDensityPerM2:null,ecologicalRateStatus:'uncalibrated-demonstration',
 displaySizeM:{range:d.sizeRangeM,measure:d.sizeMeasure,status:'illustrative-selection'},
 admissionDepthM:{range:d.depthSelectionM,status:'selected-whole-body-depth-not-complete-natural-range'},
 substrate:['stable-hard-reef'],habitat:['reef-face','reef-edge'],
 limitations:['只在真实稳定硬底上露出贴底活动；尚无垂直攀附、藏缝、繁殖或跨区迁移。',
  '摄食扣当地未分辨营养，未解析口部接触、砂粒处理、可见捕杀或完整天然食谱。',
  '尺寸比例、数量、速度和摄食率为显示选择，未野外校准。'],...d});
export const OCEAN_REEF_BOTTOM_SPECIES=freeze([
 species({id:'blue-linckia-star',commonName:'蓝海星（描述性中文名）',scientificName:'Linckia laevigata',scientificAuthor:'(Linnaeus, 1758)',
  kind:'starfish',guild:'selected-surface-algal-nutrition-consumer',lengthM:.24,sizeRangeM:[.20,.28],sizeMeasure:'maximum-whole-arm-span',depthSelectionM:[3,15],
  colors:['#315f9c','#407fb0','#88a1b0'],description:'小中央盘与五条长而圆钝的蓝色腕，腹侧步带有管足；采用常见蓝色形态，不混用尖棘沙海星。',
  diet:'选取礁面藻类营养分量；本版扣当地algae代理，未解析实际珊瑚藻表面、微生物膜或完整食谱。',
  behavior:'在真实岩面低坡空隙缓慢移动；未模拟攀爬立面、腕部自割或再生。',
  foodPool:'algae',foodProxyStatus:'selected-existing-algal-organics-not-resolved-coralline-surface-or-full-diet',
  morphology:{arms:5,form:'small-disc-long-round-ended-arms-blue-phase',tubeFeet:'paired-ventral-rows'},
  sources:[source('https://lifg.australian.museum/Group.html?groupId=RtcVGxAf&hierarchyId=','Australian Museum Lizard Island：常见蓝色形态、礁脊及最长腕半径约15cm标本'),
   source('https://onlinelibrary.wiley.com/doi/abs/10.1111/j.1095-8312.1974.tb00713.x','Laxton 1974原始研究：在珊瑚藻覆盖的死亡硬珊瑚骨骼上及其间取食；不据此推断完整食谱')]}),
 species({id:'prickly-redfish',commonName:'梅花参（描述性中文名）',scientificName:'Thelenota ananas',scientificAuthor:'(Jaeger, 1833)',
  kind:'sea-cucumber',guild:'deposit-feeder',lengthM:.38,sizeRangeM:[.34,.44],sizeMeasure:'body-length',depthSelectionM:[3,20],
  colors:['#955035','#c67949','#5b352a'],description:'隆背、扁腹的大型红褐色海参，背部有明显锥形和分枝乳突，浅红腹面有管足与20条口触手。',
  diet:'沉积物中的有机营养分量；本版扣当地detritus，矿物沙粒不是能量。',
  behavior:'选取实际低坡硬底礁缘慢移；未实现翻砂、砂粒吞排或自然生殖周期。',
  foodPool:'detritus',foodProxyStatus:'selected-existing-detrital-organics-not-mineral-sand-mass',
  morphology:{oralTentacles:20,form:'arched-dorsum-flat-ventrum-large-conical-and-branched-papillae'},
  referenceSizeM:{maximum:.80,averageAbout:.45,measure:'fresh-body-length'},
  sources:[source('https://www.fao.org/4/i1918e/i1918e.pdf','FAO2012 pp116–117：20口触手、大乳突、硬底礁坡/通道及尺寸'),
   source('https://www.marinespecies.org/aphia.php?id=210916&p=taxdetails','WoRMS接受身份及Rowe & Gates1995底栖/碎屑沉积摄食记录')]}),
 species({id:'giant-triton',commonName:'大法螺',scientificName:'Charonia tritonis',scientificAuthor:'(Linnaeus, 1758)',
  kind:'mollusc',guild:'echinoderm-predator',lengthM:.28,sizeRangeM:[.24,.34],sizeMeasure:'shell-length',depthSelectionM:[3,20],
  colors:['#b6a07e','#6d5141','#cdbd9c'],description:'长尖螺塔、大体螺层和带褐色斑带的壳体，腹侧壳口露出爬行足、头触角和短水管；完整身体占位包含壳外部分。',
  diet:'海星及其他棘皮动物；本版只扣当地reefGuild动物性营养，未捕杀可见海星。',
  behavior:'稀疏选择真实礁面，带壳缓慢爬行；不模拟气味追踪或棘冠海星治理。',
  foodPool:'reefGuild.preyOrganicUnits',foodProxyStatus:'selected-existing-animal-organics-not-visible-echinoderm-kills',
  morphology:{form:'elongated-spire-whorled-shell-open-ventral-aperture-foot-paired-tentacles-siphon'},
  referenceSizeM:{maximumAbout:.50,measure:'shell-length'},naturalRarity:'reported-rare-not-a-calibrated-spawn-density',
  sources:[source('https://www.aims.gov.au/information-centre/news-and-stories/playing-fears-exploring-use-pacific-triton-mitigating-crown-thorns-starfish-outbreaks','AIMS：印度太平洋珊瑚礁、稀少，取食海星和海参'),
   source('https://www.aims.gov.au/information-centre/news-and-stories/triton-ate-crown-thorns','AIMS：壳可约半米；不把自然每周摄食频率换算为本版速率'),
   source('https://pmc.ncbi.nlm.nih.gov/articles/PMC8270824/','2021原始转录组研究：长而窄的保护壳与半米壳长口径')]}),
]);
export const OCEAN_REEF_BOTTOM_IDS=freeze(OCEAN_REEF_BOTTOM_SPECIES.map(s=>s.id));
export const oceanReefBottomSpeciesById=freeze(Object.fromEntries(OCEAN_REEF_BOTTOM_SPECIES.map(s=>[s.id,s])));
export const reefBottomFoodPool=id=>oceanReefBottomSpeciesById[id]?.foodPool;
export const reefBottomFoodScope=id=>oceanReefBottomSpeciesById[id]?.foodProxyStatus;
