import { DIRECTOR_STEPS } from './directorTour.js';
import { isDirectorPlaybackRate } from './directorCameraMotion.js';

/** Route position and full-shot coverage are separate. Seeking can move the
 * position forwards or backwards, but never counts an unseen chapter as played.
 * Remaining time estimates rendered observation only; loading has no fixed ETA. */
export function directorTourProgress(state, steps = DIRECTOR_STEPS) {
  const durations = steps.map(step => Number.isFinite(step.durationMs) && step.durationMs > 0 ? step.durationMs : 0);
  const totalMs = durations.reduce((sum, duration) => sum + duration, 0);
  const index = Number.isInteger(state.index) ? Math.max(0, Math.min(steps.length - 1, state.index)) : 0;
  const currentMs = durations[index] || 0;
  const elapsedMs = ['showing', 'complete'].includes(state.phase) && Number.isFinite(state.elapsedMs)
    ? Math.max(0, Math.min(currentMs, state.elapsedMs)) : 0;
  const precedingMs = durations.slice(0, index).reduce((sum, duration) => sum + duration, 0);
  const remainingMs = currentMs - elapsedMs + durations.slice(index + 1).reduce((sum, duration) => sum + duration, 0);
  const playbackRate = isDirectorPlaybackRate(state.playbackRate) ? state.playbackRate : 1;
  const stepIds = new Set(steps.map(step => step.id));
  const completedCount = new Set((state.completedStepIds || []).filter(id => stepIds.has(id))).size;
  const totalCount = steps.length;
  const allCompleted = totalCount > 0 && completedCount === totalCount;
  return {
    timelinePercent: totalMs > 0 ? 100 * (precedingMs + elapsedMs) / totalMs : 0,
    remainingSec: state.phase === 'complete' ? 0 : Math.ceil(remainingMs / (1000 * playbackRate)),
    completedCount, totalCount, unfinishedCount: totalCount - completedCount,
    completed: allCompleted, allCompleted,
  };
}
