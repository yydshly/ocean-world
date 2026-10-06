import { DEMO_ACTIONS, DEMO_LIVING_STOPS } from './demoCapabilities.js';
import { isDirectorPlaybackRate } from './directorCameraMotion.js';

export { DIRECTOR_PLAYBACK_RATES } from './directorCameraMotion.js';

const actions = new Map(DEMO_ACTIONS.map(action => [action.id, action]));
const step = (id, title, caption, actionId, durationMs, motionKind = 'walk') => Object.freeze({
  id, title, caption, action: actions.get(actionId), durationMs,
  motion: Object.freeze({ kind: motionKind, durationSec: durationMs / 1000 }),
});
const layers = (biome, labels) => [
  step(`${biome}-bed`, labels[0], '镜头缓慢下降，靠近海床观察起伏与近底生活空间。', 'layer-bed', 12000),
  step(`${biome}-midwater`, labels[1], '镜头缓慢升起，观察水层中的动物与周围空间。', 'layer-midwater', 12000),
  step(`${biome}-surface`, labels[2], biome === 'deep'
    ? '镜头升至海床上方，俯看灯光中的沉积地形。'
    : '镜头向巨藻上部升起，观察藻冠与开放水域。', 'layer-surface', 12000),
];

function withStepContexts(steps) {
  let context = null;
  return steps.map(item => {
    if (['world', 'living-stop', 'kelp-stop', 'deep-stop'].includes(item.action.kind)) {
      context = Object.freeze({ biome: item.action.biome,
        ...(item.action.biome === 'reef' ? { profile: item.action.profile } : {}) });
    }
    if (!context) throw new TypeError('A director chapter requires an explicit world context.');
    return Object.freeze({ ...item, context });
  });
}

// A direct chapter seek must enter its own world even when the native action
// normally operates on the current one. Keep the native action reference on
// the step; the dispatcher receives this explicit contextual copy instead.
export function directorStepAction(item) {
  if (!item?.action || !item?.context) throw new TypeError('A director action requires its chapter context.');
  return Object.freeze({ ...item.action, ...item.context });
}

// Every action goes through the same native entry dispatcher as the capability
// overview. Route stops are explicit observation jumps, never simulated travel.
// After the real entry becomes ready, motion drives a bounded local walkthrough.
// Independent worlds and distant stop jumps are not one geographic journey.
// Time below is moving observation time; asynchronous loading does not consume it.
export const DIRECTOR_STEPS = Object.freeze(withStepContexts([
  step('shallows-opening', '新浅海：先看整体', '先看礁群、草床与沙道。依次巡游各观察点，跨海域时切换场景。', 'world-living-shallows', 14000),
  ...DEMO_LIVING_STOPS.map(stop => step(`shallows-${stop.id}`, stop.title,
    `${stop.description}。镜头沿海床缓慢前进，转向观察周围生境。`, stop.action.id, 12000)),
  step('shallows-life', '浅海：附近的真实生物', '在群落周围巡游，观察生物的运动与生活空间。', 'current-local-life', 14000, 'follow'),
  step('shallows-discoveries', '浅海：沉木与沉底瓶', '沿海床寻找沉木与沉底瓶，查看途中留下的发现记录。', 'living-discoveries', 12000),
  step('legacy-opening', '原浅礁：固定礁区', '在珊瑚、鱼群与岩隙之间缓行，观察原礁区的整体关系。', 'world-legacy-reef', 14000),
  step('legacy-wide', '原浅礁：全景入口', '绕礁群缓慢转看，留意开放水域与岩面的层次。', 'legacy-wide', 12000, 'orbit'),
  step('legacy-skeleton', '原浅礁：珊瑚骨架', '环绕珊瑚骨架，观察枝群的轮廓与结构。', 'legacy-skeleton', 12000, 'orbit'),
  step('kelp-opening', '海带林：进入连续探索', '在巨藻岩底与林间空地缓行，观察林下、藻间和冠层。', 'world-kelp', 14000),
  step('kelp-forest-belt', '林缘生活带：巨藻群', '沿硬底巨藻群缓行，观察高冠、林下低冠和真实动物。', 'stop-forest-belt-interior', 14000),
  step('kelp-forest-opening', '林缘生活带：开放沙地', '在相邻的天然沉积空隙移动，回望巨藻林缘与上方水域。', 'stop-forest-belt-opening', 12000),
  ...layers('kelp', ['海带林：林底', '海带林：藻间水层', '海带林：上部水域']),
  step('kelp-life', '海带林：附近的真实动物', '在林下群落周围巡游，留意动物与藻体之间的生活空间。', 'current-local-life', 14000, 'follow'),
  step('deep-opening', '深海：软底与观察器照明', '观察器沿软底缓行，灯光扫过沉积平原、缓坡和岩露头。', 'world-deep', 14000),
  step('deep-plain-belt', '深海生活带：沉积平原', '沿软泥底缓行，观察实际底栖生命、近底鱼与食物活动。', 'stop-deep-plain-community', 14000),
  step('deep-outcrop-belt', '深海生活带：缓坡岩露头', '灯光随镜头扫过宽缓坡和稀疏岩露头，观察周围生活空间。', 'stop-deep-slope-outcrop', 12000),
  ...layers('deep', ['深海：近底观察', '深海：离底观察', '深海：上方观察']),
  step('deep-life', '深海：附近的真实动物', '沿深海群落缓慢移动，观察近底活动与觅食空间。', 'current-local-life', 14000, 'follow'),
  step('tools-return', '回到浅海：查看现有工具', '回到浅海巡游，接着查看图鉴、环境、记录与实验工具。', 'world-living-shallows', 12000),
  step('tools-catalog', '生物图鉴', '认识当前海域的生物，查看物种资料与附近可观察的活体。', 'current-catalog', 8000),
  step('tools-environment', '环境实验入口', '查看光照、水流、资源与生态读数，探索环境与生物活动的联系。', 'current-science', 8000),
  step('tools-journal', '探索手记', '记下喜欢的观察点，回访途中发现的生活空间。', 'current-journal', 8000),
  step('tools-foodweb', '独立实验：食物网对照', '用独立食物网模型比较基线与干预，查看资源变化和物质账本。', 'population-foodweb', 8000),
  step('tools-age', '独立实验：年龄结构', '用独立种群模型观察年龄结构与长期变化。', 'population-age', 8000),
  step('tools-capture', '截图、录像与导出', '保存观察画面，录制一段巡游，或导出当前实验数据。', 'capture-guide', 8000),
]));

export function createDirectorState() {
  return { active: false, index: 0, phase: 'idle', playing: false, elapsedMs: 0, token: 0, error: null, playbackRate: 1, completedStepIds: [] };
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
const recordComplete = state => {
  const id = DIRECTOR_STEPS[state.index].id;
  return state.completedStepIds.includes(id) ? state
    : { ...state, completedStepIds: [...state.completedStepIds, id] };
};

/** A callback must carry the token of the step that created it. This lets a
 * late load, failure, or timer from an old step harmlessly settle after seek,
 * restart, or stop. Pausing can still allow the current load to complete. */
export function directorReducer(state, event) {
  if (!event || typeof event.type !== 'string') return state;
  switch (event.type) {
    case 'set-rate':
      return isDirectorPlaybackRate(event.playbackRate) && event.playbackRate !== state.playbackRate
        ? { ...state, playbackRate: event.playbackRate } : state;
    case 'start':
      return loadStep({ ...state, completedStepIds: [] }, validIndex(event.index) ? event.index : 0, true);
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
    case 'record-complete':
      // The native shot owner verifies completion before releasing the camera.
      // This receipt records coverage without advancing or inventing shot time.
      return matches(state, event) && state.phase === 'showing' && !state.error
        ? recordComplete(state) : state;
    case 'tick': {
      if (!matches(state, event) || state.phase !== 'showing' || !state.playing || state.error
        || !Number.isFinite(event.deltaMs) || event.deltaMs <= 0) return state;
      const elapsedMs = Math.min(DIRECTOR_STEPS[state.index].durationMs, state.elapsedMs + event.deltaMs);
      const nextState = { ...state, elapsedMs };
      // A slow tab can complete this step, but cannot consume viewing time for
      // the next scene before that scene has actually finished loading.
      return elapsedMs >= DIRECTOR_STEPS[state.index].durationMs ? advance(recordComplete(nextState)) : nextState;
    }
    case 'stop':
      return { ...createDirectorState(), token: state.token + 1, playbackRate: state.playbackRate,
        completedStepIds: state.completedStepIds };
    case 'finish':
      return state.active && (event.token === undefined || event.token === state.token) ? complete(state) : state;
    default:
      return state;
  }
}
