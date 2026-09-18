// Nguồn vị trí người. Cả ba trả về cùng một dạng Person[] (toạ độ sàn, mét) để phần dựng hình không cần biết
// dữ liệu đến từ đâu.
//   - SimSource: người ảo tự đi xuyên cổng + người đặt tay (Shift-click trên sàn 3D).
//   - WsSource: WebSocket nhận JSON {"persons":[{"id":1,"x":0.4,"d":2.5}, ...]} (id tuỳ chọn) từ hệ tracking ngoài.
//   - CameraSource: webcam + MediaPipe ObjectDetector (lớp "person"), điểm chân = giữa mép dưới khung,
//     đổi sang sàn bằng homography 4 điểm (hiệu chỉnh trong app).
import type { InteractionConfig, Person, PortalSpec } from '../model';
import { applyHomography, solveHomography, type H } from './homography';
import { Tracker } from './tracker';

export interface PersonSource {
  start(): Promise<void>;
  stop(): void;
  /** gọi mỗi khung; dt giây */
  update(dt: number): Person[];
  readonly status: string;
}

// ---------------------------------------------------------------- mô phỏng
export class SimSource implements PersonSource {
  status = 'Mô phỏng';
  private t = 0;
  private manual = new Map<number, { x: number; d: number; born: number }>();
  constructor(private readonly getPortal: () => PortalSpec, private readonly getWalkers: () => number) {}
  async start(): Promise<void> { this.t = 0; }
  stop(): void { this.manual.clear(); }
  /** người đặt tay: id âm để không đụng người ảo */
  setManual(id: number, x: number, d: number): void {
    const m = this.manual.get(id);
    if (m) { m.x = x; m.d = d; } else this.manual.set(id, { x, d, born: this.t });
  }
  clearManual(): void { this.manual.clear(); }
  update(dt: number): Person[] {
    this.t += dt;
    const L = this.getPortal().length;
    const W = this.getPortal().width;
    const out: Person[] = [];
    const n = Math.max(0, Math.min(6, Math.round(this.getWalkers())));
    const span = L + 7; // từ -3.5 m ngoài sân tới 3.5 m sau cổng
    const period = span / 0.9; // 0,9 m/s
    for (let i = 0; i < n; i++) {
      const phase = ((this.t + (i * period) / n) % period) / period;
      const d = -3.5 + phase * span;
      const x = Math.sin(i * 2.4) * W * 0.28 + Math.sin(this.t * 0.7 + i) * 0.15;
      out.push({ id: 1000 + i, x, d, age: phase * period });
    }
    for (const [id, m] of this.manual) out.push({ id, x: m.x, d: m.d, age: this.t - m.born });
    return out;
  }
}

// ---------------------------------------------------------------- WebSocket
export class WsSource implements PersonSource {
  status = 'Chưa kết nối';
  private ws: WebSocket | null = null;
  private stopped = false;
  private last: { id?: number; x: number; d: number }[] = [];
  private lastAt = 0;
  private readonly tracker = new Tracker(1.0, 0.6, 800);
  private readonly born = new Map<number, number>();
  constructor(private readonly url: string) {}

  async start(): Promise<void> {
    this.stopped = false;
    this.connect();
  }
  private connect(): void {
    if (this.stopped) return;
    try {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      this.status = `Đang kết nối ${this.url}…`;
      ws.onopen = () => { this.status = `Đã kết nối ${this.url}`; };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(String(e.data)) as { persons?: { id?: number; x: number; d: number }[] };
          if (Array.isArray(msg.persons)) { this.last = msg.persons.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.d)); this.lastAt = performance.now(); }
        } catch { /* bỏ gói hỏng */ }
      };
      ws.onclose = () => { this.status = 'Mất kết nối, thử lại…'; this.ws = null; if (!this.stopped) setTimeout(() => this.connect(), 1500); };
      ws.onerror = () => ws.close();
    } catch (err) {
      this.status = `Lỗi: ${(err as Error).message}`;
    }
  }
  stop(): void {
    this.stopped = true;
    this.ws?.close();
    this.ws = null;
    this.last = [];
  }
  update(): Person[] {
    const now = performance.now();
    if (now - this.lastAt > 1000) this.last = []; // hệ ngoài im lặng -> coi như không có ai
    const withIds = this.last.every((p) => typeof p.id === 'number');
    if (withIds) {
      const ids = new Set<number>();
      const out = this.last.map((p) => {
        const id = p.id as number;
        ids.add(id);
        if (!this.born.has(id)) this.born.set(id, now);
        return { id, x: p.x, d: p.d, age: (now - this.born.get(id)!) / 1000 };
      });
      for (const id of [...this.born.keys()]) if (!ids.has(id)) this.born.delete(id);
      return out;
    }
    return this.tracker.update(this.last, now);
  }
}

// ---------------------------------------------------------------- camera + AI
export interface Detection { u: number; v: number; w: number; h: number; score: number }

export class CameraSource implements PersonSource {
  status = 'Chưa bật';
  readonly video = document.createElement('video');
  lastDetections: Detection[] = [];
  private stream: MediaStream | null = null;
  private detector: import('@mediapipe/tasks-vision').ObjectDetector | null = null;
  private running = false;
  private tracker = new Tracker(1.2, 0.5, 700);
  private homography: H | null = null;
  private persons: Person[] = [];
  private lastVideoTime = -1;
  private fpsCount = 0;
  private fpsAt = 0;
  fps = 0;

  constructor(private readonly getConfig: () => InteractionConfig['camera']) {
    this.video.muted = true;
    this.video.playsInline = true;
  }

  setCalib(calib: { img: [number, number][]; floor: [number, number][] } | null): void {
    this.homography = calib && calib.img.length >= 4 && calib.floor.length >= 4 ? solveHomography(calib.img, calib.floor) : null;
  }

  async start(): Promise<void> {
    const cfg = this.getConfig();
    this.setCalib(cfg.calib);
    this.status = 'Đang mở camera…';
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: cfg.deviceId ? { exact: cfg.deviceId } : undefined, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: false,
      });
    } catch (err) {
      this.status = `Không mở được camera: ${(err as Error).message}`;
      throw err;
    }
    this.video.srcObject = this.stream;
    await this.video.play();
    this.status = 'Đang nạp model nhận diện…';
    try {
      const { FilesetResolver, ObjectDetector } = await import('@mediapipe/tasks-vision');
      const vision = await FilesetResolver.forVisionTasks(new URL('/mediapipe/wasm', location.href).toString());
      const make = (delegate: 'GPU' | 'CPU') => ObjectDetector.createFromOptions(vision, {
        baseOptions: { modelAssetPath: new URL('/models/efficientdet_lite0.tflite', location.href).toString(), delegate },
        runningMode: 'VIDEO',
        categoryAllowlist: ['person'],
        scoreThreshold: Math.max(0.1, cfg.minScore),
        maxResults: 8,
      });
      this.detector = await make('GPU').catch(() => make('CPU'));
    } catch (err) {
      this.status = `Không nạp được model: ${(err as Error).message}`;
      throw err;
    }
    this.running = true;
    this.status = this.homography ? 'Đang theo dõi' : 'Đang theo dõi (CHƯA hiệu chỉnh sàn)';
    this.loop();
  }

  private loop(): void {
    if (!this.running || !this.detector) return;
    const v = this.video;
    if (v.readyState >= 2 && v.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = v.currentTime;
      const now = performance.now();
      const cfg = this.getConfig();
      const res = this.detector.detectForVideo(v, now);
      const dets: Detection[] = [];
      for (const d of res.detections) {
        const b = d.boundingBox;
        const score = d.categories[0]?.score ?? 0;
        if (!b || score < cfg.minScore) continue;
        let u = (b.originX + b.width / 2) / v.videoWidth;
        const bottom = (b.originY + b.height) / v.videoHeight;
        if (cfg.flipX) u = 1 - u;
        dets.push({ u, v: bottom, w: b.width / v.videoWidth, h: b.height / v.videoHeight, score });
      }
      this.lastDetections = dets;
      if (this.homography) {
        const floor = dets.map((d) => { const [x, dd] = applyHomography(this.homography!, d.u, d.v); return { x, d: dd }; })
          .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.d) && Math.abs(p.x) < 30 && Math.abs(p.d) < 60);
        this.persons = this.tracker.update(floor, now);
      } else this.persons = [];
      this.fpsCount++;
      if (now - this.fpsAt > 1000) { this.fps = this.fpsCount; this.fpsCount = 0; this.fpsAt = now; }
    }
    requestAnimationFrame(() => this.loop());
  }

  /** đổi một điểm ảnh (0..1) sang sàn theo hiệu chỉnh hiện tại (dùng cho màn hiệu chỉnh) */
  toFloor(u: number, v: number): [number, number] | null {
    return this.homography ? applyHomography(this.homography, u, v) : null;
  }

  stop(): void {
    this.running = false;
    this.detector?.close();
    this.detector = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
    this.persons = [];
    this.lastDetections = [];
    this.tracker.clear();
    this.status = 'Đã tắt';
  }

  update(): Person[] { return this.persons; }
}

export async function listCameras(): Promise<{ id: string; label: string }[]> {
  try {
    const devs = await navigator.mediaDevices.enumerateDevices();
    return devs.filter((d) => d.kind === 'videoinput').map((d, i) => ({ id: d.deviceId, label: d.label || `Camera ${i + 1}` }));
  } catch {
    return [];
  }
}
