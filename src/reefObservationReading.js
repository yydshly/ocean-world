// Read-only interpretation of the existing reef model. State is a behaviour
// branch, not proof of food intake; lastFeedAt records successful feed events.
const supported = new Set(['green-chromis', 'lined-tang', 'black-cucumber', 'cleaner-wrasse', 'cleaner-shrimp']);
const food = {
  'green-chromis': ['plankton', '浮游食物'],
  'lined-tang': ['algae', '藻膜'],
  'black-cucumber': ['detritus', '碎屑'],
  'cleaner-shrimp': ['detritus', '碎屑'],
};
const labels = { schooling:'群游与摄食', grazing:'刮食的条件', foraging:'寻找与移动', 'deposit-feeding':'沉积物摄食', cleaning:'清洁互动', fleeing:'撤向庇护处', hiding:'暂时隐蔽', resting:'低光下休息' };
const amount = value => !Number.isFinite(value) ? '未记录' : value > 0 && value < .01 ? value.toExponential(1) : value.toFixed(2);
function feedRecord(agent, now) {
  if (!Number.isFinite(agent.lastFeedAt) || !Number.isFinite(now) || agent.lastFeedAt > now) return '尚无有效采食记录';
  const seconds = Math.max(0, Math.floor(now - agent.lastFeedAt));
  return `上次记录采食：${seconds < 60 ? `${seconds}模拟秒前` : `${Math.floor(seconds / 60)}分${seconds % 60}模拟秒前`}`;
}

export function reefObservationReading(agent, snapshot) {
  if (!agent || snapshot?.biomeId !== 'reef' || !supported.has(agent.speciesId)) return null;
  if (!agent.alive || agent.state === 'dead') return { label:'个体已死亡', explanation:'当前快照不能确定死亡原因，可选择其他活体继续观察。', context:'死亡后的状态不再表示持续摄食。', experiment:null };
  const state = agent.state, id = agent.speciesId;
  let explanation;
  if (state === 'fleeing') explanation = '近期威胁触发撤离后，模型会让它朝珊瑚庇护处转向；威胁离开后也会短暂延续这个状态。';
  else if (state === 'hiding') explanation = id === 'cleaner-shrimp'
    ? '附近捕食者触发隐蔽分支，模型让它退向岩隙口的原位，暂停普通碎屑摄食。'
    : '日照较低时，模型让鱼靠近珊瑚庇护点，暂停普通摄食并降低游动速度。';
  else if (state === 'resting') explanation = '日照较低时，它朝庇护点移动或休息，不执行白天的普通摄食分支。';
  else if (state === 'cleaning') explanation = '合适客户靠近且有寄生负荷时，模型减少客户的寄生状态，并给清洁者补充体能。';
  else if (id === 'cleaner-wrasse') explanation = '它寻找合适的客户鱼，靠近后才进入清洁互动；寻找客户不等于已在清洁。';
  else if (id === 'cleaner-shrimp') explanation = '它在岩隙口移动，并尝试摄取碎屑资源；是否有实际摄入要看采食记录。';
  else if (id === 'black-cucumber') explanation = '它贴沙地缓慢移动，从碎屑资源尝试摄食；本场景没有局部食物斑块寻路。';
  else if (id === 'lined-tang') explanation = state === 'grazing'
    ? '体能较低且接近硬底时，模型允许它刮食藻膜；这个动作状态不保证每次都能摄入资源。'
    : '它沿礁面移动，只有体能较低且接近硬底时才开始刮食藻膜。';
  else explanation = '它参考同伴的方向与间距，同时尝试摄取浮游食物；群游状态不等于每次摄食成功。';
  const current = snapshot.environment?.currentMps;
  const pieces = [`水流 ${Number.isFinite(current) ? `${current.toFixed(2)} m/s` : '未记录'}`];
  const pool = food[id];
  if (pool && state !== 'cleaning') {
    pieces.push(`全礁共享${pool[1]}参考量 ${amount(snapshot.metrics?.[pool[0]])}`);
    pieces.push(feedRecord(agent, snapshot.metrics?.timeSec));
  } else pieces.push('清洁供能来自客户互动，不以藻膜或浮游食物量判断');
  if (snapshot.paused) pieces.push('模拟暂停，状态与记录按模拟时间保持');
  return {
    label: labels[state] || '当前行为线索', explanation, context: pieces.join(' · '),
    experiment: { label:'观察环境变化', hint:'打开环境面板，一次调整一个条件；打开面板不会改变参数。' },
  };
}
