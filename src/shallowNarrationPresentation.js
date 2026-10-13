/** UI follows the route chapter even during the intentional gaps between clips. */
export function shallowNarrationPresentation({snapshot = {}, voice = {}, clips = [], chapters = [], duration = 240} = {}) {
  const time = Math.max(0, Number(snapshot.time) || 0);
  const chapter = chapters.find(item => time < item.end) || chapters.at(-1);
  const clip = chapter && clips.find(item => item.start >= chapter.start && item.start < chapter.end);
  const active = clips.find(item => item.id === voice.clipId);
  const next = clips.find(item => item.start > time);
  const finished = time >= duration;
  const canReplay = !!(snapshot.ready && !finished && clip && time > clip.start + .6);
  let message;
  if (finished) message = '讲解已结束，可从头重听';
  else if (!snapshot.ready) message = '场景准备好后可开启讲解';
  else if (!voice.enabled) message = '六段中文讲解 · 开启后从当前位置继续';
  else if (voice.status === 'blocked') message = '点击重试讲解以允许播放';
  else if (voice.status === 'error') message = '语音暂不可用，仍可继续观看';
  else if (snapshot.free) message = '探索中，讲解暂停 · 返回巡游后继续';
  else if (snapshot.returning) message = '镜头正在归位 · 归位后继续讲解';
  else if (snapshot.hidden) message = '页面在后台，讲解暂停';
  else if (!snapshot.playing) message = '讲解已开启 · 继续巡游后同步播放';
  else if (voice.status === 'loading') message = '正在载入讲解';
  else if (voice.status === 'playing') message = active?.title || '正在讲解';
  else if (voice.status === 'quiet') message = next ? `留白观察 · 下一段：${next.title}` : '本次讲解已播完 · 继续安静观察';
  else message = '讲解已开启 · 随巡游同步播放';
  return {message, finished, canReplay, replayStart: clip?.start ?? null, replayTitle: clip?.title ?? ''};
}
