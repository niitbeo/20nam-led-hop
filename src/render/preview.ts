// Mô phỏng 3D: dán texture "bản đồ pixel" lên đúng hình học cổng, thêm vỏ tối, sàn phản chiếu,
// nhân vật (người có hoạt ảnh, robot đón khách) để cảm nhận tỉ lệ, và các góc camera (kể cả đi xuyên tự động).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { buildScreenBuffers } from '../geometry';
import { canvasSize, type Person, type Project } from '../model';
import { makeHuman, makeRobot, type Character } from './characters';

export type CameraPreset = 'outside' | 'entrance' | 'inside' | 'ceiling' | 'exit' | 'walk' | 'fpv';
export const CAMERA_LABEL: Record<CameraPreset, string> = {
  outside: 'Ngoài sân nhìn vào',
  entrance: 'Đứng ở cửa cổng',
  inside: 'Đứng trong cổng',
  ceiling: 'Ngước nhìn trần',
  exit: 'Cuối cổng nhìn ra',
  walk: 'Đi xuyên tự động',
  fpv: 'Tự đi (WASD + chuột)',
};

const EYE = 1.6;
const WALK_PERIOD = 18;

type RobotRole = 'greeter' | 'patrol' | 'aisle';
interface RobotActor { group: THREE.Group; ch: Character | null; role: RobotRole; phase: number }

/** Một nhân vật đang đứng trên sàn: vị trí, hướng và trạng thái đi/đứng. */
interface Actor {
  group: THREE.Group;
  ch: Character | null;
  /** hình tạm (viên nang) khi chưa nạp xong mô hình */
  fallback: THREE.Object3D;
  x: number;
  d: number;
  heading: number;
}

export class Preview {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(62, 1, 0.05, 200);
  readonly controls: OrbitControls;
  private screens: THREE.Mesh | null = null;
  private readonly screenMat: THREE.MeshBasicMaterial;
  private readonly structure = new THREE.Group();
  /** người mẫu tĩnh + một người đi dạo (khi tắt tương tác) */
  private readonly people = new THREE.Group();
  private readonly extras: Actor[] = [];
  /** người đi xuyên cổng và người đi dạo ngoài sân — cho cảnh có chuyển động */
  private walker: Actor | null = null;
  private stroller: Actor | null = null;
  private exiter: Actor | null = null;
  private walkerT = 0;
  /** người theo dõi được (thay người mẫu khi bật tương tác) */
  private readonly tracked = new THREE.Group();
  private readonly trackedPool: Actor[] = [];
  private readonly trackedPrev = new Map<number, { x: number; d: number }>();
  private readonly personMat = new THREE.MeshStandardMaterial({ color: 0x1b1e26, roughness: 0.85 });
  private readonly raycaster = new THREE.Raycaster();
  private readonly floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  /** robot: 1 con đón khách đứng chờ + 2 con đi lại cho sinh động */
  private readonly robots: RobotActor[] = [];
  private readonly robotGroup = new THREE.Group();
  private robotT = 0;
  private robotWaveAt = 4;
  private robotNear = false;
  private floor: Reflector | null = null;
  private preset: CameraPreset = 'outside';
  private walkT = 0;
  private project: Project | null = null;
  private lastPersons: Person[] = [];
  /** các lần nạp mô hình đang chờ (để xuất video đợi đủ nhân vật) */
  private readonly pending = new Set<Promise<unknown>>();
  private robotWaveCount = 0;

  /** góc nhìn người thứ nhất: vị trí, hướng nhìn, phím đang giữ */
  private readonly fpv = { x: 0, d: -4.5, yaw: 0, pitch: 0, bob: 0, locked: false };
  private readonly keys = new Set<string>();

  private readonly canvasEl: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement, output: THREE.Texture) {
    this.canvasEl = canvas;
    this.scene.background = new THREE.Color(0x05060a);
    this.scene.fog = new THREE.Fog(0x05060a, 25, 70);
    this.screenMat = new THREE.MeshBasicMaterial({ map: output, side: THREE.FrontSide, toneMapped: false });
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    // cho phép camera nằm dưới mục tiêu (ngước nhìn trần): góc cực tới π
    this.controls.maxPolarAngle = Math.PI;
    this.controls.minDistance = 0.3;
    this.controls.maxDistance = 40;
    this.scene.add(this.structure, this.people, this.tracked, this.robotGroup);
    this.robotGroup.visible = false; // robot: mặc định TẮT, bật lại ở mục Góc nhìn
    this.scene.add(new THREE.AmbientLight(0x6070a0, 0.5));
    const hemi = new THREE.HemisphereLight(0x8090ff, 0x101010, 0.4);
    this.scene.add(hemi);
    void this.loadRobots();

    // ---- điều khiển góc nhìn người thứ nhất ----
    // Mặc định: KÉO chuột để nhìn quanh (giống lúc xoay cảnh), chuột vẫn thấy và vẫn bấm được giao diện.
    // Chỉ khi BẤM ĐÚP mới khoá chuột để nhìn liên tục; Esc thả ra.
    let looking = false;
    let lastX = 0;
    let lastY = 0;
    canvas.addEventListener('pointerdown', (e) => {
      if (this.preset !== 'fpv' || e.button !== 0 || e.shiftKey || this.fpv.locked) return;
      looking = true;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.style.cursor = 'grabbing';
      try { canvas.setPointerCapture(e.pointerId); } catch { /* bỏ qua */ }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (this.preset === 'fpv' && !looking && !this.fpv.locked) canvas.style.cursor = 'grab';
      if (!looking) return;
      this.fpv.yaw -= (e.clientX - lastX) * 0.004;
      this.fpv.pitch = Math.max(-1.2, Math.min(1.2, this.fpv.pitch - (e.clientY - lastY) * 0.004));
      lastX = e.clientX;
      lastY = e.clientY;
    });
    const endLook = (): void => { looking = false; canvas.style.cursor = this.preset === 'fpv' ? 'grab' : ''; };
    canvas.addEventListener('pointerup', endLook);
    canvas.addEventListener('pointercancel', endLook);
    canvas.addEventListener('dblclick', () => {
      if (this.preset !== 'fpv' || this.fpv.locked) return;
      // khung xem nhúng (trình duyệt trong app) không cho khoá chuột — nuốt lỗi, vẫn kéo chuột nhìn được
      const req = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      if (req && typeof req.catch === 'function') req.catch(() => undefined);
    });
    document.addEventListener('pointerlockchange', () => {
      this.fpv.locked = document.pointerLockElement === canvas;
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.fpv.locked) return;
      this.fpv.yaw -= e.movementX * 0.0022;
      this.fpv.pitch = Math.max(-1.2, Math.min(1.2, this.fpv.pitch - e.movementY * 0.0022));
    });
    const MOVE_KEYS = new Set([
      'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE',
      'KeyR', 'KeyF', 'PageUp', 'PageDown', 'ShiftLeft', 'ShiftRight',
    ]);
    window.addEventListener('keydown', (e) => {
      const el = e.target as HTMLElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) return;
      this.keys.add(e.code);
      // đang tự đi: các phím di chuyển không được cuộn trang hay nhảy tới cuối danh sách
      if (this.preset === 'fpv' && MOVE_KEYS.has(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  /** Đang khoá chuột trong chế độ tự đi (để giao diện báo cho người dùng). */
  get fpvLocked(): boolean { return this.fpv.locked; }

  /** Vị trí sàn của NGƯỜI ĐANG ĐI (chế độ tự đi) — để màn LED phản ứng theo chính người xem. */
  viewerPerson(): { x: number; d: number } | null {
    return this.preset === 'fpv' ? { x: this.fpv.x, d: this.fpv.d } : null;
  }

  setOutput(texture: THREE.Texture): void {
    this.screenMat.map = texture;
    this.screenMat.needsUpdate = true;
  }

  applyProject(project: Project): void {
    this.project = project;
    const b = buildScreenBuffers(project);
    const c = canvasSize(project);
    const uv = new Float32Array(b.layout.length);
    for (let i = 0; i < b.layout.length; i += 2) {
      uv[i] = b.layout[i] / c.w;
      uv[i + 1] = 1 - b.layout[i + 1] / c.h;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(b.position, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(b.index, 1));
    if (this.screens) { this.screens.geometry.dispose(); this.scene.remove(this.screens); }
    this.screens = new THREE.Mesh(g, this.screenMat);
    this.scene.add(this.screens);
    this.buildStructure(project);
    this.buildFloor();
    this.buildPeople(project);
    this.placeRobots();
    if (this.preset !== 'walk') this.setPreset(this.preset);
  }

  private buildStructure(project: Project): void {
    this.structure.clear();
    const { width: W, height: H, length: L, facadeWidth: FW, facadeHeight: FH } = project.portal;
    const T = Math.max(0.05, project.portal.frameThickness); // khung thép + tấm LED mỗi bên
    const dark = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.9, metalness: 0.1 });
    const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, mat: THREE.Material = dark): void => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
      m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      this.structure.add(m);
    };
    // vỏ hầm: hai bên + nóc, hở hai đầu. Lùi ra ngoài tấm LED một khe G để mặt trong của vỏ
    // (hướng vào hầm) không trùng mặt phẳng với tấm LED -> z-fighting.
    const G = 0.02;
    box(-W / 2 - T - G, -W / 2 - G, 0, H + T, -L - T, -0.01);
    box(W / 2 + G, W / 2 + T + G, 0, H + T, -L - T, -0.01);
    box(-W / 2 - T - G, W / 2 + T + G, H + G, H + T + G, -L - T, -0.01);
    // lưng mặt dựng: hai trụ + dải trên, chừa lối vào
    const back = (x0: number, x1: number, y0: number, y1: number): void => box(x0, x1, y0, y1, -T, -0.01);
    if (-FW / 2 < -W / 2 - T) back(-FW / 2, -W / 2 - T, 0, FH);
    if (FW / 2 > W / 2 + T) back(W / 2 + T, FW / 2, 0, FH);
    if (FH > H + T) back(-W / 2 - T, W / 2 + T, H + T, FH);
    // toà nhà phía sau và sảnh trong: không phụ thuộc đèn (MeshBasic) để luôn thấy được, dù mờ
    const far = new THREE.MeshBasicMaterial({ color: 0x171a24 });
    const lobby = new THREE.MeshBasicMaterial({ color: 0x39404f });
    const lamp = new THREE.MeshBasicMaterial({ color: 0xffe2b8 });
    const glass = new THREE.MeshBasicMaterial({ color: 0x8fa6c8 });
    box(-14, -FW / 2, 0, 9, -T - 0.4, -T, far);
    box(FW / 2, 14, 0, 9, -T - 0.4, -T, far);
    box(-14, 14, FH, 9, -T - 0.4, -T, far);
    // sảnh trong nhà: tường cuối + trần + hai hàng đèn trần để nhìn ra thấy chiều sâu, không phải tấm xám
    box(-14, 14, 0, 9, -L - 11, -L - 10.6, lobby);
    box(-14, 14, 4.2, 4.4, -L - 10.6, -L - 0.4, lobby);
    for (let i = 0; i < 4; i++) {
      const z = -L - 2 - i * 2.4;
      for (const x of [-2.6, 2.6]) box(x - 0.55, x + 0.55, 4.1, 4.2, z - 0.5, z + 0.5, lamp);
    }
    for (const x of [-5.5, 5.5]) box(x - 0.35, x + 0.35, 0, 4.2, -L - 6, -L - 5.3, far);
    // vách kính sáng cuối sảnh: cho lối ra có ánh sáng thay vì hố đen
    box(-7, 7, 0.2, 3.4, -L - 10.55, -L - 10.5, glass);
    // đèn sảnh trong (ấm) và đèn sân ngoài (lạnh) để nhân vật, sàn và tường sảnh có khối
    const warm = new THREE.PointLight(0xffd9a8, 60, 40, 2);
    warm.position.set(0, 3.8, -L - 6);
    const warm2 = new THREE.PointLight(0xffd9a8, 30, 30, 2);
    warm2.position.set(-4, 3.5, -L - 10);
    const cool = new THREE.PointLight(0xa8c4ff, 40, 40, 2);
    cool.position.set(3, 4.5, 6);
    const cool2 = new THREE.PointLight(0xa8c4ff, 25, 30, 2);
    cool2.position.set(-3, 4, 3);
    this.structure.add(warm, warm2, cool, cool2);
    // viền sáng nhẹ quanh lối vào để nhìn rõ khung
    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(W, H, L)),
      new THREE.LineBasicMaterial({ color: 0x2a3550, transparent: true, opacity: 0.6 }),
    );
    edge.position.set(0, H / 2, -L / 2);
    this.structure.add(edge);
  }

  private buildFloor(): void {
    if (this.floor) { this.scene.remove(this.floor); this.floor.geometry.dispose(); }
    this.floor = new Reflector(new THREE.PlaneGeometry(60, 60), { color: 0x3a3d46, textureWidth: 1024, textureHeight: 1024 });
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = -0.001;
    this.scene.add(this.floor);
  }

  // ---------- nhân vật ----------
  private makeFallback(): THREE.Object3D {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 1.05, 6, 12), this.personMat);
    body.position.y = 0.2 + 1.05 / 2 + 0.05;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), this.personMat);
    head.position.y = 1.62;
    g.add(body, head);
    return g;
  }

  /** Đếm nhân vật đã tạo, để chiều cao và pha bước chân khác nhau mà vẫn TẤT ĐỊNH (xuất video lặp lại được). */
  private actorSeq = 0;

  private makeActor(parent: THREE.Group, withRing = false): Actor {
    const group = new THREE.Group();
    const fallback = this.makeFallback();
    group.add(fallback);
    if (withRing) {
      const disc = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.4, 32), new THREE.MeshBasicMaterial({ color: 0x38d6ff, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = 0.01;
      group.add(disc);
    }
    parent.add(group);
    const actor: Actor = { group, ch: null, fallback, x: 0, d: 0, heading: 0 };
    const i = this.actorSeq++;
    const height = [1.62, 1.70, 1.66, 1.74][i % 4];
    const p = makeHuman(height).then((ch) => {
      if (!ch) return;
      actor.ch = ch;
      group.remove(fallback);
      group.add(ch.root);
      ch.play('idle', 0);
      ch.mixer.setTime(i * 0.63); // lệch pha để không thở/bước cùng nhịp
    });
    this.pending.add(p);
    void p.finally(() => this.pending.delete(p));
    return actor;
  }

  private static placeActor(a: Actor, x: number, d: number, heading: number): void {
    a.x = x; a.d = d; a.heading = heading;
    a.group.position.set(x, 0, -d);
    a.group.rotation.y = heading;
  }

  private buildPeople(project: Project): void {
    for (const a of this.extras) this.people.remove(a.group);
    this.extras.length = 0;
    if (this.walker) this.people.remove(this.walker.group);
    if (this.stroller) this.people.remove(this.stroller.group);
    if (this.exiter) this.people.remove(this.exiter.group);
    const L = project.portal.length;
    // hai người đứng trong cổng ngắm tường (quay mặt vào tường gần), một người đứng ngoài sân nhìn vào
    const W = project.portal.width;
    this.actorSeq = 0;
    const a = this.makeActor(this.people);
    Preview.placeActor(a, W * 0.28, L * 0.6, -Math.PI / 2);
    const b = this.makeActor(this.people);
    Preview.placeActor(b, -W * 0.3, L * 0.85, Math.PI / 2);
    const c = this.makeActor(this.people);
    Preview.placeActor(c, -project.portal.facadeWidth / 2 - 1.2, -2.6, Math.PI * 0.85);
    this.extras.push(a, b, c);
    // một người đi xuyên cổng và một người đi dạo ngang trước mặt dựng
    this.walker = this.makeActor(this.people);
    this.stroller = this.makeActor(this.people);
    this.exiter = this.makeActor(this.people);
    this.walkerT = 0;
  }

  /** Chờ mọi mô hình đang nạp (tối đa 15 s). */
  async ready(): Promise<void> {
    await Promise.race([Promise.allSettled([...this.pending]), new Promise((r) => setTimeout(r, 15000))]);
  }

  private async loadRobots(): Promise<void> {
    const roles: { role: RobotRole; height: number; phase: number }[] = [
      { role: 'greeter', height: 1.55, phase: 0 },
      { role: 'patrol', height: 1.42, phase: 0 },
      { role: 'aisle', height: 1.48, phase: 0.5 },
    ];
    for (const { role, height, phase } of roles) {
      const group = new THREE.Group();
      this.robotGroup.add(group);
      const actor: RobotActor = { group, ch: null, role, phase };
      this.robots.push(actor);
      const p = makeRobot(height);
      this.pending.add(p);
      void p.finally(() => this.pending.delete(p));
      const r = await p;
      if (!r) continue;
      actor.ch = r;
      group.add(r.root);
      r.play(role === 'greeter' ? 'Idle' : 'Walking', 0);
      if (role === 'greeter') r.mixer.addEventListener('finished', () => { r.current = ''; r.play(this.robotNear ? 'Wave' : 'Idle', 0.3); });
    }
    this.placeRobots();
  }

  private placeRobots(): void {
    if (!this.project) return;
    const { facadeWidth: FW } = this.project.portal;
    const greeter = this.robots.find((r) => r.role === 'greeter');
    if (greeter) {
      // đứng ngoài sân, ngoài mép mặt dựng bên phải, quay mặt về phía lối đi (không che màn)
      greeter.group.position.set(FW / 2 + 0.9, 0, 1.6);
      greeter.group.rotation.y = -Math.PI * 0.45;
    }
  }

  set showPeople(v: boolean) { this.people.visible = v; }
  set showRobot(v: boolean) { this.robotGroup.visible = v; }
  set showReflection(v: boolean) { if (this.floor) this.floor.visible = v; }
  get currentPreset(): CameraPreset { return this.preset; }

  /** Hiện người theo dõi được (nhân vật + vòng sáng dưới chân). null = tắt, dùng lại người mẫu. */
  setTrackedPersons(persons: Person[] | null): void {
    this.lastPersons = persons ?? [];
    if (!persons) { this.tracked.visible = false; return; }
    this.tracked.visible = true;
    while (this.trackedPool.length < persons.length) {
      this.trackedPool.push(this.makeActor(this.tracked, true));
    }
    this.trackedPool.forEach((a, i) => {
      const p = persons[i];
      a.group.visible = !!p;
      if (!p) return;
      const prev = this.trackedPrev.get(p.id);
      let heading = a.heading;
      let moving = false;
      if (prev) {
        const dx = p.x - prev.x, dz = -(p.d - prev.d);
        const dist = Math.hypot(dx, dz);
        if (dist > 0.004) { heading = Math.atan2(dx, dz); moving = dist > 0.012; }
      }
      // xoay mượt về hướng đi
      let delta = heading - a.heading;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      Preview.placeActor(a, p.x, p.d, a.heading + delta * 0.25);
      a.ch?.play(moving ? 'walk' : 'idle', 0.3);
      this.trackedPrev.set(p.id, { x: p.x, d: p.d });
    });
  }

  /** Điểm sàn (x, d) dưới con trỏ, hoặc null nếu tia không chạm sàn. */
  floorPoint(clientX: number, clientY: number, w: number, h: number): { x: number; d: number } | null {
    this.raycaster.setFromCamera(new THREE.Vector2((clientX / w) * 2 - 1, -(clientY / h) * 2 + 1), this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.floorPlane, hit)) return null;
    return { x: hit.x, d: -hit.z };
  }

  setPreset(p: CameraPreset): void {
    this.preset = p;
    if (p !== 'fpv') {
      this.canvasEl.style.cursor = '';
      if (this.fpv.locked) document.exitPointerLock();
    }
    if (!this.project) return;
    const { height: H, length: L } = this.project.portal;
    const look = (px: number, py: number, pz: number, tx: number, ty: number, tz: number): void => {
      this.camera.position.set(px, py, pz);
      this.controls.target.set(tx, ty, tz);
      this.controls.enabled = true;
      this.controls.update();
    };
    switch (p) {
      case 'outside': look(0, EYE + 0.4, 9.5, 0, 1.5, -2); break;
      case 'entrance': look(0, EYE, 1.0, 0, 1.5, -L); break;
      case 'inside': look(0.3, EYE, -L * 0.35, 0, 1.5, -L - 3); break;
      case 'ceiling': look(0, 1.2, -L * 0.5, 0.4, H + 3, -L * 0.5 - 0.6); break;
      case 'exit': look(0, EYE, -L - 2.5, 0, 1.5, 2); break;
      case 'walk': this.walkT = 0; this.controls.enabled = false; break;
      case 'fpv':
        this.controls.enabled = false;
        this.canvasEl.style.cursor = 'grab';
        // đứng ngoài sân, quay mặt vào cổng
        this.fpv.x = 0;
        this.fpv.d = -5;
        this.fpv.yaw = 0;
        this.fpv.pitch = 0;
        break;
    }
  }

  update(dt: number): void {
    if (this.preset === 'fpv' && this.project) {
      const { width: W, length: L, facadeWidth: FW } = this.project.portal;
      const k = this.keys;
      const run = k.has('ShiftLeft') || k.has('ShiftRight');
      const speed = (run ? 2.6 : 1.35) * dt; // m/s: đi bộ / chạy
      // trục đi theo hướng nhìn ngang (yaw): mặc định nhìn về -z = vào cổng
      // mũi tên trái/phải QUAY người (đi bằng bàn phím không cần chuột); A/D hoặc Q/E để bước ngang
      const turn = (k.has('ArrowLeft') ? 1 : 0) - (k.has('ArrowRight') ? 1 : 0);
      if (turn) this.fpv.yaw += turn * 1.7 * dt;
      // ngẩng đầu / cúi đầu bằng bàn phím (R F hoặc PageUp PageDown), khỏi cần chuột
      const look = (k.has('KeyR') || k.has('PageUp') ? 1 : 0) - (k.has('KeyF') || k.has('PageDown') ? 1 : 0);
      if (look) this.fpv.pitch = Math.max(-1.2, Math.min(1.2, this.fpv.pitch + look * 1.1 * dt));
      let fwd = 0, side = 0;
      if (k.has('KeyW') || k.has('ArrowUp')) fwd += 1;
      if (k.has('KeyS') || k.has('ArrowDown')) fwd -= 1;
      if (k.has('KeyD') || k.has('KeyE')) side += 1;
      if (k.has('KeyA') || k.has('KeyQ')) side -= 1;
      const len = Math.hypot(fwd, side) || 1;
      const sin = Math.sin(this.fpv.yaw), cos = Math.cos(this.fpv.yaw);
      // hướng nhìn: (sin*? ) — dx, dz trong hệ thế giới
      const dx = (fwd / len) * -sin + (side / len) * cos;
      const dz = (fwd / len) * -cos - (side / len) * sin;
      let nx = this.fpv.x + dx * speed;
      let nd = this.fpv.d - dz * speed; // d = -z
      // không xuyên tường: trong cổng thì kẹp trong lối đi, ngoài sân thì kẹp trong quảng trường
      const margin = 0.28;
      if (nd > 0.15 && nd < L - 0.15) nx = Math.max(-W / 2 + margin, Math.min(W / 2 - margin, nx));
      else if (nd <= 0.15) nx = Math.max(-FW / 2 - 4, Math.min(FW / 2 + 4, nx));
      nd = Math.max(-9, Math.min(L + 7, nd));
      const moved = Math.hypot(nx - this.fpv.x, nd - this.fpv.d);
      this.fpv.x = nx;
      this.fpv.d = nd;
      this.fpv.bob += moved * (run ? 7 : 5.5);
      const eye = EYE + Math.sin(this.fpv.bob) * 0.035;
      this.camera.position.set(this.fpv.x, eye, -this.fpv.d);
      const cp = Math.cos(this.fpv.pitch);
      this.camera.lookAt(
        this.fpv.x - Math.sin(this.fpv.yaw) * cp * 4,
        eye + Math.sin(this.fpv.pitch) * 4,
        -this.fpv.d - Math.cos(this.fpv.yaw) * cp * 4,
      );
    } else if (this.preset === 'walk' && this.project) {
      const L = this.project.portal.length;
      this.walkT = (this.walkT + dt) % WALK_PERIOD;
      const k = this.walkT / WALK_PERIOD;
      const ease = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const z = 9 - ease * (9 + L + 3);
      const sway = Math.sin(this.walkT * 2.1) * 0.03;
      this.camera.position.set(sway * 3, EYE + Math.abs(sway), z);
      this.camera.lookAt(sway * 3, EYE - 0.1, z - 6);
    } else {
      this.controls.update();
    }

    // người đi xuyên cổng: từ ngoài sân qua cổng vào sảnh rồi quay lại từ đầu
    if (this.walker && this.project && this.people.visible) {
      const { length: L, width: W, facadeWidth: FW } = this.project.portal;
      const span = L + 9;
      this.walkerT = (this.walkerT + dt * 0.85) % span;
      const d = -4.5 + this.walkerT;
      Preview.placeActor(this.walker, -W * 0.26 + Math.sin(this.walkerT * 0.6) * 0.2, d, Math.PI);
      this.walker.ch?.play('walk', 0);
      // người đi dạo ngang trước mặt dựng, qua lại liên tục
      if (this.stroller) {
        const across = FW + 1.2;
        const k = ((this.walkerT * 0.8) % across) / across * 2; // 0..2
        const forward = k < 1;
        const u = forward ? k : 2 - k;
        // đi sát trước mặt dựng để không chắn ống kính khi nhìn từ ngoài sân
        Preview.placeActor(this.stroller, -across / 2 + u * across, -1.5, forward ? Math.PI / 2 : -Math.PI / 2);
        this.stroller.ch?.play('walk', 0);
      }
      // người đi ngược ra phía sân, lệch pha nửa vòng
      if (this.exiter) {
        const d2 = -4.5 + ((this.walkerT + span * 0.5) % span);
        Preview.placeActor(this.exiter, W * 0.27 - Math.sin(this.walkerT * 0.5) * 0.18, L + 4.5 - (d2 + 4.5), 0);
        this.exiter.ch?.play('walk', 0);
      }
    }
    for (const a of this.extras) a.ch?.mixer.update(dt);
    this.walker?.ch?.mixer.update(dt);
    this.stroller?.ch?.mixer.update(dt);
    this.exiter?.ch?.mixer.update(dt);
    if (this.tracked.visible) for (const a of this.trackedPool) if (a.group.visible) a.ch?.mixer.update(dt);

    // robot: 1 con đón khách đứng chờ (vẫy tay khi có người tới gần), 2 con đi lại theo lộ trình lặp
    if (this.robotGroup.visible && this.project) {
      this.robotT += dt;
      const { width: W, length: L, facadeWidth: FW } = this.project.portal;
      for (const r of this.robots) {
        if (!r.ch) continue;
        if (r.role === 'greeter') {
          const rp = r.group.position;
          const near = this.tracked.visible && this.lastPersons.some((p) => Math.hypot(p.x - rp.x, -p.d - rp.z) < 2.6);
          if (near !== this.robotNear) {
            this.robotNear = near;
            r.ch.play(near ? 'Wave' : 'Idle', 0.3);
          }
          if (!near) {
            this.robotWaveAt -= dt;
            if (this.robotWaveAt <= 0 && r.ch.current === 'Idle') {
              // luân phiên vẫy tay / giơ ngón cái (tất định, không dùng Math.random)
              r.ch.play(this.robotWaveCount++ % 2 ? 'ThumbsUp' : 'Wave', 0.3, true);
              this.robotWaveAt = 7 + (this.robotWaveCount % 3) * 2;
            }
          }
        } else if (r.role === 'patrol') {
          // đi ngang qua lại trước mặt dựng, ngoài sân
          const span = FW + 2.4;
          const speed = 0.65;
          const half = span / speed;
          const k = ((this.robotT + r.phase * half) % (half * 2)) / half; // 0..2
          const forward = k < 1;
          const u = forward ? k : 2 - k;
          r.group.position.set(-span / 2 + u * span, 0, 3.2);
          r.group.rotation.y = forward ? Math.PI / 2 : -Math.PI / 2;
          r.ch.play('Walking', 0.3);
        } else {
          // đi dọc lối đi, từ ngoài sân xuyên qua cổng vào sảnh rồi lặp lại
          const span = L + 9;
          const speed = 0.8;
          const d = -3.5 + ((this.robotT * speed + r.phase * span) % span);
          r.group.position.set(W * 0.3, 0, -d);
          r.group.rotation.y = Math.PI;
          r.ch.play('Walking', 0.3);
        }
        r.ch.mixer.update(dt);
      }
    }
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}

/** Xem "bản đồ pixel": khung hình xuất nguyên bản, thu vừa cửa sổ. */
export class FlatView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(0, 1, 1, 0, 0, 1);
  private readonly mesh: THREE.Mesh;
  /** vùng đang chiếm trên màn hình (px CSS) để đặt nhãn */
  rect = { x: 0, y: 0, w: 1, h: 1 };

  constructor(output: THREE.Texture) {
    // DoubleSide: camera lật trục y + scale âm làm đảo chiều tam giác, tránh bị cull.
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: output, toneMapped: false, side: THREE.DoubleSide }));
    this.scene.add(this.mesh);
    this.scene.background = new THREE.Color(0x0a0b10);
  }

  setOutput(texture: THREE.Texture): void {
    (this.mesh.material as THREE.MeshBasicMaterial).map = texture;
  }

  /** Bố trí ảnh tỉ lệ (aw×ah) vào khung (vw×vh) chừa lề. */
  layout(vw: number, vh: number, aw: number, ah: number, margin: { left: number; top: number; right: number; bottom: number }): void {
    const availW = Math.max(1, vw - margin.left - margin.right);
    const availH = Math.max(1, vh - margin.top - margin.bottom);
    const s = Math.min(availW / aw, availH / ah);
    const w = aw * s;
    const h = ah * s;
    const x = margin.left + (availW - w) / 2;
    const y = margin.top + (availH - h) / 2;
    this.rect = { x, y, w, h };
    this.camera.left = 0; this.camera.right = vw; this.camera.top = 0; this.camera.bottom = vh;
    this.camera.updateProjectionMatrix();
    this.mesh.position.set(x + w / 2, y + h / 2, 0);
    this.mesh.scale.set(w, -h, 1);
  }
}
