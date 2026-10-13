const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Keep one optional audio element aligned with the tour, never with frame count. */
export function createShallowNarration(audio, clips, {baseUrl = '', onStatus = () => {}} = {}) {
  const ordered = clips.filter(clip => Number.isFinite(clip.start) && clip.duration > 0)
    .slice().sort((a, b) => a.start - b.start);
  let enabled = false, disposed = false, current = null, snapshot = null;
  let wanted = false, attempted = false, pending = false, waiting = false;
  let token = 0, pendingSeek = false, ended = false, blocked = false, previousStatus = '';
  let priming = null;
  const failures = new Set();
  audio.preload = 'none';
  audio.preservesPitch = true;

  const url = src => /^(?:https?:|data:|blob:|\/)/.test(src)
    ? src : `${baseUrl.replace(/\/$/, '')}/${src.replace(/^\//, '')}`;
  const offset = () => current ? Math.max(0, (snapshot?.time || 0) - current.start) : 0;
  const caption = () => {
    if (!current) return '';
    const time = pendingSeek ? offset() : Number(audio.currentTime) || 0;
    return current.subtitles?.find(line => time >= line.start && time < line.end)?.text || '';
  };
  const publish = () => {
    if (disposed) return;
    let status = 'off', message = '';
    if (enabled) {
      if (blocked) { status = 'blocked'; message = '浏览器暂停了语音，请再次点击开启讲解。'; }
      else if (current && failures.has(current.id)) { status = 'error'; message = '本段语音未能播放，巡游可继续；重新开启讲解可重试。'; }
      else if (!current || ended) status = 'quiet';
      else if (!wanted) status = 'paused';
      else if (pending || waiting || audio.readyState < 2) status = 'loading';
      else status = audio.paused ? 'paused' : 'playing';
    }
    const value = {enabled, status, clipId: enabled ? current?.id || null : null,
      subtitle: ['playing', 'paused', 'loading'].includes(status) ? caption() : '', message};
    const key = JSON.stringify(value);
    if (key !== previousStatus) { previousStatus = key; onStatus(value); }
  };
  const cancelPrime = () => {
    if (!priming) return;
    const previous = priming;
    priming = null; token++;
    audio.pause();
    audio.muted = previous.muted;
  };
  const stop = () => {
    cancelPrime();
    if (wanted || attempted || pending || !audio.paused) {
      token++; pending = false; attempted = false;
      wanted = false;
      audio.pause();
    }
    wanted = false;
  };
  const seek = force => {
    if (!current) return;
    if (audio.readyState < 1) { pendingSeek = true; return; }
    const duration = Number.isFinite(audio.duration) ? audio.duration : current.duration;
    const target = clamp(offset(), 0, Math.max(0, duration - .001));
    if (force || pendingSeek || Math.abs((Number(audio.currentTime) || 0) - target) > .7) {
      try { audio.currentTime = target; pendingSeek = false; }
      catch { pendingSeek = true; }
    }
  };
  const fail = (error, ownToken) => {
    if (disposed || ownToken !== token || !enabled) return;
    pending = false;
    if (error?.name === 'NotAllowedError') blocked = true;
    else failures.add(current?.id);
    wanted = false;
    audio.pause();
    publish();
  };
  const play = () => {
    if (attempted || pending || blocked || failures.has(current?.id)) return;
    const ownToken = ++token;
    attempted = true; pending = true;
    try {
      const promise = audio.play();
      Promise.resolve(promise).then(() => {
        if (disposed || ownToken !== token) return;
        if (!enabled) { audio.pause(); return; }
        pending = false; publish();
      }, error => fail(error, ownToken));
    } catch (error) { fail(error, ownToken); }
  };
  // A gesture can arrive in a silent gap or while the route is paused. Touch
  // this same media element synchronously, silently, so browsers can grant it
  // playback permission before the next narrated section. Some policies still
  // require a retry; the normal blocked state remains the explicit fallback.
  const prime = clip => {
    if (!clip || priming || blocked || failures.has(clip.id)) return;
    const ownToken = ++token;
    const request = {clip, muted: audio.muted, token: ownToken};
    priming = request;
    audio.muted = true;
    if (!current) {
      audio.src = url(clip.src);
      audio.preload = 'auto';
      audio.load();
    }
    const finish = error => {
      if (disposed || priming !== request || ownToken !== token) return;
      priming = null;
      audio.pause();
      audio.muted = request.muted;
      if (error?.name === 'NotAllowedError') blocked = true;
      else if (error) failures.add(clip.id);
      publish();
    };
    try { Promise.resolve(audio.play()).then(() => finish(), finish); }
    catch (error) { finish(error); }
  };
  const select = clip => {
    if (current === clip) return false;
    stop(); token++; current = clip; ended = false; waiting = false; pendingSeek = !!clip;
    if (clip) {
      audio.src = url(clip.src);
      audio.preload = 'auto';
      audio.load();
    }
    return true;
  };
  const sync = value => {
    if (disposed) return;
    const previous = snapshot;
    snapshot = {...snapshot, ...value};
    if (!enabled) { publish(); return; }
    const time = Number(snapshot.time) || 0;
    let clip = null;
    for (const item of ordered) if (time >= item.start && time < item.start + item.duration) clip = item;
    const active = !!(snapshot.ready && snapshot.playing && !snapshot.free && !snapshot.returning && !snapshot.hidden);
    if (priming) {
      if (clip !== current || (clip && active)) cancelPrime();
      else { if (current) seek(false); publish(); return; }
    }
    const step = time - (Number(previous?.time) || 0);
    const remaining = audio.duration - audio.currentTime;
    // Network start and media clocks can trail the tour slightly. Let only an
    // already-playing final syllable finish in the next silent gap; never seek
    // it to the last millisecond or carry speech across a deliberate scrub.
    const tail = !clip && current && !ended && wanted && !audio.paused && active
      && (snapshot.seekRevision ?? 0) === (previous?.seekRevision ?? 0)
      && step >= 0 && step <= Math.max(.45, (Number(snapshot.speed) || 1) * .35)
      && time >= current.start + current.duration && time < current.start + current.duration + .75
      && Number.isFinite(remaining) && remaining > 0 && remaining <= .75;
    if (tail) clip = current;
    const changed = select(clip);
    if (!clip) { stop(); publish(); return; }
    audio.playbackRate = clamp(Number(snapshot.speed) || 1, .25, 4);
    audio.preservesPitch = true;
    // An explicit backward seek can replay a clip that has already ended.
    if (ended && offset() < (Number.isFinite(audio.duration) ? audio.duration : clip.duration) - .5) {
      ended = false; attempted = false;
    }
    if (!active || ended || blocked || failures.has(clip.id)) {
      stop();
      if (!ended) seek(changed);
      publish(); return;
    }
    const resumed = !wanted;
    wanted = true;
    if (!tail) seek(changed || resumed);
    if (audio.paused || pending) play();
    publish();
  };
  const listeners = {
    loadedmetadata() { if (enabled && current) { seek(true); publish(); } },
    canplay() { waiting = false; publish(); },
    playing() { waiting = false; publish(); },
    waiting() { waiting = true; publish(); },
    timeupdate() { publish(); },
    pause() { publish(); },
    ended() { ended = true; pending = false; wanted = false; publish(); },
    error() {
      if (!enabled || disposed) return;
      const failed = priming?.clip || current;
      if (!failed) return;
      failures.add(failed.id); stop(); publish();
    },
  };
  for (const [event, listener] of Object.entries(listeners)) audio.addEventListener(event, listener);
  publish();
  return {
    enable(value) {
      if (disposed || !value || !Number.isFinite(value.time)) return;
      cancelPrime();
      // Reload an actual media failure only after a new user gesture.
      if (current && failures.has(current.id)) select(null);
      enabled = true; blocked = false; failures.clear();
      attempted = false;
      sync(value);
      if (!wanted && !blocked) prime(current || ordered.find(clip => clip.start > value.time));
    },
    disable() {
      if (disposed) return;
      enabled = false; stop(); publish();
    },
    sync,
    setVolume(value) { if (!disposed && Number.isFinite(Number(value))) audio.volume = clamp(Number(value), 0, 1); },
    dispose() {
      if (disposed) return;
      enabled = false; stop(); disposed = true; token++;
      for (const [event, listener] of Object.entries(listeners)) audio.removeEventListener(event, listener);
      audio.removeAttribute('src'); audio.preload = 'none'; audio.load();
    },
  };
}
