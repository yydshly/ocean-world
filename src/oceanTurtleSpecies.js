export const oceanTurtleSpeciesCatalog = Object.freeze([Object.freeze({
  id: 'green-turtle', commonName: '绿海龟', scientificName: 'Chelonia mydas', kind: 'turtle', guild: 'herbivore',
  lengthM: 1.375, sizeMeasure: 'total-length', regionalOnly: true, colors: ['#665b3a', '#b8ad83'],
  description: '温暖浅海岸、海草床与礁区的海龟代表，以椭圆略拱的甲壳和四枚鳍肢缓慢游动。此模型总长1.25～1.5米，尺寸与数量为未校准展示参数。',
  diet: '成体常摄取海草和藻类。浅海生态海域中，已登记个体接近实际海草叶片参考点后消耗当地代表海草有机库存；未接入藻类食物或逐叶咬断。',
  behavior: '在草床巡游、接近可达海草并短暂取食；上浮将固定鼻端参考点带到名义水面，换气优先于摄食。原浅礁保留巡游与呼吸。路线、速度、取食量和有机收支为未校准展示近似，未模拟生理氧气、繁殖或远洋迁徙；未加载区保存并冻结。',
  sources: [{ url: 'https://www.fisheries.noaa.gov/species/green-turtle', label: 'NOAA Fisheries：绿海龟生境、食性、外形与水面呼吸' },
    { url: 'https://www.gbrmpa.gov.au/learn/animals/marine-turtles', label: '大堡礁海洋公园：海龟与草床、礁区' }],
})]);
