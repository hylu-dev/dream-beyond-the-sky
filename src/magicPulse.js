import { BaseCapturingPass } from '@viggle/splat-engine';

// A screen-space pulse for the moment the sun breaks into golden hour: a
// ring of distortion sweeps out from a point (the sun on screen) and the
// whole frame swims with a soft shimmer, the colours split a little toward
// the edges, and the light swells warm. `amount` (0..1) is the envelope and
// `progress` (0..1) how far the ring has travelled; at amount 0 the frame
// passes through untouched.

const GLSL = /* glsl */ `
uniform sampler2D uSourceTex;
uniform vec2 uResolution;
uniform vec2 uCenter;
uniform float uAmount;
uniform float uProgress;
uniform float uTime;

vec3 fetch(vec2 uv) {
  ivec2 size = ivec2(uResolution);
  ivec2 px = clamp(ivec2(uv * uResolution), ivec2(0), size - ivec2(1));
  return texelFetch(uSourceTex, px, 0).rgb;
}

void main(void) {
  vec2 uv = gl_FragCoord.xy / uResolution;
  float aspect = uResolution.x / uResolution.y;
  // uCenter is from the top; gl_FragCoord counts from the bottom.
  vec2 center = vec2(uCenter.x, 1.0 - uCenter.y);
  vec2 d = (uv - center) * vec2(aspect, 1.0);
  float dist = length(d);
  vec2 dir = dist > 1e-4 ? d / dist : vec2(0.0);

  // The ring: a travelling ripple with a soft envelope round its radius.
  float radius = uProgress * 1.6;
  float x = dist - radius;
  float ring = sin(x * 38.0) * exp(-x * x * 26.0);
  // The shimmer: slow crossing waves over the whole frame.
  vec2 swim = vec2(sin(uv.y * 11.0 + uTime * 2.3), cos(uv.x * 9.0 - uTime * 1.9));
  vec2 offset = (dir * ring * 0.032 + swim * 0.006) * uAmount;
  offset.x /= aspect;

  // Colours split along the ring and toward the edges.
  vec2 split = dir * (0.004 + 0.006 * abs(ring)) * uAmount / vec2(aspect, 1.0);
  vec3 col;
  col.r = fetch(uv + offset + split).r;
  col.g = fetch(uv + offset).g;
  col.b = fetch(uv + offset - split).b;

  // The light swells: a warm lift brightest near the centre and on the ring.
  float glow = uAmount * (0.3 * exp(-dist * 2.2) + 0.16 * exp(-x * x * 40.0));
  col += glow * vec3(1.0, 0.82, 0.55);
  col = mix(col, col * vec3(1.06, 1.0, 0.92), uAmount * 0.5);

  gl_FragColor = vec4(col, 1.0);
}
`;

const WGSL = /* wgsl */ `
var uSourceTex: texture_2d<f32>;
uniform uResolution: vec2f;
uniform uCenter: vec2f;
uniform uAmount: f32;
uniform uProgress: f32;
uniform uTime: f32;

fn fetchAt(uv: vec2f) -> vec3f {
  let size = vec2i(uniform.uResolution);
  let px = clamp(vec2i(uv * uniform.uResolution), vec2i(0), size - vec2i(1));
  return textureLoad(uSourceTex, px, 0).rgb;
}

@fragment
fn fragmentMain(input: FragmentInput) -> FragmentOutput {
  var output: FragmentOutput;
  let uv = input.position.xy / uniform.uResolution;
  let aspect = uniform.uResolution.x / uniform.uResolution.y;
  let d = (uv - uniform.uCenter) * vec2f(aspect, 1.0);
  let dist = length(d);
  var dir = vec2f(0.0);
  if (dist > 1e-4) { dir = d / dist; }

  let radius = uniform.uProgress * 1.6;
  let x = dist - radius;
  let ring = sin(x * 38.0) * exp(-x * x * 26.0);
  let swim = vec2f(sin(uv.y * 11.0 + uniform.uTime * 2.3), cos(uv.x * 9.0 - uniform.uTime * 1.9));
  var offset = (dir * ring * 0.032 + swim * 0.006) * uniform.uAmount;
  offset.x = offset.x / aspect;

  let split = dir * (0.004 + 0.006 * abs(ring)) * uniform.uAmount / vec2f(aspect, 1.0);
  var col: vec3f;
  col.r = fetchAt(uv + offset + split).r;
  col.g = fetchAt(uv + offset).g;
  col.b = fetchAt(uv + offset - split).b;

  let glow = uniform.uAmount * (0.3 * exp(-dist * 2.2) + 0.16 * exp(-x * x * 40.0));
  col = col + glow * vec3f(1.0, 0.82, 0.55);
  col = mix(col, col * vec3f(1.06, 1.0, 0.92), uniform.uAmount * 0.5);

  output.color = vec4f(col, 1.0);
  return output;
}
`;

export class MagicPulse extends BaseCapturingPass {
  constructor() {
    super({ shaderName: 'magic-pulse-v1', fragmentGLSL: GLSL, fragmentWGSL: WGSL, needsSceneDepth: false });
    this.amount = 0;
    this.progress = 0;
    this.time = 0;
    // A share of the frame across and down, from its top-left corner.
    this.center = [0.5, 0.5];
  }

  bindUniforms(scope, device) {
    scope.resolve('uResolution').setValue([device.width, device.height]);
    scope.resolve('uCenter').setValue(this.center);
    scope.resolve('uAmount').setValue(this.amount);
    scope.resolve('uProgress').setValue(this.progress);
    scope.resolve('uTime').setValue(this.time);
  }
}
