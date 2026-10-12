import { gzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';

// Keep authored geometry byte-for-byte intact, but stop shipping large base64
// literals as executable JavaScript. Content-hashed data survives UI releases.
export function compressedModelDataPlugin() {
  return {
    name: 'compressed-model-data',
    apply: 'build',
    enforce: 'pre',
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
