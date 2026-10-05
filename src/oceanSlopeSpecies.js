// A separate regional catalog: adding an outer-slope representative must not
// change the authored shallow reef's species order, counts or initial animals.
export const oceanSlopeSpeciesCatalog = Object.freeze([
  Object.freeze({
    id: 'lyretail-anthias', commonName: '海金鱼类群',
    scientificName: 'Pseudanthias squamipinnis s.l.', kind: 'fish', guild: 'planktivore', lengthM: .065, regionalOnly: true,
    colors: ['#ce8846', '#dfb171', '#b16a44'],
    nameNote: '传统海金鱼类群代表；印度洋与太平洋种界存在分类意见差异，部分资料将太平洋成员称为 P. cheirospilos。',
    description: '在外礁坡的礁体上方群聚的小型浮游摄食鱼。本场采用金橙色雌鱼外观与约6.5厘米的展示个体。',
    diet: '水层中的浮游动物；摄食消耗当地浮游参考资源池。',
    behavior: '礁面上方保持同伴间距并缓慢转向；低光时靠近当地礁面休息。未模拟性别转换、繁殖或社会等级。',
    sources: [{ url: 'https://fishesofaustralia.net.au/home/species/4402',
      label: 'Museums Victoria：外礁坡群聚、浮游食性、1–55米分布及类群命名边界' }],
  }),
]);
export const oceanSlopeSpeciesById = Object.freeze(Object.fromEntries(
  oceanSlopeSpeciesCatalog.map(species => [species.id, species])));
