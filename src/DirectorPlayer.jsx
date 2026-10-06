import React from 'react';
import { DIRECTOR_PLAYBACK_RATES } from './directorTour.js';
import { directorTourProgress } from './directorTourProgress.js';
import './directorPlayer.css';

const finite = value => Number.isFinite(value) ? value : 0;
const durationText = seconds => {
  const remaining = Math.max(0, Math.ceil(finite(seconds)));
  return `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
};

export function DirectorPlayer({ state, steps = [], onPause, onResume, onNext,
  onPrevious, onSeek, onStop, onRestart, onPlaybackRateChange }) {
  if (!state || (!state.active && state.phase !== 'complete')) return null;

  const count = steps.length;
  const index = Math.min(Math.max(0, Math.trunc(finite(state.index))), Math.max(0, count - 1));
  const step = steps[index];
  const complete = state.phase === 'complete';
  const loading = state.phase === 'loading';
  const transition = state.transition;
  const fading = state.active && ['out', 'covered', 'in'].includes(transition?.phase);
  const moving = state.active && transition?.phase === 'move';
  const maskOpacity = Math.min(1, Math.max(0, finite(transition?.opacity)));
  const transitionCopy = fading ? transition.kind === 'cross-world' ? '转往另一海域'
    : transition.kind === 'reposition' ? '转往另一观察点' : '调整观察镜头'
    : moving ? '附近镜头正在衔接' : null;
  const durationMs = Math.max(0, finite(step?.durationMs));
  const elapsedMs = Math.min(durationMs, Math.max(0, finite(state.elapsedMs)));
  const progress = durationMs ? Math.round(elapsedMs / durationMs * 100) : 0;
  const playbackRate = DIRECTOR_PLAYBACK_RATES.includes(state.playbackRate) ? state.playbackRate : 1;
  const remainingSec = Math.ceil(Math.max(0, durationMs - elapsedMs) / (1000 * playbackRate));
  const route = directorTourProgress(state, steps);
  const timelinePercent = Math.min(100, Math.max(0, Math.round(finite(route.timelinePercent))));
  const routeTiming = `${state.playing ? '剩余约' : '继续播放约'} ${durationText(route.remainingSec)}（另加转场和加载）`;
  const routeSummary = `路线位置 ${timelinePercent}% · 完整播放 ${route.completedCount}/${route.totalCount}`;
  const completionSummary = `完整播放 ${route.completedCount}/${route.totalCount}${route.allCompleted
    ? '' : ` · 尚有 ${route.unfinishedCount} 章未完整播放`}`;
  const activePhaseLabel = fading ? '自然转场中' : loading || moving ? '镜头衔接中' : '镜头巡游';
  const phaseLabel = complete ? '演示结束' : !state.playing
    ? fading || loading || moving ? `已暂停 · ${activePhaseLabel}` : '已暂停' : activePhaseLabel;
  const currentLabel = complete ? '演示结束' : `${index + 1} / ${count} · ${step?.title || '场景观察'}`;

  return <>
    {/* The hook owns the actual opacity and execution gate. This sibling only
        covers scenery; there is no independent CSS timer or completion event. */}
    {fading && <div className="director-scene-transition" aria-hidden="true"
      data-transition-phase={transition.phase} data-transition-kind={transition.kind}
      style={{ opacity: maskOpacity }}
    />}
    <section className="director-player glass" aria-label="导演演示播放器" data-phase={state.phase}>
    <header className="director-player-heading">
      <span className="director-player-brand"><i aria-hidden="true"/>导演演示</span>
      <span className="director-player-phase">{phaseLabel}</span>
      <label className="director-player-speed">巡游速度
        <select aria-label="巡游速度" value={playbackRate}
          onChange={event => onPlaybackRateChange?.(Number(event.target.value))}>
          {DIRECTOR_PLAYBACK_RATES.map(rate => <option key={rate} value={rate}>{rate}×</option>)}
        </select>
      </label>
      <button type="button" className="director-player-exit" aria-label="退出导演演示" onClick={onStop}>退出</button>
    </header>

    <div className="director-player-copy">
      {/* The live region contains chapter text only. Frame-by-frame dwell
          updates remain outside it so screen readers hear each step once. */}
      <p className="director-player-title" role="status" aria-live="polite" aria-atomic="true">{currentLabel}</p>
      <p className="director-player-caption">{complete
        ? route.allCompleted
          ? `全部 ${route.totalCount} 章已完整播放。可选择章节重看，或自由探索。`
          : '本次演示已结束。选择章节可重新观看，也可以重新播放全部，或自由探索。'
        : step?.caption || '观察当前海域的实际场景与状态。'}</p>
      {transitionCopy && <p className="director-player-transition-copy">{transitionCopy}</p>}
    </div>

    {state.error && <p className="director-player-error" role="alert">{String(state.error)}</p>}

    <div className="director-player-progress-row">
      <div className="director-player-progress" role="progressbar" aria-label="当前章节巡游进度"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={loading ? 0 : progress}
        aria-valuetext={complete ? '演示结束' : loading ? '章节加载中' : `${progress}%，剩余 ${remainingSec} 秒`}>
        <span style={{ width: `${loading ? 0 : progress}%` }}/>
      </div>
      <span className="director-player-timing">{complete ? '已结束' : loading
        ? '加载中…' : state.playing ? `${remainingSec} 秒后继续` : '暂停中'}</span>
    </div>

    <div className="director-player-route-row">
      {!complete && <div className="director-player-route-progress" role="progressbar" aria-label="导演路线进度"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={timelinePercent}
        aria-valuetext={`${routeSummary} · ${routeTiming}`}>
        <span style={{ width: `${timelinePercent}%` }}/>
      </div>}
      <span className="director-player-route-summary">{complete ? completionSummary : `${routeSummary} · ${routeTiming}`}</span>
    </div>

    <div className="director-player-controls">
      <select aria-label="导演演示章节" value={complete ? '' : step?.id || ''} disabled={!count}
        onChange={event => {
          const chosen = steps.findIndex(item => item.id === event.target.value);
          if (chosen >= 0) onSeek(chosen);
        }}>
        {complete && <option value="" disabled>选择章节重新观看</option>}
        {steps.map((item, itemIndex) => <option key={item.id} value={item.id}>
          {String(itemIndex + 1).padStart(2, '0')} · {item.title}
        </option>)}
      </select>
      {complete ? <div className="director-player-buttons director-player-completion">
        <button type="button" className="director-primary" onClick={onRestart}>重新演示</button>
        <button type="button" onClick={onStop}>自由探索</button>
      </div> : <div className="director-player-buttons">
        <button type="button" disabled={!count || index === 0} onClick={onPrevious}>上一章</button>
        <button type="button" className="director-primary" aria-label={state.playing ? '暂停导演演示' : '继续导演演示'} onClick={state.playing ? onPause : onResume}>
          {state.playing ? '暂停' : '继续'}
        </button>
        <button type="button" disabled={!count} onClick={onNext}>{index === count - 1 ? '结束演示' : '下一章'}</button>
      </div>}
    </div>
  </section></>;
}
