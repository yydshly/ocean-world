// World-fixed authored school passages for the finite observation sample.
// Whole shoals stay beside the swim corridor; no camera-driven per-frame push,
// body enlargement, disappearing members or complete boids solver is used.
export function arrangeSampleSchoolPassages(model, groups, progress) {
  const route = Array.from({length:301}, (_,i) => model.path.getPointAt(i/300));
  const routeMinZ = Math.min(...route.map(p=>p.z))-.05;
  const routeMaxZ = Math.max(...route.map(p=>p.z))+.05;
  model.schoolPassages = [];
  for (const group of groups) {
    const members = model.agents.filter(a=>a.speciesId===group.species);
    if (!members.length) continue;
    const relative = members.map(a=>({a,dx:a.home.x-a.schoolCenter.x,dz:a.home.z-a.schoolCenter.z}));
    const orbit = {x:1.1,z:.90}, formation = {forward:.50,side:.10};
    const drift = {forward:.09,side:.05};
    // Includes every member, its full orbit, independent drift and a generous
    // whole-body/fin bound. Actual asset envelopes are checked in scene tests.
    const body = Math.max(...members.map(a=>a.sizeM*.70));
    const transverse = orbit.z + Math.max(...relative.map(p=>Math.abs(p.dz)*formation.side)) + drift.side + body;
    const side = Math.sign(group.lateral)||-1, margin = .8;
    const centerZ = side<0 ? routeMinZ-transverse-margin : routeMaxZ+transverse+margin;
    const observer = model.path.getPointAt(progress(group.time)), forward = 3.8;
    const phase = Math.atan2((centerZ-observer.z)*orbit.z,forward*orbit.x);
    const center = {x:observer.x+forward-orbit.x*Math.cos(phase),z:centerZ};
    for (const [i,{a,dx,dz}] of relative.entries()) {
      a.home={x:center.x+dx,z:center.z+dz};a.schoolCenter={...center};
      a.schoolPhase=phase-group.time*a.speed;a.schoolOrbit={...orbit};
      a.schoolFormation={...formation};a.schoolDrift={...drift};
      a.schoolVertical=.26*Math.sin(i*2.39996);a.lift=group.lift;
      a.schoolPassage=group.species;
    }
    model.schoolPassages.push({speciesId:group.species,side,center,orbit,formation,drift,
      routeMinZ,routeMaxZ,bodyRadiusBound:body,transverseEnvelope:transverse,margin,
      visitTime:group.time,agents:members});
  }
}
