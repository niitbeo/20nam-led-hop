// Bộ dựng khung hình phẳng ("bản đồ pixel"): mỗi cảnh vẽ vào một lớp, hai lớp trộn bằng hiệu ứng
// chuyển cảnh, kết quả là một texture đúng độ phân giải LED. Mô phỏng 3D và cửa sổ xuất chỉ đọc
// texture này -> hai nơi luôn giống hệt nhau.
import * as THREE from 'three';
import { buildScreenBuffers } from '../geometry';
import { canvasSize, screenPixels, TRANSITION_INDEX, type Cursor, type Person, type Project, type Scene, type ScreenId } from '../model';
import { effectById, MEDIA_EFFECT_ID, resolveParams } from './effects';
import { COMMON, FLAT_VERTEX } from './shaders';
import { getTextTexture } from './text';

export interface MediaAsset {
  texture: THREE.Texture;
  aspect: number;
  video: HTMLVideoElement | null;
}
export type MediaLookup = (id: string) => MediaAsset | null;

const MEDIA_FRAG = /* glsl */ `
${COMMON}
uniform sampler2D uMedia;
uniform float uMediaAspect;
uniform int uMapping;
uniform int uFit;
uniform vec4 uScreenAspect;
uniform vec2 uCanvas;
uniform float uIntensity;
vec2 fitUv(vec2 uv, float ra, float ma, int fit) {
  if (fit == 2) return uv;
  float r = ra / ma;
  vec2 c = uv - 0.5;
  if (fit == 0) { if (r > 1.0) c.y /= r; else c.x *= r; }
  else { if (r > 1.0) c.x *= r; else c.y /= r; }
  return c + 0.5;
}
void main() {
  vec2 uv; float ra;
  float sa = vScreen < 0.5 ? uScreenAspect.x : vScreen < 1.5 ? uScreenAspect.y : vScreen < 2.5 ? uScreenAspect.z : uScreenAspect.w;
  if (uMapping == 0) { uv = vSuv; ra = sa; }
  else if (uMapping == 1) {
    if (vScreen < 2.5) { uv = unfold(vWorld, vScreen); ra = (2.0 * uDims.y + uDims.x) / uDims.z; }
    else { uv = vSuv; ra = sa; }
  } else { uv = gl_FragCoord.xy / uRes; ra = uCanvas.x / uCanvas.y; }
  uv = fitUv(uv, ra, uMediaAspect, uFit);
  vec3 col = texture2D(uMedia, uv).rgb;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) col = vec3(0.0);
  gl_FragColor = vec4(col * uIntensity, 1.0);
}
`;

const TEXT_FRAG = /* glsl */ `
${COMMON}
uniform sampler2D uText;
uniform float uTextAspect;
uniform vec3 uTextColor;
uniform float uSize;
uniform float uSpeed;
uniform vec4 uScreenAspect;
uniform vec4 uMask;
uniform float uFacadeHole; // t của mép trên lối vào trên mặt dựng
void main() {
  float A, mask, t0, size;
  if (vScreen < 0.5) { A = uScreenAspect.x; mask = uMask.x; }
  else if (vScreen < 1.5) { A = uScreenAspect.y; mask = uMask.y; }
  else if (vScreen < 2.5) { A = uScreenAspect.z; mask = uMask.z; }
  else { A = uScreenAspect.w; mask = uMask.w; }
  if (vScreen > 2.5 && uFacadeHole < 0.98) {
    // mặt dựng: chữ nằm trên dải phía trên lối vào
    float band = 1.0 - uFacadeHole;
    size = uSize * band;
    t0 = uFacadeHole + band * 0.5 - size * 0.5;
    A = A / band;
  } else { size = uSize; t0 = 0.5 - uSize * 0.5; }
  float wS = uSize * uTextAspect / A;
  if (uSpeed <= 0.0 && wS > 0.94) {
    // chữ đứng yên mà dài hơn màn: thu nhỏ cho vừa, giữ căn giữa
    float k = 0.94 / wS;
    wS *= k;
    float c = t0 + size * 0.5;
    size *= k;
    t0 = c - size * 0.5;
  }
  float s0 = uSpeed > 0.0 ? 1.0 - mod(uTime * uSpeed, 1.0 + wS) : 0.5 - wS * 0.5;
  vec2 tuv = vec2((vSuv.x - s0) / wS, (vSuv.y - t0) / size);
  float a = 0.0;
  if (tuv.x >= 0.0 && tuv.x <= 1.0 && tuv.y >= 0.0 && tuv.y <= 1.0) a = texture2D(uText, tuv).a;
  gl_FragColor = vec4(uTextColor, a * mask);
}
`;

const MAX_PERSONS = 8;
// Lớp tương tác: quầng theo khoảng cách 3D thật từ điểm trên bề mặt tới người (tâm ngang ngực),
// sóng lan từ chân người theo tuổi của người đó. Chế độ 1/2 cộng sáng, 3 nhân (mặt nạ hé mở).
const INTERACT_FRAG = /* glsl */ `
${COMMON}
uniform vec3 uPersons[${MAX_PERSONS}]; // x, d, tuổi (s)
uniform int uCount;
uniform int uMode;
uniform vec3 uColor;
uniform float uRadius;
uniform float uIntensity;
uniform float uSpeed;
void main() {
  float glow = 0.0;
  float ripple = 0.0;
  for (int i = 0; i < ${MAX_PERSONS}; i++) {
    if (i >= uCount) break;
    vec3 pp = uPersons[i];
    float dist = distance(vWorld, vec3(pp.x, 1.1, -pp.y));
    glow = max(glow, exp(-pow(dist / uRadius, 2.0)));
    float distF = distance(vWorld, vec3(pp.x, 0.0, -pp.y));
    for (int k = 0; k < 2; k++) {
      float r = mod(pp.z * uSpeed + float(k) * uRadius * 0.5, uRadius);
      float ring = exp(-pow((distF - r) / 0.16, 2.0)) * (1.0 - r / uRadius);
      ripple = max(ripple, ring);
    }
  }
  if (uMode == 1) gl_FragColor = vec4(uColor * glow * uIntensity, 1.0);
  else if (uMode == 2) gl_FragColor = vec4(uColor * ripple * uIntensity, 1.0);
  else {
    float m = clamp(0.05 + glow * uIntensity * 1.3, 0.0, 1.0);
    gl_FragColor = vec4(vec3(m), 1.0);
  }
}
`;

const TRANSITION_FRAG = /* glsl */ `
${COMMON}
uniform sampler2D uA;
uniform sampler2D uB;
uniform float uProgress;
uniform int uType;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 a = texture2D(uA, uv).rgb;
  vec3 b = texture2D(uB, uv).rgb;
  float p = uProgress;
  float u, v;
  tunnel(vWorld, vScreen, u, v);
  float un = u / uDims.z;
  float m = p;
  if (uType == 2) { float edge = mix(-0.4, 1.15, p); m = 1.0 - smoothstep(edge - 0.12, edge, un); }
  else if (uType == 3) { float edge = mix(1.15, -0.4, p); m = smoothstep(edge, edge + 0.12, un); }
  else if (uType == 4) {
    float dist = length(vWorld - vec3(0.0, uDims.y * 0.5, -uDims.z));
    float maxD = length(vec3(uFacade.x * 0.5, uFacade.y, uDims.z)) * 1.05;
    float radius = p * maxD;
    m = 1.0 - smoothstep(radius - 0.3, radius, dist);
  }
  else if (uType == 5) {
    float n = fbm(vec2(u, v) * 1.6) * 0.75 + hash2(floor(gl_FragCoord.xy / 3.0)) * 0.25;
    m = smoothstep(n, n + 0.15, p * 1.15);
  }
  else if (uType == 6) {
    vec3 flash = vec3(1.0);
    vec3 col = p < 0.5 ? mix(a, flash, smoothstep(0.0, 1.0, p * 2.0)) : mix(flash, b, smoothstep(0.0, 1.0, (p - 0.5) * 2.0));
    gl_FragColor = vec4(col, 1.0);
    return;
  }
  else if (uType == 7) { float f = fract(un * 6.0); m = smoothstep(f - 0.06, f, p * 1.06); }
  else if (uType == 0) { m = step(0.5, p); }
  gl_FragColor = vec4(mix(a, b, clamp(m, 0.0, 1.0)), 1.0);
}
`;

function makeRT(w: number, h: number): THREE.WebGLRenderTarget {
  return new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false });
}

const hex = (s: unknown): THREE.Color => new THREE.Color(typeof s === 'string' ? s : '#000000');

/** Một lớp = một cảnh được vẽ ra texture riêng. */
class Layer {
  readonly rt: THREE.WebGLRenderTarget;
  private readonly scene = new THREE.Scene();
  private readonly baseMesh: THREE.Mesh;
  private readonly textMesh: THREE.Mesh;
  private readonly interactMesh: THREE.Mesh;
  private readonly effectMats = new Map<string, THREE.ShaderMaterial>();
  private readonly mediaMat: THREE.ShaderMaterial;
  private readonly textMat: THREE.ShaderMaterial;
  private readonly interactMat: THREE.ShaderMaterial;

  constructor(private readonly comp: Compositor, w: number, h: number) {
    this.rt = makeRT(w, h);
    this.mediaMat = new THREE.ShaderMaterial({
      vertexShader: FLAT_VERTEX,
      fragmentShader: MEDIA_FRAG,
      uniforms: {
        ...comp.sharedUniforms(),
        uMedia: { value: null },
        uMediaAspect: { value: 1 },
        uMapping: { value: 0 },
        uFit: { value: 0 },
        uIntensity: { value: 1 },
      },
    });
    this.textMat = new THREE.ShaderMaterial({
      vertexShader: FLAT_VERTEX,
      fragmentShader: TEXT_FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        ...comp.sharedUniforms(),
        uText: { value: null },
        uTextAspect: { value: 1 },
        uTextColor: { value: new THREE.Color('#fff') },
        uSize: { value: 0.3 },
        uSpeed: { value: 0 },
        uMask: { value: new THREE.Vector4(1, 1, 0, 1) },
        uFacadeHole: { value: 0.7 },
      },
    });
    this.interactMat = new THREE.ShaderMaterial({
      vertexShader: FLAT_VERTEX,
      fragmentShader: INTERACT_FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      uniforms: {
        ...comp.sharedUniforms(),
        uPersons: { value: Array.from({ length: MAX_PERSONS }, () => new THREE.Vector3()) },
        uCount: { value: 0 },
        uMode: { value: 1 },
        uColor: { value: new THREE.Color('#fff') },
        uRadius: { value: 1.5 },
        uIntensity: { value: 1 },
        uSpeed: { value: 1.5 },
      },
    });
    this.baseMesh = new THREE.Mesh(comp.geometry, this.mediaMat);
    this.interactMesh = new THREE.Mesh(comp.geometry, this.interactMat);
    this.textMesh = new THREE.Mesh(comp.geometry, this.textMat);
    this.baseMesh.frustumCulled = this.textMesh.frustumCulled = this.interactMesh.frustumCulled = false;
    this.interactMesh.renderOrder = 1;
    this.textMesh.renderOrder = 2;
    this.scene.add(this.baseMesh, this.interactMesh, this.textMesh);
  }

  setGeometry(g: THREE.BufferGeometry): void {
    this.baseMesh.geometry = g;
    this.textMesh.geometry = g;
    this.interactMesh.geometry = g;
  }

  private effectMaterial(id: string): THREE.ShaderMaterial | null {
    const cached = this.effectMats.get(id);
    if (cached) return cached;
    const def = effectById(id);
    if (!def) return null;
    const mat = new THREE.ShaderMaterial({
      vertexShader: FLAT_VERTEX,
      fragmentShader: `${COMMON}
uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3;
uniform float uSpeed; uniform float uScale; uniform float uIntensity; uniform float uP1; uniform float uP2;
${def.glsl}
void main() {
  float u, v;
  tunnel(vWorld, vScreen, u, v);
  float un = u / uDims.z;
  float vn = v / (2.0 * uDims.y + uDims.x);
  vec3 col = effect(u, v, un, vn);
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}`,
      uniforms: {
        ...this.comp.sharedUniforms(),
        uC1: { value: new THREE.Color() },
        uC2: { value: new THREE.Color() },
        uC3: { value: new THREE.Color() },
        uSpeed: { value: 1 },
        uScale: { value: 1 },
        uIntensity: { value: 1 },
        uP1: { value: 1 },
        uP2: { value: 1 },
      },
    });
    this.effectMats.set(id, mat);
    return mat;
  }

  render(renderer: THREE.WebGLRenderer, scene: Scene, local: number, media: MediaLookup, playing: boolean): void {
    const params = resolveParams(scene.effect, scene.params);
    const persons = this.comp.interactionOn ? this.comp.persons : [];
    const ia = scene.interact;
    if (this.comp.interactionOn && ia.driveParam && ia.driveParam in params) {
      // tham số lái theo tiến độ người đi xa nhất (0 lối vào -> 1 cuối cổng)
      const L = this.comp.project.portal.length;
      let progress = 0;
      for (const p of persons) progress = Math.max(progress, Math.min(1, Math.max(0, p.d / L)));
      params[ia.driveParam] = ia.driveFrom + (ia.driveTo - ia.driveFrom) * progress;
    }
    const num = (k: string, d = 1): number => (typeof params[k] === 'number' ? (params[k] as number) : d);
    let mat: THREE.ShaderMaterial | null = null;
    if (scene.effect === MEDIA_EFFECT_ID) {
      mat = this.mediaMat;
      const asset = scene.media ? media(scene.media.id) : null;
      const u = mat.uniforms;
      u.uMedia.value = asset?.texture ?? null;
      u.uMediaAspect.value = asset?.aspect ?? 1;
      u.uMapping.value = scene.media ? { each: 0, unfold: 1, layout: 2 }[scene.media.mapping] : 0;
      u.uFit.value = scene.media ? { cover: 0, contain: 1, stretch: 2 }[scene.media.fit] : 0;
      u.uIntensity.value = num('intensity');
      if (asset?.video) syncVideo(asset.video, local, playing);
      if (!asset) {
        // chưa chọn media hoặc đang nạp: màn đen
        mat = this.effectMaterial('solid')!;
        (mat.uniforms.uC1.value as THREE.Color).set(0x000000);
        mat.uniforms.uIntensity.value = 1;
      }
    } else {
      mat = this.effectMaterial(scene.effect) ?? this.effectMaterial('solid');
      const u = mat!.uniforms;
      u.uC1.value = hex(params.c1);
      u.uC2.value = hex(params.c2);
      u.uC3.value = hex(params.c3);
      u.uSpeed.value = num('speed');
      u.uScale.value = num('scale');
      u.uIntensity.value = num('intensity');
      u.uP1.value = num('p1');
      u.uP2.value = num('p2');
    }
    mat!.uniforms.uTime.value = local;
    this.baseMesh.material = mat!;

    this.interactMesh.visible = this.comp.interactionOn && ia.mode !== 'none';
    if (this.interactMesh.visible) {
      const u = this.interactMat.uniforms;
      const arr = u.uPersons.value as THREE.Vector3[];
      const n = Math.min(MAX_PERSONS, persons.length);
      for (let i = 0; i < n; i++) arr[i].set(persons[i].x, persons[i].d, persons[i].age);
      u.uCount.value = n;
      u.uMode.value = { spotlight: 1, ripple: 2, reveal: 3 }[ia.mode as 'spotlight' | 'ripple' | 'reveal'];
      (u.uColor.value as THREE.Color).set(ia.color);
      u.uRadius.value = Math.max(0.2, ia.radius);
      u.uIntensity.value = ia.intensity;
      u.uSpeed.value = ia.speed;
      const multiply = ia.mode === 'reveal';
      this.interactMat.blendSrc = multiply ? THREE.ZeroFactor : THREE.OneFactor;
      this.interactMat.blendDst = multiply ? THREE.SrcColorFactor : THREE.OneFactor;
    }

    const tx = scene.text;
    this.textMesh.visible = tx.enabled && tx.text.trim().length > 0;
    if (this.textMesh.visible) {
      const tex = getTextTexture(tx.text);
      const u = this.textMat.uniforms;
      u.uText.value = tex.texture;
      u.uTextAspect.value = tex.aspect;
      u.uTextColor.value = hex(tx.color);
      u.uSize.value = tx.size;
      u.uSpeed.value = tx.speed;
      u.uTime.value = local;
      (u.uMask.value as THREE.Vector4).set(+tx.screens.left, +tx.screens.right, +tx.screens.ceiling, +tx.screens.facade);
      u.uFacadeHole.value = Math.min(1, this.comp.project.portal.height / this.comp.project.portal.facadeHeight);
    }

    renderer.setRenderTarget(this.rt);
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
    renderer.render(this.scene, this.comp.camera);
  }
}

/** Đồng bộ video với thời gian cảnh: chỉ nhảy khi lệch nhiều để không giật. */
function syncVideo(video: HTMLVideoElement, local: number, playing: boolean): void {
  if (!Number.isFinite(video.duration) || video.duration <= 0) return;
  const want = local % video.duration;
  const drift = Math.abs(video.currentTime - want);
  if (playing) {
    if (video.paused) void video.play().catch(() => {});
    if (drift > 0.5 && video.duration - drift > 0.5) video.currentTime = want;
  } else {
    if (!video.paused) video.pause();
    if (drift > 0.05) video.currentTime = want;
  }
}

export class Compositor {
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  geometry: THREE.BufferGeometry;
  project: Project;
  /** người đang theo dõi (toạ độ sàn); cập nhật mỗi khung từ nguồn tracking hoặc từ sync */
  persons: Person[] = [];
  get interactionOn(): boolean { return this.project.interaction?.enabled ?? false; }
  private readonly uDims = new THREE.Vector3();
  private readonly uFacade = new THREE.Vector2();
  private readonly uRes = new THREE.Vector2();
  private readonly uCanvas = new THREE.Vector2();
  private readonly uScreenAspect = new THREE.Vector4();
  private layerA: Layer;
  private layerB: Layer;
  private readonly transitionMat: THREE.ShaderMaterial;
  private readonly transitionScene = new THREE.Scene();
  private readonly transitionMesh: THREE.Mesh;
  private _output: THREE.WebGLRenderTarget;
  private width = 0;
  private height = 0;
  private scale = 0.5;
  // cửa sổ xuất cần 1:1 với bản đồ pixel (4800 px với cổng mẫu) -> cho tới 8192 (WebGL2 phổ biến)
  private static readonly MAX_DIM = 8192;

  constructor(project: Project, scale: number) {
    this.project = project;
    this.scale = scale;
    this.geometry = new THREE.BufferGeometry();
    this.applyProject(project);
    const { w, h } = this.targetSize();
    this.layerA = new Layer(this, w, h);
    this.layerB = new Layer(this, w, h);
    this._output = makeRT(w, h);
    this.transitionMat = new THREE.ShaderMaterial({
      vertexShader: FLAT_VERTEX,
      fragmentShader: TRANSITION_FRAG,
      uniforms: { ...this.sharedUniforms(), uA: { value: null }, uB: { value: null }, uProgress: { value: 0 }, uType: { value: 1 } },
    });
    this.transitionMesh = new THREE.Mesh(this.geometry, this.transitionMat);
    this.transitionMesh.frustumCulled = false;
    this.transitionScene.add(this.transitionMesh);
    this.width = w;
    this.height = h;
  }

  /** Uniform dùng chung; các Vector được chia sẻ theo tham chiếu nên chỉ cần cập nhật một nơi. */
  sharedUniforms(): Record<string, THREE.IUniform> {
    return {
      uTime: { value: 0 },
      uDims: { value: this.uDims },
      uFacade: { value: this.uFacade },
      uRes: { value: this.uRes },
      uCanvas: { value: this.uCanvas },
      uScreenAspect: { value: this.uScreenAspect },
    };
  }

  get output(): THREE.Texture { return this._output.texture; }
  get outputSize(): { w: number; h: number } { return { w: this.width, h: this.height }; }

  private targetSize(): { w: number; h: number } {
    const c = canvasSize(this.project);
    let s = this.scale;
    const maxDim = Math.max(c.w, c.h) * s;
    if (maxDim > Compositor.MAX_DIM) s *= Compositor.MAX_DIM / maxDim;
    return { w: Math.max(8, Math.round(c.w * s)), h: Math.max(8, Math.round(c.h * s)) };
  }

  setScale(scale: number): void {
    if (scale === this.scale) return;
    this.scale = scale;
    this.resize();
  }

  private resize(): void {
    const { w, h } = this.targetSize();
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.layerA.rt.setSize(w, h);
    this.layerB.rt.setSize(w, h);
    this._output.setSize(w, h);
  }

  /** Gọi khi kích thước cổng hoặc bố cục thay đổi. */
  applyProject(project: Project): void {
    this.project = project;
    const p = project.portal;
    this.uDims.set(p.width, p.height, p.length);
    this.uFacade.set(p.facadeWidth, p.facadeHeight);
    const c = canvasSize(project);
    this.uCanvas.set(c.w, c.h);
    const px = screenPixels(p);
    const asp = (id: ScreenId): number => px[id].w / px[id].h;
    this.uScreenAspect.set(asp('left'), asp('right'), asp('ceiling'), asp('facade'));
    const b = buildScreenBuffers(project);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(b.position, 3));
    g.setAttribute('aSuv', new THREE.BufferAttribute(b.screenUv, 2));
    g.setAttribute('aLayout', new THREE.BufferAttribute(b.layout, 2));
    g.setAttribute('aScreen', new THREE.BufferAttribute(b.screenId, 1));
    g.setIndex(new THREE.BufferAttribute(b.index, 1));
    this.geometry.dispose();
    this.geometry = g;
    if (this.layerA) {
      this.layerA.setGeometry(g);
      this.layerB.setGeometry(g);
      this.transitionMesh.geometry = g;
      this.resize();
    }
  }

  render(renderer: THREE.WebGLRenderer, cursor: Cursor | null, media: MediaLookup, playing: boolean): void {
    this.uRes.set(this.width, this.height);
    const prevTarget = renderer.getRenderTarget();
    if (!cursor) {
      renderer.setRenderTarget(this._output);
      renderer.setClearColor(0x000000, 1);
      renderer.clear();
      renderer.setRenderTarget(prevTarget);
      return;
    }
    const scenes = this.project.scenes;
    const a = scenes[cursor.index];
    this.layerA.render(renderer, a, cursor.local, media, playing);
    const u = this.transitionMat.uniforms;
    u.uA.value = this.layerA.rt.texture;
    if (cursor.next !== null && cursor.progress > 0) {
      this.layerB.render(renderer, scenes[cursor.next], cursor.nextLocal, media, playing);
      u.uB.value = this.layerB.rt.texture;
      u.uProgress.value = cursor.progress;
      u.uType.value = TRANSITION_INDEX[a.transition];
    } else {
      u.uB.value = this.layerA.rt.texture;
      u.uProgress.value = 0;
      u.uType.value = 1;
    }
    renderer.setRenderTarget(this._output);
    renderer.clear();
    renderer.render(this.transitionScene, this.camera);
    renderer.setRenderTarget(prevTarget);
  }
}
