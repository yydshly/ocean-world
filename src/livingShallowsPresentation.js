const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;

/** One coherent display treatment for the living shallow world. These values
 * never enter ecological daylight, resources, water transport or stored state.
 * The reduced near-field veil and directional/sky ratio retain a readable
 * foreground while distant features still disappear through underwater haze. */
export function livingShallowsPresentation({ hour = 12, depthM = 0, turbidity = .25,
  attenuationPerM = .035 } = {}) {
  const time = ((finite(hour, 12) % 24) + 24) % 24;
  const daylight = clamp(Math.sin((time - 6) / 12 * Math.PI), 0, 1);
  const depth = clamp(finite(depthM, 0), 0, 1000);
  const sediment = clamp(finite(turbidity, .25), 0, 1);
  const transmission = Math.exp(-depth * clamp(finite(attenuationPerM, .035), 0, 2));
  const haze = .014 + sediment * .030;
  return {
    daylight, transmission, fogDensity: haze,
    sunIntensity: (.04 + daylight * 3.4) * Math.max(.28, transmission),
    skyIntensity: (.05 + daylight * .48) * Math.max(.45, Math.sqrt(transmission)),
    sunColor: [1 - .25 * (1 - transmission), .97 - .10 * (1 - transmission), .91],
    skyColor: '#8eaeb6', groundColor: '#263b32',
    scope: 'uncalibrated shallow display lighting and haze; no ecological forcing',
  };
}
