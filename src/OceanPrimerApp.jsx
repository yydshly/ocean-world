import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ShallowSampleScene } from './world/ShallowSampleScene.js';
import { loadPreparedShallowGeometry } from './world/preparedShallowGeometry.js';
import { prepareShallowRenderer } from './world/prepareShallowRenderer.js';
import { createShallowJourney, constrainShallowExploration, shallowJourneyChapter } from './shallowJourney.js';
import { createShallowSchooling, prepareShallowSchooling } from './shallowSchooling.js';
import { createOceanPrimerSurface } from './world/OceanPrimerSurface.js';
import { createOceanPrimerPelagic } from './world/OceanPrimerPelagic.js';
import { createOceanPrimerDeep, oceanPrimerDeepFloorHeight } from './world/OceanPrimerDeep.js';
import { createPrimerWater } from './world/OceanPrimerWater.js';
import { createPrimerPassage, createPrimerCompositor, primerTravelState } from './oceanPrimerTravel.js';
import { createShallowNarration } from './shallowNarration.js';
import { OCEAN_PRIMER_CHAPTERS, OCEAN_PRIMER_CLIPS, oceanPrimerChapter, oceanPrimerDepthMarker } from './oceanPrimer.js';
import { ExperienceNavigation } from './ExperienceNavigation.jsx';
import { SceneLoading } from './SceneLoading.jsx';
import './oceanPrimer.css';

const clock = time => `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, '0')}`;
const poseVector = point => new THREE.Vector3(point.x, point.y, point.z);

export function OceanPrimerApp() {
  const canvas = useRef(null), runtime = useRef(null), audio = useRef(null), player = useRef(null), narrationEvents = useRef([]);
  const [ready, setReady] = useState(false), [error, setError] = useState(''), [started, setStarted] = useState(false);
  const [time, setTime] = useState(0), [playing, setPlaying] = useState(false), [speed, setSpeed] = useState(1), [free, setFree] = useState(false);
  const [voice, setVoice] = useState({ enabled: false, status: 'off', subtitle: '' }), [details, setDetails] = useState(false), [diagnostics, setDiagnostics] = useState({ ready: false });
  const latestVoice = useRef(voice); latestVoice.current = voice;
  const chapter = oceanPrimerChapter(time);
  const narrationSnapshot = () => ({ ...runtime.current?.state, hidden: document.hidden, returning: false });
  useEffect(() => {
    const controller = createShallowNarration(audio.current, OCEAN_PRIMER_CLIPS, {
      baseUrl: import.meta.env.BASE_URL, onStatus: next => {
        const event = narrationEvents.current.at(-1);
        if (event?.status !== next.status || event?.clipId !== next.clipId) {
          narrationEvents.current.push({ time: runtime.current?.state.time ?? 0, status: next.status, clipId: next.clipId });
          if (narrationEvents.current.length > 180) narrationEvents.current.shift();
        }
        setVoice(next);
      },
    });
    controller.setVolume(.75); player.current = controller;
    return () => { controller.dispose(); player.current = null; };
  }, []);
  useEffect(() => {
    let renderer, shallow, shallowWater, surface, pelagic, deep, passage, compositor, frame, controls, observer, disposed = false, last = 0, uiAt = 0;
    const seedQuery = Number(new URLSearchParams(window.location.search).get('seed') ?? 55), seed = Number.isFinite(seedQuery) ? seedQuery : 55;
    const state = { time: 0, ready: false, playing: false, started: false, speed: 1, free: false, seekRevision: 0, dirty: true };
    const metrics = { version: 2, stage: '07', scope: 'finite-authored-ocean-learning-tour', durationSec: 450, seed,
      persistence: 'none; original exploration stores are not connected', runs: [], preparation: [], frames: 0, intervalsMs: [],
      chapterFrames: {}, interruptions: [], errors: [], resolutionScale: 1, baselineShallowPreserved: true };
    let route, activeScene, activeCamera, activeUnit, depth = 0;
    const cameras = {}, scenes = {};
    const selectWorld = value => {
      const current = oceanPrimerChapter(value), local = value - current.start;
      if (current.id === 'shallow') {
        activeScene = shallow.scene; activeCamera = shallow.camera; activeUnit = null;
        shallow.update(local, !state.free, route.view(local));
        shallow.water.visible = false;
      } else {
        const id = current.id === 'recap' ? 'surface' : current.id;
        const t = current.id === 'recap' ? 12 + local * .2 : local;
        activeUnit = { surface, pelagic, deep }[id]; activeScene = scenes[id]; activeCamera = cameras[id];
        if (!state.free) {
          const pose = activeUnit.cameraPose(t); activeCamera.position.copy(poseVector(pose.position)); activeCamera.lookAt(poseVector(pose.target));
          if (activeCamera.fov !== pose.fov) { activeCamera.fov = pose.fov ?? 52; activeCamera.updateProjectionMatrix(); }
        }
      }
      if (controls && controls.object !== activeCamera) { controls.object = activeCamera; controls.enabled = false; }
      if (state.free) {
        controls.update();
        if (current.id === 'shallow') {
          activeCamera.position.copy(constrainShallowExploration(shallow.model, activeCamera.position)); shallow.updateView(); shallow.water.position.copy(activeCamera.position);
        } else if (current.id === 'deep' && local >= 26) {
          const p = activeCamera.position; p.x = THREE.MathUtils.clamp(p.x, -25, 25); p.z = THREE.MathUtils.clamp(p.z, -25, 25);
          p.y = Math.max(p.y, oceanPrimerDeepFloorHeight(p.x, p.z) + .6);
        }
      }
      if (current.id === 'shallow') {
        shallowWater?.update(value, activeCamera);
        depth = Math.max(0, 8 - activeCamera.position.y);
      } else {
        const t = current.id === 'recap' ? 12 + local * .2 : local;
        activeUnit.update(t, activeCamera, value);
        depth = activeUnit.environmentAt?.(current.id === 'pelagic' ? activeCamera : t)?.depthM ?? Math.max(0, -activeCamera.position.y);
      }
      return current;
    };
    const renderView = value => { selectWorld(value); return { scene: activeScene, camera: activeCamera }; };
    const drawFrame = () => {
      const travel = !state.free && primerTravelState(state.time); metrics.travel = travel || null;
      if (!travel) { const view = renderView(state.time); renderer.render(view.scene, view.camera); return oceanPrimerChapter(state.time); }
      passage.update(state.time, travel);
      const pose = passage.cameraPose(state.time, travel), camera = cameras.passage;
      camera.position.copy(poseVector(pose.position)); camera.lookAt(poseVector(pose.target));
      const movingWater = { scene: scenes.passage, camera };
      if (travel.leg === 'departure') compositor.render(renderer, renderView(Math.min(state.time, travel.boundary - .001)), movingWater, travel.blend);
      else if (travel.leg === 'arrival') compositor.render(renderer, movingWater, renderView(Math.max(state.time, travel.boundary + .001)), travel.blend);
      else { activeScene = movingWater.scene; activeCamera = movingWater.camera; renderer.render(activeScene, activeCamera); }
      depth = travel.depthM; activeUnit = passage;
      return oceanPrimerChapter(state.time);
    };
    const resize = () => {
      if (!renderer) return; const { width, height } = canvas.current.getBoundingClientRect(); if (!width || !height) return;
      renderer.setSize(width, height, false);
      metrics.viewport = { width, height, pixelRatio: renderer.getPixelRatio() };
      compositor?.resize(width, height, renderer.getPixelRatio());
      for (const camera of [shallow?.camera, ...Object.values(cameras)].filter(Boolean)) { camera.aspect = width / height; camera.updateProjectionMatrix(); }
      state.dirty = true;
    };
    const publish = () => {
      const c = oceanPrimerChapter(state.time);
      const next = { ...metrics, timeSec: state.time, ready: state.ready, playing: state.playing, free: state.free, speed: state.speed,
        chapterId: c.id, depthM: depth, camera: activeCamera?.position.toArray(), narration: { ...latestVoice.current, events: narrationEvents.current },
        unit: activeUnit?.diagnostics?.() ?? { type: 'unchanged-shallow-chapter', animalCount: shallow?.model.agents.length, localTimeSec: state.time - 45 },
        lastRenderPassDrawCalls: renderer?.info.render.calls, lastRenderPassTriangles: renderer?.info.render.triangles };
      setDiagnostics(next); setTime(state.time);
    };
    runtime.current = { state, metrics, start() {
      if (!state.ready) return; state.started = true; state.playing = true; state.dirty = true; last = 0;
      metrics.runs.push({ startedAtMs: performance.now(), startSec: state.time, speed: state.speed, completed: false });
      setStarted(true); setPlaying(true);
    }, toggle() {
      if (!state.ready) return;
      if (state.free) { state.free = false; controls.enabled = false; setFree(false); }
      state.playing = !state.playing && state.time < 450; state.dirty = true; last = 0;
      metrics.interruptions.push({ type: state.playing ? 'resume' : 'pause', timeSec: state.time }); setPlaying(state.playing);
    }, seek(value) {
      const requested = THREE.MathUtils.clamp(value, 0, 450); state.seekRevision++; state.free = false; controls.enabled = false;
      state.time = requested; state.dirty = true; last = 0; metrics.interruptions.push({ type: 'seek', timeSec: requested });
      setFree(false); selectWorld(state.time); publish();
    }, observe() {
      state.free = !state.free; state.playing = false; state.dirty = true; last = 0;
      controls.enabled = state.free; controls.target.copy(activeCamera.position).add(activeCamera.getWorldDirection(new THREE.Vector3()).multiplyScalar(8)); controls.update();
      controls.minDistance = oceanPrimerChapter(state.time).id === 'pelagic' ? 9 : 1.2;
      metrics.interruptions.push({ type: state.free ? 'free-observation' : 'return-to-tour', timeSec: state.time }); setFree(state.free); setPlaying(false);
    }, speed(value) { state.speed = value; last = 0; metrics.interruptions.push({ type: 'speed', timeSec: state.time, speed: value }); setSpeed(value); } };
    const render = now => {
      if (disposed) return; frame = requestAnimationFrame(render);
      try {
      if (!state.ready) { last = 0; return; }
      const interval = last ? now - last : 0, dt = Math.min(interval / 1000, .1); last = now;
      if (document.hidden) { last = 0; return; }
      if (state.playing || state.dirty || state.free) {
        if (state.playing && !state.free) state.time = Math.min(450, state.time + dt * state.speed);
        const c = drawFrame(); state.dirty = false;
        if (state.playing && interval > 0) {
          metrics.frames++; metrics.intervalsMs.push(interval); if (metrics.intervalsMs.length > 600) metrics.intervalsMs.shift();
          const group = metrics.chapterFrames[c.id] ??= { count: 0, wallMs: 0, maxMs: 0, over250: 0, intervalBuckets5Ms: {} };
          group.count++; group.wallMs += interval; group.maxMs = Math.max(group.maxMs, interval); if (interval > 250) group.over250++;
          const bucket = Math.ceil(interval / 5) * 5; group.intervalBuckets5Ms[bucket] = (group.intervalBuckets5Ms[bucket] ?? 0) + 1;
        }
        if (state.time >= 450 && state.playing) {
          state.playing = false; setPlaying(false); const run = metrics.runs.at(-1);
          if (run) { run.completed = true; run.endedAtMs = now; run.elapsedWallSec = (now - run.startedAtMs) / 1000; }
        }
      }
      player.current?.sync({ ...state, hidden: document.hidden, returning: false });
      if (now - uiAt > 200) { publish(); uiAt = now; }
      } catch (e) { cancelAnimationFrame(frame); state.playing = false; metrics.errors.push(e.message); setPlaying(false); setError(`海洋总览已停止：${e.message}`); publish(); }
    };
    const visibility = () => { last = 0; if (document.hidden && state.playing) metrics.interruptions.push({ type: 'background', timeSec: state.time }); player.current?.sync(narrationSnapshot()); };
    document.addEventListener('visibilitychange', visibility);
    const initialize = async () => {
      const begun = performance.now();
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
      renderer.debug.onShaderError = () => { throw new Error('画面着色器未能编译，已停止准备，避免显示缺失的场景'); };
      renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .85;
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; canvas.current.appendChild(renderer.domElement);
      const gl = renderer.getContext(), extension = gl.getExtension('WEBGL_debug_renderer_info'); metrics.gpu = extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      try { await loadPreparedShallowGeometry(); } catch (e) { metrics.preparedGeometryFallback = e.message; }
      if (disposed) return;
      shallow = new ShallowSampleScene(seed, { livingCommunities: true }); shallow.model.schoolingSystem = createShallowSchooling(shallow.model); route = createShallowJourney(shallow.model);
      // Only this independent instance adopts the shared water presentation.
      // The standalone shallow scene, its assets and original ecology remain.
      shallow.scene.traverse(object => { if (object.isLight) object.visible = false; });
      shallowWater = createPrimerWater(shallow.scene, { seed, seaLevelM: 8, underwaterOnly: true, extentM: 1600 });
      if (shallowWater.sun) {
        shallowWater.sun.castShadow = true; shallowWater.sun.shadow.mapSize.set(1024, 1024);
        Object.assign(shallowWater.sun.shadow.camera, { left: -18, right: 18, top: 15, bottom: -15, near: .5, far: 400 });
        shallowWater.sun.shadow.bias = -.00025; shallowWater.sun.shadow.normalBias = .035;
      }
      shallow.water.visible = false;
      shallow.update(0, true, route.view(0)); metrics.shallow = { animalCount: shallow.model.agents.length, routeLengthM: route.length, habitats: ['礁谷', '沙道', '草床'] };
      for (const id of ['surface', 'pelagic', 'deep', 'passage']) { scenes[id] = new THREE.Scene(); cameras[id] = new THREE.PerspectiveCamera(52, 1, .05, id === 'surface' ? 3000 : 250); }
      surface = createOceanPrimerSurface(scenes.surface, { seed }); pelagic = createOceanPrimerPelagic(scenes.pelagic, { seed }); deep = createOceanPrimerDeep(scenes.deep, { seed });
      passage = createPrimerPassage(scenes.passage, { seed }); compositor = createPrimerCompositor();
      let preparationTimer;
      try { await Promise.race([Promise.all([prepareShallowSchooling(shallow.model.schoolingSystem), shallow.loadTextures(), surface.loadTextures?.(import.meta.env.BASE_URL)]),
        new Promise((_, reject) => { preparationTimer = setTimeout(() => reject(new Error('模型与贴图准备超过30秒，请重新载入')), 30000); })]); }
      finally { clearTimeout(preparationTimer); }
      if (disposed) return;
      shallow.assetsSealed = true; shallow.scanController.abort();
      controls = new OrbitControls(cameras.surface, renderer.domElement); controls.enabled = false; controls.enableDamping = true; controls.enablePan = false; controls.minDistance = 1.2; controls.maxDistance = 60;
      observer = new ResizeObserver(resize); observer.observe(canvas.current); resize();
      for (const [id, sample] of [['surface', 0], ['shallow', 95], ['pelagic', 340], ['deep', 373], ['deep', 405]]) {
        if (disposed) return;
        const view = renderView(sample);
        metrics.preparation.push({ id, sample, ...await prepareShallowRenderer(renderer, view.scene, view.camera, () => disposed) });
        renderer.setRenderTarget(compositor.targets[0]);
        try { await prepareShallowRenderer(renderer, view.scene, view.camera, () => disposed); }
        finally { renderer.setRenderTarget(null); }
      }
      const warmTravel = primerTravelState(365); passage.update(365, warmTravel);
      const warmPose = passage.cameraPose(365, warmTravel); cameras.passage.position.copy(poseVector(warmPose.position)); cameras.passage.lookAt(poseVector(warmPose.target));
      await prepareShallowRenderer(renderer, scenes.passage, cameras.passage, () => disposed);
      await prepareShallowRenderer(renderer, compositor.scene, compositor.camera, () => disposed);
      if (disposed) return;
      state.ready = true; selectWorld(0); renderer.render(activeScene, activeCamera); metrics.navigationToReadyMs = performance.now(); metrics.startupMs = performance.now() - begun;
      state.dirty = false; setReady(true); publish(); frame = requestAnimationFrame(render);
    };
    initialize().catch(e => { if (!disposed) { metrics.errors.push(e.message); setError(`海洋总览准备失败：${e.message}`); } });
    return () => {
      disposed = true; cancelAnimationFrame(frame); observer?.disconnect(); document.removeEventListener('visibilitychange', visibility); controls?.dispose();
      shallowWater?.dispose(); shallow?.dispose(); surface?.dispose(); pelagic?.dispose(); deep?.dispose(); passage?.dispose(); compositor?.dispose(); renderer?.dispose(); renderer?.forceContextLoss(); renderer?.domElement.remove(); runtime.current = null;
    };
  }, []);
  const start = () => { runtime.current?.start(); player.current?.enable(narrationSnapshot()); };
  const seek = value => runtime.current?.seek(Number(value));
  const depth = diagnostics.depthM ?? 0;
  return <main className="ocean-primer">
    <div ref={canvas} className="ocean-primer-canvas" aria-label="从海面到深海的三维科普画面"/>
    <ExperienceNavigation/>
    <audio ref={audio} preload="none" aria-label="海洋总览中文讲解"/>
    {!ready && <SceneLoading experience="primer" phase="render" error={error}/>}
    {ready && !started && <section className="primer-intro" aria-label="开始海洋总览">
      <p>TIDAL · 第一次认识海洋</p><h1>从海面，走进大海。</h1>
      <p>7分30秒，认识海面、水层与海底。经过浅海群落，观察鲸和海豚，再走进深海。</p>
      <button onClick={start}>开始导览 · 带中文讲解</button><button className="primer-quiet" onClick={() => runtime.current?.start()}>安静观看</button>
      <small>代表性科普场景 · 不同海域会明确切换 · 原有体验仍在“更多体验”中</small>
    </section>}
    {started && <>
      <header className="primer-heading"><p>第一次认识海洋 · {clock(time)} / 7:30</p><h1>{chapter.title}</h1><span>{chapter.place}</span></header>
      {!diagnostics.travel && chapter.id === 'shallow' && <aside className="primer-subject"><strong>{shallowJourneyChapter(time - 45).title}</strong><span>{shallowJourneyChapter(time - 45).life}</span></aside>}
      <aside className="primer-space" aria-label="当前海洋空间位置">
        <strong>我们在哪里</strong><span>{depth < .2 ? '海面之上' : `${depth >= 100 ? Math.round(depth) : depth.toFixed(1)} 米水下`}</span>
        <svg viewBox="0 0 210 100" role="img" aria-label="海面、水层、海床的深度关系示意">
          <path d="M8 18 H202" stroke="#cce4df" fill="none"/><path d="M8 36 L62 36 Q80 38 104 80 L202 80" stroke="#718b88" fill="none" strokeWidth="3"/>
          <text x="8" y="12">海面</text><text x="15" y="54">浅海</text><text x="142" y="41">水层</text><text x="149" y="94">深海海床</text>
          <circle cx={depth < 40 ? 43 : 132} cy={18 + oceanPrimerDepthMarker(depth) * 57} r="5" fill="#d7dfad"/>
        </svg><small>深度位置示意 · 非等比例</small>
      </aside>
      {!diagnostics.travel && chapter.id === 'pelagic' && <aside className="primer-subject"><strong>{time < 320 ? '座头鲸 · 约13.8米' : '宽吻海豚 · 约2.65米'}</strong><span>真实尺度 · 活动为科普编排</span></aside>}
      {!diagnostics.travel && chapter.id === 'deep' && <aside className="primer-subject"><strong>{depth < 1000 ? '中层水体观察' : depth < 3499 ? '前往深海海床' : '3500米深海海床'}</strong>
        <span>{depth < 1000 ? '冠水母 · 吸血乌贼' : depth >= 3499 ? '海猪 · 鼠尾鱼 · 软海葵' : '灯束与海雪引导视线'}</span><span>观察器灯照明 · 非太阳光</span></aside>}
      {chapter.id === 'recap' && <section className="primer-recap"><h2>带着这三件事回望大海</h2><p>海面之下，是广阔的水体与海床。</p><p>不同深度和栖息地，有不同的生命。</p><p>观察动物，也要观察它周围的环境。</p></section>}
      {diagnostics.travel && <aside className="primer-travel" aria-label="观察旅程进度"><strong>{diagnostics.travel.label}</strong><span>{diagnostics.travel.note}</span><progress value={diagnostics.travel.progress} max="1"/><small>正在前行 · {Math.round(diagnostics.travel.depthM)}米深度示意</small></aside>}
      {!diagnostics.travel && chapter.id === 'deep' && time >= 392 && time < 400 && <aside className="primer-travel"><strong>观察器继续前往海床</strong><span>700米水层 → 3500米海床 · 下潜时间压缩</span><small>灯束与海雪引导视线，海床逐渐显露</small></aside>}
      <section className="primer-controls" aria-label="海洋总览播放控制">
        <p className="primer-lesson">{chapter.lesson}</p>
        {voice.enabled && voice.subtitle && <p className="primer-caption" aria-label="当前讲解字幕">{voice.subtitle}</p>}
        <div className="primer-actions"><button onClick={() => runtime.current?.toggle()}>{playing ? '暂停观察' : time >= 450 ? '导览结束' : '继续导览'}</button>
          <button onClick={() => player.current?.[voice.enabled ? 'disable' : 'enable'](narrationSnapshot())}>{voice.enabled ? '关闭讲解' : '开启讲解'}</button>
          <button onClick={() => setDetails(value => !value)} aria-expanded={details}>{details ? '收起路线' : '章节与探索'}</button><span>{voice.status === 'blocked' ? '点击开启讲解允许播放' : voice.status === 'error' ? '讲解加载失败，可重新开启' : 'AI合成讲解 · 科普展示'}</span></div>
        {details && <div className="primer-expanded"><nav aria-label="海洋总览章节">{OCEAN_PRIMER_CHAPTERS.map(c => <button key={c.id} aria-current={c.id === chapter.id ? 'step' : undefined} onClick={() => seek(c.start)}>{c.title}</button>)}</nav>
          <label>总览进度 <input aria-label="总览进度" type="range" min="0" max="450" step="1" value={time} onChange={e => seek(e.target.value)}/></label>
          <label>速度 <select aria-label="总览速度" value={speed} onChange={e => runtime.current?.speed(Number(e.target.value))}>{[.5, 1, 1.5, 2, 4].map(v => <option key={v} value={v}>{v}×</option>)}</select></label>
          <button disabled={Boolean(diagnostics.travel)} onClick={() => runtime.current?.observe()}>{free ? '返回导览镜头' : diagnostics.travel ? '抵达后自由观察' : '自由转动观察'}</button><button onClick={() => { seek(0); start(); }}>从头观看</button>
          <a href={`${import.meta.env.BASE_URL}?demo=shallow-journey&seed=55`}>单独观看原4分钟浅海 →</a><a href={`${import.meta.env.BASE_URL}assets/ocean-primer/animals/README.md`}>模型来源与展示范围</a></div>}
      </section>
    </>}
    {error && ready && <p className="primer-error" role="alert">{error}</p>}
    <output id="ocean-primer-diagnostics" hidden>{JSON.stringify({ ...diagnostics, voice: { ...voice, events: narrationEvents.current } })}</output>
  </main>;
}
