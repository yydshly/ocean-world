/** Only the current native shot's completed clock can confirm a chapter. */
export function directorMotionCompletionEvent(shot, state, token, steps) {
  if (!state?.active || state.phase !== 'showing' || state.error || state.token !== token) return null;
  const durationSec = steps?.[state.index]?.motion?.durationSec;
  if (!Number.isFinite(durationSec) || durationSec <= 0 || !shot || shot.complete !== true || shot.error
    || !['walk', 'orbit', 'follow'].includes(shot.kind) || shot.durationSec !== durationSec
    || !Number.isFinite(shot.elapsedSec) || shot.elapsedSec < durationSec) return null;
  return { type: 'record-complete', token };
}
