import * as THREE from 'three';

// Short, explicit time-compressed journeys within the fixed 450s programme.
// These are observation-point changes, never a real geographic transect.
export const PRIMER_TRAVEL_WINDOWS = Object.freeze([
  { id: 'into-reef', start: 39, end: 52, boundary: 45, from: 'surface', to: 'shallow', fromDepth: 4, toDepth: 5.6, label: '进入浅海观察点', note: '镜头继续向前，接近礁谷群落' },
  { id: 'into-open-water', start: 279, end: 294, boundary: 285, from: 'shallow', to: 'pelagic', fromDepth: 5.9, toDepth: 6, label: '转往开阔水域', note: '切换至加勒比海代表性观察点 · 航行时间压缩' },
  { id: 'into-midwater', start: 355, end: 375, boundary: 365, from: 'pelagic', to: 'deep', fromDepth: 6, toDepth: 700, label: '观察器前往中层水体', note: '切换至东北太平洋 · 下潜时间压缩' },
  { id: 'return-to-surface', start: 425, end: 436, boundary: 430, from: 'deep', to: 'recap', fromDepth: 3500, toDepth: 0, label: '返回海面，回望海洋', note: '返航时间压缩示意' },
].map(Object.freeze));
const smooth = t => { t = THREE.MathUtils.clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export function primerTravelState(time) {
  if (!Number.isFinite(time)) throw new TypeError('Travel time must be finite seconds.');
  const window = PRIMER_TRAVEL_WINDOWS.find(w => time >= w.start && time < w.end);
  if (!window) return null;
  const u = (time - window.start) / (window.end - window.start), progress = smooth(u);
  return { ...window, u, progress, depthM: THREE.MathUtils.lerp(window.fromDepth, window.toDepth, progress),
    leg: u < .27 ? 'departure' : u > .70 ? 'arrival' : 'travel',
    blend: u < .27 ? smooth(u / .27) : u > .70 ? smooth((u - .70) / .30) : 0 };
}

export function createPrimerPassage(scene, { seed = 55 } = {}) {
  const root = new THREE.Group(); root.name = 'Time-compressed continuous observation journey'; scene.add(root);
  const geometry = new THREE.BufferGeometry(), data = new Float32Array(700 * 3), sizes = new Float32Array(700);
  let randomState = (Number(seed) | 0) ^ 0x717341;
  const random = () => { randomState = Math.imul(randomState ^ randomState >>> 15, 0x45d9f3b); return (randomState >>> 0) / 4294967296; };
  for (let i = 0; i < sizes.length; i++) { data[i * 3] = (random() - .5) * 34; data[i * 3 + 1] = (random() - .5) * 24; data[i * 3 + 2] = random() * -85; sizes[i] = .45 + random() * 1.3; }
  geometry.setAttribute('position', new THREE.BufferAttribute(data, 3)); geometry.setAttribute('grainSize', new THREE.BufferAttribute(sizes, 1));
  const material = new THREE.ShaderMaterial({ transparent: true, depthWrite: false,
    uniforms: { time: { value: 0 }, dark: { value: 0 } },
    vertexShader: `uniform float time;attribute float grainSize;varying float distanceToEye;varying vec3 ray;
      void main(){vec3 p=position;p.z=mod(p.z+time*1.8,85.0)-85.0;p.y-=mod(time*.018,1.0);vec4 eye=modelViewMatrix*vec4(p,1.);distanceToEye=-eye.z;ray=normalize(eye.xyz);gl_Position=projectionMatrix*eye;gl_PointSize=clamp(grainSize*85./max(1.,distanceToEye),.8,5.);}`,
    fragmentShader: `uniform float dark;varying float distanceToEye;varying vec3 ray;
      void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;float beam=smoothstep(.68,.97,-ray.z);float a=(1.-r*r)*mix(.16,beam*.45,dark)*exp(-distanceToEye*.035);gl_FragColor=vec4(mix(vec3(.60,.80,.82),vec3(.75,.79,.78),dark),a);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }` });
  const particles = new THREE.Points(geometry, material); particles.frustumCulled = false; root.add(particles);
  const background = new THREE.Color(), fog = new THREE.FogExp2(0x245f75, .023);
  const domeGeometry = new THREE.SphereGeometry(120, 32, 18), domeMaterial = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false,
    uniforms: { tint: { value: background } }, vertexShader: 'void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `uniform vec3 tint;void main(){gl_FragColor=vec4(tint,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }` });
  const dome = new THREE.Mesh(domeGeometry, domeMaterial); dome.renderOrder = -3; root.add(dome);
  const daylight = new THREE.Color('#17617a'), darkness = new THREE.Color('#020a12');
  let disposed = false, current;
  const cameraPose = (time, travel) => {
    const turn = Math.sin(travel.u * Math.PI) * .14;
    return { position: { x: turn * .9, y: 0, z: 0 }, target: { x: turn * 2, y: travel.id === 'return-to-surface' ? .35 : -.15, z: -12 }, fov: 54 };
  };
  const update = (time, travel) => {
    if (disposed) return; current = travel;
    const dark = THREE.MathUtils.smoothstep(travel.depthM, 20, 260);
    background.copy(daylight).lerp(darkness, dark); scene.background = background; fog.color.copy(background); fog.density = .023 + dark * .02; scene.fog = fog;
    material.uniforms.dark.value = dark; material.uniforms.time.value = time;
  };
  return { root, update, cameraPose, diagnostics: () => ({ role: 'finite-display-travel-no-store', particles: sizes.length, travel: current }),
    dispose() { if (disposed) return; disposed = true; root.removeFromParent(); geometry.dispose(); material.dispose(); domeGeometry.dispose(); domeMaterial.dispose(); } };
}

// Blend linear HDR chapter renders, then apply the SAME display tone mapping
// once. A continuous water passage replaces a full-screen blackout.
export function createPrimerCompositor() {
  const targets = [0, 1].map(() => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: true, stencilBuffer: false }));
  const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const material = new THREE.ShaderMaterial({ depthTest: false, depthWrite: false,
    uniforms: { first: { value: targets[0].texture }, second: { value: targets[1].texture }, blend: { value: 0 } },
    vertexShader: 'varying vec2 uvScreen;void main(){uvScreen=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader: `uniform sampler2D first;uniform sampler2D second;uniform float blend;varying vec2 uvScreen;
      void main(){gl_FragColor=vec4(mix(texture2D(first,uvScreen).rgb,texture2D(second,uvScreen).rgb,blend),1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }` });
  const geometry = new THREE.PlaneGeometry(2, 2); scene.add(new THREE.Mesh(geometry, material));
  return { scene, camera, targets,
    resize(width, height, dpr) { for (const target of targets) target.setSize(Math.round(width * dpr), Math.round(height * dpr)); },
    render(renderer, first, second, blend) {
      for (const [i, view] of [first, second].entries()) { renderer.setRenderTarget(targets[i]); renderer.render(view.scene, view.camera); }
      renderer.setRenderTarget(null); material.uniforms.blend.value = blend; renderer.render(scene, camera);
    },
    dispose() { for (const target of targets) target.dispose(); geometry.dispose(); material.dispose(); scene.clear(); } };
}
