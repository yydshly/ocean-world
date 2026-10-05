// Independent regional catalog: the authored reef's original population and
// species order remain unchanged when upper/midwater representatives are added.
export const oceanPelagicSpeciesCatalog = Object.freeze([
  Object.freeze({
    id: 'yellowtail-fusilier', commonName: '黄尾乌尾鮗', scientificName: 'Caesio cuning',
    kind: 'fish', guild: 'planktivore', lengthM: .25, regionalOnly: true,
    colors: ['#7c929b', '#dbbb43', '#ddd2c5'],
    description: '印度洋—西太平洋热带礁区的水层群游鱼。灰蓝色身体、黄色尾部与背部后段，腹面浅白至粉色；本场展示约25厘米个体。',
    diet: '水层中的浮游动物；摄食消耗当地浮游参考资源池。',
    behavior: '在实际礁体上方的中上层水域保持同伴间距、共同转向，并在已加载的相邻海域之间巡游。每群通常5–8尾是便于观察的代表个体，旧区域容量不足时可采用4尾小组；数量、速度、水层与路线未按野外观测校准。低光时减慢巡游并停止浮游摄食是未校准模型规则，未加载海域暂停演化；未模拟夜间迁层、繁殖或季节迁徙。',
    sources: [{ url: 'https://australian.museum/learn/animals/fishes/yellowtail-fusilier-caesio-cuning-bloch-1791/',
      label: 'Australian Museum：体色、热带分布、1–60米水深与中层成群浮游摄食' },
    { url: 'https://fishesofaustralia.net.au/home/species/540',
      label: 'Museums Victoria：Caesio cuning 分类与礁区分布' },
    { url: 'https://fishdb.sinica.edu.tw/taxon/382089-fishdb',
      label: '台湾鱼类资料库：黄尾乌尾鮗／黄尾梅鲷名称' }],
  }),
]);
export const oceanPelagicSpeciesById = Object.freeze(Object.fromEntries(
  oceanPelagicSpeciesCatalog.map(species => [species.id, species])));
