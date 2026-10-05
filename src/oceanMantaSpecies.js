// A separate regional representative; the authored reef catalog and original
// population stay intact. sizeM measures disc width rather than head-to-tail length.
export const oceanMantaSpeciesCatalog = Object.freeze([
  Object.freeze({
    id: 'reef-manta', commonName: '礁蝠鲼', scientificName: 'Mobula alfredi',
    kind: 'ray', guild: 'planktivore', lengthM: 3.15, discWidthM: 3.15,
    sizeMeasure: 'disc-width', regionalOnly: true,
    colors: ['#333b40', '#b9bab0', '#101a20'],
    description: '印度洋—西太平洋热带和亚热带礁区的大型滤食鳐类。展翅滑游，以宽阔胸鳍推进；本场个体盘宽约3.0–3.3米，盘宽是两侧胸鳍之间的宽度。',
    diet: '浮游动物；摄食会扣除当地浮游参考资源池，资源不足时仅巡游。',
    behavior: '在适宜礁体旁较开阔的水层偶见单个代表个体，以胸鳍缓慢摆动推进，随当地浮游参考资源变化在巡游和滤食之间切换。出现概率、数量、速度、深度和摄食阈值是未校准模型参数；可在已加载的相邻分区间漫游，个体时钟、身份与摄食历史随身保留，随后摄食扣除到达海域的资源；未加载区冻结。遇到阻挡时尝试邻近安全方向并短暂保持转向，这是一种局部避让近似。漫游路线不代表真实季节迁徙。未模拟滚翻滤食、繁殖或完整身体碰撞。',
    sources: [{ url: 'https://www.mantatrust.org/mobula-alfredi',
      label: 'Manta Trust：礁蝠鲼分布、浮游动物食性与平均盘宽' },
    { url: 'https://fishesofaustralia.net.au/home/species/2738',
      label: 'Museums Victoria：礁区栖息、头鳍导流、滤食与自然迁徙' },
    { url: 'https://research.mantatrust.org/armstrong-et-al-2021',
      label: 'Armstrong等（2021）：马尔代夫高密度浮游动物斑块与滤食活动' }],
  }),
]);
export const oceanMantaSpeciesById = Object.freeze(Object.fromEntries(
  oceanMantaSpeciesCatalog.map(species => [species.id, species])));
