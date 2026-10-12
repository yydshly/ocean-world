// Browser-provided script attribution complements rAF interval measurements.
// Keep a bounded diagnostic history; this does not change simulation timing.
export function observeMainThreadStalls(context, Observer = globalThis.PerformanceObserver) {
  const events = [];
  const type = Observer?.supportedEntryTypes?.includes('long-animation-frame')
    ? 'long-animation-frame' : Observer?.supportedEntryTypes?.includes('longtask') ? 'longtask' : null;
  if (!type) return { type, events, dispose() {} };
  const observer = new Observer(list => {
    for (const entry of list.getEntries()) {
      if (entry.duration < 100) continue;
      events.push({ startMs: entry.startTime, durationMs: entry.duration, ...context(),
        scripts: [...(entry.scripts ?? [])].map(script => ({
          source: script.sourceURL, function: script.sourceFunctionName,
          sourceCharPosition: script.sourceCharPosition,
          invoker: script.invoker, durationMs: script.duration,
          executionStartMs: script.executionStart,
          forcedLayoutMs: script.forcedStyleAndLayoutDuration,
        })) });
      if (events.length > 64) events.shift();
    }
  });
  observer.observe({ type });
  return { type, events, dispose() { observer.disconnect(); } };
}
