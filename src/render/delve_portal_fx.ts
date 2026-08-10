import * as THREE from 'three';
import { hash2 } from '../sim/rng';
import { GFX, sharedUniforms } from './gfx';

// ---------------------------------------------------------------------------
// Delve-mouth portal: a self-animating red "void" sheet that fills the entrance
// arch, driven by the shared uTime clock (no per-frame JS plumbing, same
// pattern as the Drowned-Temple water in dungeon.ts). A churning swirl + a
// global breathing pulse take a deep near-black red up to a hot bright red; the
// circular alpha mask hides the plane's rectangular edges so it reads as a glowing
// mouth. On the composer tiers the hot core is pushed past 1.0 (uHdr) so it
// blooms; on low/headless (no composer) the colour stays saturated so it still
// reads without bloom.
// ---------------------------------------------------------------------------
const DELVE_PORTAL_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWPos;
  #include <fog_pars_vertex>
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWPos = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const DELVE_PORTAL_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uDim;
  uniform vec3 uBright;
  uniform vec3 uRim;
  uniform float uHdr;
  varying vec2 vUv;
  varying vec3 vWPos;
  #include <common>
  #include <fog_pars_fragment>
  void main() {
    vec2 p = vUv * 2.0 - 1.0; // centre-origin -1..1
    float r = length(p);

    // spinning vortex: angular phase + time rotates concentric rings inward
    float angle  = atan(p.y, p.x) / (2.0 * PI); // 0..1 around the disc
    float vortex = sin((angle + uTime * 0.10) * PI * 12.0 + r * 10.0 - uTime * 2.0) * 0.5 + 0.5;

    // three churning noise layers for organic variation
    float swirl = sin(p.x * 5.0 + uTime * 1.0)
                + sin(p.y * 6.0 - uTime * 0.85)
                + sin((p.x + p.y) * 4.5 + uTime * 0.65);
    float churn = 0.5 + 0.28 * (swirl / 3.0);

    // slow ominous breathing pulse
    float pulse = 0.5 + 0.5 * sin(uTime * 0.85);

    // hot outer rim (caller-tinted; crimson by default, watery cyan for the drowned shrine)
    vec3 rimCol = uRim * uHdr;

    // zone blending: void core (uDim) → mid swirl (uBright) → rim
    float toMid  = smoothstep(0.06, 0.55, r);
    float toRim  = smoothstep(0.45, 0.85, r);
    float ringEnergy = vortex * churn * smoothstep(0.90, 0.05, r);

    vec3 col = uDim;
    col = mix(col, uBright, toMid * (0.55 + 0.45 * ringEnergy));
    col = mix(col, rimCol,  toRim * (0.45 + 0.55 * pulse));
    col += uBright * smoothstep(0.28, 0.0, r) * 0.6 * uHdr; // core bloom

    // fill the whole opening as a dark solid portal; feather only the outer rim
    vec2 e = abs(p);
    float fill = (1.0 - smoothstep(0.76, 1.0, e.x)) * (1.0 - smoothstep(0.76, 1.0, e.y));
    float alpha = fill * (0.93 + 0.07 * pulse);

    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

const delvePortalMatCache = new Map<string, THREE.ShaderMaterial>();
/** Returns the cached delve-mouth void-plane material for this dim/bright/rim triple. */
export function delvePortalMaterial(
  dim: number,
  bright: number,
  rim: number,
): THREE.ShaderMaterial {
  const key = `${dim}_${bright}_${rim}`;
  let mat = delvePortalMatCache.get(key);
  if (mat) return mat;
  mat = new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uTime: sharedUniforms.uTime,
      uDim: { value: new THREE.Color(dim) },
      uBright: { value: new THREE.Color(bright) },
      uRim: { value: new THREE.Color(rim) },
      uHdr: { value: GFX.composer ? 2.8 : 1.0 },
    },
    vertexShader: DELVE_PORTAL_VERT,
    fragmentShader: DELVE_PORTAL_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    fog: true,
  });
  delvePortalMatCache.set(key, mat);
  return mat;
}

// The delve-entrance GLB bakes its stone AND its hanging veil into one shared
// texture (single unnamed material), so the veil can't be recolored by material
// name. For the drowned shrine we want that red veil to read as water: clone the
// converted material and inject a red→blue recolor that only touches reddish
// texels (R dominant over G/B), leaving the grey stone untouched. Cloned per
// asset-part material so the default (purple) entrance keeps the original red veil.
const drowningVeilMatCache = new Map<THREE.Material, THREE.Material>();
/** Returns the cached red-to-blue drowning-veil recolor clone of `src`. */
export function drownVeilMaterial(src: THREE.Material): THREE.Material {
  const cached = drowningVeilMatCache.get(src);
  if (cached) return cached;
  const m = src.clone();
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
      // recolor the baked red veil to a murky Blackwater blue; red-dominance gates it
      // so stone stays grey. The gate must SATURATE (smoothstep, full recolor by 0.15):
      // texels here are linear-space, where even a bright red fold only reaches ~0.5
      // dominance, and the old linear-strength mix left half the red channel intact,
      // so the veil still read red in-game. Stone dominance measures under 0.01.
      float _veilRed = smoothstep(0.02, 0.15, diffuseColor.r - max(diffuseColor.g, diffuseColor.b));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.04, 0.13, 0.2) * (0.4 + diffuseColor.r), _veilRed);
      `,
    );
  };
  // a distinct program key so three doesn't reuse the un-injected cached program
  m.customProgramCacheKey = () => 'drownVeil';
  drowningVeilMatCache.set(src, m);
  return m;
}

// Embers drifting up out of the delve mouth, a deterministic point cloud whose
// whole motion (rise + sideways waver + life fade) is a function of uTime, so it
// self-animates with no per-frame JS. Additive + HDR-boosted so it glows and
// blooms on composer tiers; reads as warm sparks on low too.
const DELVE_EMBER_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uRise;
  attribute float aPhase;
  attribute float aSpeed;
  attribute float aDrift;
  varying float vLife;
  void main() {
    float t = fract(uTime * aSpeed + aPhase); // 0..1 life cycle
    vLife = t;
    vec3 pos = position;
    pos.y += t * uRise;                                  // rise
    pos.x += sin((t + aPhase) * 6.2831) * aDrift;        // lazy sideways waver
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = (95.0 / max(-mv.z, 1.0)) * (0.45 + 0.55 * sin(t * 3.14159));
    gl_Position = projectionMatrix * mv;
  }
`;
const DELVE_EMBER_FRAG = /* glsl */ `
  uniform float uHdr;
  uniform vec3 uCol1;
  uniform vec3 uCol2;
  varying float vLife;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float soft = smoothstep(0.5, 0.0, d);
    float fade = sin(vLife * 3.14159);                   // fade in then out over life
    vec3 col = mix(uCol1, uCol2, vLife) * uHdr;
    gl_FragColor = vec4(col, soft * fade * 0.85);
  }
`;

/** Builds a self-animating ember-particle Points cloud rising out of a delve mouth. */
export function buildDelveEmbers(
  cx: number,
  baseY: number,
  cz: number,
  halfW: number,
  riseY: number,
  col1: [number, number, number] = [1.0, 0.16, 0.09],
  col2: [number, number, number] = [1.0, 0.5, 0.18],
): THREE.Points {
  const N = GFX.standardMaterials ? 48 : 28; // lighter on low
  const positions = new Float32Array(N * 3);
  const phase = new Float32Array(N);
  const speed = new Float32Array(N);
  const drift = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    positions[i * 3] = (hash2(i * 1.7, cx, 0x656d62) - 0.5) * halfW * 2;
    positions[i * 3 + 1] = hash2(i * 2.3, cz, 0x656d62) * 1.5; // start low in the mouth
    positions[i * 3 + 2] = (hash2(i * 3.1, cx + cz, 0x656d62) - 0.5) * 0.6;
    phase[i] = hash2(i * 4.5, cx, 0x656d62);
    speed[i] = 0.05 + hash2(i * 5.9, cz, 0x656d62) * 0.09;
    drift[i] = 0.3 + hash2(i * 6.7, cx, 0x656d62) * 0.7;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  geo.setAttribute('aSpeed', new THREE.BufferAttribute(speed, 1));
  geo.setAttribute('aDrift', new THREE.BufferAttribute(drift, 1));
  // motion happens in the shader, so bound it manually or it culls at rest
  geo.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(0, riseY / 2, 0),
    Math.max(halfW, riseY) + 1.5,
  );
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: sharedUniforms.uTime,
      uRise: { value: riseY },
      uHdr: { value: GFX.composer ? 2.0 : 1.0 },
      uCol1: { value: new THREE.Vector3(...col1) },
      uCol2: { value: new THREE.Vector3(...col2) },
    },
    vertexShader: DELVE_EMBER_VERT,
    fragmentShader: DELVE_EMBER_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.position.set(cx, baseY, cz);
  pts.renderOrder = 4; // over the void + vault
  return pts;
}

/** Drops the cached delve-portal and drowning-veil materials (props.ts's profile-cache reset). */
export function resetDelvePortalFxCaches(): void {
  delvePortalMatCache.clear();
  drowningVeilMatCache.clear();
}
