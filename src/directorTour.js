import { DEMO_ACTIONS, DEMO_LIVING_STOPS, DEMO_KELP_STOPS, DEMO_DEEP_STOPS } from './demoCapabilities.js';
import { isDirectorPlaybackRate } from './directorCameraMotion.js';

export { DIRECTOR_PLAYBACK_RATES } from './directorCameraMotion.js';

const actions = new Map(DEMO_ACTIONS.map(action => [action.id, action]));
const livingStops = new Map(DEMO_LIVING_STOPS.map(stop => [stop.id, stop]));
// The capability list retains its familiar button order. The director visits
// the existing geographic stops from its opening area back towards the reef.
const livingStopOrder = ['shoal-life-community', 'meadow-life-community', 'biodiversity-reef', 'benthic-community', 'shallow-scene-reef', 'shallow-scene-sand', 'shallow-scene-meadow', 'shallow-scene-slope',
  'habitat-belt-reef', 'habitat-belt-meadow', 'seascape-transition', 'connected-seascape',
  'shelf-rise', 'sand-basin', 'patch-reef', 'meadow-edge', 'ridge-gully', 'outer-reef',
  'seagrass-meadow', 'sand-channel', 'reef-garden'];
const openingEntryStops = Object.freeze({ 'shallows-opening': 'shallow-scene-reef',
  'kelp-opening': 'kelp-scene-forest', 'deep-opening': 'deep-scene-plain' });
const step = (id, title, caption, actionId, durationMs, motionKind = 'walk', routeId = null) => Object.freeze({
  id, title, caption, action: actions.get(actionId), durationMs,
  motion: Object.freeze({ kind: motionKind, durationSec: durationMs / 1000, ...(routeId?{routeId}:{}) }),
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
  const entryStopId = item.motion?.routeId === 'living-visual' ? 'habitat-belt-reef' : openingEntryStops[item.id];
  return Object.freeze({ ...item.action, ...item.context,
    ...(entryStopId ? { entryStopId } : {}) });
}

// Every action goes through the same native entry dispatcher as the capability
// overview. Route stops are explicit observation jumps, never simulated travel.
// After the real entry becomes ready, motion drives a bounded local walkthrough.
// Independent worlds and distant stop jumps are not one geographic journey.
// Time below is moving observation time; asynchronous loading does not consume it.
export const DIRECTOR_STEPS = Object.freeze(withStepContexts([
  step('shallows-opening', '新浅海：先看整体', '从浅海整景的礁群起步，再观察砂道、宽草床和外礁坡。', 'world-living-shallows', 14000),
  step('shallows-life', '浅海：附近的真实生物', '在群落周围巡游，观察生物的运动与生活空间。', 'current-local-life', 14000, 'follow'),
  step('shallows-discoveries', '浅海：沉木与沉底瓶', '沿海床寻找沉木与沉底瓶，查看途中留下的发现记录。', 'living-discoveries', 12000),
  ...livingStopOrder.map(id => {
    const stop = livingStops.get(id);
    if (!stop) throw new TypeError(`Missing director observation stop: ${id}`);
    return step(`shallows-${stop.id}`, stop.title,
      `${stop.description}。${id==='shoal-life-community'?'镜头在实际鱼群水层缓慢推进，转看同伴和巡游动物。':'镜头沿海床缓慢前进，转向观察周围生境。'}`, stop.action.id,
      id==='shoal-life-community'?16000:id==='meadow-life-community'?14000:12000, 'walk', id==='shoal-life-community'?'shoal-life':id==='meadow-life-community'?'meadow-life':null);
  }),
  step('legacy-opening', '原浅礁：固定礁区', '在珊瑚、鱼群与岩隙之间缓行，观察原礁区的整体关系。', 'world-legacy-reef', 14000),
  step('legacy-wide', '原浅礁：全景入口', '绕礁群缓慢转看，留意开放水域与岩面的层次。', 'legacy-wide', 12000, 'orbit'),
  step('legacy-skeleton', '原浅礁：珊瑚骨架', '环绕珊瑚骨架，观察枝群的轮廓与结构。', 'legacy-skeleton', 12000, 'orbit'),
  step('kelp-opening', '巨藻整景：先看整体', '从高冠藻群起步，依次观察岩底、沉积开口和开放林缘。', 'world-kelp', 14000),
  ...['kelp-scene-forest','kelp-scene-rockbed','kelp-scene-opening','kelp-scene-outer'].map(id=>{
    const stop=DEMO_KELP_STOPS.find(row=>row.id===id);
    return step(`kelp-${id}`,stop.title,`${stop.description}。沿海床缓行，转看周围的整体生境。`,stop.action.id,12000);
  }),
  step('kelp-understory-life', '巨藻林：林下附着群落', '镜头穿行真实岩面群落，观察林下藻丛、珊瑚藻、海绵和海鞘构成的层次。', 'stop-kelp-understory-life', 16000, 'walk', 'kelp-understory-life'),
  step('kelp-near-bottom-life', '巨藻林：岩沙底层群落', '镜头沿真实海床缓行，观察红岩蟹爬行、近底鱼与角鲨游动，以及沙底圆盘鳐的觅食空间。', 'stop-kelp-near-bottom-life', 16000, 'walk', 'kelp-near-bottom-life'),
  step('kelp-water-life', '巨藻林：林缘水层群落', '穿行实际鱼群的水层，观察竹荚鱼共同转向、乌贼缓游与海荨麻漂游，再留意岩藻旁的取食者。', 'stop-kelp-water-life', 16000, 'walk', 'kelp-water-life'),
  step('kelp-bottom-life', '巨藻林：林底新群落', '沿岩底缓行，寻找当地实际生成的红鲍、藻蟹、海兔和附着海葵。', 'stop-kelp-bottom-life', 14000, 'walk', 'kelp-benthic-life'),
  step('kelp-forest-belt', '林缘生活带：巨藻群', '沿硬底巨藻群缓行，观察高冠、林下低冠和真实动物。', 'stop-forest-belt-interior', 14000),
  step('kelp-forest-opening', '林缘生活带：开放沙地', '在相邻的天然沉积空隙移动，回望巨藻林缘与上方水域。', 'stop-forest-belt-opening', 12000),
  ...layers('kelp', ['海带林：林底', '海带林：藻间水层', '海带林：上部水域']),
  step('kelp-life', '海带林：附近的真实动物', '在林下群落周围巡游，留意动物与藻体之间的生活空间。', 'current-local-life', 14000, 'follow'),
  step('deep-opening', '深海整景：先看整体', '观察器从沉积平原起步，灯光依次扫过宽缓坡、岩露头和开放海床。', 'world-deep', 14000),
  ...['deep-scene-plain','deep-scene-slope','deep-scene-outcrop','deep-scene-outer'].map(id=>{
    const stop=DEMO_DEEP_STOPS.find(row=>row.id===id);
    return step(`deep-${id}`,stop.title,`${stop.description}。沿实际海床缓行，观察周围整体环境。`,stop.action.id,12000);
  }),
  step('deep-water-life', '深海：近底游泳群落', '镜头沿实际生活空间缓行，观察长体鱼与带鳍章鱼的近底游动和真实食物接触。', 'stop-deep-water-life', 16000, 'walk', 'deep-water-life'),
  step('deep-hard-life', '深海：岩附着群落', '镜头沿实际岩露头缓行，观察海百合与黑珊瑚的完整附着形态和悬浮摄食空间。', 'stop-deep-hard-life', 14000, 'walk', 'deep-hard-life'),
  step('deep-bottom-life', '深海：软底新群落', '镜头沿实际软泥底缓行，观察当地新增动物及其摄食生活空间。', 'stop-deep-bottom-life', 14000, 'walk', 'deep-benthic-life'),
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
  return { active: false, index: 0, phase: 'idle', playing: false, elapsedMs: 0, token: 0, error: null, playbackRate: 1, completedStepIds: [], transition: { phase: 'none', kind: null, opacity: 0, elapsedMs: 0, durationMs: 0 } };
}

const validIndex = index => Number.isInteger(index) && index >= 0 && index < DIRECTOR_STEPS.length;
const matches = (state, event) => state.active && event.token === state.token;
const loadStep = (state, index, playing = state.playing) => ({
  ...state, active: true, index, phase: 'loading', playing, elapsedMs: 0, token: state.token + 1, error: null,
  transition: { ...state.transition, phase: state.transition?.opacity > 0 ? 'out' : 'none' },
});
const complete = state => ({
  ...state, active: false, phase: 'complete', playing: false, token: state.token + 1, error: null,
  transition: { phase: 'none', kind: null, opacity: 0, elapsedMs: 0, durationMs: 0 },
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
    case 'transition-stage': {
      if (!matches(state, event) || state.phase !== 'loading' || state.error ||
          !['none', 'out', 'covered', 'in', 'move'].includes(event.phase) ||
          !['nearby', 'reposition', 'cross-world'].includes(event.kind)) return state;
      const opacity = Math.max(0, Math.min(1, state.transition?.opacity ?? 0));
      const animated = event.phase === 'out' || event.phase === 'in';
      const duration = Number.isFinite(event.durationMs) ? Math.max(0, Math.min(2000, event.durationMs)) : 480;
      return { ...state, transition: { phase: event.phase, kind: event.kind, token: event.token, elapsedMs: 0,
        startOpacity: opacity, opacity: event.phase === 'covered' ? 1 : animated ? opacity : 0,
        durationMs: animated ? duration * (event.phase === 'out' ? 1 - opacity : opacity) : 0 } };
    }
    case 'transition-tick': {
      const transition = state.transition;
      if (!matches(state, event) || !state.playing || state.error || !['out', 'in'].includes(transition?.phase) ||
          !Number.isFinite(event.deltaMs) || event.deltaMs <= 0) return state;
      const elapsedMs = Math.min(transition.durationMs, transition.elapsedMs + event.deltaMs);
      const progress = transition.durationMs > 0 ? elapsedMs / transition.durationMs : 1;
      const eased = progress * progress * (3 - 2 * progress);
      const end = transition.phase === 'out' ? 1 : 0;
      return { ...state, transition: { ...transition, elapsedMs,
        opacity: transition.startOpacity + (end - transition.startOpacity) * eased,
        phase: progress === 1 ? transition.phase === 'out' ? 'covered' : 'none' : transition.phase } };
    }
    case 'set-rate':
      return isDirectorPlaybackRate(event.playbackRate) && event.playbackRate !== state.playbackRate
        ? { ...state, playbackRate: event.playbackRate } : state;
    case 'start':
      return loadStep({ ...state, completedStepIds: [] }, validIndex(event.index) ? event.index : 0, true);
    case 'entered':
      if (!matches(state, event) || state.phase !== 'loading' || state.error || state.transition?.phase !== 'none' || state.transition?.opacity > 0) return state;
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
