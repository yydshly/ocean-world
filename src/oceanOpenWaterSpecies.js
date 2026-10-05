// Living-shallows water-column representatives, separate from legacy recipes.
export const openWaterSpeciesCatalog = Object.freeze([
  Object.freeze({
    id: 'reef-squid', commonName: '大鳍礁鱿代表', scientificName: 'Sepioteuthis lessoniana complex',
    kind: 'squid', guild: 'water-column-predator', identityLevel: 'species-complex', regionalOnly: true,
    lengthM: .4, sizeMeasure: 'total-length', colors: ['#a3a792', '#707d78'],
    nameNote: '按 Sepioteuthis lessoniana 广义类群表示；博物馆资料指出该名可能包含多个物种。',
    description: '热带印度—太平洋沿岸礁区和草床上方的头足类代表。长外套膜两侧有宽鳍，头部具有八腕和两条触腕；本场全长0.3～0.5米，尺寸与数量为展示参数。',
    diet: '自然摄取虾、其他甲壳类和鱼。本模型扣除未解析的小型游泳动物猎物库存，不代表直接滤食浮游生物或捕杀某只可见鱼。',
    behavior: '在实际礁体上方保持水层净空、缓慢巡游，低光时较多探食；昼夜偏好与鳍摆为定性表达。当前为单只代表，不是完整鱿鱼群；未模拟真实喷射推进、变色、产卵或同类相食。',
    sources: [{ url: 'https://australian.museum/learn/animals/molluscs/bigfin-reef-squid-sepioteuthis-lessoniana-lesson-1830/', label: 'Australian Museum：大鳍礁鱿的分类、生境、成群活动和食性' },
      { url: 'https://www.montereybayaquarium.org/animals-the-ocean/animals-a-to-z/bigfin-reef-squid', label: 'Monterey Bay Aquarium：宽鳍、八腕两触腕与沿岸生活' }],
  }),
  Object.freeze({
    id: 'spotted-jelly', commonName: '白斑水母', scientificName: 'Phyllorhiza punctata',
    kind: 'jelly', guild: 'planktivore', regionalOnly: true,
    lengthM: .35, sizeMeasure: 'bell-diameter', colors: ['#b3b49b', '#dfdec3'],
    description: '热带西太平洋原生的沿岸漂游水母代表，具有白色斑点的半透明圆钟和下垂口腕。本场钟径0.25～0.45米，稀疏出现；不模拟水母暴发。',
    diet: '摄取小型浮游动物；模型实际扣除当地浮游食物代理库存。部分地区个体有共生藻，本版未接入共生光合供能。',
    behavior: '在有净空的沿岸水层缓慢脉动，并响应当地水流。位置与摄食由保存的实际个体状态决定；未模拟底栖水螅阶段、季节暴发或完整流体运动。',
    sources: [{ url: 'https://australian.museum/learn/animals/jellyfish/white-spotted-jellyfish/', label: 'Australian Museum：白斑水母的外形、沿岸生境和尺度' },
      { url: 'https://nas.er.usgs.gov/queries/FactSheet.aspx?speciesID=1192', label: 'USGS：热带西太平洋原生范围与共生藻差异' },
      { url: 'https://mote.org/animal-encyclopedia/australian-spotted-jellyfish/', label: 'Mote Marine Laboratory：浮游食物与分布' }],
  }),
]);
export const openWaterSpeciesById = Object.freeze(Object.fromEntries(
  openWaterSpeciesCatalog.map(species => [species.id, species])));
