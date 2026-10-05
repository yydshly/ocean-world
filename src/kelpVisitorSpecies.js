// Regional visitors are kept separate from the original authored kelp roster.
// Size, motion and sparse allocation are illustrative model choices, not a
// measured Monterey population or a calibrated migration/food-web model.
export const kelpVisitorSpeciesCatalog = Object.freeze([
  Object.freeze({
    id: 'leopard-shark', commonName: '豹鲨', scientificName: 'Triakis semifasciata',
    identityLevel: 'species', kind: 'fish', guild: 'near-bottom-visitor',
    lengthM: 1.35, sizeMeasure: 'total-length', regionalOnly: true,
    displaySizeM: { range: [1.2, 1.5], measure: 'total-length', status: 'illustrative-selection' },
    colors: ['#989987', '#bfc2b6', '#454d45'],
    description: '蒙特雷巨藻林周边偶见的近底巡游代表。细长银铜色身体，背部一列深色椭圆鞍斑，两枚背鳍、三角胸鳍和长而不对称的尾鳍，口部位于头部腹面。本场选用1.2至1.5米总长，比例与斑纹为依据资料制作的简化轮廓。',
    diet: '自然食谱包含底栖无脊椎动物、鱼卵和鱼；本轮仅表现巡游，未接入摄食或能量代谢。',
    behavior: '在浅水林缘与开阔海床上方稀疏巡游，随实际海床起伏并绕开固体和有限藻株包络。在当前已加载海域内巡游；未加载海域暂停。数量、速度和转向均未校准；未模拟繁殖、潮汐迁移、完整流体力学或食物网。',
    sources: [
      { url: 'https://www.montereybayaquarium.org/animals-the-ocean/animals-a-to-z/leopard-shark',
        label: 'Monterey Bay Aquarium：Triakis semifasciata形态、总长、浅水近底与巨藻林巡游及自然食谱' },
      { url: 'https://sanctuaries.noaa.gov/pgallery/pgmonterey/living/living_11.html',
        label: 'NOAA Monterey Bay National Marine Sanctuary：蒙特雷巨藻林中的豹鲨' },
    ],
  }),
]);

export const kelpVisitorSpeciesById = Object.freeze(Object.fromEntries(
  kelpVisitorSpeciesCatalog.map(species => [species.id, species])));
