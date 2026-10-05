import { biomeById } from './biomes.js';

// Only the three entries admitted by DEEP_SEA_PLAN. Taxonomic identity is not
// promoted from a genus/family proxy to a named species by the renderer.
const admitted = ['sea-pig-group', 'rattail-family', 'pom-pom-anemone'];
const level = { 'genus-group': 'genus', 'family-group': 'family', species: 'species' };
export const deepSpeciesCatalog = admitted.map((id) => {
  const entry = biomeById['deep-soft-bottom'].organisms.find((item) => item.id === id);
  if (!entry) throw new Error(`Missing approved deep organism: ${id}`);
  return {
    ...entry,
    taxonomicLevel: level[entry.identityLevel],
    lengthM: (entry.displaySizeM.range[0] + entry.displaySizeM.range[1]) / 2,
    sizeMeasure: entry.displaySizeM.measure,
    sources: entry.sourceLinks.map((source) => ({ ...source })),
    sourceLinks: entry.sourceLinks.map((source) => ({ ...source })),
    bioluminescent: false,
    bioluminescenceStatus: 'not-verified-no-emission',
    ecologicalRateStatus: 'uncalibrated-demonstration',
  };
});
export const deepSpeciesById = Object.fromEntries(deepSpeciesCatalog.map((species) => [species.id, species]));
export const deepModelScope = Object.freeze({
  region: '东北太平洋深海软底示意', depthM: 3500,
  coOccurrenceStatus: 'not-a-survey-reconstruction',
  temperatureC: null, salinityPsu: null, dissolvedOxygenMgL: null,
  resourceUnit: 'relative-organic-food-proxy-unit',
  note: '来源支持分类层级、尺度上限和功能行为；显示数量、速率、食物份额与场地条件均未校准。',
});
