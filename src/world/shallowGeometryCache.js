// Source files contain a finite set of near/distant prototypes. Keep CPU-only
// prototypes and give every caller independent arrays for transforms/disposal.
export function cloneGeometryKit(kit) {
  return Object.fromEntries(Object.entries(kit).map(([key, geometry]) => [key, geometry.clone()]));
}

export function decodeGeometryBytes(data) {
  if (Uint8Array.fromBase64) return Uint8Array.fromBase64(data);
  const text = atob(data), bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes;
}
