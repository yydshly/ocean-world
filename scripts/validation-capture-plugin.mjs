import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const MIB = 1024 * 1024;
const MAX_REQUEST_BYTES = 30 * MIB;
const CAPTURE_TYPES = {
  screenshot: { directory: 'screenshots', extension: 'png', maxBytes: 10 * MIB },
  telemetry: { directory: 'telemetry', extension: 'json', maxBytes: 2 * MIB },
  video: { directory: 'videos', extension: 'webm', maxBytes: 20 * MIB },
};
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const PNG_END = Buffer.from([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);
const WEBM_SIGNATURE = Buffer.from([26, 69, 223, 163]);

class CaptureError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function respond(response, status, payload) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.end(JSON.stringify(payload));
}

function assertLocalRequest(request) {
  const address = request.socket.remoteAddress;
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address)) {
    throw new CaptureError(403, 'Capture is available only on loopback.');
  }
  let host;
  try {
    host = new URL(`http://${request.headers.host}`);
  } catch {
    throw new CaptureError(403, 'Invalid local host.');
  }
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(host.hostname)
    || host.username || host.password || host.pathname !== '/' || host.search || host.hash) {
    throw new CaptureError(403, 'Capture requires a local host.');
  }
  if (request.headers.origin !== undefined) {
    let origin;
    try {
      origin = new URL(request.headers.origin);
    } catch {
      throw new CaptureError(403, 'Invalid origin.');
    }
    const protocol = request.socket.encrypted ? 'https:' : 'http:';
    if (origin.protocol !== protocol || origin.host !== host.host
      || origin.username || origin.password || origin.pathname !== '/'
      || origin.search || origin.hash) {
      throw new CaptureError(403, 'Capture origin must match the local server.');
    }
  }
}

function readJson(request) {
  const contentLength = request.headers['content-length'];
  if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_REQUEST_BYTES)) {
    request.resume();
    throw new CaptureError(413, 'Capture request is too large.');
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      chunks.length = 0;
      reject(error);
    };
    request.on('data', (chunk) => {
      if (settled) return;
      bytes += chunk.length;
      if (bytes > MAX_REQUEST_BYTES) {
        fail(new CaptureError(413, 'Capture request is too large.'));
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (settled) return;
      settled = true;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new CaptureError(400, 'Capture body must be valid JSON.'));
      }
    });
    request.on('aborted', () => fail(new CaptureError(400, 'Capture upload was interrupted.')));
    request.on('error', () => fail(new CaptureError(400, 'Capture upload failed.')));
  });
}

function safeBaseName(name, kind) {
  if (typeof name !== 'string' || name.length > 200) {
    throw new CaptureError(400, 'Capture name must be a short string.');
  }
  // Treat both slash types as separators even when running on a different OS.
  let base = name.split(/[\\/]/).at(-1)
    .replace(/\.(png|json|webm)$/i, '')
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 64);
  if (!base) base = kind;
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(base)) base = `capture-${base}`;
  return base;
}

function decodeBase64(value, maxBytes) {
  if (!value || value.length > Math.ceil(maxBytes / 3) * 4) {
    throw new CaptureError(value ? 413 : 400, value ? 'Capture data is too large.' : 'Capture data is empty.');
  }
  if (value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new CaptureError(400, 'Capture data must be valid base64.');
  }
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length > maxBytes) throw new CaptureError(413, 'Capture data is too large.');
  if (decoded.toString('base64') !== value) throw new CaptureError(400, 'Capture base64 is not canonical.');
  return decoded;
}

function captureData(payload, type) {
  if (payload.kind === 'telemetry') {
    if (!payload.data || typeof payload.data !== 'object' || Array.isArray(payload.data)) {
      throw new CaptureError(400, 'Telemetry data must be a JSON object.');
    }
    // Saved terrain grids make full observation records large. Compact JSON
    // retains every field while keeping the same bounded capture quota.
    const bytes = Buffer.from(`${JSON.stringify(payload.data)}\n`);
    if (bytes.length > type.maxBytes) throw new CaptureError(413, 'Telemetry data is too large.');
    return bytes;
  }
  if (typeof payload.data !== 'string') throw new CaptureError(400, 'Media data must be a string.');
  if (payload.kind === 'screenshot') {
    const prefix = 'data:image/png;base64,';
    if (!payload.data.startsWith(prefix)) throw new CaptureError(400, 'Screenshot must be a PNG data URL.');
    const bytes = decodeBase64(payload.data.slice(prefix.length), type.maxBytes);
    if (bytes.length < 45 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)
      || bytes.readUInt32BE(8) !== 13 || bytes.toString('ascii', 12, 16) !== 'IHDR'
      || bytes.readUInt32BE(16) === 0 || bytes.readUInt32BE(20) === 0
      || !bytes.subarray(-12).equals(PNG_END)) {
      throw new CaptureError(400, 'Screenshot data is not a PNG image.');
    }
    return bytes;
  }
  // Accept raw base64 or the data URL produced by FileReader for MediaRecorder.
  const value = payload.data.startsWith('data:')
    ? payload.data.replace(/^data:video\/webm(?:;codecs=[^;,]+)?;base64,/, '')
    : payload.data;
  const bytes = decodeBase64(value, type.maxBytes);
  if (bytes.length < 12 || !bytes.subarray(0, 4).equals(WEBM_SIGNATURE)
    || !bytes.subarray(0, 4096).includes(Buffer.from('webm'))) {
    throw new CaptureError(400, 'Video data is not a WebM container.');
  }
  return bytes;
}

/** Save local development validation artifacts; never installed in a build/preview. */
export function validationCapturePlugin() {
  return {
    name: 'reef-validation-capture',
    apply: 'serve',
    configureServer(server) {
      const projectRoot = path.resolve(server.config.root);
      server.middlewares.use(async (request, response, next) => {
        if (request.url?.split('?')[0] !== '/__reef-capture') return next();
        try {
          assertLocalRequest(request);
          if (request.method !== 'POST') {
            response.setHeader('Allow', 'POST');
            throw new CaptureError(405, 'Capture requires POST.');
          }
          if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')) {
            throw new CaptureError(415, 'Capture requires application/json.');
          }
          const payload = await readJson(request);
          if (!payload || typeof payload !== 'object' || Array.isArray(payload)
            || !Object.hasOwn(CAPTURE_TYPES, payload.kind)) {
            throw new CaptureError(400, 'Unsupported capture kind.');
          }
          const type = CAPTURE_TYPES[payload.kind];
          const base = safeBaseName(payload.name, payload.kind);
          const bytes = captureData(payload, type);
          const stamp = new Date().toISOString().replace(/[:.]/g, '-');
          const filename = `${base}-${stamp}-${randomUUID().slice(0, 8)}.${type.extension}`;
          const relative = `output/validation/${type.directory}/${filename}`;
          const destination = path.resolve(projectRoot, 'output', 'validation', type.directory, filename);
          await mkdir(path.dirname(destination), { recursive: true });
          await writeFile(destination, bytes, { flag: 'wx' });
          respond(response, 200, { ok: true, file: relative });
        } catch (error) {
          request.resume();
          if (!response.writableEnded && !response.destroyed) {
            respond(response, error instanceof CaptureError ? error.status : 500, {
              ok: false,
              error: error instanceof CaptureError ? error.message : 'Unable to save validation artifact.',
            });
          }
        }
      });
    },
  };
}
