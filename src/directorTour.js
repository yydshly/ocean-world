import { DEMO_ACTIONS, DEMO_LIVING_STOPS } from './demoCapabilities.js';

const actions = new Map(DEMO_ACTIONS.map(action => [action.id, action]));
const step = (id, title, caption, actionId, durationMs) => Object.freeze({
  id, title, caption, action: actions.get(actionId), durationMs,
});
const layers = (biome, labels) => [
  step(`${biome}-bed`, labels[0], '在当前水平位置切换观察高度；海床、生境和群落保持原状。', 'layer-bed', 6000),
  step(`${biome}-midwater`, labels[1], '观察同一海域的垂直空间，动物是否出现取决于实际活体分布。', 'layer-midwater', 6000),
  step(`${biome}-surface`, labels[2], biome === 'deep'
    ? '这是深海观察器上方的观察高度，并非抵达海面。'
    : '观察巨藻上部和周围水域；这次切换不移动到另一个海域。', 'layer-surface', 6000),
];

// Every action goes through the same native entry dispatcher as the capability
// overview. Route stops are explicit observation jumps, never simulated travel.
// Time below is viewing time; asynchronous world loading does not consume it.
export const DIRECTOR_STEPS = Object.freeze([
  step('shallows-opening', '新浅海：先看整体', '从连续海床开始，观察礁群、海草床和沙道；沿用当前世界的实际存档。', 'world-living-shallows', 10000),
  ...DEMO_LIVING_STOPS.map(stop => step(`shallows-${stop.id}`, stop.title,
    `观察点直达：${stop.description}。切换完成后再开始计时；地貌以当前实际海床为准。`, stop.action.id, 6000)),
  step('shallows-life', '浅海：附近的真实生物', '寻找当前已加载海域中的活体；若附近没有可观察动物，会如实说明并继续演示。', 'current-local-life', 10000),
  step('shallows-discoveries', '浅海：沉木与沉底瓶', '查看当前世界的实际发现记录；只有进入近距观察范围才会形成发现，不自动添加记录。', 'living-discoveries', 8000),
  step('legacy-opening', '原浅礁：固定礁区', '切换到原浅礁世界，观察既有珊瑚、鱼群与岩隙。', 'world-legacy-reef', 10000),
  step('legacy-wide', '原浅礁：全景入口', '回到固定礁区全景，查看这个入口实际提供的场景。', 'legacy-wide', 6000),
  step('legacy-skeleton', '原浅礁：珊瑚骨架', '通过原有骨架入口观察模型；模型完成加载后才开始停留计时。', 'legacy-skeleton', 8000),
  step('kelp-opening', '海带林：进入连续探索', '进入巨藻岩底与林间空地；海带附着在适合的硬质基底上，动物沿用实际群落。', 'world-kelp', 10000),
  ...layers('kelp', ['海带林：林底', '海带林：藻间水层', '海带林：上部水域']),
  step('kelp-life', '海带林：附近的真实动物', '从当前加载区域寻找活体，展示动物所在的生活空间；稀疏或缺席不会触发补种。', 'current-local-life', 10000),
  step('deep-opening', '深海：软底与观察器照明', '进入连续深海探索，观察沉积平原、缓坡与岩露头，以及当前实际软底群落。', 'world-deep', 10000),
  ...layers('deep', ['深海：近底观察', '深海：离底观察', '深海：上方观察']),
  step('deep-life', '深海：附近的真实动物', '寻找当前深海中的真实活体；只有实际存在时才会聚焦，不保证所有动物同框出现。', 'current-local-life', 10000),
  step('tools-return', '回到浅海：查看现有工具', '返回新浅海的入口观察点，依次演示图鉴、环境读数、记录和独立实验工作台。', 'world-living-shallows', 8000),
  step('tools-catalog', '生物图鉴', '查看当前海域的物种资料与可观察活体；目录中的物种不代表此刻都在附近。', 'current-catalog', 8000),
  step('tools-environment', '环境实验入口', '展示当前光照、水流、资源和生态读数；导演演示不会自动修改环境参数。', 'current-science', 8000),
  step('tools-journal', '探索手记', '展示当前浏览器保存的观察点；演示不会自动标记、覆盖或删除手记。', 'current-journal', 8000),
  step('tools-foodweb', '独立实验：食物网对照', '这是独立的功能群模型，用于比较资源与物质账本；结果不等于当前三维世界的种群。', 'population-foodweb', 8000),
  step('tools-age', '独立实验：年龄结构', '展示独立种群模型的年龄结构和长期变化；工作台计算同种子对照，不改写三维海域中的动物。', 'population-age', 10000),
  step('tools-capture', '截图、录像与导出', '演示捕捉入口和实际可用按钮；下载或录像由你点击启动，导演不会自动录制。', 'capture-guide', 8000),
]);

export function createDirectorState() {
  return { active: false, index: 0, phase: 'idle', playing: false, elapsedMs: 0, token: 0, error: null };
}

const validIndex = index => Number.isInteger(index) && index >= 0 && index < DIRECTOR_STEPS.length;
const matches = (state, event) => state.active && event.token === state.token;
const loadStep = (state, index, playing = state.playing) => ({
  ...state, active: true, index, phase: 'loading', playing, elapsedMs: 0, token: state.token + 1, error: null,
});
const complete = state => ({
  ...state, active: false, phase: 'complete', playing: false, token: state.token + 1, error: null,
});
const advance = state => state.index + 1 < DIRECTOR_STEPS.length
  ? loadStep(state, state.index + 1) : complete(state);

/** A callback must carry the token of the step that created it. This lets a
 * late load, failure, or timer from an old step harmlessly settle after seek,
 * restart, or stop. Pausing can still allow the current load to complete. */
export function directorReducer(state, event) {
  if (!event || typeof event.type !== 'string') return state;
  switch (event.type) {
    case 'start':
      return loadStep(state, validIndex(event.index) ? event.index : 0, true);
    case 'entered':
      if (!matches(state, event) || state.phase !== 'loading' || state.error) return state;
      return { ...state, phase: 'showing', elapsedMs: 0 };
    case 'failed':
      if (!matches(state, event)) return state;
      return { ...state, playing: false, error: String(event.error?.message || event.error || '当前入口未完成加载，可重试或跳到下一步。') };
    case 'pause':
      return state.active && state.playing ? { ...state, playing: false } : state;
    case 'resume':
      if (!state.active) return state;
      return state.error ? loadStep(state, state.index, true) : { ...state, playing: true };
    case 'next':
      return state.active ? advance(state) : state;
    case 'prev':
      return state.active ? loadStep(state, Math.max(0, state.index - 1)) : state;
    case 'seek':
      return state.active && validIndex(event.index) ? loadStep(state, event.index) : state;
    case 'tick': {
      if (!matches(state, event) || state.phase !== 'showing' || !state.playing || state.error
        || !Number.isFinite(event.deltaMs) || event.deltaMs <= 0) return state;
      const elapsedMs = Math.min(DIRECTOR_STEPS[state.index].durationMs, state.elapsedMs + event.deltaMs);
      const nextState = { ...state, elapsedMs };
      // A slow tab can complete this step, but cannot consume viewing time for
      // the next scene before that scene has actually finished loading.
      return elapsedMs >= DIRECTOR_STEPS[state.index].durationMs ? advance(nextState) : nextState;
    }
    case 'stop':
      return { ...createDirectorState(), token: state.token + 1 };
    case 'finish':
      return state.active && (event.token === undefined || event.token === state.token) ? complete(state) : state;
    default:
      return state;
  }
}
