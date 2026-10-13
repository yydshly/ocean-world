// Packaged files use a binary suffix, not a Content-Encoding header. The browser
// caches the compressed source and explicitly decodes it exactly once.
import { sceneLoadingProgress } from '../sceneLoadingProgress.js';
export async function loadCompressedModelData(url) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 60000);
  let bytes = 0, lastPublished = 0;
  sceneLoadingProgress.start(url);
  try {
    const response = await fetch(url, { signal: controller.signal });
    sceneLoadingProgress.response(url);
    if (!response.ok) throw new Error(`模型数据加载失败 (${response.status})：${url}`);
    if (typeof DecompressionStream !== 'function')
      throw new Error('此浏览器不支持模型解压，请使用新版 Chrome、Edge、Safari 或 Firefox。');
    const progress = new TransformStream({ transform(chunk, destination) {
      bytes += chunk.byteLength;
      if (performance.now() - lastPublished > 150) {
        sceneLoadingProgress.update(url, bytes); lastPublished = performance.now();
      }
      destination.enqueue(chunk);
    }, flush() { sceneLoadingProgress.received(url, bytes); } });
    const data = await new Response(response.body.pipeThrough(progress).pipeThrough(new DecompressionStream('gzip'))).json();
    sceneLoadingProgress.update(url, bytes, true); return data;
  } catch (error) {
    sceneLoadingProgress.fail(url, error);
    throw error;
  } finally { clearTimeout(timer); }
}
