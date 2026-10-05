// An additive living-shallows catalogue. Original authored/legacy biomes keep
// their species recipes and saved populations. Sizes below are display samples.
export const oceanReefGuildSpeciesCatalog = Object.freeze([
  Object.freeze({
    id: 'day-octopus', commonName: '日行章鱼', scientificName: 'Octopus cyanea',
    kind: 'octopus', guild: 'benthic-predator', regionalOnly: true,
    lengthM: .65, sizeMeasure: 'arm-envelope', colors: ['#87745e', '#ad9473'],
    nameNote: '中文名为描述性译名，以学名辨认。',
    description: '印度—太平洋浅礁的头足类代表，具有外套膜、头部和八条腕。本场水平腕展约0.5～0.8米，是简化形态与展示尺寸，尚无皮肤拟态。',
    diet: '自然食物包括蟹、其他甲壳类、软体动物及鱼；本模型消费小型底栖动物和动物残余的代理库存，不代表捕杀某只可见动物。',
    behavior: '在真实礁石附近的可达底面缓慢探食，日间活动较多。石缘停留是庇护近似，尚未实现真正洞穴、喷水推进、繁殖与复杂认知。',
    sources: [{ url: 'https://www.montereybayaquarium.org/animals-the-ocean/animals-a-to-z/day-octopus', label: 'Monterey Bay Aquarium：日行章鱼的礁区生境、食物与尺寸' },
      { url: 'https://museum-publications.australian.museum/media/dd/Uploads/Documents/38091/ams370_vXIX_04_lowres.8d1f30d.pdf', label: 'Australian Museum：日行章鱼在礁岩附近探食的自然史' }],
  }),
  Object.freeze({
    id: 'spotted-reef-crab', commonName: '红斑瓢蟹', scientificName: 'Carpilius maculatus',
    kind: 'crab', guild: 'benthic-predator', regionalOnly: true,
    lengthM: .16, sizeMeasure: 'carapace-width', colors: ['#c1b190', '#864d45'],
    description: '印度—西太平洋岩礁底栖蟹，浅色拱壳、红色斑纹、粗壮双螯与四对步足。本场壳宽0.12～0.2米，足展大于壳宽；不把它放大成大型礁体。',
    diet: '底栖动物性食物与食腐；模型取用小型底栖动物和动物残余的代理库存，食谱组成和速率未按实测校准。',
    behavior: '在礁石附近缓慢行走、停留和探食，夜间更活跃。依实际底面判断可达性，未模拟洞内生活、蜕壳或繁殖。',
    sources: [{ url: 'https://eprints.cmfri.org.in/10970/1/225-12.pdf', label: 'ICAR-CMFRI：红斑瓢蟹的尺寸、浅礁生境与夜行食腐' },
      { url: 'https://lkcnhm.nus.edu.sg/app/uploads/2017/04/sbr2014-004.pdf', label: 'National University of Singapore：6米礁石浅洞的野外记录' },
      { url: 'https://churaumi.okinawa/tc/fishbook/00000370/', label: '冲绳美丽海水族馆：红斑瓢蟹名称与学名' }],
  }),
  Object.freeze({
    id: 'tube-sponge', commonName: '管状海绵群体代表', scientificName: 'Porifera · tubular growth form',
    kind: 'sponge', guild: 'attached-filter', identityLevel: 'phylum-group', regionalOnly: true,
    lengthM: .6, sizeMeasure: 'height', colors: ['#948367', '#5f6659'],
    nameNote: '海绵动物门的管状生长形代表，未鉴定为具名物种；海绵属于动物。',
    description: '由多根高低不同、具有出水口的管体组成，固定附着在实际硬底上。本场高度0.3～0.9米，不表示特定物种的实测尺寸或天然密度。',
    diet: '自然过滤微小颗粒、细菌等；模型从区域浮游食物代理库存扣除摄入量，尚未拆分细菌与各类颗粒。',
    behavior: '作为保存的固定附着个体，持续滤食并留下摄食记录；不会随镜头生成或巡游。未模拟细胞泵水、共生体和繁殖。',
    sources: [{ url: 'https://oceanservice.noaa.gov/facts/sponge.html', label: 'NOAA Ocean Service：固定生活的海绵动物及过滤功能' },
      { url: 'https://qrius.si.edu/taxonomy/term/11906', label: 'Smithsonian：海绵进出水口与过滤摄食' }],
  }),
]);
export const reefGuildSpeciesById = Object.freeze(Object.fromEntries(
  oceanReefGuildSpeciesCatalog.map(species => [species.id, species])));
