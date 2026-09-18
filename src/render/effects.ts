// Thư viện hiệu ứng có sẵn. Thêm hiệu ứng mới = thêm một mục vào EFFECTS:
// hàm GLSL `vec3 effect(float u, float v, float un, float vn)` trả về màu, dùng các uniform chung
// (uC1..uC3 màu, uSpeed, uScale, uIntensity, uP1, uP2 tham số riêng) và toạ độ hầm (xem shaders.ts).

export type ParamType = 'color' | 'range';
export interface ParamSpec {
  key: string;
  label: string;
  type: ParamType;
  default: number | string;
  min?: number;
  max?: number;
  step?: number;
}

export interface EffectDef {
  id: string;
  name: string;
  params: ParamSpec[];
  glsl: string;
}

const color = (key: string, label: string, def: string): ParamSpec => ({ key, label, type: 'color', default: def });
const range = (key: string, label: string, def: number, min: number, max: number, step = 0.01): ParamSpec => ({ key, label, type: 'range', default: def, min, max, step });

function common(c1: string, c2: string, c3: string, extra: ParamSpec[] = []): ParamSpec[] {
  return [
    color('c1', 'Màu nền', c1),
    color('c2', 'Màu 2', c2),
    color('c3', 'Màu sáng', c3),
    range('speed', 'Tốc độ', 1, 0, 3),
    range('scale', 'Mật độ', 1, 0.2, 4),
    range('intensity', 'Độ sáng', 1, 0, 2),
    ...extra,
  ];
}

export const EFFECTS: EffectDef[] = [
  {
    id: 'nebula',
    name: 'Tinh vân',
    params: common('#0a1560', '#5a2bd0', '#38d6ff', [range('p1', 'Sao', 1, 0, 2), range('p2', 'Độ cuộn', 1.5, 0, 3)]),
    glsl: /* glsl */ `
vec3 effect(float u, float v, float un, float vn) {
  vec2 p = vec2(u, v) * (0.35 * uScale);
  float t = uTime * uSpeed * 0.08;
  float n1 = fbm(p + vec2(t, -t * 0.7));
  float n2 = fbm(p * 1.7 + vec2(-t * 1.3, t * 0.4) + n1 * uP2);
  vec3 col = mix(uC1, uC2, smoothstep(0.25, 0.75, n1));
  col = mix(col, uC3, smoothstep(0.55, 0.95, n2) * 0.9);
  col *= 0.6 + 1.6 * n2;
  vec2 sp = vec2(u, v) * 18.0;
  vec2 cell = floor(sp);
  vec2 f = fract(sp) - 0.5;
  vec2 r = hash22(cell);
  float star = smoothstep(0.09, 0.0, length(f - (r - 0.5) * 0.8));
  float tw = 0.5 + 0.5 * sin(uTime * (2.0 + 4.0 * r.x) + r.y * 6.28);
  star *= step(0.86, hash2(cell + 3.1)) * tw * uP1;
  col += star;
  return col * uIntensity;
}`,
  },
  {
    id: 'warp',
    name: 'Hầm sao',
    params: common('#050a1e', '#7ab8ff', '#ffffff', [range('p1', 'Chiều (+ vào, − ra)', 1, -1, 1, 2), range('p2', 'Độ dài vệt', 1, 0.3, 2)]),
    glsl: /* glsl */ `
vec3 effect(float u, float v, float un, float vn) {
  vec3 col = uC1;
  float along = (un + 0.25) / 1.5;
  if (uP1 < 0.0) along = 1.0 - along;
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float lanes = (14.0 + fk * 10.0) * uScale;
    float lv = vn * lanes;
    float cell = floor(lv);
    float fv = fract(lv) - 0.5;
    float r = hash1(cell * 7.3 + fk * 31.0);
    float r2 = hash1(cell * 3.1 + fk * 17.0);
    float speed = uSpeed * (0.6 + r) * (1.0 - fk * 0.2);
    float len = (0.12 + 0.3 * r2) * uP2;
    float ph = fract(uTime * speed * 0.35 + r2);
    float dd = along - ph;
    float streak = smoothstep(-len, 0.0, dd) * (1.0 - smoothstep(0.0, 0.02, dd));
    float w = smoothstep(0.5, 0.0, abs(fv) * (2.0 + fk));
    col += mix(uC2, uC3, r) * streak * w * (1.0 - fk * 0.25) * step(0.3, hash1(cell * 1.7 + fk));
  }
  return col * uIntensity;
}`,
  },
  {
    id: 'rings',
    name: 'Vòng sáng chạy',
    params: common('#120a2e', '#ff7a18', '#ffe27a', [range('p1', 'Chiều (+ vào, − ra)', 1, -1, 1, 2), range('p2', 'Độ dày', 1, 0.3, 3)]),
    glsl: /* glsl */ `
vec3 effect(float u, float v, float un, float vn) {
  float spacing = 1.2 / uScale;
  float x = u - uTime * uSpeed * 1.5 * (uP1 < 0.0 ? -1.0 : 1.0);
  float ph = fract(x / spacing) - 0.5;
  float i = floor(x / spacing);
  float ring = exp(-pow(ph / (0.06 * uP2), 2.0));
  float glow = 0.35 * exp(-pow(ph / 0.3, 2.0));
  vec3 rc = mix(uC2, uC3, hash1(i * 3.7));
  vec3 col = uC1 * (0.6 + 0.4 * (1.0 - abs(vn - 0.5) * 2.0));
  col += rc * (ring + glow);
  return col * uIntensity;
}`,
  },
  {
    id: 'portal',
    name: 'Cổng thời gian',
    params: common('#080a3a', '#4a1fb8', '#7fe6ff', [range('p1', 'Số cánh xoáy', 5, 2, 10, 1), range('p2', 'Vòng sáng cuối', 1, 0, 2)]),
    glsl: /* glsl */ `
vec3 effect(float u, float v, float un, float vn) {
  float ang = vn * 4.712 + 2.356;
  float r = clamp(1.0 - un, 0.0, 1.6);
  float sw = sin(ang * floor(uP1 + 0.5) + log(r + 0.05) * 4.0 * uScale - uTime * uSpeed * 1.5);
  float arms = smoothstep(0.2, 1.0, sw);
  float n = fbm(vec2(ang * 1.5, r * 3.0 - uTime * uSpeed * 0.4));
  vec3 col = mix(uC1, uC2, n) * (0.4 + 0.6 * (1.0 - r * 0.5));
  col += uC3 * arms * 0.6 * (1.0 - r * 0.6);
  float ring = exp(-pow((un - 1.0) / 0.06, 2.0)) + 0.35 * exp(-pow((un - 1.0) / 0.25, 2.0));
  col += vec3(1.0, 0.95, 0.9) * ring * uP2;
  float ring0 = exp(-pow(un / 0.05, 2.0)) * 0.8;
  col += uC3 * ring0;
  return col * uIntensity;
}`,
  },
  {
    id: 'blueprint',
    name: 'Bản vẽ kiến trúc',
    params: common('#041a2e', '#1fa8d8', '#9df3ff', [range('p1', 'Khối nhấp nháy', 1, 0, 2), range('p2', 'Vạch quét', 1, 0, 2)]),
    glsl: /* glsl */ `
vec3 effect(float u, float v, float un, float vn) {
  vec2 p = vec2(u, v) * uScale;
  vec2 gm = abs(fract(p * 4.0 + 0.5) - 0.5) / 4.0;
  float minor = 1.0 - smoothstep(0.0, 0.015, min(gm.x, gm.y));
  vec2 gM = abs(fract(p + 0.5) - 0.5);
  float major = 1.0 - smoothstep(0.0, 0.025, min(gM.x, gM.y));
  float sweep = fract(uTime * uSpeed * 0.15);
  float sw = exp(-pow((un - (sweep * 1.5 - 0.3)) / 0.06, 2.0));
  vec2 cell = floor(p * 0.5);
  float on = step(0.78, hash2(cell + floor(uTime * uSpeed * 0.4)));
  vec2 cf = abs(fract(p * 0.5) - 0.5);
  float m = max(cf.x, cf.y);
  float box = (1.0 - smoothstep(0.44, 0.47, m)) * smoothstep(0.4, 0.43, m);
  vec3 col = uC1 * 0.6;
  col += uC2 * (minor * 0.22 + major * 0.7);
  col += uC3 * box * on * 0.9 * uP1;
  col += uC3 * sw * 0.9 * uP2;
  return col * uIntensity;
}`,
  },
  {
    id: 'aurora',
    name: 'Cực quang',
    params: common('#03101e', '#18d99a', '#8a5cff', [range('p1', 'Tách dải', 1, 0, 2), range('p2', 'Độ mịn', 1, 0.3, 2)]),
    glsl: /* glsl */ `
vec3 effect(float u, float v, float un, float vn) {
  float t = uTime * uSpeed * 0.3;
  float height = 1.0 - abs(vn - 0.5) * 2.0;
  float x = un * 3.0 * uScale;
  vec3 col = uC1;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float wave = fbm(vec2(x * 0.8 + fi * 3.7 + t * (0.6 + fi * 0.3), fi * 11.0)) * 2.0 - 1.0;
    float center = 0.55 + 0.25 * wave + (fi - 1.0) * 0.1 * uP1;
    float d = height - center;
    float curtain = exp(-pow(d / (0.16 * uP2), 2.0)) * (0.55 + 0.45 * fbm(vec2(x * 3.0 - t * 2.0, fi * 5.0)));
    col += mix(uC2, uC3, smoothstep(-0.2, 0.2, d)) * curtain * 0.85;
  }
  col += uC2 * 0.12 * height;
  return col * uIntensity;
}`,
  },
  {
    id: 'particles',
    name: 'Hạt sáng',
    params: common('#0a0618', '#ffb347', '#fff3c4', [range('p1', 'Chiều trôi (+ vào, − ra)', 1, -1, 1, 2), range('p2', 'Cỡ hạt', 1, 0.3, 3)]),
    glsl: /* glsl */ `
vec3 effect(float u, float v, float un, float vn) {
  vec3 col = uC1;
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float sc = (2.5 + fk * 1.5) * uScale;
    vec2 p = vec2(u, v) * sc;
    p.x -= uTime * uSpeed * (0.4 + fk * 0.25) * (uP1 < 0.0 ? -1.0 : 1.0);
    vec2 cell = floor(p);
    vec2 f = fract(p);
    vec2 r = hash22(cell + fk * 9.0);
    vec2 c = 0.5 + 0.3 * sin(uTime * (0.5 + r) * 1.5 + r * 6.28);
    float d = length(f - c);
    float size = (0.04 + 0.06 * r.y) * uP2;
    float glow = size / (d + 0.02) * 0.05;
    float dot = smoothstep(size, size * 0.3, d);
    float alive = step(0.5, hash2(cell + fk * 3.3));
    col += mix(uC2, uC3, r.x) * (dot + glow) * alive * (1.0 - fk * 0.2);
  }
  return col * uIntensity;
}`,
  },
  {
    id: 'gradient',
    name: 'Dải màu',
    params: common('#c8102e', '#ff8a00', '#ffe066', [range('p1', 'Pha màu sáng', 1, 0, 2)]),
    glsl: /* glsl */ `
vec3 effect(float u, float v, float un, float vn) {
  float t = uTime * uSpeed * 0.4;
  float a = 0.5 + 0.5 * sin(un * 3.14 * uScale + t);
  float b = 0.5 + 0.5 * sin(vn * 3.14 * uScale - t * 0.7 + un * 2.0);
  vec3 col = mix(uC1, uC2, a);
  col = mix(col, uC3, b * uP1 * 0.5);
  return col * uIntensity;
}`,
  },
  {
    id: 'pulse',
    name: 'Nhịp sáng',
    params: common('#1a0630', '#ff2d95', '#ffffff', [range('p1', 'Độ dứt', 1, 0.2, 3)]),
    glsl: /* glsl */ `
vec3 effect(float u, float v, float un, float vn) {
  float beat = fract(uTime * uSpeed * 0.5);
  float env = exp(-beat * 4.0 * uP1);
  float dist = length(vec2((un - 0.5) * 2.0, (vn - 0.5) * 2.0));
  float wave = exp(-pow((dist - beat * 1.8) / (0.12 * uScale), 2.0));
  vec3 col = uC1 * (0.3 + 0.5 * env) + uC2 * wave + uC3 * exp(-dist * 2.0) * env * 0.6;
  return col * uIntensity;
}`,
  },
  {
    id: 'waves',
    name: 'Sóng màu',
    params: common('#001f3f', '#0aa6c2', '#e9fbff', [range('p1', 'Ngọn sáng', 1, 0, 2)]),
    glsl: /* glsl */ `
vec3 effect(float u, float v, float un, float vn) {
  float t = uTime * uSpeed;
  float w = sin(u * 3.0 * uScale - t * 2.0) + sin(v * 2.2 * uScale + t * 1.3) + sin((u + v) * 1.7 * uScale - t);
  w = w / 3.0 * 0.5 + 0.5;
  vec3 col = mix(uC1, uC2, smoothstep(0.2, 0.8, w));
  col += uC3 * pow(smoothstep(0.75, 1.0, w), 2.0) * uP1;
  return col * uIntensity;
}`,
  },
  {
    id: 'ribbon',
    name: 'Lụa đỏ kỷ niệm',
    params: common('#b0101c', '#ff3d4a', '#ffffff', [range('p1', 'Số dải lụa', 4, 1, 6, 1), range('p2', 'Lấp lánh', 1, 0, 2)]),
    glsl: /* glsl */ `
vec3 effect(float u, float v, float un, float vn) {
  float t = uTime * uSpeed * 0.5;
  vec3 col = uC1 * (0.85 + 0.15 * sin(un * 6.0 + t));
  for (int i = 0; i < 6; i++) {
    if (float(i) >= uP1) break;
    float fi = float(i);
    float y = 0.5 + 0.28 * sin(un * 3.0 * uScale + t * (0.6 + fi * 0.15) + fi * 1.7) + 0.1 * sin(un * 7.0 * uScale - t * 1.3 + fi * 2.1);
    float d = abs(vn - y);
    float band = exp(-pow(d / (0.05 + fi * 0.015), 2.0));
    float sheen = 0.5 + 0.5 * sin(un * 5.0 + t * 2.0 + fi);
    col = mix(col, mix(uC2, uC3, sheen * 0.7), band * 0.9);
  }
  vec2 sp = vec2(u, v) * 12.0;
  vec2 cell = floor(sp);
  vec2 f = fract(sp) - 0.5;
  vec2 r = hash22(cell);
  float star = smoothstep(0.09, 0.0, length(f - (r - 0.5) * 0.8)) * step(0.88, hash2(cell + 1.7)) * (0.5 + 0.5 * sin(uTime * 3.0 + r.x * 6.28));
  col += star * uP2 * 0.9;
  return col * uIntensity;
}`,
  },
  {
    id: 'solid',
    name: 'Màu đơn',
    params: [color('c1', 'Màu', '#000000'), range('intensity', 'Độ sáng', 1, 0, 2)],
    glsl: /* glsl */ `
vec3 effect(float u, float v, float un, float vn) { return uC1 * uIntensity; }`,
  },
];

export const MEDIA_EFFECT_ID = 'media';
export const MEDIA_PARAMS: ParamSpec[] = [range('intensity', 'Độ sáng', 1, 0, 2)];

export function effectById(id: string): EffectDef | null {
  return EFFECTS.find((e) => e.id === id) ?? null;
}

export function paramsFor(effectId: string): ParamSpec[] {
  return effectId === MEDIA_EFFECT_ID ? MEDIA_PARAMS : effectById(effectId)?.params ?? [];
}

/** Giá trị tham số đã điền mặc định theo schema. */
export function resolveParams(effectId: string, params: Record<string, number | string>): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  for (const p of paramsFor(effectId)) out[p.key] = params[p.key] ?? p.default;
  return out;
}
