// Shared authored observation/habitat patches in metres, over the existing
// terrain. These are layout bounds, not new habitats, biomass or calibrated
// territories. Fish can leave them when escaping or pursuing real contacts.
const zone = (center, spawn, wander, substrate = null) => Object.freeze({
  center: Object.freeze({ x: center[0], y: center[1], z: center[2] }),
  spawnHalfExtentM: Object.freeze({ x: spawn[0], y: spawn[1], z: spawn[2] }),
  wanderHalfExtentM: Object.freeze({ x: wander[0], y: wander[1], z: wander[2] }),
  substrate,
});

export const REEF_ACTIVITY_ZONES = Object.freeze({
  mainReef: zone([-4.0, 2.05, -1.5], [.95, .24, .65], [1.1, .4, .8]),
  reefEdge: zone([-2.15, 1.75, -1.25], [.95, .25, .9], [1.3, .5, 1.2]),
  reefForaging: zone([-3.85, 1.0, -1.6], [.7, .2, .65], [1.05, .35, .9], 'reef'),
  grazeNear: zone([-3.75, 0, -1.0], [.5, 0, .28], [.55, 0, .3], 'reef'),
  grazeFar: zone([-5.35, 0, 1.75], [.5, 0, .35], [.55, 0, .4], 'reef'),
  reefClams: zone([-4.1, 0, -2.1], [.45, 0, .2], [.45, 0, .2], 'reef'),
  sandCorridor: zone([.25, 0, 1.55], [1.1, 0, 1.05], [1.25, 0, 1.25], 'sand'),
  openCleaning: zone([.55, 1.0, -1.5], [.22, .15, .22], [1.1, .35, 1.0]),
  shrimpMouth: zone([1.0, 0, -1.5], [.15, 0, .15], [.15, 0, .15], 'sand'),
  grouperWest: zone([-5.45, 0, -4.65], [.45, 0, .35], [.65, .15, .5], 'reef'),
  grouperEast: zone([2.65, 0, -2.85], [.25, 0, .3], [.45, .15, .45], 'reef'),
});

export const REEF_GRAZING_ZONE_IDS = Object.freeze(['grazeNear', 'grazeFar']);
export const REEF_GROUPER_ZONE_IDS = Object.freeze(['grouperWest', 'grouperEast']);
// A spatial search limit for this authored station, not a measured territory.
export const REEF_CLEANING_CLIENT_REACH_M = 2.4;
