import React from 'react';
import './directorPlayer.css';

const finite = value => Number.isFinite(value) ? value : 0;

export function DirectorPlayer({ state, steps = [], onPause, onResume, onNext,
  onPrevious, onSeek, onStop, onRestart }) {
  if (!state || (!state.active && state.phase !== 'complete')) return null;

  const count = steps.length;
  const index = Math.min(Math.max(0, Math.trunc(finite(state.index))), Math.max(0, count - 1));
  const step = steps[index];
  const complete = state.phase === 'complete';
  const loading = state.phase === 'loading';
  const durationMs = Math.max(0, finite(step?.durationMs));
  const elapsedMs = Math.min(durationMs, Math.max(0, finite(state.elapsedMs)));
  const progress = complete ? 100 : durationMs ? Math.round(elapsedMs / durationMs * 100) : 0;
  const remainingSec = Math.ceil(Math.max(0, durationMs - elapsedMs) / 1000);
  const phaseLabel = complete ? '演示结束' : loading ? '正在进入章节' : state.playing ? '自动播放' : '已暂停';
  const currentLabel = complete ? '演示结束' : `${index + 1} / ${count} · ${step?.title || '场景观察'}`;

  return <section className="director-player glass" aria-label="导演演示播放器" data-phase={state.phase}>
    <header className="director-player-heading">
      <span className="director-player-brand"><i aria-hidden="true"/>导演演示</span>
      <span className="director-player-phase">{phaseLabel}</span>
      <button type="button" className="director-player-exit" aria-label="退出导演演示" onClick={onStop}>退出</button>
    </header>

    <div className="director-player-copy">
      {/* The live region contains chapter text only. Frame-by-frame dwell
          updates remain outside it so screen readers hear each step once. */}
      <p className="director-player-title" role="status" aria-live="polite" aria-atomic="true">{currentLabel}</p>
      <p className="director-player-caption">{complete
        ? '可以重新播放，或回到当前海域自由探索。'
        : step?.caption || '观察当前海域的实际场景与状态。'}</p>
    </div>

    {state.error && <p className="director-player-error" role="alert">{String(state.error)}</p>}

    <div className="director-player-progress-row">
      <div className="director-player-progress" role="progressbar" aria-label="当前章节停留进度"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={loading ? 0 : progress}
        aria-valuetext={complete ? '演示结束' : loading ? '章节加载中' : `${progress}%，剩余 ${remainingSec} 秒`}>
        <span style={{ width: `${loading ? 0 : progress}%` }}/>
      </div>
      <span className="director-player-timing">{complete ? '已结束' : loading
        ? '加载中…' : state.playing ? `${remainingSec} 秒后继续` : '暂停中'}</span>
    </div>

    <div className="director-player-controls">
      <select aria-label="导演演示章节" value={step?.id || ''} disabled={!count}
        onChange={event => {
          const chosen = steps.findIndex(item => item.id === event.target.value);
          if (chosen >= 0) onSeek(chosen);
        }}>
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
  </section>;
}
