import React,{useEffect,useRef,useState} from 'react';
import {createShallowNarration} from './shallowNarration.js';
import narration from './data/shallowJourneyNarration.json';

export function ShallowNarration({runtime,ready,onRestart}){
  const audio=useRef(null),controller=useRef(null),events=useRef([]);
  const [voice,setVoice]=useState({enabled:false,status:'off',subtitle:''});
  const [volume,setVolume]=useState(.75),[captions,setCaptions]=useState(true);
  const snapshot=()=>({...runtime.current?.narrationSnapshot(),hidden:document.hidden});
  useEffect(()=>{
    const player=createShallowNarration(audio.current,narration.clips,{baseUrl:import.meta.env.BASE_URL,onStatus:next=>{
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
  },[runtime]);
  // The route is authoritative, including explicit seeks and the return blend.
  useEffect(()=>{controller.current?.sync(snapshot());});
  const enable=()=>{onRestart();controller.current?.enable(snapshot());};
  const retry=['blocked','error'].includes(voice.status);
  const active=narration.clips.find(c=>c.id===voice.clipId);
  const messages={off:'六段中文讲解 · 段落间留白观察',quiet:'留白观察 · 下一段将随镜头开始',paused:'讲解已随巡游暂停',loading:'正在载入讲解',playing:active?.title??'正在讲解',blocked:'点击重试讲解以允许播放',error:'语音暂不可用，仍可继续观看'};
  return <section className="journey-narration" aria-label="浅海语音讲解">
    <audio ref={audio} preload="none" aria-label="浅海中文旁白"/>
    <output id="shallow-narration-diagnostics" hidden>{JSON.stringify({enabled:voice.enabled,status:voice.status,clipId:voice.clipId,events:events.current})}</output>
    <div className="narration-actions">
      <button disabled={!ready} onClick={retry?()=>controller.current?.enable(snapshot()):voice.enabled?()=>controller.current?.disable():enable} aria-pressed={voice.enabled}>{retry?'重试讲解':voice.enabled?'关闭讲解':'开启讲解 · 从头观看'}</button>
      <label>音量 <input aria-label="讲解音量" type="range" min="0" max="1" step=".05" value={volume} onChange={e=>{const value=Number(e.target.value);setVolume(value);controller.current?.setVolume(value);}}/></label>
      <label><input type="checkbox" checked={captions} onChange={e=>setCaptions(e.target.checked)}/>字幕</label>
      <span>AI合成旁白 · {messages[voice.status]}</span>
    </div>
    {voice.enabled&&captions&&voice.subtitle&&<p className="narration-caption" aria-label="当前讲解字幕">{voice.subtitle}</p>}
  </section>;
}
