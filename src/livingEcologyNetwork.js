/** A deliberately small material network for the independent living-shallows
 * scene. One unit is a relative organic/nutrient reference quantity, shared by
 * transfers, never kilograms or the old energy index. Living individual stocks
 * represent tracked organic material, not their geometric volume. Coral and
 * seagrass stocks are aggregate representatives of actual habitat descriptors.
 * Energy supply/respiration are not an energy-conserving physical model. */
export const LIVING_NETWORK_VERSION = 1;
export const LIVING_NETWORK_PROFILE = 'living-shallows-v1';
export const LIVING_NETWORK_UNITS = 'relative organic/nutrient reference units; not measured biomass; independent of energy';
const POOLS = ['algae', 'plankton', 'detritus'];
const TOTALS = ['primaryProduction', 'externalInput', 'ingestion', 'feedingDetritus', 'predation',
  'deathDetritus', 'plantLitter', 'decomposition', 'mineralisation', 'systemOutput'];
const finiteNonnegative = value => Number.isFinite(value) && value >= 0;
const TURTLE_ORGANIC_FIELDS = ['turtleOrganicVersion', 'turtleOrganicInitializedAtSec', 'turtleOrganic'];
const hasTurtleOrganicRecord = region => TURTLE_ORGANIC_FIELDS.some(key => Object.hasOwn(region, key)) ||
  (Array.isArray(region.turtleAgents) ? region.turtleAgents : []).some(agent =>
    agent && (Object.hasOwn(agent, 'organicUnits') || Object.hasOwn(agent, 'organicDeathRecorded')));
const trackedTurtles = region => region.turtleOrganicVersion === 1 && Array.isArray(region.turtleAgents) ? region.turtleAgents : [];
const stock = region => POOLS.reduce((n, key) => n + region.resources[key], 0) + region.basicNetwork.nutrients +
  region.basicNetwork.plantOrganicUnits + region.basicNetwork.coralOrganicUnits +
  (region.reefGuild?.preyOrganicUnits ?? 0) +
  (region.openWaterLife?.preyOrganicUnits ?? 0) +
  region.agents.reduce((n, agent) => n + agent.organicUnits, 0) +
  trackedTurtles(region).reduce((n, agent) => n + agent.organicUnits, 0);
const cap = value => Math.max(0, Math.min(1, value));

export function livingNetworkBalance(region) {
  const n = region.basicNetwork;
  return n.ledger.initial + n.ledger.externalInput + n.ledger.transferredIn -
    n.ledger.transferredOut - n.ledger.output - stock(region);
}

/** A missing whole network can be admitted exactly once before activation.
 * Existing deaths receive no invented carcass; historical food/energy and IDs
 * remain intact. The current tracked stocks define this network's initial
 * boundary, rather than reconstructing unrecorded historical transfers. */
export function initializeLivingNetwork(region, chunk) {
  if (region.basicNetwork !== undefined) return false;
  const counts = kind => chunk.elements.filter(e => e.kind === kind).length;
  const habitat = { algae: cap(counts('algae') / 4), seagrass: cap(counts('seagrass') / 24), coral: cap(counts('coral') / 8) };
  for (const agent of region.agents) {
    agent.organicUnits = agent.alive ? .004 : 0;
    agent.organicDeathRecorded = !agent.alive;
  }
  region.basicNetwork = {
    version: LIVING_NETWORK_VERSION, profile: LIVING_NETWORK_PROFILE, units: LIVING_NETWORK_UNITS,
    initializedAtSec: region.timeSec, habitat,
    nutrients: .32, plantOrganicUnits: .06 * habitat.seagrass, coralOrganicUnits: .06 * habitat.coral,
    ledger: { initial: 0, externalInput: 0, transferredIn: 0, transferredOut: 0, output: 0 },
    processTotals: Object.fromEntries(TOTALS.map(key => [key, 0])),
  };
  region.basicNetwork.ledger.initial = stock(region);
  // These extend only this profile's original food-stock ledger. Internal
  // additions/removals are not mislabeled as external imports or ingestion.
  region.ledger.networkAdded = 0;
  region.ledger.networkRemoved = 0;
  return true;
}

export function validateLivingNetworkRecord(region) {
  const n = region.basicNetwork;
  if (!n || n.version !== LIVING_NETWORK_VERSION || n.profile !== LIVING_NETWORK_PROFILE || n.units !== LIVING_NETWORK_UNITS ||
    !finiteNonnegative(n.initializedAtSec) || n.initializedAtSec > region.timeSec ||
    !['nutrients', 'plantOrganicUnits', 'coralOrganicUnits'].every(key => finiteNonnegative(n[key])) ||
    !['algae', 'seagrass', 'coral'].every(key => finiteNonnegative(n.habitat?.[key]) && n.habitat[key] <= 1) ||
    !['initial', 'externalInput', 'transferredIn', 'transferredOut', 'output'].every(key => finiteNonnegative(n.ledger?.[key])) ||
    !TOTALS.every(key => finiteNonnegative(n.processTotals?.[key])) ||
    !POOLS.every(key => finiteNonnegative(region.resources?.[key])) ||
    !['initial', 'input', 'ingested', 'exported', 'networkAdded', 'networkRemoved'].every(key => finiteNonnegative(region.ledger?.[key])) ||
    !region.agents.every(agent => finiteNonnegative(agent.organicUnits) && typeof agent.organicDeathRecorded === 'boolean' &&
      (agent.alive ? !agent.organicDeathRecorded : !agent.organicDeathRecorded || agent.organicUnits === 0))) return false;
  if (hasTurtleOrganicRecord(region) && (region.turtleOrganicVersion !== 1 || !Array.isArray(region.turtleAgents) ||
    !finiteNonnegative(region.turtleOrganicInitializedAtSec) || region.turtleOrganicInitializedAtSec > region.timeSec ||
    !finiteNonnegative(region.turtleOrganic?.initialInputUnits) || region.turtleOrganic.initialInputUnits > n.ledger.externalInput + 1e-8 ||
    !finiteNonnegative(region.turtleOrganic?.counters?.seagrassGrazedUnits) ||
    region.turtleOrganic.counters.seagrassGrazedUnits > n.processTotals.ingestion + 1e-8 ||
    !region.turtleAgents.every(agent => agent && typeof agent.alive === 'boolean' && finiteNonnegative(agent.organicUnits) &&
      typeof agent.organicDeathRecorded === 'boolean' &&
      (agent.alive ? !agent.organicDeathRecorded : !agent.organicDeathRecorded || agent.organicUnits === 0)))) return false;
  const foodError = region.ledger.initial + region.ledger.input + (region.ledger.transferredIn ?? 0) + region.ledger.networkAdded -
    region.ledger.ingested - region.ledger.exported - (region.ledger.transferredOut ?? 0) - region.ledger.networkRemoved -
    POOLS.reduce((total, key) => total + region.resources[key], 0);
  return Math.abs(livingNetworkBalance(region)) < 1e-8 && Math.abs(foodError) < 1e-8 &&
    Math.abs(n.ledger.externalInput - n.processTotals.externalInput) < 1e-8 &&
    Math.abs(n.ledger.output - n.processTotals.systemOutput) < 1e-8;
}

function addFood(region, pool, quantity) {
  region.resources[pool] += quantity;
  region.ledger.networkAdded += quantity;
}
function removeFood(region, pool, quantity) {
  region.resources[pool] -= quantity;
  region.ledger.networkRemoved += quantity;
}
function output(region, quantity) {
  region.basicNetwork.ledger.output += quantity;
  region.basicNetwork.processTotals.systemOutput += quantity;
}
function externalFood(region, pool, quantity) {
  region.resources[pool] += quantity;
  region.ledger.input += quantity;
  region.basicNetwork.ledger.externalInput += quantity;
  region.basicNetwork.processTotals.externalInput += quantity;
}
/** Admission of genuinely new display individuals into an existing network.
 * Their initial organic reference stock is an explicit outside input; neither
 * previous individuals nor the historical food-stock ledger is recalculated. */
export function recordLivingAdmission(region, agents) {
  if (!region.basicNetwork) return 0;
  let input = 0;
  for (const agent of agents) {
    if (agent.organicUnits !== undefined) continue;
    agent.organicUnits = agent.alive ? .004 : 0;
    agent.organicDeathRecorded = !agent.alive;
    input += agent.organicUnits;
  }
  region.basicNetwork.ledger.externalInput += input;
  region.basicNetwork.processTotals.externalInput += input;
  return input;
}

/** A once-only extension of the existing ledger boundary. Historical turtles
 * retain their identity, movement and deaths; only live body reference stocks
 * are admitted as explicit input. A partial record is left for validation,
 * never silently repaired or used to recalculate the old initial balance. */
export function initializeLivingTurtleOrganic(region) {
  if (!region.basicNetwork || !Array.isArray(region.turtleAgents) || hasTurtleOrganicRecord(region)) return false;
  const input = recordLivingAdmission(region, region.turtleAgents);
  region.turtleOrganicVersion = 1;
  region.turtleOrganicInitializedAtSec = region.timeSec;
  region.turtleOrganic = { initialInputUnits: input, counters: { seagrassGrazedUnits: 0 } };
  return true;
}
function retainOrganic(region, agent, quantity) {
  const retained = Math.min(quantity, Math.max(0, .04 - agent.organicUnits));
  agent.organicUnits += retained;
  output(region, quantity - retained);
}

/** Called after the existing _feed has debited the actual food pool. */
export function recordLivingIngestion(region, agent, quantity) {
  const n = region.basicNetwork;
  const residue = quantity * .25;
  retainOrganic(region, agent, quantity * .60);
  addFood(region, 'detritus', residue);
  output(region, quantity * .15);
  n.processTotals.ingestion += quantity;
  n.processTotals.feedingDetritus += residue;
}

/** The caller proves actual contact with an existing seagrass descriptor.
 * This debits the representative plant stock, not the algae/plankton/detritus
 * food ledger. No material or energy is obtained when that stock is empty. */
export function recordLivingSeagrassGrazing(region, turtle, requestedQuantity) {
  if (!finiteNonnegative(requestedQuantity)) throw new RangeError('Seagrass grazing quantity must be finite and non-negative.');
  if (!region.basicNetwork || region.turtleOrganicVersion !== 1 || !trackedTurtles(region).includes(turtle) ||
      !turtle.alive || turtle.organicDeathRecorded) return 0;
  const quantity = Math.min(requestedQuantity, region.basicNetwork.plantOrganicUnits);
  if (quantity === 0) return 0;
  region.basicNetwork.plantOrganicUnits -= quantity;
  recordLivingIngestion(region, turtle, quantity);
  region.turtleOrganic.counters.seagrassGrazedUnits += quantity;
  return quantity;
}

export function recordLivingDeath(region, agent) {
  if (agent.organicDeathRecorded) return;
  const quantity = agent.organicUnits;
  agent.organicUnits = 0;
  agent.organicDeathRecorded = true;
  addFood(region, 'detritus', quantity);
  region.basicNetwork.processTotals.deathDetritus += quantity;
}

/** A capture transfers the prey's tracked stock, never its energy index. */
export function recordLivingPredation(region, predator, prey) {
  if (prey.organicDeathRecorded) return 0;
  const quantity = prey.organicUnits;
  prey.organicUnits = 0;
  prey.organicDeathRecorded = true;
  retainOrganic(region, predator, quantity * .60);
  addFood(region, 'detritus', quantity * .25);
  output(region, quantity * .15);
  region.basicNetwork.processTotals.predation += quantity;
  region.basicNetwork.processTotals.deathDetritus += quantity * .25;
  return quantity;
}

export function recordLivingTransfer(owner, destination, quantity) {
  owner.basicNetwork.ledger.transferredOut += quantity;
  destination.basicNetwork.ledger.transferredIn += quantity;
}

export function recordLivingFoodExchange(region, { imported = 0, transferredOut = 0, exported = 0 }) {
  region.basicNetwork.ledger.transferredIn += imported;
  region.basicNetwork.ledger.transferredOut += transferredOut;
  output(region, exported);
}

/** Nutrient reuse, light-dependent representative production, organic
 * shedding and microbial mineralisation. Coefficients are authored proxies;
 * local food production is constrained by nutrients and actual habitat. */
export function tickLivingNetwork(region, environment, dt) {
  const n = region.basicNetwork;
  const nutrientInput = .00015 * environment.foodSupply * dt;
  n.nutrients += nutrientInput;
  n.ledger.externalInput += nutrientInput;
  n.processTotals.externalInput += nutrientInput;
  externalFood(region, 'plankton', .0012 * environment.foodSupply * (1 + environment.currentMps) * dt);
  externalFood(region, 'detritus', .0002 * environment.foodSupply * dt);
  const produce = (rate, receive) => {
    const quantity = Math.min(n.nutrients, rate * environment.lightAtDepth * dt);
    n.nutrients -= quantity;
    receive(quantity);
    n.processTotals.primaryProduction += quantity;
  };
  produce(.0007 * n.habitat.algae, quantity => addFood(region, 'algae', quantity));
  // The water food pool is mixed plankton food; this small phototrophic
  // production term is a group proxy, not literal visual animal reproduction.
  produce(.0003, quantity => addFood(region, 'plankton', quantity));
  produce(.0003 * n.habitat.seagrass, quantity => { n.plantOrganicUnits += quantity; });
  produce(.0002 * n.habitat.coral, quantity => { n.coralOrganicUnits += quantity; });
  // Coral colonies are attached animals with symbionts plus particle capture.
  const captured = Math.min(region.resources.plankton, .00004 * n.habitat.coral * dt);
  removeFood(region, 'plankton', captured);
  n.coralOrganicUnits += captured * .60;
  addFood(region, 'detritus', captured * .25);
  output(region, captured * .15);
  n.processTotals.ingestion += captured;
  n.processTotals.feedingDetritus += captured * .25;
  for (const key of ['plantOrganicUnits', 'coralOrganicUnits']) {
    const litter = Math.min(n[key], n[key] * .0003 * dt);
    n[key] -= litter;
    addFood(region, 'detritus', litter);
    n.processTotals.plantLitter += litter;
  }
  for (const agent of [...region.agents, ...trackedTurtles(region)]) {
    if (!agent.alive) { recordLivingDeath(region, agent); continue; }
    const loss = Math.min(agent.organicUnits, agent.organicUnits * .0001 * dt);
    agent.organicUnits -= loss;
    output(region, loss);
  }
  const decomposed = Math.min(region.resources.detritus, region.resources.detritus * .002 * dt);
  removeFood(region, 'detritus', decomposed);
  n.nutrients += decomposed * .72;
  output(region, decomposed * .28);
  n.processTotals.decomposition += decomposed;
  n.processTotals.mineralisation += decomposed * .72;
  for (const pool of POOLS) {
    const flowLoss = pool === 'plankton' ? .0008 : .0001;
    const exported = Math.min(region.resources[pool], region.resources[pool] * flowLoss * dt);
    const excess = Math.max(0, region.resources[pool] - exported - 1);
    region.resources[pool] -= exported + excess;
    region.ledger.exported += exported + excess;
    output(region, exported + excess);
  }
}

export function summarizeLivingNetwork(regions, speciesById) {
  const agents = regions.flatMap(region => region.agents.filter(agent => agent.alive));
  const turtleRegions = regions.filter(region => region.turtleOrganicVersion === 1);
  const turtles = turtleRegions.flatMap(region => region.turtleAgents);
  const liveTurtles = turtles.filter(agent => agent.alive);
  const seagrassGrazedUnits = turtleRegions.reduce((n, region) => n + region.turtleOrganic.counters.seagrassGrazedUnits, 0);
  const hasGuild = guild => agents.some(agent => speciesById[agent.speciesId]?.guild === guild);
  const total = key => regions.reduce((n, region) => n + region.basicNetwork[key], 0);
  const coverage = {
    primaryProduction: regions.some(region => region.basicNetwork.habitat.algae > 0 || region.basicNetwork.habitat.seagrass > 0),
    grazing: hasGuild('grazer') || liveTurtles.length > 0, planktonFeeding: hasGuild('planktivore'),
    attachedFilterFeeding: hasGuild('photosymbiotic-filter') || hasGuild('attached-filter') || regions.some(region => region.basicNetwork.habitat.coral > 0),
    predation: hasGuild('predator'), detritusFeeding: hasGuild('deposit-feeder'), decomposition: regions.length > 0,
    ...(turtleRegions.length ? { seagrassGrazing: seagrassGrazedUnits > 0 } : {}),
  };
  return { enabled: true, version: LIVING_NETWORK_VERSION, units: LIVING_NETWORK_UNITS,
    scope: turtleRegions.length ? 'loaded regions; unloaded frozen; registered turtles included in organic consumer inventory' :
      'loaded regions; unloaded frozen; turtle patrol visitors outside organic consumer inventory', coverage,
    nutrients: total('nutrients'), plantOrganicUnits: total('plantOrganicUnits'), coralOrganicUnits: total('coralOrganicUnits'),
    consumerOrganicUnits: [...agents, ...liveTurtles].reduce((n, agent) => n + agent.organicUnits, 0),
    detritus: regions.reduce((n, region) => n + region.resources.detritus, 0),
    ...(turtleRegions.length ? { turtleGrazing: {
      scope: 'registered owner-local turtles; seagrass consumption only after actual descriptor contact; organic quantities are relative proxies',
      registeredCount: turtles.length, aliveCount: liveTurtles.length,
      consumerOrganicUnits: liveTurtles.reduce((n, agent) => n + agent.organicUnits, 0),
      initialInputUnits: turtleRegions.reduce((n, region) => n + region.turtleOrganic.initialInputUnits, 0),
      seagrassGrazedUnits,
    } } : {}),
    ...(regions.some(region => region.reefGuildVersion === 1) ? { reefGuild: {
      scope: 'unresolved benthic invertebrate prey food pool; detrital support is a group food-web approximation; no rendered prey kills',
      preyOrganicUnits: regions.reduce((n, region) => n + (region.reefGuild?.preyOrganicUnits ?? 0), 0),
      proxyConsumedUnits: regions.reduce((n, region) => n + (region.reefGuild?.counters.proxyConsumedUnits ?? 0), 0),
      filterConsumedUnits: regions.reduce((n, region) => n + (region.reefGuild?.counters.filterConsumedUnits ?? 0), 0),
      preySupportedUnits: regions.reduce((n, region) => n + (region.reefGuild?.counters.preySupportedUnits ?? 0), 0),
    } } : {}),
    ...(regions.some(region => region.openWaterLifeVersion === 1) ? { openWaterLife: {
      scope: 'owner-local swimming representatives; small swimming prey food-web proxy; jelly photosymbiont production not simulated',
      preyOrganicUnits: regions.reduce((n, region) => n + (region.openWaterLife?.preyOrganicUnits ?? 0), 0),
      proxyConsumedUnits: regions.reduce((n, region) => n + (region.openWaterLife?.counters.proxyConsumedUnits ?? 0), 0),
      planktonConsumedUnits: regions.reduce((n, region) => n + (region.openWaterLife?.counters.planktonConsumedUnits ?? 0), 0),
      preySupportedUnits: regions.reduce((n, region) => n + (region.openWaterLife?.counters.preySupportedUnits ?? 0), 0),
    } } : {}),
    processTotals: Object.fromEntries(TOTALS.map(key => [key, regions.reduce((n, region) => n + region.basicNetwork.processTotals[key], 0)])),
    balanceError: regions.reduce((maximum, region) => Math.max(maximum, Math.abs(livingNetworkBalance(region))), 0),
  };
}
