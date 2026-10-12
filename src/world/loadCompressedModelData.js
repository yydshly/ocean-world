// Packaged files use a binary suffix, not a Content-Encoding header. The browser
// caches the compressed source and explicitly decodes it exactly once.
export async function loadCompressedModelData(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`模型数据加载失败 (${response.status})：${url}`);
  if (typeof DecompressionStream !== 'function')
    throw new Error('此浏览器不支持模型解压，请使用新版 Chrome、Edge、Safari 或 Firefox。');
  return new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json();
}
