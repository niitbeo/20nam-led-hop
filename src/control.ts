// Cửa sổ ĐIỀU KHIỂN: thời gian -> vị trí trên danh sách cảnh -> dựng bản đồ pixel -> vẽ mô phỏng 3D
// hoặc xem phẳng. Mọi thay đổi từ giao diện đi qua hooks.changed(...) rồi tự lưu và gửi cho cửa sổ xuất.
// Nguồn vị trí người (mô phỏng / WebSocket / camera AI) cũng chạy ở đây và phát cho cửa sổ xuất.
import * as THREE from 'three';
import { AudioEngine } from './audio';
import { exportVideo } from './export';
import { openExportModal } from './exportUi';
import { loadAutostart, openSavedOutputs } from './autostart';
import { flatRects } from './geometry';
import { MediaCache } from './media';
import { canvasSize, defaultProject, locate, scheduledProgram, SCREEN_LABEL, storeActiveProgram, switchProgram, totalDuration, type Cursor, type Person } from './model';
import { Compositor } from './render/compositor';
import { FlatView, Preview } from './render/preview';
import { downloadJson, loadProject, normalize, pickJson, saveProject } from './storage';
import { createControlSync, wallClock } from './sync';
import { openCalibration } from './tracking/calibration';
import { CameraSource, SimSource, WsSource, type PersonSource } from './tracking/sources';
import { buildUi, type App, type ChangeKind } from './ui';

export function startControl(): void {
  const app: App = {
    project: loadProject() ?? defaultProject(),
    t: 0,
    playing: true,
    selected: 0,
    view: 'preview',
    camera: 'outside',
    showPeople: true,
    reflection: true,
    showRobot: false,
    renderScale: 0.5,
    track: { status: 'Tắt', count: 0, fps: 0 },
    blackout: false,
    scheduleNote: '',
    masterVolume: 1,
    muted: false,
  };

  // Tắt quản lý màu của three: Color.set('#hex') giữ nguyên giá trị, không đổi sang tuyến tính.
  // Kết hợp outputColorSpace = Linear bên dưới -> đường màu "thô": hex nhập vào = giá trị lên LED.
  THREE.ColorManagement.enabled = false;

  const canvas = document.getElementById('stage') as HTMLCanvasElement;
  const status = document.getElementById('status')!;
  const labels = document.getElementById('labels')!;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const media = new MediaCache();
  const audio = new AudioEngine();
  const compositor = new Compositor(app.project, app.renderScale);
  const preview = new Preview(canvas, compositor.output);
  const flat = new FlatView(compositor.output);
  preview.applyProject(app.project);
  preview.setPreset(app.camera);

  const sync = createControlSync(
    () => app.project,
    () => ({ t: app.t, playing: app.playing, blackout: app.blackout, sentAt: wallClock() }),
  );

  // ---------- lời nhắc ngắn ----------
  const toastEl = document.createElement('div');
  toastEl.id = 'toast';
  document.body.append(toastEl);
  let toastTimer = 0;
  function toast(msg: string): void {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 1600);
  }

  // ---------- hoàn tác / làm lại ----------
  // Chụp ảnh toàn bộ dự án dưới dạng JSON. Các thay đổi liên tiếp (kéo thanh trượt) được gộp
  // thành MỘT bước hoàn tác bằng cách chỉ chốt sau 450 ms không có thay đổi mới.
  const snap = (): string => { storeActiveProgram(app.project); return JSON.stringify(app.project); };
  let lastSnap = '';
  let undoStack: string[] = [];
  let redoStack: string[] = [];
  let burstBefore: string | null = null;
  let burstTimer = 0;

  function flushBurst(): void {
    clearTimeout(burstTimer);
    if (burstBefore === null) return;
    const now = snap();
    if (burstBefore !== now) {
      undoStack.push(burstBefore);
      if (undoStack.length > 60) undoStack.shift();
      redoStack = [];
    }
    burstBefore = null;
    lastSnap = now;
  }
  function recordChange(): void {
    if (burstBefore === null) burstBefore = lastSnap;
    clearTimeout(burstTimer);
    burstTimer = window.setTimeout(flushBurst, 450);
  }
  function applySnapshot(json: string): void {
    const p = normalize(JSON.parse(json));
    if (!p) return;
    app.project = p;
    app.t = Math.min(app.t, totalDuration(p));
    app.selected = Math.max(0, Math.min(app.selected, p.scenes.length - 1));
    compositor.applyProject(p);
    preview.applyProject(p);
    ui.refreshAll();
    layoutLabels();
    syncSource();
    sync.sendProject();
    sync.sendState();
    scheduleSave();
    lastSnap = snap();
  }
  function undo(): void {
    flushBurst();
    const prev = undoStack.pop();
    if (!prev) { toast('Không còn gì để hoàn tác'); return; }
    redoStack.push(snap());
    applySnapshot(prev);
    toast(`Đã hoàn tác (còn ${undoStack.length} bước)`);
  }
  function redo(): void {
    flushBurst();
    const next = redoStack.pop();
    if (!next) { toast('Không có gì để làm lại'); return; }
    undoStack.push(snap());
    applySnapshot(next);
    toast('Đã làm lại');
  }

  let viewerAge = 0;
  let exporting = false;
  let saveTimer = 0;
  function scheduleSave(): void {
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => saveProject(app.project), 300);
  }

  // ---------- nguồn vị trí người ----------
  let source: PersonSource | null = null;
  let sourceKey = '';
  let persons: Person[] = [];

  function sourceKeyOf(): string {
    const ia = app.project.interaction;
    if (!ia.enabled) return '';
    if (ia.source === 'ws') return `ws:${ia.wsUrl}`;
    if (ia.source === 'camera') return `camera:${ia.camera.deviceId}:${ia.camera.minScore}`;
    return 'sim';
  }

  function syncSource(): void {
    const key = sourceKeyOf();
    if (key === sourceKey) {
      // cùng nguồn camera nhưng đổi hiệu chỉnh/lật: cập nhật tại chỗ
      if (source instanceof CameraSource) source.setCalib(app.project.interaction.camera.calib);
      return;
    }
    source?.stop();
    source = null;
    persons = [];
    sourceKey = key;
    app.track = { status: 'Tắt', count: 0, fps: 0 };
    if (!key) return;
    const ia = app.project.interaction;
    const s: PersonSource = ia.source === 'ws' ? new WsSource(ia.wsUrl)
      : ia.source === 'camera' ? new CameraSource(() => app.project.interaction.camera)
      : new SimSource(() => app.project.portal, () => app.project.interaction.sim.walkers);
    source = s;
    s.start().catch((err: Error) => { app.track.status = `Lỗi: ${err.message}`; });
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
      preview.showRobot = app.showRobot;
      if (preview.currentPreset !== app.camera) preview.setPreset(app.camera);
      layoutLabels();
    }
    if (kind === 'scenes') ui.refreshScenes(), ui.refreshProps();
    if (kind === 'interaction') syncSource();
    if (kind === 'program') { app.t = 0; app.selected = 0; ui.refreshAll(); sync.sendState(); }
    if (kind !== 'view') { recordChange(); scheduleSave(); sync.sendProject(); }
    app.t = Math.min(app.t, totalDuration(app.project));
  }

  /** Đổi chương trình đang phát (tay hoặc theo lịch). */
  function playProgram(id: string, note: string): void {
    if (!switchProgram(app.project, id)) return;
    app.blackout = false;
    app.playing = true;
    app.scheduleNote = note;
    onChanged('program');
  }

  // ---------- lịch phát: xét mỗi giây, chỉ tác động khi "mong muốn" đổi (tới mốc giờ) ----------
  let lastWant: string | null = null;
  function tickSchedule(): void {
    const res = scheduledProgram(app.project, new Date());
    if (!res) { lastWant = null; if (app.blackout) { app.blackout = false; sync.sendState(); } app.scheduleNote = ''; return; }
    const progName = (id: string): string => app.project.programs.find((p) => p.id === id)?.name ?? '?';
    const note = res.rule ? `theo khung giờ ${res.rule.start}–${res.rule.end}` : 'ngoài giờ';
    if (res.want === 'black') app.scheduleNote = `Tắt màn (${note})`;
    else app.scheduleNote = `${progName(res.want)} (${note})`;
    if (res.want === lastWant) return;
    lastWant = res.want;
    if (res.want === 'black') { app.blackout = true; app.playing = false; sync.sendState(); }
    else playProgram(res.want, app.scheduleNote);
  }
  setInterval(tickSchedule, 1000);

  const ui = buildUi(app, {
    changed: onChanged,
    seek: (t) => { app.t = Math.max(0, Math.min(t, totalDuration(app.project))); sync.sendState(); },
    play: (on) => { app.playing = on; sync.sendState(); },
    loadSample: () => { app.project = defaultProject(); app.t = 0; app.selected = 0; replaceProject(); },
    save: () => downloadJson(app.project),
    open: async () => {
      const p = await pickJson();
      if (!p) { alert('Tệp không đúng định dạng dự án.'); return; }
      app.project = p; app.t = 0; app.selected = 0; replaceProject();
    },
    calibrate: () => {
      const ia = app.project.interaction;
      if (!(ia.enabled && ia.source === 'camera' && source instanceof CameraSource)) {
        alert('Bật tương tác với nguồn "Camera + AI" trước, chờ camera chạy rồi mới hiệu chỉnh.');
        return;
      }
      openCalibration(source, app.project.portal, ia.camera.calib, (calib) => {
        app.project.interaction.camera.calib = calib;
        onChanged('interaction');
        ui.refreshInteraction();
      });
    },
    clearManual: () => { if (source instanceof SimSource) source.clearManual(); },
    playProgram: (id) => playProgram(id, 'chọn tay'),
    // trong lúc xuất: dừng vòng lặp dựng hình chính để GPU dồn cho bộ xuất (đo: nhanh gấp ~4 lần)
    exportVideo: () => { app.playing = false; sync.sendState(); openExportModal(app.project, app.camera === 'walk' ? 'walk' : app.camera, (on) => { exporting = on; }); },
  });

  function replaceProject(): void {
    flushBurst();
    if (lastSnap) { undoStack.push(lastSnap); redoStack = []; }
    compositor.applyProject(app.project);
    preview.applyProject(app.project);
    ui.refreshAll();
    layoutLabels();
    scheduleSave();
    syncSource();
    sync.sendProject();
    sync.sendState();
    lastSnap = snap();
  }

  // Shift + kéo trên sàn 3D = đặt/di chuyển một người ảo (chỉ với nguồn mô phỏng).
  let placing = false;
  canvas.addEventListener('pointerdown', (e) => {
    if (!e.shiftKey || app.view !== 'preview' || !(source instanceof SimSource)) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    placing = true;
    preview.controls.enabled = false;
    placeAt(e);
  }, true);
  window.addEventListener('pointermove', (e) => { if (placing) placeAt(e); });
  window.addEventListener('pointerup', () => {
    if (!placing) return;
    placing = false;
    if (preview.currentPreset !== 'walk') preview.controls.enabled = true;
  });
  function placeAt(e: PointerEvent): void {
    const r = canvas.getBoundingClientRect();
    const pt = preview.floorPoint(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
    if (pt && source instanceof SimSource) source.setManual(-1, pt.x, pt.d);
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

  // canvas chiếm phần bên phải bảng điều khiển (CSS #stage), nên đo theo chính nó
  const MARGIN = { left: 24, top: 40, right: 24, bottom: 100 };
  const stageSize = (): { w: number; h: number } => ({ w: canvas.clientWidth, h: canvas.clientHeight });
  function resize(): void {
    const { w, h } = stageSize();
    if (w < 2 || h < 2) return; // cửa sổ bị thu về 0 (ẩn tab): giữ nguyên, tránh aspect NaN
    renderer.setSize(w, h, false);
    preview.resize(w, h);
    const c = canvasSize(app.project);
    flat.layout(w, h, c.w, c.h, MARGIN);
    layoutLabels();
  }
  window.addEventListener('resize', resize);
  resize();

  window.addEventListener('keydown', (e) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (e.code === 'Space') { e.preventDefault(); app.playing = !app.playing; sync.sendState(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
  });

  // ---------- vòng lặp ----------
  let last = performance.now();
  let frames = 0;
  let fpsAt = last;
  function frame(now: number): void {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (exporting) { requestAnimationFrame(frame); return; }
    const total = totalDuration(app.project);
    if (app.playing && total > 0) {
      app.t += dt;
      if (app.t >= total) {
        if (app.project.loop) app.t %= total;
        else { app.t = total; app.playing = false; sync.sendState(); }
      }
    }

    if (source) {
      persons = source.update(dt);
      app.track.status = source.status;
      app.track.count = persons.length;
      app.track.fps = source instanceof CameraSource ? source.fps : 0;
    }
    // Người đang tự đi trong mô phỏng cũng được tính là MỘT NGƯỜI: đi tới đâu màn phản ứng tới đó.
    const viewer = preview.viewerPerson();
    let all = persons;
    if (viewer && app.project.interaction.enabled) {
      viewerAge += dt;
      all = [...persons, { id: -99, x: viewer.x, d: viewer.d, age: viewerAge }];
      app.track.count = all.length;
    } else viewerAge = 0;
    if (source || viewer) sync.sendPersons(all);
    compositor.persons = all;
    // không dựng hình nhân vật cho chính người xem (camera nằm trong người đó)
    preview.setTrackedPersons(app.project.interaction.enabled ? persons : null);
    preview.showPeople = app.showPeople && !app.project.interaction.enabled;

    const cursor: Cursor | null = app.blackout ? null : locate(app.project, app.t);
    audio.master = app.masterVolume;
    audio.muted = app.muted;
    audio.update(app.project, cursor, app.t, app.playing, app.blackout);
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
      const { w, h } = stageSize();
      flat.layout(w, h, c.w, c.h, MARGIN);
      renderer.render(flat.scene, flat.camera);
    }
    ui.tick(cursor);

    frames++;
    if (now - fpsAt > 500) {
      const fps = Math.round((frames * 1000) / (now - fpsAt));
      frames = 0;
      fpsAt = now;
      const o = compositor.outputSize;
      const c = canvasSize(app.project);
      status.textContent = `${fps} fps · dựng ${o.w}×${o.h} / xuất ${c.w}×${c.h}`;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  syncSource();
  lastSnap = snap();

  // Tự chạy: mở lại bộ cửa sổ xuất đã lưu (chờ một nhịp cho dự án/đồng bộ sẵn sàng)
  const bridge = window.ledPortal;
  const auto = loadAutostart();
  if (bridge && auto.openOnStart && auto.outputs.length) {
    setTimeout(() => {
      void bridge.listOutputs().then(async (open) => {
        if (open.length) return; // đã có (ví dụ HMR nạp lại) thì thôi
        const n = await openSavedOutputs(bridge, auto.outputs);
        console.info(`Tự mở ${n} cửa sổ xuất đã lưu`);
      });
    }, 1500);
  }

  // Tay cầm gỡ lỗi trong console: ledportal.app / preview / compositor
  (window as unknown as { ledportal: unknown }).ledportal = { app, preview, compositor, media, audio, sync, exportVideo, get source() { return source; }, set exporting(v: boolean) { exporting = v; } };
}
