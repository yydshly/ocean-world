import { biomeById } from './biomes.js';

// Independent regional addition: the authored three-class DeepSimulation
// catalog and its default random sequence remain unchanged.
const entry = biomeById['deep-soft-bottom'].organisms.find(item => item.id === 'giant-sea-spider-group');
export const deepPredatorSpeciesCatalog = [{ ...entry, taxonomicLevel: 'genus',
  lengthM: .30, sizeMeasure: 'leg-span', sources: entry.sourceLinks.map(source => ({ ...source })),
  sourceLinks: entry.sourceLinks.map(source => ({ ...source })), bioluminescent: false,
  bioluminescenceStatus: 'not-verified-no-emission', ecologicalRateStatus: 'uncalibrated-demonstration' }];
export const deepPredatorSpeciesById = Object.fromEntries(deepPredatorSpeciesCatalog.map(species => [species.id, species]));
export const DEEP_PREDATOR_PARAMETERS = Object.freeze({
  communityVersion: 1, allocationProbability: .32, maximumPerRegion: 1,
  crawlMps: .006, turnRadiansPerSec: .12, senseM: 2,
  intakeConditionPerSec: .0003, assimilationFraction: .8, metabolismPerSec: .000035,
  preyMinimumCondition: .08, hungryBelow: .85, mouthReachM: .004,
  birthDistanceM: [.4, .7], maximumRootLiftFraction: .12,
  note: 'Sparse allocation, motion, contact samples, condition transfers and rates are qualitative demonstration choices, not surveyed co-occurrence, biomass, observed density or measured field rates. Only loaded local owners advance; no sunlight or observer lamp supplies energy.',
});
