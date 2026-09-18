// Vòng lặp chính: thời gian -> vị trí trên danh sách cảnh -> dựng bản đồ pixel -> vẽ mô phỏng 3D
// hoặc xem phẳng. Mọi thay đổi từ giao diện đi qua hooks.changed(...) rồi tự lưu.
import '@fontsource/be-vietnam-pro/500.css';
import '@fontsource/be-vietnam-pro/800.css';
import * as THREE from 'three';
import { flatRects } from './geometry';
import { MediaCache } from './media';
import { canvasSize, defaultProject, locate, SCREEN_LABEL, totalDuration, type Cursor } from './model';
import { Compositor } from './render/compositor';
import { FlatView, Preview } from './render/preview';
import { downloadJson, loadProject, pickJson, saveProject } from './storage';
import { buildUi, type App, type ChangeKind } from './ui';

const app: App = {
  project: loadProject() ?? defaultProject(),
  t: 0,
  playing: true,
  selected: 0,
  view: 'preview',
  camera: 'outside',
  showPeople: true,
  reflection: true,
  renderScale: 0.5,
};

// Tắt quản lý màu của three: Color.set('#hex') giữ nguyên giá trị, không đổi sang tuyến tính.
// Kết hợp outputColorSpace = Linear bên dưới -> đường màu "thô": hex nhập vào = giá trị lên LED.
THREE.ColorManagement.enabled = false;

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const status = document.getElementById('status')!;
const labels = document.getElementById('labels')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
// Không đổi màu ở bất kỳ khâu nào: màu hiệu ứng/ảnh tính ra sao thì lên LED y như vậy.
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const media = new MediaCache();
const compositor = new Compositor(app.project, app.renderScale);
const preview = new Preview(canvas, compositor.output);
const flat = new FlatView(compositor.output);
preview.applyProject(app.project);
preview.setPreset(app.camera);

let saveTimer = 0;
function scheduleSave(): void {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => saveProject(app.project), 300);
}

function onChanged(kind: ChangeKind): void {
  if (kind === 'portal' || kind === 'layout') {
    compositor.applyProject(app.project);
    preview.applyProject(app.project);
    layoutLabels();
  }
  if (kind === 'view') {
    compositor.setScale(app.renderScale);
    preview.showPeople = app.showPeople;
    preview.showReflection = app.reflection;
    if (preview.currentPreset !== app.camera) preview.setPreset(app.camera);
    layoutLabels();
  }
  if (kind === 'scenes') ui.refreshScenes(), ui.refreshProps();
  if (kind !== 'view') scheduleSave();
  app.t = Math.min(app.t, totalDuration(app.project));
}

const ui = buildUi(app, {
  changed: onChanged,
  seek: (t) => { app.t = Math.max(0, Math.min(t, totalDuration(app.project))); },
  play: (on) => { app.playing = on; },
  loadSample: () => { app.project = defaultProject(); app.t = 0; app.selected = 0; replaceProject(); },
  save: () => downloadJson(app.project),
  open: async () => {
    const p = await pickJson();
    if (!p) { alert('Tệp không đúng định dạng dự án.'); return; }
    app.project = p; app.t = 0; app.selected = 0; replaceProject();
  },
});

function replaceProject(): void {
  compositor.applyProject(app.project);
  preview.applyProject(app.project);
  ui.refreshAll();
  layoutLabels();
  scheduleSave();
}

// ---------- nhãn vùng trên bản đồ pixel ----------
function layoutLabels(): void {
  labels.replaceChildren();
  if (app.view !== 'flat') return;
  const c = canvasSize(app.project);
  const r = flat.rect;
  for (const fr of flatRects(app.project)) {
    const d = document.createElement('div');
    d.className = 'lb';
    d.style.left = `${r.x + (fr.x / c.w) * r.w}px`;
    d.style.top = `${r.y + (fr.y / c.h) * r.h}px`;
    d.style.width = `${(fr.w / c.w) * r.w}px`;
    d.style.height = `${(fr.h / c.h) * r.h}px`;
    d.innerHTML = `${SCREEN_LABEL[fr.id]} <span>${fr.w}×${fr.h} @ ${fr.x},${fr.y}</span>`;
    labels.append(d);
  }
}

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (w < 2 || h < 2) return; // cửa sổ bị thu về 0 (ẩn tab): giữ nguyên, tránh aspect NaN
  renderer.setSize(w, h, false);
  preview.resize(w, h);
  const c = canvasSize(app.project);
  flat.layout(w, h, c.w, c.h, { left: 360, top: 40, right: 20, bottom: 90 });
  layoutLabels();
}
window.addEventListener('resize', resize);
resize();

window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return;
  if (e.code === 'Space') { e.preventDefault(); app.playing = !app.playing; }
  if (e.code === 'Home') app.t = 0;
});

// ---------- vòng lặp ----------
let last = performance.now();
let frames = 0;
let fpsAt = last;
let fps = 0;
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const total = totalDuration(app.project);
  if (app.playing && total > 0) {
    app.t += dt;
    if (app.t >= total) {
      if (app.project.loop) app.t %= total;
      else { app.t = total; app.playing = false; }
    }
  }
  const cursor: Cursor | null = locate(app.project, app.t);
  compositor.render(renderer, cursor, media.lookup, app.playing);
  const active = new Set<string>();
  if (cursor) {
    const a = app.project.scenes[cursor.index].media?.id;
    const b = cursor.next !== null ? app.project.scenes[cursor.next].media?.id : undefined;
    if (a) active.add(a);
    if (b) active.add(b);
  }
  media.pauseExcept(active);

  renderer.setRenderTarget(null);
  if (app.view === 'preview') {
    preview.update(dt);
    renderer.render(preview.scene, preview.camera);
  } else {
    const c = canvasSize(app.project);
    flat.layout(window.innerWidth, window.innerHeight, c.w, c.h, { left: 360, top: 40, right: 20, bottom: 90 });
    renderer.render(flat.scene, flat.camera);
  }
  ui.tick(cursor);

  frames++;
  if (now - fpsAt > 500) {
    fps = Math.round((frames * 1000) / (now - fpsAt));
    frames = 0;
    fpsAt = now;
    const o = compositor.outputSize;
    const c = canvasSize(app.project);
    status.textContent = `${fps} fps · dựng ${o.w}×${o.h} / xuất ${c.w}×${c.h}`;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Tay cầm gỡ lỗi trong console: ledportal.app / preview / compositor
(window as unknown as { ledportal: unknown }).ledportal = { app, preview, compositor, media };
