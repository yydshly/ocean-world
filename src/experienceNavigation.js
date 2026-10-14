export const EXPERIENCE_GROUPS = Object.freeze([
  Object.freeze({
    id: 'watch', title: '观看主线',
    detail: '当前浅海主线、鱼群演示与历史样板。',
    entries: Object.freeze([
      Object.freeze({ id: 'primer', title: '第一次认识海洋', detail: '7分30秒 · 海面、浅海、鲸豚与深海，带中文讲解', demo: 'ocean-primer' }),
      Object.freeze({ id: 'journey', title: '4分钟浅海体验', detail: '推荐主线 · 鱼群 → 礁谷 → 沙道 → 草床', demo: 'shallow-journey' }),
      Object.freeze({ id: 'school', title: '60秒鱼群协同', detail: '同一浅海 · 分流、汇合、散开与聚群', demo: 'shallow-journey', school: '1' }),
      Object.freeze({ id: 'sample', title: '75秒历史样板', detail: '早期冻结路线 · 与当前主线范围不同', demo: 'shallow-sample' }),
    ]),
  }),
  Object.freeze({
    id: 'explore', title: '研究与范围探索',
    detail: '使用持续世界；区域需要单独准备，验收范围与主线不同。',
    entries: Object.freeze([
      Object.freeze({ id: 'all', title: '能力总览', detail: '查看观察工具与各专题入口', demo: 'all' }),
      Object.freeze({ id: 'director', title: '导演模式', detail: '研究入口 · 可选章与变速，跨区可能等待', demo: 'director' }),
      Object.freeze({ id: 'life', title: '生命巡游', detail: '研究路线 · 4分钟观察，区域准备另计', demo: 'life-expedition', world: 'whole-seabed' }),
      Object.freeze({ id: 'reef', title: '热带礁谷', detail: '区域入口 · 礁体与动物群落', demo: 'reef-valley-region', world: 'whole-seabed' }),
      Object.freeze({ id: 'meadow', title: '海草草甸', detail: '区域入口 · 草床、沙底与坡面', demo: 'seagrass-meadow-region', world: 'whole-seabed' }),
      Object.freeze({ id: 'kelp', title: '海带林', detail: '研究入口 · 部分旧存档无法恢复，可能卡顿', demo: 'kelp-life' }),
      Object.freeze({ id: 'deep', title: '深海软底', detail: '研究入口 · 底栖群落与照明，可能卡顿', demo: 'deep-life' }),
    ]),
  }),
]);

export const EXPERIENCE_ENTRIES = Object.freeze(EXPERIENCE_GROUPS.flatMap(group => group.entries));

export function experienceHref(id, { base = '/', seed = '55' } = {}) {
  const entry = EXPERIENCE_ENTRIES.find(item => item.id === id);
  if (!entry) throw new RangeError(`Unknown ocean experience: ${id}`);
  const query = new URLSearchParams({ demo: entry.demo, seed: String(seed || '55') });
  if (entry.world) query.set('world', entry.world);
  if (entry.school) query.set('school', entry.school);
  return `${base.replace(/\/?$/, '/')}?${query}`;
}

export function currentExperience(search = '') {
  const query = new URLSearchParams(search);
  if (query.get('demo') === 'shallow-journey') return query.get('school') === '1' ? 'school' : 'journey';
  return EXPERIENCE_ENTRIES.find(entry => entry.demo === query.get('demo'))?.id ?? null;
}
