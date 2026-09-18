// Cửa sổ XUẤT ra LED (?output=1): không giao diện, tự dựng bản đồ pixel ở tỉ lệ 1:1 rồi hiện
// vùng `src` (px của bản đồ) lên cửa sổ. Dự án và thời gian nhận từ bảng điều khiển (sync.ts).
import * as THREE from 'three';
import { MediaCache } from './media';
import { canvasSize, locate, totalDuration, type Project } from './model';
import { Compositor } from './render/compositor';
import { normalize } from './storage';
import { createOutputSync, wallClock, type SyncState } from './sync';

export function startOutput(): void {
  THREE.ColorManagement.enabled = false;
  document.body.classList.add('output');
  const q = new URLSearchParams(location.search);
  const srcParam = q.get('src')?.split(',').map(Number);
  const src = srcParam && srcParam.length === 4 && srcParam.every(Number.isFinite) ? { x: srcParam[0], y: srcParam[1], w: srcParam[2], h: srcParam[3] } : null;
  const fit = q.get('fit') === '1';

  const canvas = document.getElementById('stage') as HTMLCanvasElement;
  const status = document.getElementById('status')!;
  status.textContent = 'Chờ bảng điều khiển…';
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setPixelRatio(1); // LED cần đúng từng pixel, không nhân theo DPI

  const media = new MediaCache();
  let project: Project | null = null;
  let compositor: Compositor | null = null;
  let state: SyncState | null = null;

  // Vẽ vùng nguồn ra cửa sổ: camera trực giao theo px cửa sổ (y xuống), một tấm phẳng.
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const camera = new THREE.OrthographicCamera(0, 1, 0, 1, 0, 1);
  const geom = new THREE.PlaneGeometry(1, 1);
  const mat = new THREE.MeshBasicMaterial({ toneMapped: false, side: THREE.DoubleSide });
  const quad = new THREE.Mesh(geom, mat);
  scene.add(quad);

  function layout(): void {
    if (!project || !compositor) return;
    const c = canvasSize(project);
    const region = src ?? { x: 0, y: 0, w: c.w, h: c.h };
    const uv = geom.attributes.uv as THREE.BufferAttribute;
    // PlaneGeometry: uv (0,1) trên-trái, (1,0) dưới-phải; texture v=1 là mép trên bản đồ pixel
    const u0 = region.x / c.w, u1 = (region.x + region.w) / c.w;
    const v1 = 1 - region.y / c.h, v0 = 1 - (region.y + region.h) / c.h;
    uv.setXY(0, u0, v1); uv.setXY(1, u1, v1); uv.setXY(2, u0, v0); uv.setXY(3, u1, v0);
    uv.needsUpdate = true;
    const W = window.innerWidth, H = window.innerHeight;
    camera.left = 0; camera.right = W; camera.top = 0; camera.bottom = H;
    camera.updateProjectionMatrix();
    let w = region.w, h = region.h, x = 0, y = 0;
    if (fit) {
      const s = Math.min(W / region.w, H / region.h);
      w = region.w * s; h = region.h * s; x = (W - w) / 2; y = (H - h) / 2;
    }
    quad.position.set(x + w / 2, y + h / 2, 0);
    quad.scale.set(w, -h, 1);
    renderer.setSize(W, H, false);
  }

  createOutputSync(
    (data) => {
      const p = normalize(data);
      if (!p) return;
      project = p;
      if (!compositor) {
        compositor = new Compositor(p, 1);
        mat.map = compositor.output;
        mat.needsUpdate = true;
      } else compositor.applyProject(p);
      layout();
      status.textContent = '';
    },
    (s) => { state = s; },
    (persons) => { if (compositor) compositor.persons = persons; },
  );
  window.addEventListener('resize', layout);

  function currentTime(): { t: number; playing: boolean } {
    if (!project || !state) return { t: 0, playing: false };
    const total = totalDuration(project);
    let t = state.t + (state.playing ? (wallClock() - state.sentAt) / 1000 : 0);
    if (total > 0) t = project.loop ? ((t % total) + total) % total : Math.min(t, total);
    return { t, playing: state.playing };
  }
  // Tay cầm cho tự kiểm tra (electron/selftest.cjs) và gỡ lỗi
  (window as unknown as { ledportalOutput: unknown }).ledportalOutput = { t: () => currentTime().t, get project() { return project; } };

  let lastFrame = performance.now();

  function frame(): void {
    requestAnimationFrame(frame);
    if (!project || !compositor) return;
    const { t, playing } = currentTime();
    compositor.updateTouches(Math.min(0.1, (performance.now() - lastFrame) / 1000));
    lastFrame = performance.now();
    const cursor = state?.blackout ? null : locate(project, t);
    compositor.render(renderer, cursor, media.lookup, playing);
    const active = new Set<string>();
    if (cursor) {
      const a = project.scenes[cursor.index].media?.id;
      const b = cursor.next !== null ? project.scenes[cursor.next].media?.id : undefined;
      if (a) active.add(a);
      if (b) active.add(b);
    }
    media.pauseExcept(active);
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
}
