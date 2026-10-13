// Full foreground playback evidence. All rates below are actual rAF cadence;
// construction/CPU benchmarks never populate these records.
export function createShallowPlaybackMetrics(){
  const metrics={version:2,frameIntervalsMs:[],resolutionScale:1,slowFrames:0,drawCalls:0,triangles:0,runs:[],startupMs:null};
  let run=null;
  return {metrics,
    start(now,settings){run={...settings,startedAt:now,intervalsMs:[],resolutionHistory:[],interruptions:[],completed:false};metrics.runs.push(run);if(metrics.runs.length>3)metrics.runs.shift();},
    interrupt(reason){if(run&&!run.completed&&!run.interruptions.includes(reason))run.interruptions.push(reason);},
    frame(now,interval,time,scale){
      if(!run||run.completed)return;
      if(interval>0&&run.intervalsMs.length<60000)run.intervalsMs.push(interval);
      if(run.resolutionHistory.at(-1)?.scale!==scale)run.resolutionHistory.push({time,scale});
      run.lastModelSecond=time;run.elapsedWallSeconds=(now-run.startedAt)/1000;
    },
    finish(now){if(!run||run.completed)return;run.completed=true;run.elapsedWallSeconds=(now-run.startedAt)/1000;
      const sorted=[...run.intervalsMs].sort((a,b)=>a-b),sum=sorted.reduce((a,b)=>a+b,0);
      run.averageFps=sum?sorted.length*1000/sum:0;run.p95FrameMs=sorted[Math.floor((sorted.length-1)*.95)]??0;
      run.maxFrameMs=sorted.at(-1)??0;run.uninterrupted=run.interruptions.length===0;
    }
  };
}
