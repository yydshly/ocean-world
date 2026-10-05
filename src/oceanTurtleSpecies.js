export const oceanTurtleSpeciesCatalog = Object.freeze([Object.freeze({
  id: 'green-turtle', commonName: '绿海龟', scientificName: 'Chelonia mydas', kind: 'turtle', guild: 'herbivore',
  lengthM: 1.375, sizeMeasure: 'total-length', regionalOnly: true, colors: ['#665b3a', '#b8ad83'],
  description: '温暖浅海岸、海草床与礁区的海龟代表，以椭圆略拱的甲壳和四枚鳍肢缓慢游动。此模型总长1.25～1.5米，尺寸与数量为未校准展示参数。',
  diet: '成体常摄取海草和藻类；本轮尚未接入摄食，景观海草没有可消耗的库存。',
  behavior: '在真实草床上方作本格内巡游，按有限间隔上浮，将固定鼻端参考点带到名义水面，短暂停留后下潜至原水层。间隔、速度和停留时长为展示参数，未模拟氧气、生理、代谢、繁殖或远洋迁徙；未加载区保存并冻结。',
  sources: [{ url: 'https://www.fisheries.noaa.gov/species/green-turtle', label: 'NOAA Fisheries：绿海龟生境、食性、外形与水面呼吸' },
    { url: 'https://www.gbrmpa.gov.au/learn/animals/marine-turtles', label: '大堡礁海洋公园：海龟与草床、礁区' }],
})]);
