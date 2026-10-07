import { useEffect, useReducer, useRef } from 'react';
import { createDirectorState, directorReducer, DIRECTOR_STEPS, directorStepAction } from './directorTour.js';
import { directorSceneReady } from './directorReadiness.js';
import { isDirectorPlaybackRate } from './directorCameraMotion.js';
import { directorMotionCompletionEvent } from './directorMotionReceipt.js';
import { directorTourProgress } from './directorTourProgress.js';

const worldKey = world => `${world.biomeId}:${world.isLivingShallows ? 'living' : 'original'}`;
const panelAction = action => ['panel', 'population', 'capture'].includes(action.kind);

/** Orchestrates existing entries; it never resets a world or creates animals. */
export function useDirectorTour({ worldRef, snapshot, worldReady, error, execute, recording, paused, speed, onControls, onNotice }) {
  const [state, dispatch] = useReducer(directorReducer, undefined, createDirectorState);
  const current = useRef(state); current.current = state;
  const adapters = useRef(null); adapters.current = { execute, onControls, onNotice };
  const original = useRef(null), waiting = useRef(null), startedToken = useRef(null);
  const restoreArmed = useRef(false);
  const environments = useRef(new Map()), preparedWorlds = useRef(new WeakSet());
  const receipts = useRef([]), autoStarted = useRef(false);
  const motion = useRef(null);
  const valid = token => current.current.active && current.current.token === token;
  const stopMotion = () => {
    motion.current?.world.stopDirectorMotion?.(); motion.current = null;
    waiting.current?.entryWorld?.stopDirectorEntry?.();
  };
  const fail = (token, problem) => { if (valid(token)) { stopMotion(); dispatch({ type: 'failed', token, error: problem }); } };
  const start = (index = 0) => {
    if (recording) { adapters.current.onNotice('请先结束录像，再开始导演演示'); return; }
    stopMotion();
    if (!original.current) original.current = { paused: worldRef.current?.paused ?? paused, speed: worldRef.current?.speed ?? speed };
    receipts.current = []; waiting.current = null; startedToken.current = null;
    restoreArmed.current = false;
    environments.current.clear(); preparedWorlds.current = new WeakSet();
    dispatch({ type: 'start', index });
  };
  const stop = () => { stopMotion(); waiting.current = null; dispatch({ type: 'stop' }); };
  const changeStep = event => { stopMotion(); dispatch(event); };
  const prepareWorld = (world, token) => {
    if (!valid(token) || !world || preparedWorlds.current.has(world)) return;
    const prior = environments.current.get(worldKey(world));
    if (prior) world.setEnvironment(prior);
    preparedWorlds.current.add(world);
  };
  const applied = (token, absence = false) => {
    if (!valid(token) || waiting.current?.token !== token || !waiting.current.executed) return;
    waiting.current.appliedAt = performance.now(); waiting.current.absence = absence;
  };
  const panelReady = token => {
    if (valid(token) && waiting.current?.token === token) waiting.current.panelReady = true;
  };

  useEffect(() => {
    if (autoStarted.current || !worldReady || new URLSearchParams(window.location.search).get('demo') !== 'director') return;
    autoStarted.current = true; start();
  }, [worldReady]);

  useEffect(() => {
    const actual = worldRef.current;
    if (!state.active || !actual || actual.disposed) return;
    const previousTakeover = actual.onDirectorManualTakeover;
    const takeover = () => {
      if (worldRef.current === actual && current.current.active) {
        stop(); adapters.current.onNotice('已切换为自由观察。');
      }
      previousTakeover?.();
    };
    actual.onDirectorManualTakeover = takeover;
    return () => { if (actual.onDirectorManualTakeover === takeover) actual.onDirectorManualTakeover = previousTakeover; };
  }, [state.active, worldReady, snapshot?.runId]);

  useEffect(() => {
    if (!state.active || state.phase !== 'loading' || state.error || startedToken.current === state.token) return;
    const token = state.token, action = directorStepAction(DIRECTOR_STEPS[state.index]);
    startedToken.current = token;
    const previous = worldRef.current;
    stopMotion();
    const sameWorld = previous && !previous.disposed && action.biome === previous.biomeId &&
      (action.biome !== 'reef' || action.profile === (previous.isLivingShallows ? 'living-shallows-v1' : 'legacy'));
    let plan = null;
    try { if (sameWorld && !(state.transition?.opacity > 0) && !['living-visual', 'meadow-life', 'shoal-life', 'kelp-water-life', 'deep-hard-life'].includes(DIRECTOR_STEPS[state.index].motion.routeId))
      plan = previous.planDirectorEntry?.(action); }
    catch (problem) { fail(token, problem); return; }
    const mode = ['keep', 'continuous'].includes(plan?.kind) ? plan.kind : 'cut';
    const kind = mode === 'cut' ? sameWorld ? 'reposition' : 'cross-world' : 'nearby';
    const wait = { token, action, entryWorld: previous, plan, mode, kind, executeReady: false, executed: false,
      appliedAt: null, panelReady: false, absence: false, prepared: false, revealing: false };
    waiting.current = wait;
    const enter = async () => {
      const nativePaused = mode === 'cut' || !current.current.playing;
      adapters.current.onControls(nativePaused, 1);
      try {
        if (previous && !previous.disposed) {
          await previous.setPaused(nativePaused);
          if (!valid(token) || worldRef.current !== previous) return;
          const env = previous.snapshot().environment;
          environments.current.set(worldKey(previous), Object.fromEntries(
            ['currentMps', 'turbidity', 'foodSupply', 'hour', 'observerLight'].filter(key => Number.isFinite(env[key])).map(key => [key, env[key]])));
        }
        if (!valid(token) || waiting.current !== wait) return;
        wait.executeReady = true;
        const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        dispatch({ type: 'transition-stage', token, phase: mode === 'cut' ? 'out' : mode === 'continuous' ? 'move' : 'none',
          kind, durationMs: reduced ? 0 : 480 });
      } catch (problem) { fail(token, problem); }
    };
    enter();
  }, [state.active, state.phase, state.token, state.error]);

  useEffect(() => {
    if (!state.active || state.phase !== 'loading' || state.error) return;
    const wait = waiting.current;
    if (!wait || wait.token !== state.token || !wait.executeReady || wait.executed ||
        (wait.mode === 'cut' && state.transition?.phase !== 'covered')) return;
    wait.executed = true;
    try {
      adapters.current.execute({ ...wait.action, directorToken: state.token,
        ...(wait.mode === 'continuous' ? { directorEntryPlan: wait.plan } : {}) });
    } catch (problem) { fail(state.token, problem); }
  }, [state.active, state.phase, state.token, state.error, state.transition?.phase, state.transition?.token]);

  useEffect(() => {
    if (!state.active || !state.playing || state.error || !['out', 'in'].includes(state.transition?.phase)) return;
    const token = state.token;
    let frame, previousTime = performance.now();
    const advance = now => {
      const deltaMs = Math.max(0, Math.min(100, now - previousTime)); previousTime = now;
      if (!valid(token)) return;
      if (typeof document === 'undefined' || document.visibilityState === 'visible')
        dispatch({ type: 'transition-tick', token, deltaMs: deltaMs * current.current.playbackRate });
      frame = requestAnimationFrame(advance);
    };
    frame = requestAnimationFrame(advance);
    return () => cancelAnimationFrame(frame);
  }, [state.active, state.playing, state.token, state.error, state.transition?.phase]);

  useEffect(() => {
    const wait = waiting.current, actual = worldRef.current;
    if (!state.active || state.phase !== 'loading' || state.error || wait?.mode !== 'continuous' ||
        wait.token !== state.token || actual !== wait.entryWorld) return;
    actual?.setDirectorEntryPlayback?.({ playing: state.playing, playbackRate: state.playbackRate });
  }, [state.active, state.phase, state.token, state.error, state.playing, state.playbackRate,
    worldReady, snapshot?.runId, waiting.current?.appliedAt]);

  useEffect(() => {
    if (!state.active || state.phase !== 'loading' || state.error) return;
    const token = state.token;
    let elapsedMs = 0, previousTime = performance.now();
    const timer = setInterval(() => {
      const now = performance.now(), deltaMs = Math.max(0, now - previousTime); previousTime = now;
      const wait = waiting.current;
      if (!valid(token) || !current.current.playing || !wait?.executed ||
          (typeof document !== 'undefined' && document.visibilityState !== 'visible') ||
          ['out', 'in'].includes(current.current.transition?.phase) ||
          (wait.mode === 'continuous' && worldRef.current?.directorEntrySnapshot?.().active)) return;
      elapsedMs += deltaMs;
      if (elapsedMs >= 45000) fail(token, '这个入口未在 45 秒有效加载时间内就绪。可以重试或跳过。');
    }, 1000);
    return () => clearInterval(timer);
  }, [state.active, state.phase, state.token, state.error]);

  useEffect(() => {
    const wait = waiting.current;
    if (!state.active || state.phase !== 'loading' || state.error || !worldReady || !wait || wait.token !== state.token || wait.appliedAt === null) return;
    const actual = worldRef.current;
    if (wait.mode === 'continuous') {
      if (actual !== wait.entryWorld) { fail(state.token, '镜头衔接所属海域已改变。'); return; }
      const entry = actual.directorEntrySnapshot();
      if (entry.error) { fail(state.token, entry.error); return; }
      if (!entry.kind) { stop(); adapters.current.onNotice('已切换为自由观察。'); return; }
      if (!entry.complete) return;
    }
    if (!directorSceneReady(wait.action, actual, snapshot, { panelReady: wait.panelReady })) return;
    if (wait.mode === 'cut' && !wait.prepared) {
      wait.prepared = true;
      if (['living-visual', 'meadow-life', 'shoal-life', 'kelp-water-life', 'deep-hard-life'].includes(DIRECTOR_STEPS[state.index].motion.routeId)) {
        if (actual.prepareDirectorObservation?.(DIRECTOR_STEPS[state.index].motion) !== true) {
          fail(state.token, '当前观察镜头无法安全就位，可重试或跳到下一章。'); return;
        }
        wait.absence = DIRECTOR_STEPS[state.index].motion.routeId === 'living-visual' && actual.livingVisualRoute?.status === 'empty';
        // Preparing can move into another resident window. Keep full cover
        // until its native nine-owner loading has genuinely completed.
        return;
      }
    }
    if (wait.mode === 'cut' && !wait.revealing) {
      wait.revealing = true;
      const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      dispatch({ type: 'transition-stage', token: state.token, phase: 'in', kind: wait.kind, durationMs: reduced ? 0 : 480 });
      return;
    }
    if (state.transition?.phase === 'move') {
      dispatch({ type: 'transition-stage', token: state.token, phase: 'none', kind: wait.kind }); return;
    }
    if (state.transition?.phase !== 'none' || state.transition?.opacity > 0) return;
    receipts.current = [...receipts.current.slice(-63), {
      step: DIRECTOR_STEPS[state.index].id, action: wait.action.id, token: state.token,
      biome: snapshot.biomeId, profile: snapshot.sceneProfile, chunkId: snapshot.ocean?.chunkId,
      loadingRegions: snapshot.ocean?.ecology?.metrics?.loadingRegions ?? 0,
      alive: snapshot.ocean?.ecology?.metrics?.alive, panelReady: wait.panelReady, absence: wait.absence,
      transitionMode: wait.mode,
    }];
    dispatch({ type: 'entered', token: state.token });
  }, [snapshot, worldReady, state.active, state.phase, state.token, state.error, state.transition?.phase]);

  useEffect(() => {
    // The constructor clears its error on the next render after retry/seek.
    // Re-observing that same old value for a new chapter token would fail the
    // replacement before it can load. Only a new root error stops playback.
    if (error && current.current.active) fail(current.current.token, error);
  }, [error]);

  useEffect(() => {
    // Auto-start dispatches in an earlier effect of the initial idle render.
    // Only an observed active render can arm restoration of its saved controls.
    if (state.active) restoreArmed.current = true;
    if (!state.active && !restoreArmed.current) return;
    const actual = worldRef.current;
    if (!actual || !worldReady) return;
    const previous = original.current;
    if (!state.active && !previous) return;
    const continuousEntry = state.phase === 'loading' && ['keep', 'continuous'].includes(waiting.current?.mode);
    const target = state.active ? { paused: (state.phase !== 'showing' && !continuousEntry) || !state.playing || !!state.error, speed: 1 } : previous;
    actual.speed = target.speed; adapters.current.onControls(target.paused, target.speed);
    if (actual.paused !== target.paused) actual.setPaused(target.paused).catch(problem => {
      if (worldRef.current === actual && state.active) fail(state.token, problem);
      else adapters.current.onNotice(problem.message);
    });
    if (!state.active) { original.current = null; restoreArmed.current = false; }
  }, [state.active, state.phase, state.playing, state.token, state.error, worldReady, snapshot?.runId, state.transition?.phase]);

  useEffect(() => {
    if (!state.active || state.phase !== 'showing' || state.error || !worldReady) return;
    const actual = worldRef.current, token = state.token, step = DIRECTOR_STEPS[state.index];
    if (!actual || actual.disposed) return;
    try {
      const begun = actual.beginDirectorMotion({ ...step.motion,
        playbackRate: current.current.playbackRate,
        layer: step.action.kind === 'layer' ? step.action.layer : undefined,
        distanceM: panelAction(step.action) ? 3 : undefined,
      });
      if (!begun) { fail(token, '当前镜头无法启动，可重试或跳到下一章。'); return; }
      const owner = { world: actual, token }; motion.current = owner;
      const previousCompletion = actual.onDirectorMotionComplete;
      const onCompletion = shot => {
        if (motion.current !== owner || worldRef.current !== actual) return;
        const event = directorMotionCompletionEvent(shot, current.current, token, DIRECTOR_STEPS);
        if (event) dispatch(event);
      };
      actual.onDirectorMotionComplete = onCompletion;
      return () => {
        try { actual.stopDirectorMotion(); }
        finally {
          if (actual.onDirectorMotionComplete === onCompletion) actual.onDirectorMotionComplete = previousCompletion;
          if (motion.current === owner) motion.current = null;
        }
      };
    } catch (problem) { fail(token, problem); }
    // Pause/resume changes native pause only, retaining this shot and its path.
  }, [state.active, state.phase, state.token, state.error, worldReady, snapshot?.runId]);

  useEffect(() => {
    // A rate change updates the current native clock without starting a new path.
    const owner = motion.current;
    if (!state.active || state.phase !== 'showing' || state.error || !owner
      || owner.token !== state.token || owner.world !== worldRef.current) return;
    if (!owner.world.setDirectorPlaybackRate(state.playbackRate)) fail(state.token, '当前巡游速度无法应用，请重试。');
  }, [state.playbackRate, state.active, state.phase, state.token, state.error, worldReady, snapshot?.runId]);

  useEffect(() => {
    if (!state.active || state.phase !== 'showing' || state.error) return;
    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      const owner = motion.current;
      if (!owner || owner.token !== state.token || owner.world !== worldRef.current) return;
      const shot = owner.world.directorMotionSnapshot();
      if (!shot?.kind && !shot?.error) {
        stop(); adapters.current.onNotice('已切换为自由观察，可从顶部重新开始导演演示。'); return;
      }
      if (shot?.error) { fail(state.token, shot.error); return; }
      if (!current.current.playing) return;
      // Follow the rendered shot's clock, not a wall timer that could advance
      // while a low frame rate leaves the camera behind its planned route.
      const observedMs = shot?.complete ? DIRECTOR_STEPS[state.index].durationMs : (shot?.elapsedSec ?? 0) * 1000;
      dispatch({ type: 'tick', token: state.token, deltaMs: observedMs - current.current.elapsedMs });
    }, 250);
    return () => clearInterval(timer);
  }, [state.active, state.phase, state.playing, state.token, state.error]);

  return { state, steps: DIRECTOR_STEPS, start, stop, applied, prepareWorld, panelReady, fail,
    pause: () => dispatch({ type: 'pause' }), resume: () => dispatch({ type: 'resume' }),
    next: () => changeStep({ type: 'next' }), previous: () => changeStep({ type: 'prev' }),
    seek: index => state.phase === 'complete' ? start(index) : changeStep({ type: 'seek', index }),
    setPlaybackRate: playbackRate => {
      if (isDirectorPlaybackRate(playbackRate)) dispatch({ type: 'set-rate', playbackRate });
    },
    diagnostics: { ...state, title: DIRECTOR_STEPS[state.index].title, progress: directorTourProgress(state), entered: receipts.current,
      motion: worldRef.current?.directorMotionSnapshot?.() ?? null,
      entry: worldRef.current?.directorEntrySnapshot?.() ?? null },
  };
}
