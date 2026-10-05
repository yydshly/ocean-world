// A separate continuous-kelp water-column representative. The original kelp
// catalog and authored KelpSimulation population retain their old order/state.
export const kelpWaterSpeciesCatalog = Object.freeze([
  Object.freeze({
    id: 'blue-rockfish', commonName: '蓝岩鱼', scientificName: 'Sebastes mystinus',
    nameNote: '中文名为描述性译名，以学名辨认。形态对应2015年重描述后的 Sebastes mystinus。',
    identityLevel: 'species', kind: 'fish', guild: 'small-animal-predator',
    lengthM: .30, sizeMeasure: 'total-length', regionalOnly: true,
    displaySizeM: { range: [.28, .34], measure: 'total-length', status: 'illustrative-selection' },
    colors: ['#667d89', '#a8aea9', '#465762'],
    description: '蒙特雷巨藻林周边水层的蓝岩鱼代表。深卵圆鱼体、较大眼与小口，前段棘条和后段软条相连的背鳍，宽而浅凹的尾鳍；灰蓝身体带大暗斑、腹面较浅。本场选用约30厘米总长，未按当地种群尺寸分布校准。',
    diet: '林冠周边的小型动物性食物；场景用当地食物的相对参考量表示部分食谱。',
    behavior: '在实际巨藻和岩底边缘较开阔的水层，以稀疏代表小组共同转向并保持间距，在已加载的相邻海域之间巡游，摄食消耗当前海域的小型动物食物。数量、速度、巡游半径、光照响应和摄食阈值均为未校准模型参数；未加载海域暂停演化，未模拟季节迁徙、繁殖或完整藻叶碰撞。',
    sources: [
      { url: 'https://spo.nmfs.noaa.gov/sites/default/files/frable_0.pdf',
        label: 'Frable等（2015），NOAA Fishery Bulletin：S. mystinus重描述、蒙特雷巨藻床标本、鱼体及鳍形态' },
      { url: 'https://aquarium.org/animals/blue-rockfish/',
        label: 'Oregon Coast Aquarium：蓝岩鱼群集与近岸岩礁、巨藻水层栖息；旧分布栏不作为本场地域依据' },
      { url: 'https://spo.nmfs.noaa.gov/sites/default/files/pdf-content/1978/761/love.pdf',
        label: 'Love与Ebeling（1978），NOAA Fishery Bulletin：历史blue-rockfish林冠食物研究；早于分类拆分，非本场蒙特雷测量' },
      { url: 'https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0098976',
        label: 'Green等（2014），PLOS ONE：Carmel Bay历史blue-rockfish昼夜垂直活动；早于分类拆分，仅支持定性光响应，不校准本场阈值或迁层' },
    ],
  }),
]);

export const kelpWaterSpeciesById = Object.freeze(Object.fromEntries(
  kelpWaterSpeciesCatalog.map(species => [species.id, species])));
