import { useEffect, useReducer, useRef } from 'react';
import { createDirectorState, directorReducer, DIRECTOR_STEPS } from './directorTour.js';
import { directorSceneReady } from './directorReadiness.js';

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
  const valid = token => current.current.active && current.current.token === token;
  const fail = (token, problem) => { if (valid(token)) dispatch({ type: 'failed', token, error: problem }); };
  const start = () => {
    if (recording) { adapters.current.onNotice('请先结束录像，再开始导演演示'); return; }
    if (!original.current) original.current = { paused: worldRef.current?.paused ?? paused, speed: worldRef.current?.speed ?? speed };
    receipts.current = []; waiting.current = null; startedToken.current = null;
    restoreArmed.current = false;
    environments.current.clear(); preparedWorlds.current = new WeakSet();
    dispatch({ type: 'start' });
  };
  const stop = () => { waiting.current = null; dispatch({ type: 'stop' }); };
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
    const token = state.token, action = DIRECTOR_STEPS[state.index].action;
    startedToken.current = token;
    waiting.current = { token, action, appliedAt: null, panelReady: false, absence: false };
    const enter = async () => {
      const previous = worldRef.current;
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
        if (panelAction(action)) applied(token);
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
    if (error && state.active) fail(state.token, error);
  }, [error, state.active, state.token]);

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
    if (!state.active || state.phase !== 'showing' || !state.playing || state.error) return;
    let previous = performance.now();
    const timer = setInterval(() => {
      const now = performance.now(), deltaMs = Math.min(1000, now - previous); previous = now;
      if (document.visibilityState === 'visible') dispatch({ type: 'tick', token: state.token, deltaMs });
    }, 250);
    return () => clearInterval(timer);
  }, [state.active, state.phase, state.playing, state.token, state.error]);

  return { state, steps: DIRECTOR_STEPS, start, stop, applied, prepareWorld, panelReady, fail,
    pause: () => dispatch({ type: 'pause' }), resume: () => dispatch({ type: 'resume' }),
    next: () => dispatch({ type: 'next' }), previous: () => dispatch({ type: 'prev' }),
    seek: index => dispatch({ type: 'seek', index }),
    diagnostics: { ...state, title: DIRECTOR_STEPS[state.index].title, entered: receipts.current },
  };
}
