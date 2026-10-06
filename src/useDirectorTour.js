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
    if (!valid(token) || waiting.current?.token !== token) return;
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
    if (!state.active || state.phase !== 'loading' || state.error || startedToken.current === state.token) return;
    const token = state.token, action = directorStepAction(DIRECTOR_STEPS[state.index]);
    startedToken.current = token;
    waiting.current = { token, action, appliedAt: null, panelReady: false, absence: false };
    const enter = async () => {
      const previous = worldRef.current;
      stopMotion();
      adapters.current.onControls(true, 1);
      try {
        if (previous && !previous.disposed) {
          await previous.setPaused(true);
          if (!valid(token) || worldRef.current !== previous) return;
          // Retain actual forcing across ordinary constructors; do not rewind clocks.
          const env = previous.snapshot().environment;
          environments.current.set(worldKey(previous), Object.fromEntries(
            ['currentMps', 'turbidity', 'foodSupply', 'hour', 'observerLight'].filter(key => Number.isFinite(env[key])).map(key => [key, env[key]])));
        }
        if (!valid(token)) return;
        adapters.current.execute({ ...action, directorToken: token });
      } catch (problem) { fail(token, problem); }
    };
    enter();
  }, [state.active, state.phase, state.token, state.error]);

  useEffect(() => {
    if (!state.active || state.phase !== 'loading' || state.error) return;
    const token = state.token;
    const timeout = setTimeout(() => fail(token, '这个入口未在 45 秒内就绪。可以重试或跳过。'), 45000);
    return () => clearTimeout(timeout);
  }, [state.active, state.phase, state.token, state.error]);

  useEffect(() => {
    const wait = waiting.current;
    if (!state.active || state.phase !== 'loading' || state.error || !worldReady || !wait || wait.token !== state.token || wait.appliedAt === null) return;
    if (performance.now() - wait.appliedAt < 750) return;
    if (!directorSceneReady(wait.action, worldRef.current, snapshot, { panelReady: wait.panelReady })) return;
    receipts.current = [...receipts.current.slice(-63), {
      step: DIRECTOR_STEPS[state.index].id, action: wait.action.id, token: state.token,
      biome: snapshot.biomeId, profile: snapshot.sceneProfile, chunkId: snapshot.ocean?.chunkId,
      loadingRegions: snapshot.ocean?.ecology?.metrics?.loadingRegions ?? 0,
      alive: snapshot.ocean?.ecology?.metrics?.alive, panelReady: wait.panelReady, absence: wait.absence,
    }];
    dispatch({ type: 'entered', token: state.token });
  }, [snapshot, worldReady, state.active, state.phase, state.token, state.error]);

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
    const target = state.active ? { paused: state.phase !== 'showing' || !state.playing || !!state.error, speed: 1 } : previous;
    actual.speed = target.speed; adapters.current.onControls(target.paused, target.speed);
    if (actual.paused !== target.paused) actual.setPaused(target.paused).catch(problem => {
      if (worldRef.current === actual && state.active) fail(state.token, problem);
      else adapters.current.onNotice(problem.message);
    });
    if (!state.active) { original.current = null; restoreArmed.current = false; }
  }, [state.active, state.phase, state.playing, state.token, state.error, worldReady, snapshot?.runId]);

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
      motion: worldRef.current?.directorMotionSnapshot?.() ?? null },
  };
}
