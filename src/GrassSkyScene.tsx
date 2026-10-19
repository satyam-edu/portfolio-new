import { useEffect, useRef } from 'react'
import * as THREE from 'three'

export const PAN_DURATION = 3.0

// Camera state tweened from App's ENTER timeline. `shift` is how far below its resting place the horizon
// sits, in frame heights: 1 = one full screen below (Phase 1, only sky), 0 = resting ~70% down (Phase 2).
// Pitch is derived from it each frame, so the sky moves exactly 100vh — locked to the DOM overlay's -100vh slide.
export type CameraView = { shift: number; clouds: number; throttled: boolean }
const FOV = 55
const TAN_HALF_FOV = Math.tan(THREE.MathUtils.degToRad(FOV / 2))
const REST_HORIZON = 0.704

// ponytail: brute-force instancing; if low-end GPUs stutter, add distance LOD (fewer, wider far blades)
const BLADE_COUNT = 250000
const FIELD_DEPTH = 24
const FIELD_NEAR = 1.6
// ponytail: two fixed rings (detailed near, cheap far) instead of real distance LOD
const FAR_BLADE_COUNT = 60000
const FAR_DEPTH = 60
const EXPOSURE = 1.0
const CLUMP_RADIUS = 0.1
const BUTTERFLY_COUNT = 45
const FIREFLY_COUNT = 160
export const FIREFLY_COLORS = ['#d9ff6b', '#ffd166', '#9bffb0', '#8fe3ff', '#ffa8d6']

const SKY_ZENITH = '#3470e0'
const SKY_HORIZON = '#b8d4ee'
const NIGHT_ZENITH = '#030716'
const NIGHT_HORIZON = '#1b2a52'
// seconds for a full day <-> night crossfade
const NIGHT_FADE = 1.6

const NOISE_GLSL = /* glsl */ `
  float hash21(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
    for (int i = 0; i < 4; i++) {
      v += a * valueNoise(p);
      p = m * p;
      a *= 0.5;
    }
    return v;
  }
`

// 2D simplex noise (Ashima Arts / Stefan Gustavson, MIT) plus a rotated fBm on top of it.
// Simplex instead of value noise for the wind: no grid-aligned artifacts, so gust fronts read as organic shapes.
const SIMPLEX_GLSL = /* glsl */ `
  vec3 permute289(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod(i, 289.0);
    vec3 p = permute289(permute289(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
    m = m * m;
    m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }
  float windFbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    // rotate + offset each octave so the layers don't line up into visible diagonal streaks
    mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
    for (int i = 0; i < 4; i++) {
      v += a * snoise(p);
      p = rot * p * 2.03 + 17.0;
      a *= 0.5;
    }
    return v;
  }
`

const skyVertexShader = /* glsl */ `
  varying vec3 vWorldPos;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`

const skyFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uClouds;
  uniform float uNight;
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  varying vec3 vWorldPos;
  ${NOISE_GLSL}

  float hash13(vec3 p3) {
    p3 = fract(p3 * 0.1031);
    p3 += dot(p3, p3.zyx + 31.32);
    return fract((p3.x + p3.y) * p3.z);
  }
  vec3 hash33(vec3 p3) {
    p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yxz + 33.33);
    return fract((p3.xxy + p3.yxx) * p3.zyx);
  }

  // One star per occupied cell of a 3D grid laid over the unit sphere: isotropic, no pole pinching.
  // Each star twinkles at its own rate, and some barely twinkle at all, so the field never pulses in sync.
  vec3 starLayer(vec3 d, float scale, float density, float minR, float maxR) {
    vec3 id = floor(d * scale);
    float h = hash13(id);
    if (h > density) return vec3(0.0);
    vec3 r = hash33(id + 11.0);
    vec3 starDir = normalize(id + 0.5 + (r - 0.5) * 0.5);
    float dist = length(d - starDir) * scale;
    float radius = mix(minR, maxR, r.x * r.x);
    float core = smoothstep(radius, 0.0, dist);
    float glow = exp(-dist / radius * 1.6) * 0.35;
    float speed = mix(1.2, 4.5, r.y);
    float twinkle = mix(1.0, 0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * speed + h * 80.0)), smoothstep(0.2, 0.8, r.z));
    vec3 tint = mix(vec3(0.72, 0.82, 1.0), vec3(1.0, 0.9, 0.74), r.z);
    return tint * (core + glow) * twinkle * mix(0.5, 1.3, r.y);
  }

  // A meteor every ~7s on average: random start in the upper sky, streaks down-sideways with a fading tail.
  float shootingStar(vec3 d) {
    float period = 7.0;
    float n = floor(uTime / period);
    vec3 r = hash33(vec3(n, n * 1.7, 3.1));
    if (r.z < 0.3) return 0.0;
    float dur = 1.1;
    float lt = uTime - n * period - r.x * (period - dur);
    if (lt < 0.0 || lt > dur) return 0.0;
    vec2 a = vec2(atan(d.x, -d.z), asin(clamp(d.y, -1.0, 1.0)));
    vec2 start = vec2((r.x - 0.5) * 1.2, 0.32 + r.y * 0.3);
    vec2 vel = normalize(vec2(r.z < 0.65 ? -1.0 : 1.0, -0.5)) * 0.55;
    vec2 tail = -normalize(vel);
    vec2 rel = a - (start + vel * lt);
    float along = dot(rel, tail);
    float across = length(rel - tail * along);
    float streak = step(0.0, along) * (1.0 - smoothstep(0.0, 0.16, along)) * smoothstep(0.0022, 0.0, across);
    return streak * sin(lt / dur * 3.14159) * 1.6;
  }

  void main() {
    vec3 dir = normalize(vWorldPos - cameraPosition);
    float h = max(dir.y, 0.0);
    vec3 sky = mix(uHorizon, uZenith, smoothstep(0.0, 1.0, pow(h, 0.55)));

    vec3 color = sky;
    float density = 0.0;
    // clouds are the most expensive part of the frame; skip them entirely before the pan and near the horizon
    if (uClouds > 0.001 && h > 0.02) {
      // project the view ray onto a cloud deck overhead; +0.12 stops the horizon stretching to infinity
      vec2 uv = dir.xz / (h + 0.12) * 0.35;
      vec2 wind = vec2(uTime * 0.018, uTime * 0.006);
      float warp = fbm(uv * 0.6 + wind * 0.5 + 3.0);
      float base = fbm(uv + wind + warp * 0.6);
      // faster high-frequency erosion on the edges gives the billowy, drifting cumulus look
      float detail = fbm(uv * 3.2 + wind * 2.0);
      density = smoothstep(0.48, 0.78, base + (detail - 0.5) * 0.28);
      // thinner at night so the stars carry the sky
      density *= smoothstep(0.02, 0.22, h) * uClouds * mix(1.0, 0.6, uNight);

      // bright billow cores, thin edges stay tinted by the sky behind them; at night, dim moonlit grey-blue
      vec3 dayCloud = mix(sky + vec3(0.18), vec3(1.0), smoothstep(0.3, 1.0, density));
      vec3 nightCloud = mix(sky + vec3(0.03, 0.04, 0.07), vec3(0.2, 0.23, 0.34), smoothstep(0.3, 1.0, density));
      color = mix(sky, mix(dayCloud, nightCloud, uNight), density * 0.9);
    }

    if (uNight > 0.001 && h > 0.0) {
      // the whole star field turns slowly overhead, so even untwinkling stars drift
      float ang = uTime * 0.004;
      vec3 sd = vec3(cos(ang) * dir.x - sin(ang) * dir.z, dir.y, sin(ang) * dir.x + cos(ang) * dir.z);
      vec3 stars = starLayer(sd, 150.0, 0.09, 0.12, 0.22) + starLayer(sd, 55.0, 0.06, 0.07, 0.13);
      stars += vec3(0.9, 0.95, 1.0) * shootingStar(dir);
      // fade out into the horizon haze and behind clouds
      color += stars * smoothstep(0.0, 0.16, h) * (1.0 - density) * uNight;
    }

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const grassVertexShader = /* glsl */ `
  uniform float uTime;
  varying float vHeight;
  varying float vTint;
  varying float vPatch;
  varying float vCloudShade;
  varying float vGust;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  #include <fog_pars_vertex>
  ${NOISE_GLSL}
  ${SIMPLEX_GLSL}

  void main() {
    vec3 root = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    float t = uv.y;
    float seed = hash21(root.xz * 13.7);
    // blade height scale baked into the instance matrix; wind displacement scales with it so tall far blades bend alike
    float bladeScale = length(instanceMatrix[1].xyz);

    vec3 p = position;
    // distant blades widen so they don't go sub-pixel and shimmer while the camera moves
    p.x *= mix(1.0, 2.2, smoothstep(6.0, 35.0, distance(root.xz, cameraPosition.xz)));
    // per-blade arch: some stand upright, some droop forward
    p.z += mix(0.02, 0.09, seed) * t * t;

    vec4 world = instanceMatrix * vec4(p, 1.0);

    // ---- wind ----
    // Everything is sampled at the blade ROOT, so every vertex of a blade sees the same gust and the blade bends
    // as one piece. Every field is scrolled along windDir, so the pattern physically travels diagonally over X/Z.
    vec2 windDir = normalize(vec2(1.0, 0.8));
    vec2 perp = vec2(-windDir.y, windDir.x);

    // 1) massive swells: ~50-unit wavelength, the slow cohesive "breathing" of the whole field
    float swell = snoise(root.xz * 0.02 - windDir * uTime * 0.015);
    // 2) domain warp: bends the gust fronts so they curl and break instead of marching in straight bands
    vec2 wp = root.xz * 0.09;
    vec2 warp = vec2(snoise(wp * 0.45 + uTime * 0.02), snoise(wp * 0.45 + vec2(31.7, 11.3) - uTime * 0.02)) * 0.9;
    // 3) traveling gust fronts: 4-octave simplex fBm moving ~0.65 units/s downwind
    float gusts = windFbm(wp + warp - windDir * uTime * 0.06);
    float gust = smoothstep(-0.35, 0.75, gusts * 0.75 + swell * 0.5);

    // calm lean everywhere + gust push; turbulence grows inside gusts, where real grass thrashes most
    float lean = 0.012 + gust * 0.045;
    float flutter = snoise(root.xz * 1.7 + vec2(uTime * 1.4, seed * 9.0)) * (0.2 + 0.8 * gust);
    // pow(uv.y, 3.0): exactly 0 at the root, so roots are anchored; the upper stalk takes almost all the bend
    float bend = pow(t, 3.0);
    vec2 disp = (windDir * lean + perp * flutter * 0.015) * bend * bladeScale;
    world.xz += disp;
    // pull the tip down as it swings out, approximating a stalk of fixed length arcing over
    world.y -= length(disp) * 0.5;
    vGust = gust;

    // field-scale variation sampled once per blade root; cheap value-noise taps, not per-fragment fbm
    vPatch = valueNoise(root.xz * 0.12) * 0.65 + valueNoise(root.xz * 0.4 + 7.0) * 0.35;
    vCloudShade = valueNoise(root.xz * 0.045 + vec2(uTime * 0.025, uTime * 0.01));

    vWorldNormal = normalize(mat3(instanceMatrix) * normal);
    vWorldPos = world.xyz;
    vHeight = t;
    vTint = seed;

    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`

const grassFragmentShader = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uMid;
  uniform vec3 uTip;
  uniform vec3 uTipDry;
  uniform vec3 uSunDir;
  uniform float uNight;
  varying float vHeight;
  varying float vTint;
  varying float vPatch;
  varying float vCloudShade;
  varying float vGust;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  #include <fog_pars_fragment>

  void main() {
    // dry/olive patches across the field, plus the odd dry blade anywhere
    float dry = clamp(smoothstep(0.7, 1.0, vTint) * 0.3 + smoothstep(0.6, 0.85, vPatch) * 0.35, 0.0, 1.0);
    vec3 tip = mix(uTip, uTipDry, dry);
    vec3 mid = mix(uMid, uMid * vec3(1.15, 1.05, 0.8), smoothstep(0.5, 0.8, vPatch));
    // near-black root -> dark body -> sharp jump to sunlit yellow-green over the top half
    vec3 albedo = mix(uBase, mid, smoothstep(0.0, 0.4, vHeight));
    albedo = mix(albedo, tip, smoothstep(0.45, 0.95, vHeight));
    albedo *= mix(0.7, 1.15, vTint);

    vec3 toFrag = vWorldPos - cameraPosition;
    float dist = length(toFrag);
    vec3 viewDir = toFrag / dist;
    vec3 n = normalize(vWorldNormal) * (gl_FrontFacing ? 1.0 : -1.0);
    // distant blades light as a soft carpet instead of flickering between facets
    n = normalize(mix(n, vec3(0.0, 1.0, 0.0), smoothstep(8.0, 30.0, dist) * 0.6));

    // subtle occlusion at the base; the albedo is already near-black there, so this only deepens it slightly
    float ao = mix(0.4, 1.0, smoothstep(0.0, 0.35, vHeight));
    float diffuse = max((dot(n, uSunDir) + 0.15) / 1.15, 0.0);
    // light passing through the thin blade: back faces toward the sun, strongest looking into the light
    float backlit = max(dot(-n, uSunDir), 0.0) * 0.5 + pow(max(dot(viewDir, uSunDir), 0.0), 3.0);
    float translucency = backlit * vHeight * vHeight;
    float cloudShadow = mix(0.62, 1.0, smoothstep(0.35, 0.65, vCloudShade));

    // night swaps the sun for a cool, dim moon from the same direction
    vec3 skyAmbient = mix(vec3(0.16, 0.2, 0.27), vec3(0.015, 0.025, 0.055), uNight);
    vec3 sun = mix(vec3(1.1, 1.04, 0.88), vec3(0.09, 0.13, 0.24), uNight) * cloudShadow;
    vec3 col = albedo * (skyAmbient + sun * diffuse) * ao;
    col += albedo * mix(vec3(1.1, 1.2, 0.55), vec3(0.1, 0.14, 0.2), uNight) * translucency * cloudShadow * 0.9;
    // gust crests flatten blades so their faces catch the sky; troughs stand upright and darker.
    // This bright/dark band travelling with the gust field is what makes the waves visible from afar.
    col *= 1.0 + (vGust * 0.45 - 0.12) * vHeight;
    // moonlight washes out colour: desaturate and cool the field at night
    col = mix(col, vec3(dot(col, vec3(0.3, 0.59, 0.11))) * vec3(0.65, 0.85, 1.25), uNight * 0.55);

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`

const groundVertexShader = /* glsl */ `
  varying vec3 vWorldPos;
  #include <fog_pars_vertex>
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPos = world.xyz;
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`

const groundFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uBase;
  uniform vec3 uMid;
  uniform vec3 uTip;
  uniform vec3 uSunDir;
  uniform float uNight;
  varying vec3 vWorldPos;
  #include <fog_pars_fragment>
  ${NOISE_GLSL}

  void main() {
    vec2 xz = vWorldPos.xz;
    // same patch and cloud-shadow fields the blades use, so gaps and far carpet match the grass above
    float patchNoise = valueNoise(xz * 0.12) * 0.65 + valueNoise(xz * 0.4 + 7.0) * 0.35;
    float fine = valueNoise(xz * 12.0);
    vec3 albedo = mix(uBase, uMid, 0.35 + fine * 0.5);
    albedo = mix(albedo, uTip * 0.55, smoothstep(0.55, 0.85, patchNoise) * 0.5);

    float cloudShadow = mix(0.62, 1.0, smoothstep(0.35, 0.65, valueNoise(xz * 0.045 + vec2(uTime * 0.025, uTime * 0.01))));
    float diffuse = max((uSunDir.y + 0.15) / 1.15, 0.0);
    vec3 ambient = mix(vec3(0.16, 0.2, 0.27), vec3(0.015, 0.025, 0.055), uNight);
    vec3 sun = mix(vec3(1.1, 1.04, 0.88), vec3(0.09, 0.13, 0.24), uNight);
    vec3 col = albedo * (ambient + sun * cloudShadow * diffuse * 0.8);
    // near the camera the ground is only glimpsed deep between blades, where it sits in their shade
    col *= mix(0.35, 1.0, smoothstep(6.0, 30.0, distance(vWorldPos, cameraPosition)));
    col = mix(col, vec3(dot(col, vec3(0.3, 0.59, 0.11))) * vec3(0.65, 0.85, 1.25), uNight * 0.55);

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`

const vignetteVertexShader = /* glsl */ `
  varying vec2 vNdc;
  void main() {
    vNdc = position.xy;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

const vignetteFragmentShader = /* glsl */ `
  varying vec2 vNdc;
  void main() {
    // gentle lens vignette: blends toward black at the corners
    float alpha = smoothstep(0.55, 1.45, length(vNdc * vec2(1.0, 0.9))) * 0.22;
    gl_FragColor = vec4(0.0, 0.0, 0.0, alpha);
  }
`

// Spear-shaped leaf folded along a forward midrib. Each half has its own vertices and normal,
// so one side catches the sun and the other falls into shadow — that two-tone crease is what
// makes the blades read as distinct, crisp leaves instead of sub-pixel noise.
function buildBladeGeometry() {
  // kept well under the 0.55 eye height so no blade crosses the horizon; the far field reads as fine texture
  const h = 0.22
  const rows = [
    { y: 0, hw: 0.013, cz: 0.004 },
    { y: 0.35 * h, hw: 0.015, cz: 0.004 },
    { y: 0.7 * h, hw: 0.0085, cz: 0.0025 },
  ]
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const indices: number[] = []

  for (const side of [-1, 1]) {
    const start = positions.length / 3
    for (const r of rows) {
      positions.push(side * r.hw, r.y, 0, 0, r.y, r.cz)
      uvs.push(side < 0 ? 0 : 1, r.y / h, 0.5, r.y / h)
    }
    positions.push(0, h, 0)
    uvs.push(0.5, 1)
    const count = positions.length / 3 - start
    for (let i = 0; i < count; i++) normals.push(side * 0.6, 0, 0.8)

    // per row: edge = start + 2i, center = start + 2i + 1; tip is the last vertex
    const tip = start + rows.length * 2
    for (let i = 0; i < rows.length - 1; i++) {
      const e0 = start + i * 2
      const c0 = e0 + 1
      const e1 = e0 + 2
      const c1 = e0 + 3
      indices.push(e0, c0, e1, c0, c1, e1)
    }
    const eLast = start + (rows.length - 1) * 2
    indices.push(eLast, eLast + 1, tip)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  return geometry
}

function buildFarBladeGeometry() {
  const w = 0.03
  const h = 0.22
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-w / 2, 0, 0, w / 2, 0, 0, 0, h, 0], 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2))
  return geometry
}

function scatterClumps(mesh: THREE.InstancedMesh, count: number, pickDepth: () => number, clumpRadius: number) {
  mesh.frustumCulled = false
  const dummy = new THREE.Object3D()
  const up = new THREE.Vector3(0, 1, 0)
  const tiltAxis = new THREE.Vector3()
  const tilt = new THREE.Quaternion()
  let i = 0
  while (i < count) {
    const depth = pickDepth()
    const halfWidth = 2 + depth
    const cx = (Math.random() - 0.5) * 2 * halfWidth
    const cz = FIELD_NEAR - depth
    const clumpSize = Math.min(count - i, 20 + Math.floor(Math.random() * 40))
    const clumpScale = 0.75 + Math.random() * 0.5
    for (let b = 0; b < clumpSize; b++, i++) {
      const angle = Math.random() * Math.PI * 2
      const r = Math.sqrt(Math.random()) * clumpRadius
      const ox = Math.cos(angle) * r
      const oz = Math.sin(angle) * r
      dummy.position.set(cx + ox, 0, cz + oz)
      dummy.quaternion.setFromAxisAngle(up, Math.random() * Math.PI * 2)
      if (r > 0) {
        // lean away from the clump centre, more at the rim: the tufted look
        tiltAxis.set(oz, 0, -ox).normalize()
        tilt.setFromAxisAngle(tiltAxis, (r / clumpRadius) * 0.45 + Math.random() * 0.15)
        dummy.quaternion.premultiply(tilt)
      }
      // far blades grow so they stay visible and form a spiky silhouette where the field meets the sky;
      // capped so the farthest ring doesn't poke noticeably above the horizon
      const s = clumpScale * (0.6 + Math.random() * 0.9) * (1 + Math.min(depth, 36) * 0.035)
      dummy.scale.set(s * (0.8 + Math.random() * 0.6), s, s)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
  }
  mesh.instanceMatrix.needsUpdate = true
}

function buildGrass() {
  const material = new THREE.ShaderMaterial({
    vertexShader: grassVertexShader,
    fragmentShader: grassFragmentShader,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uBase: { value: new THREE.Color('#030803') },
        uMid: { value: new THREE.Color('#1d3a10') },
        uTip: { value: new THREE.Color('#b6d62e') },
        uTipDry: { value: new THREE.Color('#c9cd3c') },
        // sun ahead-left and high, so the field is partly backlit from the camera's view
        uSunDir: { value: new THREE.Vector3(-0.35, 0.75, -0.55).normalize() },
        uNight: { value: 0 },
      },
    ]),
    side: THREE.DoubleSide,
    fog: true,
  })

  const mesh = new THREE.InstancedMesh(buildBladeGeometry(), material, BLADE_COUNT)
  scatterClumps(mesh, BLADE_COUNT, () => Math.pow(Math.random(), 1.35) * FIELD_DEPTH, CLUMP_RADIUS)
  // far ring: 3-vertex blades, wider clumps; with the depth-scaled size they merge into a dense carpet
  const far = new THREE.InstancedMesh(buildFarBladeGeometry(), material, FAR_BLADE_COUNT)
  scatterClumps(far, FAR_BLADE_COUNT, () => FIELD_DEPTH + Math.random() * (FAR_DEPTH - FIELD_DEPTH), CLUMP_RADIUS * 2.5)
  return { mesh, far, material }
}

const butterflyVertexShader = /* glsl */ `
  attribute float aPhase;
  uniform float uTime;
  varying vec2 vUv;
  #include <fog_pars_vertex>

  void main() {
    vUv = uv;
    // hinge each wing at the body (x = 0) and flap both up together
    float side = sign(position.x);
    float span = abs(position.x);
    float a = (sin(uTime * 22.0 + aPhase) * 0.5 + 0.5) * 1.25 - 0.15;
    vec3 p = vec3(side * span * cos(a), span * sin(a), position.z);

    vec4 mvPosition = viewMatrix * instanceMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`

const butterflyFragmentShader = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uButterflyColor;
  varying vec2 vUv;
  #include <fog_pars_fragment>

  void main() {
    vec4 c = texture2D(uMap, vUv);
    if (c.a < 0.35) discard;
    // wing fill is the only saturated part of the texture (ink is near-black, spots white), so saturation is the recolor mask;
    // 0.65 = linear red of the painted fill, keeps its shading
    float mx = max(c.r, max(c.g, c.b));
    float sat = (mx - min(c.r, min(c.g, c.b))) / max(mx, 1e-4);
    vec3 tint = uButterflyColor * clamp(c.r / 0.65, 0.0, 1.1);
    vec3 col = mix(c.rgb, tint, smoothstep(0.55, 0.8, sat));
    gl_FragColor = vec4(col * 0.92, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`

type Pt = [number, number]

// One monarch wing drawn once to a canvas: u runs from the body outward, v from tail to head.
// Both wings sample it, so the left wing mirrors for free.
function drawMonarchWing() {
  const S = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = S
  const ctx = canvas.getContext('2d')!
  const pt = (u: number, v: number): Pt => [u * S, (1 - v) * S]
  const shape = (pts: Pt[]) => {
    ctx.beginPath()
    pts.forEach(([u, v], i) => (i ? ctx.lineTo(...pt(u, v)) : ctx.moveTo(...pt(u, v))))
    ctx.closePath()
  }
  const ink = '#15100c'

  const fore: Pt[] = [[0.04, 0.52], [0.22, 0.88], [0.55, 0.98], [0.95, 0.96], [0.86, 0.68], [0.55, 0.54], [0.04, 0.48]]
  const hind: Pt[] = [[0.04, 0.5], [0.48, 0.52], [0.7, 0.4], [0.64, 0.14], [0.38, 0.04], [0.12, 0.1], [0.04, 0.3]]
  ctx.lineJoin = 'round'
  for (const wing of [hind, fore]) {
    shape(wing)
    ctx.fillStyle = '#d33a1a'
    ctx.fill()
    ctx.lineWidth = 16
    ctx.strokeStyle = ink
    ctx.stroke()
  }

  ctx.lineWidth = 4
  const veins: [number, number, number, number][] = [
    [0.05, 0.51, 0.9, 0.94],
    [0.05, 0.51, 0.8, 0.7],
    [0.3, 0.62, 0.55, 0.95],
    [0.05, 0.49, 0.62, 0.36],
    [0.05, 0.49, 0.5, 0.1],
    [0.05, 0.49, 0.22, 0.07],
  ]
  for (const [u0, v0, u1, v1] of veins) {
    ctx.beginPath()
    ctx.moveTo(...pt(u0, v0))
    ctx.lineTo(...pt(u1, v1))
    ctx.stroke()
  }

  shape([[0.62, 0.97], [0.95, 0.96], [0.88, 0.74], [0.72, 0.84]])
  ctx.fillStyle = ink
  ctx.fill()

  ctx.fillStyle = '#ffffff'
  const spots: Pt[] = [[0.78, 0.92], [0.86, 0.88], [0.84, 0.8], [0.3, 0.06], [0.5, 0.07], [0.66, 0.25]]
  for (const [u, v] of spots) {
    ctx.beginPath()
    ctx.arc(...pt(u, v), 4, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.fillStyle = ink
  ctx.fillRect(0, 0.2 * S, 0.05 * S, 0.6 * S)
  return canvas
}

function buildButterflies() {
  const map = new THREE.CanvasTexture(drawMonarchWing())
  map.colorSpace = THREE.SRGBColorSpace

  const W = 0.045
  const L = 0.04
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [0, 0, -L / 2, W, 0, -L / 2, W, 0, L / 2, 0, 0, L / 2, 0, 0, -L / 2, -W, 0, -L / 2, -W, 0, L / 2, 0, 0, L / 2],
      3,
    ),
  )
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1], 2))
  geometry.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7])

  const phases = new Float32Array(BUTTERFLY_COUNT)
  const flights = Array.from({ length: BUTTERFLY_COUNT }, (_, i) => {
    phases[i] = Math.random() * Math.PI * 2
    // ~1 in 6 spawn right at (or past) the camera-side edge of the field, closer than any grass blade,
    // so a few butterflies read as large and in front of the nearest blades instead of always over the field
    const isNear = i % 6 === 0
    const depth = isNear ? -0.5 + Math.random() * 1.3 : 1.5 + Math.random() * 22
    const tipDepth = Math.max(depth, 0)
    // wider than the camera frustum at this depth, so the wrap-around happens off screen
    const halfWidth = 2 + tipDepth * 1.05
    return {
      x: (Math.random() - 0.5) * 2 * halfWidth,
      halfWidth,
      // just above the blade tips, which grow with depth the same way scatterClumps scales them
      y: (0.26 + Math.random() * 0.08) * (1 + Math.min(tipDepth, 36) * 0.035),
      z: FIELD_NEAR - depth,
      // slow sideways drift across the field, either direction
      vx: (0.06 + Math.random() * 0.1) * (Math.random() < 0.5 ? -1 : 1),
      rx: 0.15 + Math.random() * 0.35,
      rz: 0.15 + Math.random() * 0.35,
      sx: 0.2 + Math.random() * 0.3,
      sz: 0.2 + Math.random() * 0.3,
      p1: Math.random() * Math.PI * 2,
      p2: Math.random() * Math.PI * 2,
      scale: 0.8 + Math.random() * 0.4,
    }
  })
  geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1))

  const material = new THREE.ShaderMaterial({
    vertexShader: butterflyVertexShader,
    fragmentShader: butterflyFragmentShader,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uMap: { value: null }, uButterflyColor: { value: new THREE.Color('#e63946') } }]),
    side: THREE.DoubleSide,
    fog: true,
  })
  material.uniforms.uMap.value = map

  const mesh = new THREE.InstancedMesh(geometry, material, BUTTERFLY_COUNT)
  mesh.frustumCulled = false
  // rewritten every frame
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  const dummy = new THREE.Object3D()
  dummy.rotation.order = 'YXZ'

  const update = (t: number, color: THREE.Color, night: number) => {
    material.uniforms.uTime.value = t
    material.uniforms.uButterflyColor.value.lerp(color, 0.08)
    mesh.visible = night < 0.999
    // butterflies settle into the grass as night falls
    const fade = 1 - night
    for (let i = 0; i < BUTTERFLY_COUNT; i++) {
      const f = flights[i]
      const ax = t * f.sx + f.p1
      const az = t * f.sz + f.p2
      const span = f.halfWidth * 2
      const x = ((((f.x + f.vx * t + Math.sin(ax) * f.rx + f.halfWidth) % span) + span) % span) - f.halfWidth
      // gentle float: slow bob just over the tips
      dummy.position.set(x, f.y + Math.sin(t * 1.3 + f.p1) * 0.03, f.z + Math.sin(az) * f.rz)
      // face along the flight path (drift + wander), nose tilted slightly up
      dummy.rotation.set(-0.3, Math.atan2(f.vx + Math.cos(ax) * f.rx * f.sx, Math.cos(az) * f.rz * f.sz), 0)
      dummy.scale.setScalar(f.scale * fade)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }

  const dispose = () => {
    geometry.dispose()
    material.dispose()
    map.dispose()
  }
  return { mesh, update, dispose }
}

const fireflyVertexShader = /* glsl */ `
  attribute vec4 aRand;
  uniform float uTime;
  uniform float uSize;
  varying float vGlow;

  void main() {
    // every firefly wanders on its own slow looping path, entirely on the GPU
    float ph = aRand.x * 6.2831;
    float sp = 0.5 + aRand.y;
    float r = 0.15 + aRand.z * 0.35;
    vec3 p = position;
    p.x += sin(uTime * 0.23 * sp + ph) * r + sin(uTime * 0.61 + ph * 2.0) * r * 0.35;
    p.z += cos(uTime * 0.19 * sp + ph * 1.3) * r;
    p.y += sin(uTime * 0.5 * sp + ph) * 0.05;

    // real fireflies flash, then go dark: sharp pulses on a slower, irregular envelope
    float pulse = pow(max(sin(uTime * mix(1.1, 2.6, aRand.w) + ph * 3.0), 0.0), 4.0);
    float envelope = 0.6 + 0.4 * sin(uTime * 0.37 + ph * 5.0);
    vGlow = 0.22 + pulse * envelope * 1.2;

    vec4 mv = viewMatrix * modelMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * (0.55 + vGlow * 0.45) / -mv.z;
  }
`

const fireflyFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uNight;
  varying float vGlow;

  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float core = smoothstep(0.28, 0.0, d);
    float halo = pow(max(1.0 - d, 0.0), 2.2) * 0.7;
    float a = (core + halo) * vGlow * uNight;
    if (a < 0.003) discard;
    gl_FragColor = vec4(mix(uColor, vec3(1.0), core * 0.5) * a, a);
    #include <colorspace_fragment>
  }
`

function buildFireflies(pixelRatio: number) {
  const positions = new Float32Array(FIREFLY_COUNT * 3)
  const rands = new Float32Array(FIREFLY_COUNT * 4)
  for (let i = 0; i < FIREFLY_COUNT; i++) {
    const depth = 0.4 + Math.pow(Math.random(), 1.3) * 18
    const halfWidth = 2 + depth * 1.05
    positions[i * 3] = (Math.random() - 0.5) * 2 * halfWidth
    // some hover just above the tips, some drift down inside the grass where the blades occlude them
    positions[i * 3 + 1] = (0.16 + Math.random() * 0.34) * (1 + Math.min(depth, 36) * 0.035)
    positions[i * 3 + 2] = FIELD_NEAR - depth
    for (let k = 0; k < 4; k++) rands[i * 4 + k] = Math.random()
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('aRand', new THREE.BufferAttribute(rands, 4))

  const material = new THREE.ShaderMaterial({
    vertexShader: fireflyVertexShader,
    fragmentShader: fireflyFragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uNight: { value: 0 },
      uSize: { value: 80 * pixelRatio },
      uColor: { value: new THREE.Color(FIREFLY_COLORS[0]) },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false

  const update = (t: number, color: THREE.Color, night: number) => {
    material.uniforms.uTime.value = t
    material.uniforms.uNight.value = night
    material.uniforms.uColor.value.lerp(color, 0.08)
    points.visible = night > 0.001
  }
  const dispose = () => {
    geometry.dispose()
    material.dispose()
  }
  return { points, update, dispose }
}

export default function GrassSkyScene({
  view,
  butterflyColor,
  fireflyColor,
  night,
}: {
  view: CameraView
  butterflyColor: string
  fireflyColor: string
  night: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const butterflyTarget = useRef(new THREE.Color(butterflyColor))
  const fireflyTarget = useRef(new THREE.Color(fireflyColor))
  // read by the render loop every frame, so toggling never rebuilds the scene
  const nightTarget = useRef(night ? 1 : 0)
  useEffect(() => {
    butterflyTarget.current.set(butterflyColor)
  }, [butterflyColor])
  useEffect(() => {
    fireflyTarget.current.set(fireflyColor)
  }, [fireflyColor])
  useEffect(() => {
    nightTarget.current = night ? 1 : 0
  }, [night])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    // 1.5 instead of 2: retina at 2x is ~1.8x the pixels for a difference barely visible at this scene's detail level
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.NeutralToneMapping
    renderer.toneMappingExposure = EXPOSURE
    renderer.autoClear = false
    container.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.fog = new THREE.Fog(SKY_HORIZON, 18, 120)

    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 200)
    // low eye height: the frame's bottom edge meets the ground ~1.8 units out, so only the nearest
    // blades loom large while the field recedes to a distant horizon
    camera.position.set(0, 0.55, 2.6)
    const lookTarget = new THREE.Vector3(0, 0, -6)

    const skyMaterial = new THREE.ShaderMaterial({
      vertexShader: skyVertexShader,
      fragmentShader: skyFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uClouds: { value: 0 },
        uNight: { value: 0 },
        uZenith: { value: new THREE.Color(SKY_ZENITH) },
        uHorizon: { value: new THREE.Color(SKY_HORIZON) },
      },
      side: THREE.BackSide,
      depthWrite: false,
    })
    const sky = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), skyMaterial)
    sky.renderOrder = -1
    sky.frustumCulled = false
    scene.add(sky)

    const { mesh: grass, far: farGrass, material: grassMaterial } = buildGrass()
    scene.add(grass, farGrass)

    // ground only as big as the blade field (now both rings): past its far edge the sky shows through,
    // so the last row of blades silhouettes against it instead of fading into a grey fog band
    const groundMaterial = new THREE.ShaderMaterial({
      vertexShader: groundVertexShader,
      fragmentShader: groundFragmentShader,
      uniforms: {
        ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
        uTime: grassMaterial.uniforms.uTime,
        uBase: grassMaterial.uniforms.uBase,
        uMid: grassMaterial.uniforms.uMid,
        uTip: grassMaterial.uniforms.uTip,
        uSunDir: grassMaterial.uniforms.uSunDir,
        uNight: grassMaterial.uniforms.uNight,
      },
      fog: true,
    })
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(2 * (2 + FAR_DEPTH) + 8, FAR_DEPTH + 2), groundMaterial)
    ground.rotation.x = -Math.PI / 2
    ground.position.z = FIELD_NEAR + 1 - (FAR_DEPTH + 2) / 2
    scene.add(ground)

    const butterflies = buildButterflies()
    scene.add(butterflies.mesh)
    const fireflies = buildFireflies(renderer.getPixelRatio())
    scene.add(fireflies.points)

    const dayZenith = new THREE.Color(SKY_ZENITH)
    const dayHorizon = new THREE.Color(SKY_HORIZON)
    const nightZenith = new THREE.Color(NIGHT_ZENITH)
    const nightHorizon = new THREE.Color(NIGHT_HORIZON)
    let night = nightTarget.current

    const vignetteScene = new THREE.Scene()
    const vignetteCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const vignetteMaterial = new THREE.ShaderMaterial({
      vertexShader: vignetteVertexShader,
      fragmentShader: vignetteFragmentShader,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    })
    const vignetteQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), vignetteMaterial)
    vignetteQuad.frustumCulled = false
    vignetteScene.add(vignetteQuad)

    const resize = () => {
      const { clientWidth, clientHeight } = container
      renderer.setSize(clientWidth, clientHeight)
      camera.aspect = clientWidth / clientHeight
      camera.updateProjectionMatrix()
    }
    resize()
    window.addEventListener('resize', resize)

    // one full render up front compiles every shader and uploads the 310k instance matrices while the loader is
    // showing, so nothing hitches when the field is hidden below and later scrolls into view mid-pan
    renderer.render(scene, camera)
    const field = [grass, farGrass, ground, butterflies.mesh, fireflies.points]

    const start = performance.now()
    let raf: number
    let frame = 0
    let last = 0
    const animate = () => {
      const t = (performance.now() - start) / 1000
      const dt = Math.min(t - last, 0.1)
      last = t
      skyMaterial.uniforms.uTime.value = t
      grassMaterial.uniforms.uTime.value = t

      // ease toward the requested theme; every shader reads the same 0..1 value, so they cross-fade together
      const step = dt / NIGHT_FADE
      night = nightTarget.current > night ? Math.min(night + step, 1) : Math.max(night - step, 0)
      const k = night * night * (3 - 2 * night)
      skyMaterial.uniforms.uNight.value = k
      grassMaterial.uniforms.uNight.value = k
      skyMaterial.uniforms.uZenith.value.copy(dayZenith).lerp(nightZenith, k)
      skyMaterial.uniforms.uHorizon.value.copy(dayHorizon).lerp(nightHorizon, k)
      ;(scene.fog as THREE.Fog).color.copy(skyMaterial.uniforms.uHorizon.value)

      skyMaterial.uniforms.uClouds.value = view.clouds
      // the sway reads as gentle drift against moving clouds, but against fixed stars it looks like the
      // whole field rocking, so it settles to still as night falls
      camera.position.x = Math.sin(t * 0.08) * 0.35 * (1 - k)
      // the horizon (elevation 0) projects tan(pitch)/tan(fov/2) half-frames below centre, so solving for
      // tan(pitch) from the wanted screen position makes the horizon's on-screen travel linear in `shift`
      const tanPitch = (REST_HORIZON + view.shift - 0.5) * 2 * TAN_HALF_FOV
      lookTarget.y = camera.position.y + (camera.position.z - lookTarget.z) * tanPitch
      camera.lookAt(lookTarget)
      sky.position.copy(camera.position)

      // everything on the field sits (almost) below eye height, so it projects below the horizon line; while the
      // horizon is off the bottom of the frame (landing screen, early pan) the whole field is invisible — skip it
      const showField = REST_HORIZON + view.shift < 1.05
      for (const m of field) m.visible = showField
      if (showField) {
        butterflies.update(t, butterflyTarget.current, k)
        fireflies.update(t, fireflyTarget.current, k)
      }

      // while the UI slides, draw every other frame: the scene keeps moving (30fps) but leaves the GPU room for the compositor
      if (!view.throttled || frame++ % 2 === 0) {
        renderer.clear()
        renderer.render(scene, camera)
        renderer.render(vignetteScene, vignetteCamera)
      }
      raf = requestAnimationFrame(animate)
    }
    animate()

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      renderer.dispose()
      sky.geometry.dispose()
      skyMaterial.dispose()
      ground.geometry.dispose()
      groundMaterial.dispose()
      grass.geometry.dispose()
      farGrass.geometry.dispose()
      grassMaterial.dispose()
      butterflies.dispose()
      fireflies.dispose()
      vignetteQuad.geometry.dispose()
      vignetteMaterial.dispose()
      container.removeChild(renderer.domElement)
    }
  }, [view])

  return <div ref={containerRef} className="absolute inset-0 h-full w-full" />
}
