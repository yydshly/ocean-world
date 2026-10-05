// The shared stipe stays within its nominal root-to-point length. Blades
// extend at most .70 m, plus .0525 m half-width; .8 m includes bulbs too.
// Three additional metres cover the ordinary 24 m/s, .12 s camera step.
// Transitions and following bypass this check in World before rendering.
export function kelpAnimationInRange(anchor, cameraPosition, far) {
  if (!anchor || !cameraPosition || ![anchor.x, anchor.y, anchor.z, anchor.lengthM,
    cameraPosition.x, cameraPosition.y, cameraPosition.z, far].every(Number.isFinite)
    || anchor.lengthM <= 0 || far <= 0) return true;
  const range = far + anchor.lengthM + .8 + 3;
  return (cameraPosition.x - anchor.x) ** 2 + (cameraPosition.y - anchor.y) ** 2
    + (cameraPosition.z - anchor.z) ** 2 <= range ** 2;
}
