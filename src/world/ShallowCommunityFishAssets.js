import * as THREE from 'three';

// Sample-only whole-form authoring. +X is forward and the complete animal's
// total length is one metre before the catalogue's individual size is applied.
// Museum descriptions guide the species cues; these are not measured scans.
export const SHALLOW_COMMUNITY_FISH_IDS = Object.freeze(['cleaner-wrasse', 'black-blotched-porcupinefish', 'lionfish','longfin-batfish','humphead-wrasse']);
export const SHALLOW_COMMUNITY_MOTION_PADDING = Object.freeze({ 'cleaner-wrasse': .024, 'black-blotched-porcupinefish': .024, lionfish: .024,'longfin-batfish':.035,'humphead-wrasse':.035 });
const TAU = Math.PI * 2, lerp = THREE.MathUtils.lerp, clamp = THREE.MathUtils.clamp;
const colour = hex => new THREE.Color(hex), flat = hex => () => colour(hex);

function shape(build) {
  const positions = [], colors = [], indices = [], smoothSeams = [];
  const vertex = (p, tint) => {
    const i = positions.length / 3, c = tint(...p);
    positions.push(...p); colors.push(c.r, c.g, c.b); return i;
  };
  const triangle = (a, b, c) => indices.push(a, b, c);
  const builder = {
    ruledFin(edge, tint, rows=32, columns=5) {
      // A concave fork cannot be triangulated as a fan about its centroid:
      // that fills the tail notch. Each span has its own leading/trailing edge.
      const start=positions.length/3;
      for(let r=0;r<=rows;r++){
        const [a,b]=edge(r/rows);
        for(let s=0;s<=columns;s++){
          const u=s/columns;vertex(a.map((v,k)=>lerp(v,b[k],u)),tint);
          if(r<rows&&s<columns){const k=start+r*(columns+1)+s,n=k+columns+1;triangle(k,n,k+1);triangle(k+1,n,n+1);}
        }
      }
    },
    body(stations, tint, rows = 48, sides = 32) {
      const profile = profileAt(stations), start = positions.length / 3;
      for (let r = 0; r <= rows; r++) {
        const x = lerp(stations[0][0], stations.at(-1)[0], r / rows), [upper, lower, width, centerY] = profile(x);
        for (let s = 0; s <= sides; s++) {
          const a = s / sides * TAU, sin = Math.sin(a);
          vertex([x, centerY + sin * (sin >= 0 ? upper : lower), Math.cos(a) * width], tint);
          if (r < rows && s < sides) {
            const k = start + r * (sides + 1) + s, n = k + sides + 1;
            triangle(k, n, k + 1); triangle(k + 1, n, n + 1);
          }
        }
      }
      for (const [r, reverse] of [[0, false], [rows, true]]) {
        const x = lerp(stations[0][0], stations.at(-1)[0], r / rows), cy = profile(x)[3], c = vertex([x, cy, 0], tint);
        for (let s = 0; s < sides; s++) {
          const a = start + r * (sides + 1) + s;
          reverse ? triangle(c, a + 1, a) : triangle(c, a, a + 1);
        }
      }
      for (let r = 0; r <= rows; r++) smoothSeams.push([start + r * (sides + 1), start + r * (sides + 1) + sides]);
    },
    egg(center, scale, tint, sides = 16, rows = 10) {
      const start = positions.length / 3;
      for (let r = 0; r <= rows; r++) for (let s = 0; s <= sides; s++) {
        const a = s / sides * TAU, t = r / rows * Math.PI;
        vertex([center[0] + Math.sin(t) * Math.cos(a) * scale[0], center[1] + Math.cos(t) * scale[1], center[2] + Math.sin(t) * Math.sin(a) * scale[2]], tint);
        const k = start + r * (sides + 1) + s, n = k + sides + 1;
        if (r < rows && s < sides) { if (r) triangle(k, k + 1, n); if (r < rows - 1) triangle(k + 1, n + 1, n); }
      }
    },
    tube(points, r0, r1, tint, segments = 5, sides = 7) {
      const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), frames = curve.computeFrenetFrames(segments, false), start = positions.length / 3;
      for (let r = 0; r <= segments; r++) {
        const u = r / segments, center = curve.getPoint(u), radius = lerp(r0, r1, u);
        for (let s = 0; s <= sides; s++) {
          const a = s / sides * TAU, p = center.clone().addScaledVector(frames.normals[r], radius * Math.cos(a)).addScaledVector(frames.binormals[r], radius * Math.sin(a));
          vertex(p.toArray(), tint);
          if (r < segments && s < sides) { const k = start + r * (sides + 1) + s, n = k + sides + 1; triangle(k, k + 1, n); triangle(k + 1, n + 1, n); }
        }
      }
    },
    membrane(outline, tint, rings = 4, samples = 40, camber = .004) {
      const curve = new THREE.CatmullRomCurve3(outline.map(p => new THREE.Vector3(...p)), true, 'centripetal'), edge = curve.getPoints(samples).slice(0, -1), center = new THREE.Vector3();
      edge.forEach(p => center.add(p)); center.multiplyScalar(1 / edge.length);
      const normal = new THREE.Vector3().subVectors(edge[1], edge[0]).cross(new THREE.Vector3().subVectors(edge[Math.floor(samples / 3)], edge[0])).normalize(), start = positions.length / 3;
      for (let r = 0; r <= rings; r++) for (let s = 0; s <= samples; s++) {
        const u = r / rings, p = center.clone().lerp(edge[s % samples], u).addScaledVector(normal, camber * (1 - u * u));
        vertex(p.toArray(), tint);
        if (r < rings && s < samples) { const k = start + r * (samples + 1) + s, n = k + samples + 1; triangle(k, k + 1, n); triangle(k + 1, n + 1, n); }
      }
    },
    fan(tips, tint, membraneFraction = .83) {
      // One continuous bowed membrane joins adjacent rays; the distal rays
      // project past the web. It is a surface rather than disconnected cones.
      const root = new THREE.Vector3(), start = positions.length / 3, radial = 5;
      for (let r = 0; r <= radial; r++) for (let s = 0; s < tips.length; s++) {
        const u = r / radial * membraneFraction, p = new THREE.Vector3(...tips[s]).multiplyScalar(u);
        p.y += .008 * Math.sin(u * Math.PI) * Math.sin(s / (tips.length - 1) * Math.PI);
        vertex(p.toArray(), tint);
        if (r < radial && s < tips.length - 1) { const k = start + r * tips.length + s, n = k + tips.length; triangle(k, k + 1, n); triangle(k + 1, n + 1, n); }
      }
      for (const tip of tips) this.tube([root.toArray(), tip.map(v => v * .45), tip], .0036, .0007, tint, 4, 6);
    },
  };
  build(builder);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  // All parts expose the same attributes so they can be shared by instances.
  g.setAttribute('uv', new THREE.Float32BufferAttribute(positions.flatMap((_, i) => i % 3 === 0 ? [positions[i] + .5, positions[i + 1] + .5] : []), 2));
  g.setIndex(indices); g.computeVertexNormals();
  const normal = g.attributes.normal, n = new THREE.Vector3(), other = new THREE.Vector3();
  for (const [a, b] of smoothSeams) { n.fromBufferAttribute(normal, a).add(other.fromBufferAttribute(normal, b)).normalize(); normal.setXYZ(a, n.x, n.y, n.z); normal.setXYZ(b, n.x, n.y, n.z); }
  g.computeBoundingBox(); g.computeBoundingSphere(); return g;
}

function profileAt(stations) {
  return x => {
    let i = 0; while (i < stations.length - 2 && x > stations[i + 1][0]) i++;
    const a = stations[i], b = stations[i + 1], dx = b[0] - a[0], t = clamp((x - a[0]) / dx, 0, 1), values = [];
    for (let k = 1; k < 5; k++) {
      const tangent = j => j === 0 ? (stations[1][k] - stations[0][k]) / (stations[1][0] - stations[0][0]) : j === stations.length - 1 ?
        (stations[j][k] - stations[j - 1][k]) / (stations[j][0] - stations[j - 1][0]) : (stations[j + 1][k] - stations[j - 1][k]) / (stations[j + 1][0] - stations[j - 1][0]);
      const v = (2 * t ** 3 - 3 * t ** 2 + 1) * a[k] + (t ** 3 - 2 * t ** 2 + t) * dx * tangent(i) + (-2 * t ** 3 + 3 * t ** 2) * b[k] + (t ** 3 - t ** 2) * dx * tangent(i + 1);
      values.push(k < 4 ? Math.max(.001, v) : v);
    }
    return values;
  };
}

function eyes(builder, x, y, z, radius, iris) {
  for (const s of [-1, 1]) {
    builder.egg([x, y, z * s], [radius, radius * .91, radius * .35], flat(iris), 16, 9);
    builder.egg([x + radius * .09, y, (z + radius * .24) * s], [radius * .53, radius * .56, radius * .15], flat('#172220'), 14, 8);
  }
}

function cleanerKit() {
  const stations = [[-.35, .015, .014, .010, 0], [-.24, .042, .039, .026, 0], [-.08, .066, .060, .038, .002], [.13, .067, .061, .040, .001], [.29, .051, .043, .032, 0], [.42, .030, .025, .022, -.002], [.50, .009, .007, .010, -.007]];
  const tint = (x, y, z) => {
    const rear = clamp((.5 - x), 0, 1), c = colour('#d1d4bf').lerp(colour('#5f99ac'), THREE.MathUtils.smoothstep(rear, .15, .70));
    c.lerp(colour('#dddcca'), THREE.MathUtils.smoothstep(-y, .015, .06));
    const stripeWidth = .011 + .025 * rear, axis = -.003 + .002 * Math.sin(x * 5), distance = Math.abs(y - axis);
    if (Math.abs(z) > .006 && distance < stripeWidth) c.lerp(colour('#25333a'), 1 - THREE.MathUtils.smoothstep(distance, stripeWidth * .72, stripeWidth));
    return c;
  };
  return [
    { name: 'slender adult cleaner body with widening black flank stripe', g: shape(b => { b.body(stations, tint, 44, 28); eyes(b, .404, .015, .021, .010, '#999e82');
      for (const s of [-1, 1]) b.egg([.491, -.007, s * .007], [.009, .0014, .003], flat('#555f55'), 12, 6); }), role: 'body' },
    { name: 'low continuous dorsal and anal membranes', g: shape(b => {
      b.membrane([[.29, .047, 0], [.21, .086, 0], [-.20, .086, 0], [-.34, .018, 0], [-.13, .045, 0]], flat('#789aa0'), 3, 30);
      b.membrane([[.08, -.057, 0], [-.16, -.099, 0], [-.33, -.028, 0], [-.12, -.046, 0]], flat('#8eaaa8'), 3, 26);
    }), role: 'fin' },
    { name: 'rounded striped caudal membrane', g: shape(b => b.membrane([[0, .014, 0], [-.14, .071, 0], [-.15, .058, 0], [-.15, -.058, 0], [-.14, -.071, 0], [0, -.014, 0]], (x, y) => colour(Math.abs(y) < .048 ? '#25333a' : '#72a3b1'), 4, 34, .002)), pivot: [-.35, 0, 0], motion: 'tail', role: 'fin' },
    ...[-1, 1].map(s => ({ name: `small cleaner pectoral ${s}`, g: shape(b => b.membrane([[0, 0, 0], [-.068, -.016, s * .070], [-.115, .006, s * .055], [-.044, .023, s * .020]], flat('#98b6b4'), 3, 22, .002)), pivot: [.27, -.010, s * .031], motion: 'fin', role: 'fin' })),
  ];
}

function porcupineKit() {
  const stations = [[-.34, .028, .023, .023, -.010], [-.25, .093, .085, .067, -.012], [-.09, .165, .147, .106, -.008], [.10, .189, .167, .125, -.002], [.27, .161, .126, .105, .006], [.40, .105, .076, .072, .006], [.49, .022, .025, .032, -.008], [.50, .011, .012, .021, -.009]], profile = profileAt(stations);
  const blotches = [[-.08, .115, .091, .08, .061], [.19, .122, .106, .063, .053], [.32, .076, .083, .046, .043], [-.14, .165, .015, .059, .051], [.11, .183, .008, .067, .049]];
  const tint = (x, y, z) => {
    const c = colour('#9a9880').lerp(colour('#d8d7c0'), THREE.MathUtils.smoothstep(-y, .008, .115));
    for (const [bx, by, bz, rx, ry] of blotches) {
      const d = Math.sqrt(((x - bx) / rx) ** 2 + ((y - by) / ry) ** 2 + ((Math.abs(z) - bz) / .062) ** 2);
      if (d < 1.24) { c.lerp(colour('#ddd8b9'), 1 - THREE.MathUtils.smoothstep(d, 1.12, 1.24)); c.lerp(colour('#434c43'), 1 - THREE.MathUtils.smoothstep(d, .87, 1.01)); }
    }
    c.multiplyScalar(.985 + .015 * Math.sin(x * 81 + z * 79)); return c;
  };
  return [
    { name: 'ordinary uninflated black-blotched porcupinefish body and laid short spines', g: shape(b => {
      b.body(stations, tint, 48, 36); eyes(b, .373, .068, .080, .022, '#96906a');
      for (const s of [-1, 1]) b.egg([.480, -.009, s * .008], [.020, .0018, .018], flat('#636655'), 14, 7);
      // Short spines stay laid along the ordinary resting body, never an
      // inflated defensive sphere. Facial and belly spines remain present.
      for (let ring = 0; ring < 9; ring++) for (let i = 0; i < 9; i++) {
        const x = -.19 + ring * .065, [upper, lower, width, cy] = profile(x), a = i / 9 * TAU + (ring % 2) * .17, sin = Math.sin(a), cos = Math.cos(a), y = cy + sin * (sin >= 0 ? upper : lower), z = cos * width;
        if (x > .27 && Math.abs(y - .068) < .036 && Math.abs(z) > .060) continue;
        const reach = .022 + .010 * (.5 + .5 * Math.sin(ring * 2.1 + i));
        b.tube([[x, y, z], [x - reach * .44, y + sin * .007, z + cos * .009], [x - reach, y + sin * .010, z + cos * .013]], .0038, .0005, tint, 3, 6);
      }
    }), role: 'body' },
    { name: 'unspotted rounded soft dorsal and anal fins', g: shape(b => {
      b.membrane([[-.11, .154, 0], [-.20, .238, 0], [-.29, .179, 0], [-.31, .050, 0], [-.19, .090, 0]], flat('#a4a483'), 4, 30);
      b.membrane([[-.12, -.142, 0], [-.21, -.200, 0], [-.28, -.173, 0], [-.32, -.041, 0], [-.20, -.086, 0]], flat('#b7b493'), 4, 28);
    }), role: 'fin' },
    { name: 'unspotted rounded porcupinefish caudal fin', g: shape(b => b.membrane([[0, .018, 0], [-.12, .084, 0], [-.16, .061, 0], [-.16, -.074, 0], [-.115, -.083, 0], [0, -.019, 0]], flat('#afb194'), 4, 34)), pivot: [-.34, -.01, 0], motion: 'tail', role: 'fin' },
    ...[-1, 1].map(s => ({ name: `unspotted rounded porcupinefish pectoral ${s}`, g: shape(b => b.membrane([[0, 0, 0], [-.060, -.052, s * .113], [-.137, -.017, s * .134], [-.122, .040, s * .110], [-.040, .039, s * .036]], flat('#b2b596'), 4, 30)), pivot: [.27, -.029, s * .089], motion: 'fin', role: 'fin' })),
  ];
}

function lionKit() {
  const stations = [[-.30, .029, .024, .022, -.010], [-.20, .090, .074, .050, -.010], [-.05, .145, .110, .077, -.003], [.13, .174, .126, .102, .002], [.27, .161, .118, .102, .004], [.37, .108, .081, .080, 0], [.47, .047, .043, .052, -.010], [.50, .018, .022, .030, -.011]];
  const tint = (x, y, z) => {
    const band = Math.sin((x + .5) * 53 + y * 13 + .28 * Math.sin(y * 31)), c = colour('#d0c6af').lerp(colour('#865d49'), THREE.MathUtils.smoothstep(band, -.25, .21));
    c.multiplyScalar(.97 + .03 * Math.sin(y * 73 + z * 59)); return c;
  };
  const finTint = (x, y, z) => {
    const c = colour('#c4bda6').lerp(colour('#876652'), THREE.MathUtils.smoothstep(Math.sin(x * 43 + y * 22), -.32, .22));
    const dots = Math.sin(x * 108 + y * 61) * Math.sin(y * 94 + z * 31); if (dots > .80) c.multiplyScalar(.63); return c;
  };
  const body = { name: 'continuous lionfish body with irregular cream and muted red bands', g: shape(b => {
    b.body(stations, tint, 48, 32); eyes(b, .353, .072, .078, .018, '#b5a176');
    for (const s of [-1, 1]) {
      b.egg([.483, -.017, s * .022], [.015, .002, .030], flat('#635744'), 12, 7);
      b.tube([[.343, .105, s * .061], [.326, .153, s * .073], [.299, .184, s * .083]], .006, .0013, tint, 4, 6);
      b.tube([[.459, -.050, s * .041], [.437, -.086, s * .058], [.423, -.112, s * .062]], .0045, .0008, tint, 4, 6);
    }
  }), role: 'body' };
  const dorsal = { name: 'thirteen complete long dorsal spines and basal membranes', g: shape(b => {
    const spines = [];
    for (let i = 0; i < 13; i++) {
      const u = i / 12, x = .30 - u * .51, base = [.30 - u * .51, .155 - u * .095, 0], tip = [x - .035 - u * .033, .343 + .194 * Math.sin(u * Math.PI), .004 * Math.sin(i)];
      spines.push({ base, tip }); b.tube([base, [lerp(base[0], tip[0], .55), lerp(base[1], tip[1], .55), .003], tip], .0048, .0006, finTint, 5, 6);
    }
    for (let i = 1; i < spines.length; i++) {
      const a = spines[i - 1], c = spines[i], mix = p => p.base.map((v, k) => lerp(v, p.tip[k], .64));
      b.membrane([a.base, mix(a), mix(c), c.base], finTint, 2, 12, .001);
    }
    b.membrane([[-.17, .068, 0], [-.22, .211, 0], [-.29, .206, 0], [-.34, .112, 0], [-.30, .028, 0]], finTint, 3, 26);
  }), role: 'fin' };
  return [body, dorsal,
    { name: 'lionfish soft anal and paired pelvic membranes', g: shape(b => {
      b.membrane([[-.06, -.092, 0], [-.11, -.252, 0], [-.29, -.217, 0], [-.31, -.043, 0]], finTint, 3, 26);
      for (const s of [-1, 1]) b.membrane([[.18, -.094, s * .022], [.04, -.266, s * .126], [-.02, -.166, s * .096], [.07, -.115, s * .025]], finTint, 3, 24);
    }), role: 'fin' },
    { name: 'rounded spotted lionfish caudal fin', g: shape(b => b.membrane([[0, .022, 0], [-.15, .136, 0], [-.20, .083, 0], [-.20, -.086, 0], [-.15, -.135, 0], [0, -.022, 0]], finTint, 4, 36)), pivot: [-.30, -.01, 0], motion: 'tail', role: 'fin' },
    ...[-1, 1].map(s => ({ name: `wide continuous radiating lionfish pectoral membrane ${s}`, g: shape(b => {
      const tips = Array.from({ length: 14 }, (_, i) => { const a = -.80 + i / 13 * 1.98;
        return [-.25 + .18 * Math.sin(a), .272 * Math.sin(a), s * (.37 + .093 * Math.cos(a))]; });
      b.fan(tips, (x, y, z) => finTint(x + .19, y - .016, z + s * .085), .85);
    }), pivot: [.19, -.016, s * .085], motion: 'fin', role: 'fin' })),
  ];
}

// The two remaining large reef patrol silhouettes join the same continuous
// body/curved membrane family. Museum-guided authoring, not new source scans.
function reefPatrolKit(batfish){
  const stations=batfish?
    [[-.32,.055,.050,.025,0],[-.24,.20,.20,.051,0],[-.10,.33,.31,.084,0],[.11,.33,.29,.092,0],[.28,.24,.20,.080,0],[.41,.12,.09,.048,0],[.50,.025,.021,.018,0]]:
    [[-.33,.051,.045,.040,0],[-.24,.125,.12,.077,0],[-.06,.23,.19,.132,0],[.14,.28,.21,.151,0],[.30,.31,.18,.130,0],[.39,.235,.123,.101,0],[.48,.071,.065,.056,0],[.50,.033,.034,.035,0]];
  const tint=(x,y,z)=>{
    const c=colour(batfish?'#9baba6':'#527b70').lerp(colour(batfish?'#d1c9ad':'#91a28a'),THREE.MathUtils.smoothstep(-y,-.07,.23));
    if(batfish){
      const band=Math.max(1-THREE.MathUtils.smoothstep(Math.abs(x-.29+y*.10),.035,.090),1-THREE.MathUtils.smoothstep(Math.abs(x-.035-y*.08),.040,.090));
      c.lerp(colour('#3f5350'),band*.82);
      const spot=((x-.05)/.050)**2+((y+.24)/.055)**2;if(spot<1)c.lerp(colour('#344641'),.8);
    }else{
      const cell=Math.sin(x*125+Math.sin(y*87)*.55)*Math.cos(y*98-z*8);c.multiplyScalar(.91+.09*cell);
      const face=THREE.MathUtils.smoothstep(x,.28,.43);c.lerp(colour('#659f9b'),face*(.30+.16*Math.sin(y*111+x*25)));
    }
    return c;
  };
  const fins=batfish?'#b6aa72':'#5b8d81';
  return [
    {name:batfish?'full silver batfish body with two dark bands':'continuous humphead wrasse body and forehead',role:'body',g:shape(b=>{
      b.body(stations,tint,48,36);eyes(b,batfish?.363:.397,batfish?.11:.139,batfish?.055:.086,batfish?.025:.021,'#a2a482');
      if(!batfish)for(const s of [-1,1])b.egg([.487,-.017,s*.015],[.027,.018,.038],flat('#8fa88c'),18,10);
    })},
    {name:'continuous broad dorsal and anal membranes',role:'fin',g:shape(b=>{
      b.membrane(batfish?[[.24,.25,0],[.16,.43,0],[-.03,.50,0],[-.26,.28,0],[-.32,.052,0],[-.07,.29,0]]:
        [[.32,.26,0],[.17,.34,0],[-.16,.28,0],[-.30,.10,0],[-.12,.17,0]],flat(fins),4,38);
      b.membrane(batfish?[[.12,-.27,0],[-.02,-.48,0],[-.27,-.30,0],[-.32,-.049,0],[-.12,-.21,0]]:
        [[.05,-.19,0],[-.09,-.275,0],[-.27,-.19,0],[-.31,-.047,0],[-.13,-.12,0]],flat(fins),4,34);
    })},
    {name:'rounded complete caudal membrane',role:'fin',pivot:[-.32,0,0],motion:'tail',g:shape(b=>b.membrane([[0,.04,0],[-.15,.16,0],[-.19,.10,0],[-.19,-.10,0],[-.15,-.16,0],[0,-.04,0]],flat(fins),4,34,.004))},
    ...[-1,1].map(s=>({name:`curved reef patrol pectoral ${s}`,role:'fin',pivot:[.24,-.043,s*(batfish?.072:.115)],motion:'fin',g:shape(b=>b.membrane([[0,0,0],[-.12,-.10,s*.11],[-.22,-.03,s*.15],[-.14,.052,s*.09],[-.03,.025,s*.03]],flat(fins),3,28,.004))})),
  ];
}
const buildKit = { 'cleaner-wrasse': cleanerKit, 'black-blotched-porcupinefish': porcupineKit, lionfish: lionKit,'longfin-batfish':()=>reefPatrolKit(true),'humphead-wrasse':()=>reefPatrolKit(false) };
export class ShallowCommunityFishAssets {
  constructor(builders = buildKit) {
    this.builders = builders;
    this.resources = new Set(); this.kits = new Map(); this.models = new Map(); this.disposed = false;
    this.bodyMaterial = this.own(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .53, metalness: .025 }));
    this.finMaterial = this.own(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .64, side: THREE.DoubleSide, metalness: 0 }));
  }
  own(resource) { this.resources.add(resource); return resource; }
  create(id) {
    if (this.disposed || !Object.hasOwn(this.builders, id)) return null;
    if (!this.kits.has(id)) {
      const parts = this.builders[id]();
      // Curved membrane interpolation can run slightly past a control point.
      // Normalize the entire completed body and every pivot together once.
      let minX = Infinity, maxX = -Infinity;
      for (const p of parts) { minX = Math.min(minX, p.g.boundingBox.min.x + (p.pivot?.[0] ?? 0)); maxX = Math.max(maxX, p.g.boundingBox.max.x + (p.pivot?.[0] ?? 0)); }
      const scale = 1 / (maxX - minX), centerX = (minX + maxX) * .5;
      for (const p of parts) { p.g.scale(scale, scale, scale);
        if (p.pivot) p.pivot = [(p.pivot[0] - centerX) * scale, p.pivot[1] * scale, p.pivot[2] * scale]; else p.g.translate(-centerX * scale, 0, 0);
        p.g.computeBoundingBox(); p.g.computeBoundingSphere();
      }
      for (const p of parts) { this.own(p.g); p.g.userData = { assetFamily: 'shallow-community-fish-v1', authored: true, calibrated: false, speciesId: id, role: p.role, sizeMeasure: 'total-length', referenceKit: 'public/assets/shallow-community-fish/provenance.json' }; }
      this.kits.set(id, parts);
    }
    const root = new THREE.Group(); root.name = `Shallow community / ${id}`;
    root.userData = { sizeMeasure: 'total-length', naturalUnitLength: 1, authored: true, calibrated: false };
    const model = { id, root, tail: null, fins: [] };
    for (const part of this.kits.get(id)) {
      const mesh = new THREE.Mesh(part.g, part.role === 'body' ? this.bodyMaterial : this.finMaterial); mesh.name = part.name;
      if (part.pivot) { const pivot = new THREE.Group(); pivot.name = `${part.motion} pivot / ${part.name}`; pivot.position.fromArray(part.pivot); pivot.add(mesh); root.add(pivot);
        if (part.motion === 'tail') model.tail = pivot; else model.fins.push(pivot);
      } else root.add(mesh);
    }
    if (!this.models.has(id)) this.models.set(id, []); this.models.get(id).push(model); root.updateMatrixWorld(true); return model;
  }
  update(time, speeds = new Map()) {
    if (this.disposed) return;
    for (const [id, models] of this.models) {
      const speed = clamp(speeds.get(id) ?? 0, 0, 1), rate = id === 'cleaner-wrasse' ? 3.3 : id === 'lionfish' ? 1.3 : 2.1;
      for (const m of models) {
        if (m.tail) m.tail.rotation.y = Math.sin(time * (rate + speed * 2.4)) * (id === 'lionfish' ? .043 : .073 + speed * .05);
        m.fins.forEach((fin, i) => { fin.rotation.x = Math.sin(time * (id === 'lionfish' ? .88 : 2.0 + speed * 2) + i * Math.PI) * (id === 'lionfish' ? .041 : .092); });
        m.root.updateMatrixWorld(true);
      }
    }
  }
  dispose() {
    if (this.disposed) return; this.disposed = true;
    for (const resource of this.resources) resource.dispose(); this.resources.clear(); this.kits.clear(); this.models.clear();
  }
}

// Shared complete body and curved membrane construction for whole-family assets.
export {shape as communityFishShape, eyes as communityFishEyes};
