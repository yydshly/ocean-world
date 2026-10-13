import journey from './data/shallowJourneyNarration.json' with {type:'json'};
import school from './data/shallowSchoolingNarration.json' with {type:'json'};
import {SHALLOW_JOURNEY_CHAPTERS,SHALLOW_JOURNEY_SECONDS} from './shallowJourney.js';
import {SHALLOW_SCHOOLING_PHASES,SHALLOW_SCHOOLING_SECONDS} from './shallowSchooling.js';

const schoolTimeline={clips:school.clips,chapters:SHALLOW_SCHOOLING_PHASES,duration:SHALLOW_SCHOOLING_SECONDS,
  intro:'五段鱼群讲解 · 开启后从当前位置继续'};
const journeyTimeline={
  // Let the full recovery finish before speaking about the next habitat.
  // All five later habitat recordings are reused without changing their audio.
  clips:[...school.clips,...journey.clips.filter(clip=>clip.id!=='reef-entry').map(clip=>
    clip.id==='reef-edge'?{...clip,start:64}:clip)],
  chapters:[...SHALLOW_SCHOOLING_PHASES,...SHALLOW_JOURNEY_CHAPTERS.slice(1).map((chapter,index)=>
    index===0?{...chapter,start:SHALLOW_SCHOOLING_SECONDS}:chapter)],
  duration:SHALLOW_JOURNEY_SECONDS,intro:'十段中文讲解 · 开启后从当前位置继续',
};

export function shallowNarrationTimeline({schoolingOnly=false}={}){
  return schoolingOnly?schoolTimeline:journeyTimeline;
}
