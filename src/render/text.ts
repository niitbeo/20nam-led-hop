// Chữ chạy: vẽ dòng chữ ra canvas 2D một lần rồi dùng làm texture (kênh alpha = nét chữ, màu nhuộm trong shader).
import * as THREE from 'three';

export interface TextTexture { texture: THREE.CanvasTexture; aspect: number }

const cache = new Map<string, TextTexture>();
const FONT = '800 128px "Be Vietnam Pro", "Segoe UI", system-ui, sans-serif';
const HEIGHT = 192;
const PAD = 48;

// Font nhúng nạp xong thì vẽ lại toàn bộ (lần đầu có thể đã vẽ bằng font thay thế).
document.fonts.ready.then(() => {
  for (const v of cache.values()) v.texture.dispose();
  cache.clear();
});

export function getTextTexture(text: string): TextTexture {
  const hit = cache.get(text);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  ctx.font = FONT;
  const width = Math.min(8192, Math.ceil(ctx.measureText(text).width) + PAD * 2);
  canvas.width = width;
  canvas.height = HEIGHT;
  ctx.font = FONT;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fff';
  ctx.shadowColor = 'rgba(255,255,255,0.9)';
  ctx.shadowBlur = 18;
  ctx.fillText(text, PAD, HEIGHT / 2 + 6);
  ctx.shadowBlur = 0;
  ctx.fillText(text, PAD, HEIGHT / 2 + 6);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  const out = { texture, aspect: width / HEIGHT };
  cache.set(text, out);
  return out;
}
