// Phần GLSL dùng chung: toạ độ hầm, nhiễu, đỉnh vẽ phẳng.
//
// MỌI hiệu ứng nhận toạ độ theo mét trên bề mặt cổng:
//   u  = độ sâu (0 ở lối vào, L ở cuối cổng; mặt dựng có u ÂM = khoảng cách tới mép lối vào)
//   v  = vị trí trên chu vi: 0 chân tường trái → H đỉnh tường trái → H+W mép trần phải → 2H+W chân tường phải
//   un, vn = u/L và v/(2H+W)
// Nhờ vậy hoạ tiết chạy liền từ mặt dựng vào tường, qua trần, sang tường kia mà không thấy mối nối.

export const FLAT_VERTEX = /* glsl */ `
attribute vec2 aSuv;
attribute vec2 aLayout;
attribute float aScreen;
uniform vec2 uCanvas;
varying vec3 vWorld;
varying vec2 vSuv;
varying float vScreen;
void main() {
  vWorld = position;
  vSuv = aSuv;
  vScreen = aScreen;
  vec2 ndc = vec2(aLayout.x / uCanvas.x * 2.0 - 1.0, 1.0 - aLayout.y / uCanvas.y * 2.0);
  gl_Position = vec4(ndc, 0.0, 1.0);
}
`;

export const COMMON = /* glsl */ `
uniform float uTime;
uniform vec3 uDims;   // W, H, L (m)
uniform vec2 uFacade; // FW, FH (m)
uniform vec2 uRes;    // kích thước bộ đệm đang vẽ (px)
varying vec3 vWorld;
varying vec2 vSuv;
varying float vScreen;

float hash1(float n) { return fract(sin(n) * 43758.5453123); }
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
vec2 hash22(vec2 p) { p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + vec2(17.3, 9.1); a *= 0.5; }
  return s;
}

void tunnel(vec3 w, float sid, out float u, out float v) {
  float W = uDims.x, H = uDims.y;
  if (sid < 0.5) { u = -w.z; v = w.y; }
  else if (sid < 1.5) { u = -w.z; v = H + W + (H - w.y); }
  else if (sid < 2.5) { u = -w.z; v = H + (w.x + W * 0.5); }
  else {
    float hx = W * 0.5;
    vec2 q = vec2(max(abs(w.x) - hx, 0.0), max(w.y - H, 0.0));
    u = -length(q);
    if (w.x < -hx && w.y <= H) v = clamp(w.y, 0.0, H);
    else if (w.x > hx && w.y <= H) v = H + W + (H - clamp(w.y, 0.0, H));
    else if (abs(w.x) <= hx) v = H + (w.x + hx);
    else if (w.x < 0.0) {
      // góc trên-trái: quạt từ đỉnh trụ trái (v = H) sang đầu dải trên (v = H + (x+hx) < H)
      float th = atan(w.y - H, -hx - w.x) / 1.5707963;
      v = H + (w.x + hx) * th;
    } else {
      float th = atan(w.y - H, w.x - hx) / 1.5707963;
      v = H + W + (w.x - hx) * th;
    }
  }
}

/* Trải phẳng chữ U: trần ở giữa, hai tường gập xuống hai bên; X ∈ [-(W/2+H), W/2+H], Y = độ sâu. */
vec2 unfold(vec3 w, float sid) {
  float W = uDims.x, H = uDims.y, L = uDims.z;
  float P = 2.0 * H + W;
  float X, Y = -w.z;
  if (sid < 0.5) X = -W * 0.5 - (H - w.y);
  else if (sid < 1.5) X = W * 0.5 + (H - w.y);
  else X = w.x;
  return vec2((X + P * 0.5) / P, Y / L);
}
`;
