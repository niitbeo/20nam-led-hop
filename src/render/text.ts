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

const FONT_FAMILY = '"Be Vietnam Pro", "Segoe UI", system-ui, sans-serif';

function finish(canvas: HTMLCanvasElement, key: string): TextTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  const out = { texture, aspect: canvas.width / canvas.height };
  cache.set(key, out);
  return out;
}

/** Khối chữ nhiều dòng, màu nhuộm sẵn, có quầng sáng nhẹ. */
export function getBlockTextTexture(text: string, color: string, weight: 'bold' | 'normal', align: 'left' | 'center' | 'right'): TextTexture {
  const key = `block|${weight}|${align}|${color}|${text}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l, i, a) => l.length > 0 || (i > 0 && i < a.length - 1));
  const font = `${weight === 'bold' ? 800 : 500} 128px ${FONT_FAMILY}`;
  const lineH = 156;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  ctx.font = font;
  const maxW = Math.max(1, ...lines.map((l) => ctx.measureText(l).width));
  canvas.width = Math.min(8192, Math.ceil(maxW) + PAD * 2);
  canvas.height = Math.min(8192, lines.length * lineH + PAD * 2);
  ctx.font = font;
  ctx.textBaseline = 'middle';
  ctx.textAlign = align;
  const x = align === 'left' ? PAD : align === 'right' ? canvas.width - PAD : canvas.width / 2;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  lines.forEach((l, i) => {
    const y = PAD + lineH * (i + 0.5) + 6;
    ctx.shadowBlur = 16;
    ctx.fillText(l, x, y);
    ctx.shadowBlur = 0;
    ctx.fillText(l, x, y);
  });
  return finish(canvas, key);
}

/** Dải mốc thời gian: đường ngang + chấm, năm ở trên, nhãn ở dưới, mũi tên cuối. Mỗi dòng "năm nhãn". */
export function getTimelineTexture(milestones: string, color: string, accent: string): TextTexture {
  const key = `tl|${color}|${accent}|${milestones}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const items = milestones.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const m = /^(\S+)\s*(.*)$/.exec(l);
    return { year: m?.[1] ?? l, label: (m?.[2] ?? '').toUpperCase() };
  });
  const n = Math.max(1, items.length);
  const unit = 640;
  const H = 400;
  const canvas = document.createElement('canvas');
  canvas.width = Math.min(8192, n * unit + PAD * 2);
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const yLine = H * 0.5;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  ctx.shadowColor = accent;
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.moveTo(PAD + unit * 0.25, yLine);
  ctx.lineTo(canvas.width - PAD - 40, yLine);
  ctx.stroke();
  // mũi tên
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(canvas.width - PAD, yLine);
  ctx.lineTo(canvas.width - PAD - 60, yLine - 34);
  ctx.lineTo(canvas.width - PAD - 60, yLine + 34);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  items.forEach((it, i) => {
    const x = PAD + unit * (i + 0.5);
    ctx.shadowColor = accent;
    ctx.shadowBlur = 22;
    ctx.fillStyle = accent;
    ctx.beginPath(); ctx.arc(x, yLine, 22, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(x, yLine, 10, 0, Math.PI * 2); ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.font = `800 96px ${FONT_FAMILY}`;
    ctx.fillText(it.year, x, yLine - 92);
    ctx.font = `700 56px ${FONT_FAMILY}`;
    ctx.fillText(it.label, x, yLine + 90);
    ctx.shadowBlur = 0;
  });
  return finish(canvas, key);
}

/** Dãy ảnh có khung sáng và chú thích, xếp ngang. Ảnh phải đã nạp (HTMLImageElement). */
export function getGalleryTexture(items: { key: string; img: HTMLImageElement; caption: string }[], color: string, accent: string, frame: boolean): TextTexture {
  const key = `gal|${color}|${accent}|${frame ? 1 : 0}|${items.map((i) => `${i.key}:${i.caption}`).join('|')}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const H = 720;
  const imgH = 520;
  const gap = 70;
  const widths = items.map((i) => Math.round(imgH * ((i.img.naturalWidth || 4) / (i.img.naturalHeight || 3))));
  const canvas = document.createElement('canvas');
  canvas.width = Math.min(8192, widths.reduce((a, w) => a + w + gap, 0) + PAD * 2);
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  let x = PAD;
  const top = 40;
  items.forEach((it, i) => {
    const w = widths[i];
    if (frame) {
      ctx.save();
      ctx.shadowColor = accent;
      ctx.shadowBlur = 28;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 6;
      ctx.strokeRect(x, top, w, imgH);
      ctx.restore();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 6;
      ctx.strokeRect(x, top, w, imgH);
    }
    ctx.drawImage(it.img, x, top, w, imgH);
    if (it.caption) {
      ctx.font = `700 52px ${FONT_FAMILY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.fillText(it.caption, x + w / 2, top + imgH + 74);
      ctx.shadowBlur = 0;
    }
    x += w + gap;
  });
  return finish(canvas, key);
}

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
