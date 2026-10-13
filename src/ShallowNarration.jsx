import React,{useEffect,useRef,useState} from 'react';
import {createShallowNarration} from './shallowNarration.js';
import {shallowNarrationTimeline} from './shallowNarrationTimeline.js';
import {shallowNarrationPresentation} from './shallowNarrationPresentation.js';

export function ShallowNarration({runtime,ready,onRestart,onReplay,focused=false,schoolingOnly=false}){
  const timeline=shallowNarrationTimeline({schoolingOnly});
  const audio=useRef(null),controller=useRef(null),events=useRef([]);
  const [voice,setVoice]=useState({enabled:false,status:'off',subtitle:''});
  const [volume,setVolume]=useState(.75),[captions,setCaptions]=useState(true);
  const snapshot=()=>({...runtime.current?.narrationSnapshot(),hidden:document.hidden});
  useEffect(()=>{
    const player=createShallowNarration(audio.current,timeline.clips,{baseUrl:import.meta.env.BASE_URL,onStatus:next=>{
      const previous=events.current.at(-1);
      if(previous?.status!==next.status||previous?.clipId!==next.clipId){
        events.current.push({time:runtime.current?.state.time??0,status:next.status,clipId:next.clipId??null});
        if(events.current.length>120)events.current.shift();
      }
      setVoice(next);
    }});
    controller.current=player;player.setVolume(.75);
    const visibility=()=>player.sync(snapshot());
    document.addEventListener('visibilitychange',visibility);
    return()=>{document.removeEventListener('visibilitychange',visibility);player.dispose();controller.current=null;};
  },[runtime,timeline]);
  // The route is authoritative, including explicit seeks and the return blend.
  useEffect(()=>{controller.current?.sync(snapshot());});
  // Keep this directly inside the click gesture so the media player can unlock
  // later speech even when the current route position is intentionally silent.
  const enable=()=>controller.current?.enable(snapshot());
  const fromStart=()=>{onRestart();enable();};
  const route=snapshot();
  const presentation=shallowNarrationPresentation({snapshot:route,voice,...timeline});
  const replay=()=>{onReplay?.(presentation.replayStart);enable();};
  const retry=['blocked','error'].includes(voice.status);
  return <section className={`journey-narration${focused?' narration-focused':''}`} aria-label="浅海语音讲解">
    <audio ref={audio} preload="none" aria-label="浅海中文旁白"/>
    <output id="shallow-narration-diagnostics" hidden>{JSON.stringify({enabled:voice.enabled,status:voice.status,clipId:voice.clipId,events:events.current})}</output>
    <div className="narration-actions">
      <button disabled={!ready} onClick={retry?enable:voice.enabled?()=>controller.current?.disable():enable} aria-pressed={voice.enabled}>{retry?'重试讲解':voice.enabled?'关闭讲解':'开启讲解'}</button>
      {onReplay&&presentation.canReplay&&<button className="narration-secondary" onClick={replay} title={`从「${presentation.replayTitle}」的讲解开头重听`}>重听本段</button>}
      <button className="narration-secondary" disabled={!ready} onClick={fromStart}>从头讲解</button>
      <label className="narration-secondary">音量 <input aria-label="讲解音量" type="range" min="0" max="1" step=".05" value={volume} onChange={e=>{const value=Number(e.target.value);setVolume(value);controller.current?.setVolume(value);}}/></label>
      <label className="narration-secondary"><input type="checkbox" checked={captions} onChange={e=>setCaptions(e.target.checked)}/>字幕</label>
      <span className="narration-status" role="status">AI合成旁白 · {presentation.message}</span>
    </div>
    {voice.enabled&&captions&&voice.subtitle&&<p className="narration-caption" aria-label="当前讲解字幕">{voice.subtitle}</p>}
  </section>;
}
