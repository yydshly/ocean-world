import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ShallowSampleScene } from './world/ShallowSampleScene.js';
import { SHALLOW_SAMPLE_SECONDS, shallowSampleChapter } from './shallowSample.js';
import './shallowSample.css';
import { createShallowPlaybackMetrics } from './shallowSamplePlayback.js';
import {prepareShallowRenderer} from './world/prepareShallowRenderer.js';

export function ShallowSampleApp(){
  const canvas=useRef(null),runtime=useRef(null),[time,setTime]=useState(0),[playing,setPlaying]=useState(true),
    [speed,setSpeed]=useState(1),[free,setFree]=useState(false),[summary,setSummary]=useState(null),[ready,setReady]=useState(false),[error,setError]=useState('');
  useEffect(()=>{
    const mount=canvas.current;let renderer,world,controls,frame,observer,disposed=false,last=0,lastUi=0;
    const pixelRatio=Math.min(window.devicePixelRatio||1,1.5),cadence={samples:[],slow:0,stable:0,frames:0,scale:1};
    const diagnostics=createShallowPlaybackMetrics(),metrics=diagnostics.metrics,startup=performance.now();
    const state={time:0,playing:false,speed:1,free:false,ready:false,dirty:true};
    try{
      renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
      const gl=renderer.getContext(),gpu=gl.getExtension('WEBGL_debug_renderer_info');
      metrics.environment={browser:navigator.userAgent,gpu:gpu?gl.getParameter(gpu.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),context:gl.constructor.name};
      renderer.setPixelRatio(pixelRatio);
      renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
      renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.85;
      mount.appendChild(renderer.domElement);
      const params=new URLSearchParams(window.location.search),seed=Number(params.get('seed')||55);
      const modelStart=performance.now();
      world=new ShallowSampleScene(Number.isFinite(seed)?seed:55,{scannedReef:params.get('reef')==='scanned'});setSummary({...world.summary,scannedReef:world.model.scannedReef});
      metrics.modelBuildMs=performance.now()-modelStart;
      metrics.preparedCover={used:world.model.preparedCover,signature:world.model.coverInputSignature,raw:world.model.coverRawInputSignature,authoringRaw:world.model.coverExpectedRawSignature};
      controls=new OrbitControls(world.camera,renderer.domElement);controls.enabled=false;controls.enableDamping=true;
      controls.minDistance=1;controls.maxDistance=45;controls.maxPolarAngle=Math.PI*.85;
      const resize=()=>{const {width,height}=mount.getBoundingClientRect();if(!width||!height)return;
        renderer.setSize(width,height,false);world.camera.aspect=width/height;world.camera.updateProjectionMatrix();state.dirty=true;};
      observer=new ResizeObserver(resize);observer.observe(mount);resize();
      const startRun=()=>{const {width,height}=mount.getBoundingClientRect();diagnostics.start(performance.now(),{speed:state.speed,width,height,pixelRatio});};
      runtime.current={state,diagnostics,startRun,seek(value){diagnostics.interrupt('seek');state.time=THREE.MathUtils.clamp(value,0,SHALLOW_SAMPLE_SECONDS);world.update(state.time,!state.free);state.dirty=true;setTime(state.time);},
        observe(value){if(value)diagnostics.interrupt('free-observation');state.free=value;state.dirty=true;controls.enabled=value;if(value){controls.target.copy(world.camera.position).add(world.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(8));controls.update();}else world.update(state.time);}};
      // Prepare visible assets and programs before the tour clock starts.
      // Source timeouts retain the full fallback scene, and seal late arrivals.
      const prepare=async()=>{
        const assetStart=performance.now();
        // The dry museum skeleton is optional scenery, not required living
        // reef. Its runtime placement search must not block this showcase.
        let timeout;await Promise.race([world.loadTextures(),new Promise(resolve=>timeout=setTimeout(resolve,4000))]);clearTimeout(timeout);
        metrics.textureReadyMs=performance.now()-assetStart;
        if(disposed)return;world.assetsSealed=true;world.animals.artists.sealed=true;world.animals.sourcedFish.sealed=true;world.animals.sourceTurtle.sealed=true;world.animals.openCommunity.sealed=true;world.nearCommunity.sealed=true;world.benthicCorals.sealed=true;world.animals.contactFauna.sealed=true;world.scanController.abort();
        const preparation=await prepareShallowRenderer(renderer,world.scene,world.camera,()=>disposed);if(disposed)return;
        metrics.compileMs=preparation.compileMs;metrics.assetUploadMs=preparation.uploadMs;metrics.preparedRenderBatches=preparation.batches;
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
        if(!state.playing&&!state.free&&!state.dirty){last=0;frame=requestAnimationFrame(render);return;}
        const interval=last?now-last:0,dt=Math.min(interval/1000,.1);last=now;
        if(!document.hidden){
          if(state.playing)state.time=Math.min(SHALLOW_SAMPLE_SECONDS,state.time+dt*state.speed);
          if(state.playing||state.free||state.dirty)world.update(state.time,!state.free);
          if(state.free){controls.update();const p=world.camera.position;p.y=Math.max(p.y,world.model.surface(p.x,p.z,true)+.6);world.updateView();}
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
          if(now-lastUi>180){setTime(state.time);lastUi=now;}
          if(state.time>=SHALLOW_SAMPLE_SECONDS&&state.playing){diagnostics.finish(now);state.playing=false;setTime(state.time);setPlaying(false);}
        }
        frame=requestAnimationFrame(render);
      };
      frame=requestAnimationFrame(render);
    }catch(e){setError(`场景启动失败：${e.message}`);}
    return()=>{disposed=true;cancelAnimationFrame(frame);observer?.disconnect();if(runtime.current?.visibility)document.removeEventListener('visibilitychange',runtime.current.visibility);
      if(window.__shallowSampleMetrics===metrics)delete window.__shallowSampleMetrics;controls?.dispose();world?.dispose();renderer?.dispose();renderer?.domElement.remove();runtime.current=null;};
  },[]);
  const chapter=shallowSampleChapter(time);
  const toggle=()=>{const state=runtime.current?.state;if(!state||!state.ready)return;if(state.time>=SHALLOW_SAMPLE_SECONDS){state.time=0;setTime(0);runtime.current.startRun();}else runtime.current.diagnostics.interrupt('pause');state.playing=!state.playing;setPlaying(state.playing);};
  const restart=()=>{runtime.current?.observe(false);runtime.current?.seek(0);if(runtime.current){runtime.current.state.playing=true;runtime.current.startRun();}setFree(false);setPlaying(true);};
  const changeSpeed=value=>{setSpeed(value);if(runtime.current){runtime.current.diagnostics.interrupt('speed-change');runtime.current.state.speed=value;}};
  const observe=()=>{const next=!free;runtime.current?.observe(next);setFree(next);};
  const lastRun=runtime.current?.diagnostics.metrics.runs.at(-1);
  const downloadMetrics=()=>{const blob=new Blob([JSON.stringify(runtime.current?.diagnostics.metrics,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='shallow-sample-playback.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  const exploration=new URL(window.location.href);exploration.searchParams.set('demo','life-expedition');exploration.searchParams.set('world','whole-seabed');
  return <main className="shallow-sample">
    <div className="sample-canvas" ref={canvas}/>
    <header className="sample-header"><span className="sample-brand">TIDAL <small>浅海观察</small></span><nav><a href={`${import.meta.env.BASE_URL}overview/`}>产品导览</a> · <a href={`${import.meta.env.BASE_URL}assets/shallow-artist/credits.html`} target="_blank" rel="noreferrer">模型来源</a> · <a href={exploration.href}>进入持续探索 ↗</a></nav></header>
    <section className="sample-title" aria-live="polite"><p>浅海样板 · 连续巡游 75 秒</p><h1>{chapter.title}</h1><span>{chapter.detail}</span></section>
    {summary&&<aside className="sample-community">{summary.species} 类动物 · {summary.animals} 个体<span>{summary.scannedReef?'扫描珊瑚试验 · 整景验收未通过':'群游 · 巡底 · 慢移 · 固着'}</span></aside>}
    {error&&<div className="sample-error" role="alert">{error}<button onClick={()=>window.location.reload()}>重新载入</button></div>}
    {!ready&&!error&&<div className="sample-preparing" role="status">正在准备浅海场景…</div>}
    <footer className="sample-controls">
      <div className="sample-progress"><label htmlFor="sample-progress">巡游进度</label><input id="sample-progress" disabled={!ready} type="range" min="0" max={SHALLOW_SAMPLE_SECONDS} step=".1" value={time} onChange={e=>runtime.current?.seek(Number(e.target.value))}/><span>{Math.floor(time)} / 75 秒</span></div>
      <div className="sample-actions"><button onClick={toggle} disabled={!ready||!!error}>{time>=75?'重新播放':playing?'暂停巡游':'继续巡游'}</button><button onClick={restart} disabled={!ready||!!error}>从头观看</button>
        <label>播放速度 <select disabled={!ready} value={speed} onChange={e=>changeSpeed(Number(e.target.value))}><option value=".5">0.5×</option><option value="1">1×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></label>
        <button onClick={observe} aria-pressed={free} disabled={!ready||!!error}>{free?'返回巡游镜头':'自由观察'}</button><span>{free?'拖动旋转 · 滚轮靠近':time>=75?'巡游完成，可自由观察这片海床':'礁谷 → 沙道 → 草床'}</span>
        {lastRun?.completed&&<span>本轮 {lastRun.averageFps.toFixed(1)} FPS · {lastRun.elapsedWallSeconds.toFixed(1)} 秒{!lastRun.uninterrupted?' · 含操作中断':''}</span>}
        {lastRun?.completed&&<button onClick={downloadMetrics}>下载播放数据</button>}</div>
    </footer>
  </main>;
}
