// Preserve independent historical hashes while allowing only the GLSL reserved-word fix.
// No geometry, shader arithmetic, colours, uniforms or other identifiers are normalized.
export function legacyCoralSpelling(value) {
  return typeof value === 'string' && value.includes('float tissuePatch =')
    ? value.replace(/\btissuePatch\b/g, 'patch') : value;
}
