import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ShallowSampleScene } from './world/ShallowSampleScene.js';
import { SHALLOW_SAMPLE_SECONDS, shallowSampleChapter } from './shallowSample.js';
import './shallowSample.css';
import {ShallowNarration} from './ShallowNarration.jsx';
import {createShallowJourney,shallowJourneyChapter,SHALLOW_JOURNEY_SECONDS,SHALLOW_JOURNEY_CHAPTERS,constrainShallowExploration} from './shallowJourney.js';
import { createShallowPlaybackMetrics } from './shallowSamplePlayback.js';
import {prepareShallowRenderer} from './world/prepareShallowRenderer.js';
import {loadPreparedShallowGeometry} from './world/preparedShallowGeometry.js';
import {SceneLoading} from './SceneLoading.jsx';
import {createShallowSchooling,prepareShallowSchooling,shallowSchoolingDiagnostics,shallowSchoolingPhase,SHALLOW_SCHOOLING_PHASES} from './shallowSchooling.js';

export function ShallowSampleApp({journey=false}){
  const schoolingOnly=journey&&new URLSearchParams(window.location.search).get('school')==='1';
  const duration=schoolingOnly?60:journey?SHALLOW_JOURNEY_SECONDS:SHALLOW_SAMPLE_SECONDS;
  const [location,setLocation]=useState(null),[focused,setFocused]=useState(journey);
  const [loadingPhase,setLoadingPhase]=useState('geometry');
  const panel=useRef(null),canvas=useRef(null),runtime=useRef(null),[time,setTime]=useState(0),[playing,setPlaying]=useState(true),
    [speed,setSpeed]=useState(1),[free,setFree]=useState(false),[summary,setSummary]=useState(null),[ready,setReady]=useState(false),[error,setError]=useState('');
  useEffect(()=>{
    if(!journey)return;
    const expand=e=>{if(e.key==='Escape')setFocused(false);};
    window.addEventListener('keydown',expand);return()=>window.removeEventListener('keydown',expand);
  },[journey]);
  useEffect(()=>{
    if(!journey||!panel.current)return;
    const footer=panel.current,measure=()=>footer.parentElement.style.setProperty('--sample-panel-height',`${footer.getBoundingClientRect().height}px`);
    const observer=new ResizeObserver(measure);observer.observe(footer);measure();return()=>observer.disconnect();
  },[journey]);
  useEffect(()=>{
    const mount=canvas.current;let renderer,world,controls,frame,observer,disposed=false,last=0,lastUi=0;
    const pixelRatio=Math.min(window.devicePixelRatio||1,1.5),cadence={samples:[],slow:0,stable:0,frames:0,scale:1};
    const diagnostics=createShallowPlaybackMetrics(),metrics=diagnostics.metrics,startup=performance.now();
    const state={time:0,seekRevision:0,lifeTime:0,playing:false,speed:1,free:false,ready:false,dirty:true,keys:new Set(),nudges:[]};
    let route,returnView=null;
    const initialize=async()=>{
      renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
      const gl=renderer.getContext(),gpu=gl.getExtension('WEBGL_debug_renderer_info');
      metrics.environment={browser:navigator.userAgent,gpu:gpu?gl.getParameter(gpu.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),context:gl.constructor.name};
      renderer.setPixelRatio(pixelRatio);
      renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
      renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.85;
      mount.appendChild(renderer.domElement);
      const params=new URLSearchParams(window.location.search),seed=Number(params.get('seed')||55);
      const staticStart=performance.now();
      try{metrics.preparedGeometry=await loadPreparedShallowGeometry();}
      catch(e){metrics.preparedGeometry={used:false,reason:e.message};}
      metrics.staticGeometryReadyMs=performance.now()-staticStart;
      if(disposed)return;
      setLoadingPhase('scene');
      const modelStart=performance.now();
      world=new ShallowSampleScene(Number.isFinite(seed)?seed:55,{scannedReef:params.get('reef')==='scanned',livingCommunities:journey});setSummary({...world.summary,scannedReef:world.model.scannedReef});
      if(journey){world.model.schoolingSystem=createShallowSchooling(world.model);route=createShallowJourney(world.model);metrics.experience=schoolingOnly?'stage-05-schooling-60s':'stage-05-schooling-journey';metrics.routeLengthM=route.length;metrics.livingCommunities={habitat:world.model.journeyHabitat??null,life:world.model.journeyLife??null};metrics.routeSamples=[];world.update(0,false);world.update(0,true,route.view(0));}
      metrics.modelBuildMs=performance.now()-modelStart;
      metrics.sceneBuildStagesMs={...world.buildTimings};
      metrics.preparedCover={used:world.model.preparedCover,signature:world.model.coverInputSignature,raw:world.model.coverRawInputSignature,authoringRaw:world.model.coverExpectedRawSignature};
      controls=new OrbitControls(world.camera,renderer.domElement);controls.enabled=false;controls.enableDamping=true;
      controls.minDistance=1;controls.maxDistance=45;controls.maxPolarAngle=Math.PI*.85;
      const resize=()=>{const {width,height}=mount.getBoundingClientRect();if(!width||!height)return;
        renderer.setSize(width,height,false);world.camera.aspect=width/height;world.camera.updateProjectionMatrix();state.dirty=true;};
      observer=new ResizeObserver(resize);observer.observe(mount);resize();
      const startRun=()=>{const {width,height}=mount.getBoundingClientRect();diagnostics.start(performance.now(),{speed:state.speed,width,height,pixelRatio,duration});};
      const updateWorld=()=>world.update(journey?state.lifeTime:state.time,!state.free,journey?route.view(state.time):undefined);
      runtime.current={state,diagnostics,startRun,narrationSnapshot:()=>({time:state.time,seekRevision:state.seekRevision,playing:state.playing,speed:state.speed,free:state.free,returning:!!returnView,ready:state.ready}),seek(value){diagnostics.interrupt('seek');state.seekRevision++;state.time=THREE.MathUtils.clamp(value,0,duration);state.lifeTime=state.time;returnView=null;updateWorld();state.dirty=true;setTime(state.time);},
        observe(value){
          if(value)diagnostics.interrupt('free-observation');state.free=value;state.dirty=true;state.keys.clear();state.nudges.length=0;controls.enabled=value;
          if(value){state.resumePlaying=state.playing;if(journey){state.playing=false;setPlaying(false);}controls.target.copy(world.camera.position).add(world.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(8));controls.update();}
          else if(journey){returnView={position:world.camera.position.clone(),target:controls.target.clone(),elapsed:0};state.playing=state.resumePlaying&&state.time<duration;setPlaying(state.playing);}
          else world.update(state.time);
        },move(key,on){if(on)state.keys.add(key);else state.keys.delete(key);},nudge(key){if(state.free)state.nudges.push(key);}};
      const keydown=e=>{if(!journey||!state.free||!mount.contains(document.activeElement)||!['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))return;e.preventDefault();if(!e.repeat)state.nudges.push(e.code);state.keys.add(e.code);};
      const keyup=e=>state.keys.delete(e.code),clearKeys=()=>state.keys.clear();
      window.addEventListener('keydown',keydown);window.addEventListener('keyup',keyup);window.addEventListener('blur',clearKeys);window.addEventListener('pointerup',clearKeys);window.addEventListener('pointercancel',clearKeys);
      runtime.current.cleanupInput=()=>{window.removeEventListener('keydown',keydown);window.removeEventListener('keyup',keyup);window.removeEventListener('blur',clearKeys);window.removeEventListener('pointerup',clearKeys);window.removeEventListener('pointercancel',clearKeys);};
      // Prepare visible assets and programs before the tour clock starts.
      // Source timeouts retain the full fallback scene, and seal late arrivals.
      const prepare=async()=>{
        const schoolStart=performance.now();
        const schoolReady=journey?prepareShallowSchooling(world.model.schoolingSystem).then(()=>{metrics.schoolingPreparationMs=performance.now()-schoolStart;}):Promise.resolve();
        setLoadingPhase('textures');
        const assetStart=performance.now();
        // The dry museum skeleton is optional scenery, not required living
        // reef. Its runtime placement search must not block this showcase.
        let timeout;await Promise.all([schoolReady,Promise.race([world.loadTextures(),new Promise(resolve=>timeout=setTimeout(resolve,4000))]).then(()=>{
          clearTimeout(timeout);metrics.textureReadyMs=performance.now()-assetStart;
        })]);
        if(journey&&!disposed)world.update(0,false);
        if(disposed)return;world.assetsSealed=true;world.animals.artists.sealed=true;world.animals.sourcedFish.sealed=true;world.animals.sourceTurtle.sealed=true;world.animals.openCommunity.sealed=true;world.nearCommunity.sealed=true;world.benthicCorals.sealed=true;world.animals.contactFauna.sealed=true;world.scanController.abort();
        setLoadingPhase('render');
        const preparation=await prepareShallowRenderer(renderer,world.scene,world.camera,()=>disposed);if(disposed)return;
        metrics.compileMs=preparation.compileMs;metrics.assetUploadMs=preparation.uploadMs;metrics.preparedRenderBatches=preparation.batches;
        metrics.textureUploadMs=preparation.textureUploadMs;metrics.preparedTextureCount=preparation.textureCount;
        metrics.renderPreparationMs=preparation.preparationMs;
        // Texture uploads and the first real draw belong to preparation, not
        // the first movement interval. compileAsync alone does not upload all
        // instance buffers/textures. Start the tour only after that draw.
        const firstFrameStart=performance.now();renderer.render(world.scene,world.camera);
        metrics.firstFrameMs=performance.now()-firstFrameStart;
        metrics.startupMs=performance.now()-startup;metrics.navigationToReadyMs=performance.now();state.ready=true;state.playing=true;last=0;startRun();setReady(true);
      };prepare().catch(e=>{if(!disposed)setError(`场景准备失败：${e.message}`);});
      // Read-only local diagnostics; no network reporting and no FPS claim.
      window.__shallowSampleMetrics=metrics;
      const visibility=()=>{if(document.hidden)diagnostics.interrupt('background');last=0;cadence.slow=0;cadence.stable=0;cadence.samples.length=0;};
      document.addEventListener('visibilitychange',visibility);
      runtime.current.visibility=visibility;
      const render=(now)=>{
        if(disposed)return;
        // Compile the settled material set once. Rendering through texture
        // arrival used to compile many temporary shader combinations first.
        // A queued rAF can carry a timestamp from before the synchronous
        // preparation draw. Do not count that stale timestamp as tour time.
        if(!state.ready||now<metrics.navigationToReadyMs){last=0;frame=requestAnimationFrame(render);return;}
        // A paused review frame is static. Keep its resolution and release GPU
        // work rather than repeatedly drawing it and adapting to idle cadence.
        if(!state.playing&&!state.free&&!state.dirty&&!returnView){last=0;frame=requestAnimationFrame(render);return;}
        const interval=last?now-last:0,dt=Math.min(interval/1000,.1);last=now;
        if(!document.hidden){
          if(state.playing&&(!journey||!state.free)&&!returnView)state.time=Math.min(duration,state.time+dt*state.speed);
          if(journey&&(state.playing||state.free))state.lifeTime+=dt*state.speed;
          if(state.playing||state.free||state.dirty||returnView){
            if(journey)world.update(state.lifeTime,false);else updateWorld();
            if(journey&&!state.free){const view=route.view(state.time);
              if(returnView){returnView.elapsed+=dt;const f=THREE.MathUtils.smoothstep(returnView.elapsed,0,3);view.position.lerpVectors(returnView.position,view.position,f);view.position.copy(constrainShallowExploration(world.model,view.position));view.target.lerpVectors(returnView.target,view.target,f);if(f>=1)returnView=null;}
              world.camera.position.copy(view.position);world.camera.lookAt(view.target);
            }
          }
          if(state.free){
            if(journey){const forward=world.camera.getWorldDirection(new THREE.Vector3());forward.y=0;forward.normalize();const side=new THREE.Vector3(-forward.z,0,forward.x),delta=new THREE.Vector3();
              const held=(...keys)=>keys.some(k=>state.keys.has(k));
              delta.addScaledVector(forward,(Number(held('KeyW','ArrowUp'))-Number(held('KeyS','ArrowDown')))*dt*1.6);
              delta.addScaledVector(side,(Number(held('KeyD','ArrowRight'))-Number(held('KeyA','ArrowLeft')))*dt*1.6);for(const key of state.nudges.splice(0)){if(['KeyW','ArrowUp'].includes(key))delta.addScaledVector(forward,.4);if(['KeyS','ArrowDown'].includes(key))delta.addScaledVector(forward,-.4);if(['KeyD','ArrowRight'].includes(key))delta.addScaledVector(side,.4);if(['KeyA','ArrowLeft'].includes(key))delta.addScaledVector(side,-.4);}
              world.camera.position.add(delta);controls.target.add(delta);
            }
            controls.update();const p=world.camera.position;
            if(journey){const safe=constrainShallowExploration(world.model,p);controls.target.add(safe.clone().sub(p));p.copy(safe);}else p.y=Math.max(p.y,world.model.surface(p.x,p.z,true)+.6);
          }
          if(journey){world.updateView();world.water.position.copy(world.camera.position);world.sun.target.position.set(world.camera.position.x+6,0,world.camera.position.z);world.sun.position.set(world.camera.position.x-17,28,world.camera.position.z-14);}
          renderer.render(world.scene,world.camera);
          state.dirty=false;
          metrics.drawCalls=renderer.info.render.calls;metrics.triangles=renderer.info.render.triangles;
          if(state.ready&&state.playing)diagnostics.frame(now,interval,state.time,metrics.resolutionScale);
          if(interval>0){metrics.frameIntervalsMs.push(interval);if(metrics.frameIntervalsMs.length>600)metrics.frameIntervalsMs.shift();if(interval>50)metrics.slowFrames++;}
          // Adapt only after shader warm-up and sustained cadence loss. Retain
          // the complete population and geometry; reduce pixel cost gradually.
          if(state.ready&&++cadence.frames>45&&interval>0){
            cadence.samples.push(interval);if(cadence.samples.length>30)cadence.samples.shift();
            const average=cadence.samples.reduce((sum,v)=>sum+v,0)/cadence.samples.length;
            cadence.slow=average>28?cadence.slow+interval:0;cadence.stable=average<19?cadence.stable+interval:0;
            let scale=cadence.scale;
            if(cadence.slow>1500&&scale>.65){scale=Math.max(.65,scale-.15);cadence.slow=0;cadence.samples.length=0;}
            else if(cadence.stable>8000&&scale<1){scale=Math.min(1,scale+.1);cadence.stable=0;cadence.samples.length=0;}
            if(scale!==cadence.scale){cadence.scale=scale;metrics.resolutionScale=scale;renderer.setPixelRatio(pixelRatio*scale);resize();}
          }
          if(now-lastUi>180){setTime(state.time);lastUi=now;
            if(journey){const p=world.camera.position;setLocation({x:p.x,z:p.z,above:Math.max(0,p.y-world.model.floor(p.x,p.z))});metrics.currentView={time:state.time,lifeTime:state.lifeTime,free:state.free,position:p.toArray(),returning:!!returnView,activities:Object.fromEntries([...new Set(world.model.agents.map(a=>a.journeyActivity).filter(Boolean))].map(activity=>[activity,world.model.agents.filter(a=>a.journeyActivity===activity).length]))};
              metrics.schooling=shallowSchoolingDiagnostics(world.model.schoolingSystem);
              if(state.playing&&Math.floor(state.time)>(metrics.routeSamples.at(-1)?.second??-1))metrics.routeSamples.push({second:Math.floor(state.time),position:p.toArray(),chapter:shallowJourneyChapter(state.time).habitat});}
          }
          if(state.time>=duration&&state.playing){if(journey)metrics.schooling=shallowSchoolingDiagnostics(world.model.schoolingSystem);diagnostics.finish(now);state.playing=false;setTime(state.time);setPlaying(false);}
        }
        frame=requestAnimationFrame(render);
      };
      frame=requestAnimationFrame(render);
    };initialize().catch(e=>{if(!disposed)setError(`场景启动失败：${e.message}`);});
    return()=>{disposed=true;cancelAnimationFrame(frame);observer?.disconnect();runtime.current?.cleanupInput?.();if(runtime.current?.visibility)document.removeEventListener('visibilitychange',runtime.current.visibility);
      if(window.__shallowSampleMetrics===metrics)delete window.__shallowSampleMetrics;controls?.dispose();world?.dispose();renderer?.dispose();renderer?.domElement.remove();runtime.current=null;};
  },[journey,duration,schoolingOnly]);
  const schoolPhase=shallowSchoolingPhase(time);
  const chapter=schoolingOnly?schoolPhase:journey?shallowJourneyChapter(time):shallowSampleChapter(time);
  const toggle=()=>{const state=runtime.current?.state;if(!state||!state.ready)return;if(state.time>=duration){state.time=0;state.lifeTime=0;setTime(0);runtime.current.startRun();}else runtime.current.diagnostics.interrupt('pause');state.playing=!state.playing;setPlaying(state.playing);};
  const restart=()=>{runtime.current?.observe(false);runtime.current?.seek(0);if(runtime.current){runtime.current.state.playing=true;runtime.current.startRun();}setFree(false);setPlaying(true);};
  const changeSpeed=value=>{setSpeed(value);if(runtime.current){runtime.current.diagnostics.interrupt('speed-change');runtime.current.state.speed=value;}};
  const observe=()=>{const next=!free;if(next)setFocused(false);runtime.current?.observe(next);setFree(next);};
  const visit=start=>{if(free){runtime.current?.observe(false);setFree(false);}runtime.current?.seek(start);};
  const replayNarration=start=>{if(!runtime.current?.state.ready)return;if(runtime.current.state.free){runtime.current.observe(false);setFree(false);}runtime.current.seek(start);runtime.current.state.playing=true;setPlaying(true);};
  const lastRun=runtime.current?.diagnostics.metrics.runs.at(-1);
  const downloadMetrics=()=>{const blob=new Blob([JSON.stringify(runtime.current?.diagnostics.metrics,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=journey?'shallow-journey-playback.json':'shallow-sample-playback.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  const exploration=new URL(window.location.href);exploration.searchParams.set('demo','life-expedition');exploration.searchParams.set('world','whole-seabed');
  const schoolUrl=new URL(window.location.href);schoolUrl.searchParams.set('school','1');
  const journeyUrl=new URL(window.location.href);journeyUrl.searchParams.delete('school');
  return <main className={`shallow-sample${journey?' shallow-journey':''}${journey&&focused?' is-focused':''}${journey&&free?' is-exploring':''}`}>
    <output id="shallow-diagnostics" hidden>{JSON.stringify(runtime.current?.diagnostics.metrics??null)}</output>
    <div className="sample-experience" inert={!ready||!!error} aria-hidden={!ready||!!error}>
    <div className="sample-canvas" ref={canvas} tabIndex={journey?0:undefined} role={journey?"region":undefined} aria-label={journey?"浅海探索画面":undefined} onPointerDown={()=>canvas.current?.focus({preventScroll:true})}/>
    <header className="sample-header"><span className="sample-brand">TIDAL <small>浅海观察</small></span><nav><a href={`${import.meta.env.BASE_URL}overview/`}>产品导览</a> · <a href={`${import.meta.env.BASE_URL}assets/shallow-artist/credits.html`} target="_blank" rel="noreferrer">模型来源</a> · <a href={exploration.href}>进入持续探索 ↗</a></nav></header>
    <section className="sample-title" aria-live="polite"><p>{schoolingOnly?'阶段05 · 乌尾鮗协同 · 60秒':journey?'浅海体验 · 三个完整栖息地 · 4分钟':'浅海样板 · 连续巡游 75 秒'}</p><h1>{chapter.title}</h1><span>{chapter.detail}</span></section>
    {journey&&!free&&time<=60&&<section className="schooling-status" aria-label="鱼群协同观察"><small>38条乌尾鮗 · 60秒协同观察</small><strong>{schoolPhase.title}</strong><p>{schoolPhase.detail}</p><ol>{SHALLOW_SCHOOLING_PHASES.map(phase=><li key={phase.id} aria-current={phase.id===schoolPhase.id?'step':undefined}>{phase.title}</li>)}</ol></section>}
    {summary&&<aside className="sample-community">{summary.species} 类动物 · {summary.animals} 个体<span>{schoolingOnly?'现有38条乌尾鮗 · 局部邻居协同':journey?chapter.life:summary.scannedReef?'扫描珊瑚试验 · 整景验收未通过':'群游 · 巡底 · 慢移 · 固着'}</span></aside>}
    {journey&&(free||time>60)&&<aside className="journey-guide"><span className="journey-eyebrow">{free?'就地探索':'连续海域 · 沿途观察'}</span><strong>{free?'巡游进度已保留':chapter.habitat}</strong><p>{free?'点击画面后用WASD / 方向键移动，拖动转向；方向按钮可短按或长按。':chapter.life}</p>{location&&<small>距沙底 {location.above.toFixed(1)} 米 · 本地浅海观察区</small>}
      {free&&<div className="journey-movement">{[['KeyW','向前'],['KeyA','向左'],['KeyS','向后'],['KeyD','向右']].map(([key,label])=><button key={key} aria-label={label} onPointerDown={e=>{e.preventDefault();runtime.current?.move(key,true);}} onPointerUp={()=>runtime.current?.move(key,false)} onPointerLeave={()=>runtime.current?.move(key,false)} onClick={()=>runtime.current?.nudge(key)}>{label}</button>)}</div>}
    </aside>}
    <footer className="sample-controls" ref={panel}>
      {journey&&<nav id="journey-route-controls" className={`journey-chapters${schoolingOnly?' school-chapters':''}`} aria-label={schoolingOnly?'鱼群协同阶段':'浅海路线'}>{(schoolingOnly?SHALLOW_SCHOOLING_PHASES:SHALLOW_JOURNEY_CHAPTERS).map((c,i)=><button key={c.start} aria-label={`跳至${c.title}`} aria-current={chapter===c?'step':undefined} disabled={!ready} onClick={()=>visit(c.start)}><small>0{i+1}</small>{schoolingOnly?c.title:['进入礁谷','礁边群落','礁沙过渡','沙底生命','草床海龟','开阔水层'][i]}</button>)}</nav>}
      <div className="sample-progress"><label htmlFor="sample-progress">巡游进度</label><input id="sample-progress" disabled={!ready} type="range" min="0" max={duration} step=".1" value={time} onChange={e=>runtime.current?.seek(Number(e.target.value))}/><span>{Math.floor(time)} / {duration} 秒</span></div>
      <div className="sample-actions">{journey&&<span className="journey-focus-position">{schoolingOnly?'鱼群协同':chapter.habitat} · {Math.floor(time/60)}:{String(Math.floor(time%60)).padStart(2,'0')} / {schoolingOnly?'1:00':'4:00'}</span>}<button onClick={toggle} className="sample-toggle" disabled={!ready||!!error||(journey&&free)}>{time>=duration?'重新播放':playing?'暂停巡游':'继续巡游'}</button><button className="journey-focus-secondary" onClick={restart} disabled={!ready||!!error}>从头观看</button>
        <label className="journey-focus-secondary">播放速度 <select disabled={!ready} value={speed} onChange={e=>changeSpeed(Number(e.target.value))}><option value=".5">0.5×</option><option value="1">1×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></label>
        <button className="journey-focus-secondary" onClick={observe} aria-pressed={free} disabled={!ready||!!error}>{free?'返回巡游镜头':journey?'接管探索':'自由观察'}</button><span>{free?journey?'WASD移动 · 拖动转向':'拖动旋转 · 滚轮靠近':time>=duration?'巡游完成，可自由观察这片海床':'礁谷 → 沙道 → 草床'}</span>
        {journey&&<a className="journey-focus-secondary school-link" href={schoolingOnly?journeyUrl.href:schoolUrl.href}>{schoolingOnly?'观看完整4分钟':'观看60秒鱼群协同'}</a>}
        {lastRun?.completed&&<span>最近完整播放记录 {lastRun.averageFps.toFixed(1)} FPS · {lastRun.elapsedWallSeconds.toFixed(1)} 秒{!lastRun.uninterrupted?' · 含操作中断':''}</span>}
        {lastRun?.completed&&<button className="journey-focus-secondary" onClick={downloadMetrics}>下载播放数据</button>}{journey&&<button className="journey-focus-toggle" disabled={free} title={free?'返回巡游后可专注观看':'按Esc也可展开控制'} aria-expanded={!focused} aria-controls="journey-route-controls" onClick={()=>setFocused(!focused)}>{focused?'展开控制':'专注观看'}</button>}</div>
      {journey&&<ShallowNarration runtime={runtime} ready={ready&&!error} onRestart={restart} onReplay={replayNarration} focused={focused} schoolingOnly={schoolingOnly}/>}
    </footer>
    </div>
    {(!ready||error)&&<SceneLoading experience={schoolingOnly?'school':journey?'journey':'sample'} phase={loadingPhase} error={error}/>}
  </main>;
}
