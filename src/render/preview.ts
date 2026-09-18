// Mô phỏng 3D: dán texture "bản đồ pixel" lên đúng hình học cổng, thêm vỏ tối, sàn phản chiếu,
// người mẫu để cảm nhận tỉ lệ, và các góc camera (kể cả đi xuyên tự động).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { buildScreenBuffers } from '../geometry';
import { canvasSize, type Project } from '../model';

export type CameraPreset = 'outside' | 'entrance' | 'inside' | 'ceiling' | 'exit' | 'walk';
export const CAMERA_LABEL: Record<CameraPreset, string> = {
  outside: 'Ngoài sân nhìn vào',
  entrance: 'Đứng ở cửa cổng',
  inside: 'Đứng trong cổng',
  ceiling: 'Ngước nhìn trần',
  exit: 'Cuối cổng nhìn ra',
  walk: 'Đi xuyên tự động',
};

const EYE = 1.6;
const WALK_PERIOD = 18;

export class Preview {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(62, 1, 0.05, 200);
  readonly controls: OrbitControls;
  private screens: THREE.Mesh | null = null;
  private readonly screenMat: THREE.MeshBasicMaterial;
  private readonly structure = new THREE.Group();
  private readonly people = new THREE.Group();
  private floor: Reflector | null = null;
  private preset: CameraPreset = 'outside';
  private walkT = 0;
  private project: Project | null = null;

  constructor(canvas: HTMLCanvasElement, output: THREE.Texture) {
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
    this.scene.add(this.structure, this.people);
    this.scene.add(new THREE.AmbientLight(0x6070a0, 0.5));
    const hemi = new THREE.HemisphereLight(0x8090ff, 0x101010, 0.4);
    this.scene.add(hemi);
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
    if (this.preset !== 'walk') this.setPreset(this.preset);
  }

  private buildStructure(project: Project): void {
    this.structure.clear();
    const { width: W, height: H, length: L, facadeWidth: FW, facadeHeight: FH } = project.portal;
    const T = 0.3; // độ dày vỏ
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
    // toà nhà phía sau và sảnh trong: khối mờ để thấy chiều sâu
    // không phụ thuộc đèn (MeshBasic) để sảnh luôn thấy được, dù mờ
    const far = new THREE.MeshBasicMaterial({ color: 0x171a24 });
    const lobby = new THREE.MeshBasicMaterial({ color: 0x232838 });
    box(-14, -FW / 2, 0, 9, -T - 0.4, -T, far);
    box(FW / 2, 14, 0, 9, -T - 0.4, -T, far);
    box(-14, 14, FH, 9, -T - 0.4, -T, far);
    box(-14, 14, 0, 9, -L - 9, -L - 8.6, lobby);
    for (const x of [-4.5, 4.5]) box(x - 0.3, x + 0.3, 0, 9, -L - 5, -L - 4.4, far);
    // đèn sảnh trong (ấm) và đèn sân ngoài (lạnh) để người mẫu, sàn và tường sảnh có khối
    const warm = new THREE.PointLight(0xffd9a8, 60, 40, 2);
    warm.position.set(0, 3.8, -L - 6);
    const warm2 = new THREE.PointLight(0xffd9a8, 30, 30, 2);
    warm2.position.set(-4, 3.5, -L - 10);
    const cool = new THREE.PointLight(0xa8c4ff, 40, 40, 2);
    cool.position.set(3, 4.5, 6);
    this.structure.add(warm, warm2, cool);
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

  private buildPeople(project: Project): void {
    this.people.clear();
    const L = project.portal.length;
    const mat = new THREE.MeshStandardMaterial({ color: 0x1b1e26, roughness: 0.85 });
    // tránh trục giữa (đường camera đi xuyên) và các vị trí camera đặt sẵn
    const spots: [number, number][] = [[0.9, -L * 0.6], [-1.0, -L * 0.85], [0.8, 2.2], [-1.3, -L * 0.3]];
    for (const [x, z] of spots) {
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 1.05, 6, 12), mat);
      body.position.set(x, 0.2 + 1.05 / 2 + 0.05, z);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), mat);
      head.position.set(x, 1.62, z);
      this.people.add(body, head);
    }
  }

  set showPeople(v: boolean) { this.people.visible = v; }
  set showReflection(v: boolean) { if (this.floor) this.floor.visible = v; }
  get currentPreset(): CameraPreset { return this.preset; }

  setPreset(p: CameraPreset): void {
    this.preset = p;
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
    }
  }

  update(dt: number): void {
    if (this.preset === 'walk' && this.project) {
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
