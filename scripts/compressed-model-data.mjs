import { gzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import shallowGeometryManifest from '../src/world/shallowGeometryManifest.js';

// Keep authored geometry byte-for-byte intact, but stop shipping large base64
// literals as executable JavaScript. Content-hashed data survives UI releases.
export function compressedModelDataPlugin() {
  let base = '/';
  return {
    name: 'compressed-model-data',
    apply: 'build',
    enforce: 'pre',
    configResolved(config) { base = config.base; },
    transformIndexHtml: { order: 'post', handler(_html, context) {
      const files = Object.values(context.bundle ?? {}).filter(asset => asset.type === 'asset' && asset.fileName.endsWith('.bin')).map(asset => base + asset.fileName);
      if (!files.length) return [];
      // Use the runtime's exact, versioned URL so its later fetch reuses this
      // request. The public buffer is copied by Vite, outside context.bundle.
      if (shallowGeometryManifest) files.unshift(`${base}assets/${shallowGeometryManifest.transport?.file ?? shallowGeometryManifest.file}?v=${shallowGeometryManifest.sha256.slice(0,16)}`);
      // Both shallow experiences share the same model graph. Start its data
      // requests with the document instead of waiting for the lazy JS graph.
      // Other entrances don't download these models.
      return [{ tag: 'script', injectTo: 'head-prepend', children:
        `if(['shallow-sample','shallow-journey'].includes(new URLSearchParams(location.search).get('demo')))for(const url of ${JSON.stringify(files)}){const link=document.createElement('link');link.rel='preload';link.as='fetch';link.crossOrigin='anonymous';link.href=url;document.head.appendChild(link);}` }];
    } },
    async transform(code, id) {
      if (!/\/world\/shallow\w+Data\.js$/i.test(id) || code.length < 100000) return null;
      const match = code.match(/export default ([\s\S]*);\s*$/);
      const data = match ? { default: JSON.parse(match[1]) } : await import(pathToFileURL(id).href);
      const json = JSON.stringify(data);
      // Neutral binary extension prevents servers/proxies from treating the
      // file as HTTP content encoding. Decoding is owned by our loader.
      const name = id.split('/').at(-1).replace(/\.js$/, '.bin');
      const ref = this.emitFile({ type: 'asset', name, source: gzipSync(json, { level: 9 }) });
      return {
        code: `import { loadCompressedModelData } from './loadCompressedModelData.js';
const data = await loadCompressedModelData(import.meta.ROLLUP_FILE_URL_${ref});
${Object.keys(data).map(key => key === 'default' ? 'export default data.default;' : `export const ${key} = data.${key};`).join('\n')}`,
        map: null,
      };
    },
  };
}
