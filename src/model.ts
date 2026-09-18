// Mô hình dữ liệu của một dự án cổng LED. Đây là "tài liệu" duy nhất được lưu (JSON),
// mọi thứ khác (hình học, bố cục pixel, shader) đều suy ra từ đây.

export type ScreenId = 'left' | 'right' | 'ceiling' | 'facade';
export const SCREEN_IDS: ScreenId[] = ['left', 'right', 'ceiling', 'facade'];
export const SCREEN_LABEL: Record<ScreenId, string> = {
  left: 'Tường trái',
  right: 'Tường phải',
  ceiling: 'Trần',
  facade: 'Mặt dựng',
};

/** Kích thước cổng (mét) và mật độ điểm ảnh LED.
 *  Theo bản vẽ "Cấu trúc & kích thước": bề rộng TỔNG 4,0 m gồm lối đi thực tế ~3,0 m
 *  cộng khung thép + tấm LED hai bên; chiều cao 3,0 m; chiều dài cổng 6,0 m. */
export interface PortalSpec {
  /** bề rộng LỐI ĐI THỰC TẾ = khoảng cách giữa hai mặt LED (không tính khung) */
  width: number;
  /** chiều cao lối đi */
  height: number;
  /** chiều dài cổng */
  length: number;
  /** khung thép + tấm LED mỗi bên (m); bề rộng tổng = width + 2 × frameThickness */
  frameThickness: number;
  /** mặt dựng phía trước: bề rộng và chiều cao tổng (bao quanh lối vào) */
  facadeWidth: number;
  facadeHeight: number;
  /** bước điểm ảnh LED (mm), ví dụ 2.5 = P2.5 */
  pitchMm: number;
}

export type MediaMapping = 'each' | 'unfold' | 'layout';
export const MAPPING_LABEL: Record<MediaMapping, string> = {
  each: 'Mỗi màn một bản',
  unfold: 'Trải phẳng chữ U (3 mặt liền)',
  layout: 'Theo bản đồ pixel',
};
export type MediaFit = 'cover' | 'contain' | 'stretch';
export const FIT_LABEL: Record<MediaFit, string> = { cover: 'Phủ kín (cắt mép)', contain: 'Vừa khung (viền đen)', stretch: 'Kéo giãn' };

/** Tệp âm thanh trong IndexedDB (cùng kho với ảnh/video). */
export interface AudioRef {
  id: string;
  name: string;
  /** 0..1 */
  volume: number;
  /** lặp khi tệp ngắn hơn cảnh */
  loop: boolean;
}

export interface MediaRef {
  /** khoá trong IndexedDB */
  id: string;
  name: string;
  kind: 'image' | 'video';
  mapping: MediaMapping;
  fit: MediaFit;
}

export interface TextOverlay {
  enabled: boolean;
  text: string;
  color: string;
  /** cỡ chữ theo tỉ lệ chiều cao màn (0.1–1) */
  size: number;
  /** tốc độ chạy chữ (bề rộng màn mỗi giây; 0 = đứng yên, căn giữa) */
  speed: number;
  screens: Record<ScreenId, boolean>;
}

/** Lớp phủ đặt lên cảnh: chữ nhiều dòng, logo/ảnh, hoặc dải mốc thời gian; đặt vào vùng của màn. */
export type OverlayKind = 'text' | 'image' | 'timeline' | 'gallery';
export const OVERLAY_KIND_LABEL: Record<OverlayKind, string> = { text: 'Chữ', image: 'Logo / ảnh', timeline: 'Mốc thời gian', gallery: 'Dãy ảnh có chú thích' };
/** Vùng đặt lớp. Mặt dựng: dải trên lối vào / trụ trái / trụ phải. Tường & trần: nửa trái / nửa phải (theo mắt người xem) / dải trên. */
export type FacadeZone = 'all' | 'header' | 'left' | 'right';
export const ZONE_LABEL: Record<FacadeZone, string> = { all: 'Cả màn', header: 'Dải trên lối vào', left: 'Trụ trái', right: 'Trụ phải' };
export const WALL_ZONE_LABEL: Record<FacadeZone, string> = { all: 'Cả màn', header: 'Dải trên', left: 'Nửa trái', right: 'Nửa phải' };
export const BUILTIN_LOGO = 'builtin:dau-logo';
export const BUILTIN_IMAGES: [string, string][] = [
  [BUILTIN_LOGO, 'Logo DAU'],
  ['builtin:20-nam', 'Số 20 NĂM'],
  ['builtin:skyline-1', 'Phác thảo công trình 1'],
  ['builtin:skyline-2', 'Phác thảo công trình 2'],
  ['builtin:skyline-3', 'Phác thảo công trình 3'],
];

export interface GalleryItem { mediaId: string; name: string; caption: string }

export interface Overlay {
  id: string;
  kind: OverlayKind;
  screens: Record<ScreenId, boolean>;
  zone: FacadeZone;
  /** chiều cao lớp theo tỉ lệ chiều cao vùng (0.05–1) */
  size: number;
  /** tâm lớp trong vùng, 0..1 (0.5 = giữa); bỏ qua x khi đang chạy chữ */
  x: number;
  y: number;
  /** chạy ngang, bề rộng vùng mỗi giây; 0 = đứng yên */
  speed: number;
  opacity: number;
  // chữ
  text: string;
  color: string;
  weight: 'bold' | 'normal';
  align: 'left' | 'center' | 'right';
  // ảnh: id trong IndexedDB hoặc 'builtin:...'
  mediaId: string;
  mediaName: string;
  // mốc thời gian: mỗi dòng "năm nhãn"
  milestones: string;
  accent: string;
  /** khung sáng quanh ảnh (ảnh & dãy ảnh) */
  frame: boolean;
  // dãy ảnh
  items: GalleryItem[];
}

export const DEFAULT_MILESTONES = '2006 Thành lập\n2010 Khẳng định\n2015 Bứt phá\n2020 Đổi mới\n2023 Vươn xa\n2026 Tương lai';

export function makeOverlay(kind: OverlayKind, partial: Partial<Overlay> = {}): Overlay {
  return {
    id: uid(),
    kind,
    screens: { left: kind === 'timeline', right: kind === 'timeline', ceiling: false, facade: kind !== 'timeline' },
    zone: kind === 'timeline' ? 'all' : 'header',
    size: kind === 'image' ? 0.5 : kind === 'timeline' ? 0.45 : 0.6,
    x: 0.5,
    y: 0.5,
    speed: kind === 'timeline' ? 0.08 : 0,
    opacity: 1,
    text: '20 NĂM KIẾN TẠO TƯƠNG LAI',
    color: '#ffffff',
    weight: 'bold',
    align: 'center',
    mediaId: BUILTIN_LOGO,
    mediaName: 'Logo DAU (sẵn)',
    milestones: DEFAULT_MILESTONES,
    accent: '#38d6ff',
    frame: kind === 'gallery',
    items: kind === 'gallery'
      ? [1, 2, 3].map((i) => ({ mediaId: `builtin:skyline-${i}`, name: `Phác thảo công trình ${i}`, caption: `CÔNG TRÌNH ${i}` }))
      : [],
    ...partial,
  };
}

export type TransitionType = 'cut' | 'fade' | 'wipeIn' | 'wipeOut' | 'iris' | 'dissolve' | 'flash' | 'blinds';
export const TRANSITION_LABEL: Record<TransitionType, string> = {
  cut: 'Cắt thẳng',
  fade: 'Mờ chồng',
  wipeIn: 'Quét vào trong',
  wipeOut: 'Quét ra ngoài',
  iris: 'Cổng mở tròn',
  dissolve: 'Tan hạt',
  flash: 'Chớp sáng',
  blinds: 'Rèm sáng',
};
export const TRANSITION_INDEX: Record<TransitionType, number> = { cut: 0, fade: 1, wipeIn: 2, wipeOut: 3, iris: 4, dissolve: 5, flash: 6, blinds: 7 };

/** Cách một cảnh phản ứng với vị trí người trong cổng. */
export type InteractMode = 'none' | 'spotlight' | 'ripple' | 'reveal';
export const INTERACT_LABEL: Record<InteractMode, string> = {
  none: 'Không',
  spotlight: 'Quầng sáng theo người',
  ripple: 'Sóng lan từ chân người',
  reveal: 'Chỉ hé mở quanh người',
};
export interface SceneInteract {
  mode: InteractMode;
  color: string;
  /** bán kính quầng (m) */
  radius: number;
  intensity: number;
  /** tốc độ sóng lan (m/s) */
  speed: number;
  /** tham số hiệu ứng được lái theo tiến độ người đi (0 lối vào → 1 cuối cổng); '' = không */
  driveParam: string;
  driveFrom: number;
  driveTo: number;
}

export interface Scene {
  id: string;
  name: string;
  /** giây */
  duration: number;
  /** nguồn hình nền: id hiệu ứng có sẵn, hoặc 'media' */
  effect: string;
  /** tham số hiệu ứng, khoá theo schema của hiệu ứng */
  params: Record<string, number | string>;
  media: MediaRef | null;
  /** tiếng riêng của cảnh: bắt đầu cùng cảnh, chồng mờ theo chuyển cảnh */
  audio: AudioRef | null;
  text: TextOverlay;
  overlays: Overlay[];
  interact: SceneInteract;
  /** hiệu ứng chuyển sang cảnh kế tiếp, diễn ra ở cuối cảnh này */
  transition: TransitionType;
  transitionDuration: number;
}

export type TrackSource = 'sim' | 'ws' | 'camera';
export const TRACK_SOURCE_LABEL: Record<TrackSource, string> = {
  sim: 'Mô phỏng (người ảo)',
  ws: 'WebSocket (hệ tracking ngoài)',
  camera: 'Camera + AI trong app',
};

/** Hiệu chỉnh camera: 4 điểm ảnh (0..1) ứng với 4 điểm sàn (x, d) mét. */
export interface CameraCalib {
  img: [number, number][];
  floor: [number, number][];
}

export interface InteractionConfig {
  enabled: boolean;
  source: TrackSource;
  wsUrl: string;
  camera: {
    deviceId: string;
    flipX: boolean;
    /** ngưỡng tin cậy nhận diện người 0..1 */
    minScore: number;
    calib: CameraCalib | null;
  };
  sim: { walkers: number };
}

export const defaultInteract = (): SceneInteract => ({
  mode: 'none', color: '#ffffff', radius: 1.6, intensity: 1, speed: 1.5, driveParam: '', driveFrom: 0, driveTo: 1,
});

export const defaultInteraction = (): InteractionConfig => ({
  enabled: false,
  source: 'sim',
  wsUrl: 'ws://127.0.0.1:8765',
  camera: { deviceId: '', flipX: false, minScore: 0.45, calib: null },
  sim: { walkers: 2 },
});

/** Một người đang được theo dõi, toạ độ sàn: x ngang (m, 0 = tim cổng), d độ sâu (m, 0 = lối vào, âm = ngoài sân). */
export interface Person {
  id: number;
  x: number;
  d: number;
  /** giây kể từ khi xuất hiện */
  age: number;
}

export interface LayoutRect { x: number; y: number }

/** Một chương trình = một danh sách cảnh. `Project.scenes`/`loop` là nội dung của chương trình ĐANG PHÁT
 *  (`activeProgram`); các chương trình khác cất trong `programs`. Đổi chương trình = `switchProgram()`. */
export interface Program {
  id: string;
  name: string;
  scenes: Scene[];
  loop: boolean;
  /** nhạc nền chạy theo thời gian chương trình, lặp */
  music: AudioRef | null;
}

/** Khung giờ phát: các thứ trong tuần (T2..CN), giờ bắt đầu/kết thúc HH:MM (kết thúc nhỏ hơn bắt đầu = qua đêm). */
export interface ScheduleRule {
  id: string;
  days: boolean[]; // 7 phần tử, [0] = Thứ 2 … [6] = Chủ nhật
  start: string;
  end: string;
  programId: string;
}

export interface Schedule {
  enabled: boolean;
  rules: ScheduleRule[];
  /** ngoài mọi khung giờ: tắt (màn đen) hay phát một chương trình chờ */
  offMode: 'black' | 'program';
  offProgram: string;
}

export interface Project {
  version: 1;
  name: string;
  portal: PortalSpec;
  interaction: InteractionConfig;
  /** vị trí (px) góc trên-trái của từng màn trong khung hình xuất; kích thước suy từ portal */
  layout: Record<ScreenId, LayoutRect>;
  scenes: Scene[];
  loop: boolean;
  /** nhạc nền của chương trình đang phát (bản sao của programs[active].music) */
  music: AudioRef | null;
  programs: Program[];
  activeProgram: string;
  schedule: Schedule;
}

export const DAY_LABEL = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

export const defaultSchedule = (): Schedule => ({ enabled: false, rules: [], offMode: 'black', offProgram: '' });

export function makeRule(programId: string): ScheduleRule {
  return { id: uid(), days: [true, true, true, true, true, true, true], start: '08:00', end: '22:00', programId };
}

/** Ghi nội dung đang phát (scenes/loop) vào mục chương trình tương ứng. Gọi trước khi lưu/đổi chương trình. */
export function storeActiveProgram(p: Project): void {
  const cur = p.programs.find((x) => x.id === p.activeProgram);
  if (cur) { cur.scenes = p.scenes; cur.loop = p.loop; cur.music = p.music; }
}

/** Chuyển sang chương trình khác; trả false nếu không có. */
export function switchProgram(p: Project, id: string): boolean {
  if (id === p.activeProgram) return true;
  const next = p.programs.find((x) => x.id === id);
  if (!next) return false;
  storeActiveProgram(p);
  p.activeProgram = id;
  p.scenes = next.scenes;
  p.loop = next.loop;
  p.music = next.music;
  return true;
}

export function addProgram(p: Project, name: string, scenes: Scene[] = [], loop = true): Program {
  const prog: Program = { id: uid(), name, scenes, loop, music: null };
  p.programs.push(prog);
  return prog;
}

const hm = (s: string): number => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  return m ? Math.min(23, +m[1]) * 60 + Math.min(59, +m[2]) : 0;
};

/** Khung giờ nào đang hiệu lực tại `now`; luật đứng trước có ưu tiên. */
export function activeRule(schedule: Schedule, now: Date): ScheduleRule | null {
  const dayIdx = (now.getDay() + 6) % 7; // JS: 0 = CN -> ta: 0 = T2
  const minutes = now.getHours() * 60 + now.getMinutes();
  for (const r of schedule.rules) {
    const s = hm(r.start), e = hm(r.end);
    if (s === e) continue;
    if (e > s) {
      if (r.days[dayIdx] && minutes >= s && minutes < e) return r;
    } else {
      // qua đêm: phần tối thuộc ngày r, phần sáng thuộc ngày hôm sau
      const prevDay = (dayIdx + 6) % 7;
      if ((r.days[dayIdx] && minutes >= s) || (r.days[prevDay] && minutes < e)) return r;
    }
  }
  return null;
}

/** Chương trình lịch muốn phát lúc `now`: id chương trình, hoặc 'black' = tắt màn, hoặc null = lịch tắt. */
export function scheduledProgram(p: Project, now: Date): { want: string | 'black'; rule: ScheduleRule | null } | null {
  if (!p.schedule.enabled) return null;
  const rule = activeRule(p.schedule, now);
  if (rule) return { want: rule.programId, rule };
  if (p.schedule.offMode === 'program' && p.programs.some((x) => x.id === p.schedule.offProgram)) return { want: p.schedule.offProgram, rule: null };
  return { want: 'black', rule: null };
}

export const defaultText = (): TextOverlay => ({
  enabled: false,
  text: '20 NĂM KIẾN TẠO TƯƠNG LAI',
  color: '#ffffff',
  size: 0.32,
  speed: 0.25,
  screens: { left: true, right: true, ceiling: false, facade: true },
});

let seq = 0;
export const uid = (): string => `${Date.now().toString(36)}${(seq++).toString(36)}`;

export function makeScene(effect: string, partial: Partial<Scene> = {}): Scene {
  return {
    id: uid(),
    name: '',
    duration: 12,
    effect,
    params: {},
    media: null,
    audio: null,
    text: defaultText(),
    overlays: [],
    interact: defaultInteract(),
    transition: 'fade',
    transitionDuration: 1.5,
    ...partial,
  };
}

/** Bề rộng tổng của khối cổng (tính cả khung hai bên) — con số ghi trên bản vẽ. */
export const totalWidth = (p: PortalSpec): number => p.width + 2 * p.frameThickness;

/** Điểm ảnh của từng màn theo kích thước thật và bước điểm. */
export function screenPixels(p: PortalSpec): Record<ScreenId, { w: number; h: number }> {
  const ppm = 1000 / p.pitchMm; // pixel mỗi mét
  const px = (m: number): number => Math.max(8, Math.round(m * ppm));
  return {
    left: { w: px(p.length), h: px(p.height) },
    right: { w: px(p.length), h: px(p.height) },
    ceiling: { w: px(p.width), h: px(p.length) },
    facade: { w: px(p.facadeWidth), h: px(p.facadeHeight) },
  };
}

/**
 * Xếp gọn 4 màn vào khung xuất: thử nhiều bề rộng khung (mọi tổng bề rộng của một nhóm màn),
 * mỗi lần xếp theo kiểu "dồn xuống rồi dồn sang trái", chọn khung có diện tích nhỏ nhất.
 * Chỉ 4 hình nên duyệt hết được, không cần thuật toán gần đúng.
 */
export function defaultLayout(p: PortalSpec): Record<ScreenId, LayoutRect> {
  const px = screenPixels(p);
  const items = SCREEN_IDS.map((id) => ({ id, w: px[id].w, h: px[id].h })).sort((a, b) => b.h - a.h || b.w - a.w);
  const minW = Math.max(...items.map((i) => i.w));
  const widths = new Set<number>();
  for (let mask = 1; mask < 1 << items.length; mask++) {
    let sum = 0;
    for (let i = 0; i < items.length; i++) if (mask & (1 << i)) sum += items[i].w;
    if (sum >= minW) widths.add(sum);
  }

  type Placed = { x: number; y: number; w: number; h: number };
  const fit = (binW: number): { layout: Record<ScreenId, LayoutRect>; w: number; h: number } | null => {
    const placed: Placed[] = [];
    const layout = {} as Record<ScreenId, LayoutRect>;
    for (const it of items) {
      const xs = [...new Set([0, ...placed.map((r) => r.x + r.w)])].sort((a, b) => a - b);
      const ys = [...new Set([0, ...placed.map((r) => r.y + r.h)])].sort((a, b) => a - b);
      let spot: { x: number; y: number } | null = null;
      for (const y of ys) {
        for (const x of xs) {
          if (x + it.w > binW) continue;
          if (placed.some((r) => x < r.x + r.w && x + it.w > r.x && y < r.y + r.h && y + it.h > r.y)) continue;
          spot = { x, y };
          break;
        }
        if (spot) break;
      }
      if (!spot) return null;
      placed.push({ ...spot, w: it.w, h: it.h });
      layout[it.id] = { x: spot.x, y: spot.y };
    }
    return { layout, w: Math.max(...placed.map((r) => r.x + r.w)), h: Math.max(...placed.map((r) => r.y + r.h)) };
  };

  let best: { area: number; span: number; layout: Record<ScreenId, LayoutRect> } | null = null;
  for (const binW of widths) {
    const r = fit(binW);
    if (!r) continue;
    const area = r.w * r.h;
    const span = Math.max(r.w, r.h);
    if (!best || area < best.area || (area === best.area && span < best.span)) best = { area, span, layout: r.layout };
  }
  return best?.layout ?? { left: { x: 0, y: 0 }, right: { x: px.left.w, y: 0 }, ceiling: { x: 0, y: px.left.h }, facade: { x: px.ceiling.w, y: px.left.h } };
}

/** Tỉ lệ khung xuất thực sự có nội dung (1 = không thừa pixel nào). */
export function layoutFill(project: Project): number {
  const px = screenPixels(project.portal);
  const used = SCREEN_IDS.reduce((a, id) => a + px[id].w * px[id].h, 0);
  const c = canvasSize(project);
  return used / (c.w * c.h);
}

/** Kích thước khung hình xuất bao trọn mọi màn. */
export function canvasSize(project: Project): { w: number; h: number } {
  const s = screenPixels(project.portal);
  let w = 0;
  let h = 0;
  for (const id of SCREEN_IDS) {
    w = Math.max(w, project.layout[id].x + s[id].w);
    h = Math.max(h, project.layout[id].y + s[id].h);
  }
  return { w: Math.max(w, 8), h: Math.max(h, 8) };
}

const wallsOnly = (id: ScreenId): Record<ScreenId, boolean> => ({ left: id === 'left', right: id === 'right', ceiling: false, facade: false });

/** Bộ lớp phủ mặt dựng theo poster: dải trên, trụ trái 4 từ khoá, trụ phải logo + "20 năm". */
function facadeSet(color: string): Overlay[] {
  return [
    makeOverlay('text', { zone: 'header', text: '20 NĂM KIẾN TẠO TƯƠNG LAI', color, size: 0.55 }),
    makeOverlay('text', { zone: 'left', text: 'DI SẢN\nSÁNG TẠO\nKẾT NỐI\nVƯƠN XA', color, size: 0.42, y: 0.62, align: 'left' }),
    makeOverlay('image', { zone: 'right', size: 0.22, y: 0.86 }),
    makeOverlay('text', { zone: 'right', text: '20 NĂM\nCON NGƯỜI\nÝ TƯỞNG\nCÔNG TRÌNH\nTƯƠNG LAI', color, size: 0.5, y: 0.42 }),
  ];
}

export function defaultProject(): Project {
  // đúng bản vẽ: lối đi 3,0 m + khung 0,5 m mỗi bên = 4,0 m bề rộng tổng; cao 3,0 m; dài 6,0 m
  const portal: PortalSpec = { width: 3, height: 3, length: 6, frameThickness: 0.5, facadeWidth: 6, facadeHeight: 4.2, pitchMm: 2.5 };
  const scenes: Scene[] = [
    makeScene('nebula', {
      name: '1. Bước vào cổng',
      duration: 14,
      text: { ...defaultText(), enabled: true, text: 'DI SẢN  ·  SÁNG TẠO  ·  KẾT NỐI  ·  VƯƠN XA', size: 0.26, screens: { left: true, right: true, ceiling: false, facade: false } },
      overlays: facadeSet('#ffffff'),
      interact: { ...defaultInteract(), mode: 'reveal', radius: 2.2, intensity: 1 },
      transition: 'wipeIn',
      transitionDuration: 2,
    }),
    makeScene('nebula', {
      name: '2. Tương tác theo vị trí', duration: 16, transition: 'dissolve', transitionDuration: 2,
      params: { c1: '#08123f', c2: '#3a1f9e', c3: '#38d6ff', intensity: 0.8 },
      overlays: [
        // tường trái: khối chữ ở nửa gần lối vào (nửa trái theo mắt người xem), dãy ảnh ở nửa xa
        makeOverlay('text', { screens: wallsOnly('left'), zone: 'left', text: 'QUÁ KHỨ\nHIỆN TẠI\nTƯƠNG LAI\nĐỀU BẮT ĐẦU\nTỪ CON NGƯỜI', size: 0.62, x: 0.5, y: 0.5 }),
        makeOverlay('gallery', { screens: wallsOnly('left'), zone: 'right', size: 0.7, speed: 0 }),
        // tường phải: dãy ảnh ở nửa xa (nửa trái theo mắt người xem), chữ ở nửa gần lối vào
        makeOverlay('gallery', { screens: wallsOnly('right'), zone: 'left', size: 0.7, speed: 0 }),
        makeOverlay('text', { screens: wallsOnly('right'), zone: 'right', text: 'KIẾN TẠO\nNHỮNG\nKHÔNG GIAN\nTỐT ĐẸP HƠN', size: 0.62 }),
        ...facadeSet('#ffffff'),
      ],
      interact: { ...defaultInteract(), mode: 'spotlight', color: '#9df3ff', radius: 1.4, intensity: 0.6 },
    }),
    makeScene('portal', {
      name: '3. Vùng cổng thời gian', duration: 14, transition: 'iris', transitionDuration: 2.5,
      overlays: [
        makeOverlay('text', { screens: wallsOnly('left'), zone: 'left', text: 'BẠN LÀ\nMỘT PHẦN\nCỦA\nHÀNH TRÌNH', size: 0.6 }),
        makeOverlay('image', { screens: wallsOnly('right'), zone: 'right', mediaId: 'builtin:20-nam', mediaName: 'Số 20 NĂM', size: 0.55, y: 0.6 }),
        makeOverlay('text', { screens: wallsOnly('right'), zone: 'right', text: 'KIẾN TẠO\nTƯƠNG LAI', size: 0.24, y: 0.16 }),
        ...facadeSet('#ffffff'),
      ],
      interact: { ...defaultInteract(), mode: 'spotlight', color: '#7fe6ff', radius: 1.2, intensity: 0.5, driveParam: 'p2', driveFrom: 0.2, driveTo: 2 },
    }),
    makeScene('rings', {
      name: '4. Bước qua', duration: 10, transition: 'flash', transitionDuration: 1.2,
      interact: { ...defaultInteract(), mode: 'ripple', color: '#ffe27a', radius: 3, intensity: 0.9, speed: 2 },
    }),
    makeScene('ribbon', {
      name: '5. Thế giới mới',
      duration: 16,
      text: { ...defaultText(), enabled: true, text: '20 NĂM KIẾN TẠO TƯƠNG LAI', size: 0.34, speed: 0, screens: { left: false, right: false, ceiling: true, facade: false } },
      overlays: [
        ...facadeSet('#ffffff'),
        makeOverlay('timeline', { color: '#ffffff', accent: '#ffe27a', size: 0.5, speed: 0.06 }),
      ],
      transition: 'fade',
      transitionDuration: 2,
    }),
  ];
  const main: Program = { id: uid(), name: 'Chương trình chính', scenes, loop: true, music: null };
  const idle: Program = {
    id: uid(),
    name: 'Chờ (ngoài giờ)',
    scenes: [makeScene('gradient', { name: 'Dải màu nhẹ', duration: 30, params: { intensity: 0.35 }, transition: 'fade', transitionDuration: 2 })],
    loop: true,
    music: null,
  };
  const schedule: Schedule = { ...defaultSchedule(), rules: [{ ...makeRule(main.id), start: '07:00', end: '22:00' }], offMode: 'program', offProgram: idle.id };
  return {
    version: 1, name: 'Cổng Kiến Tạo DAU', portal, interaction: defaultInteraction(), layout: defaultLayout(portal),
    scenes, loop: true, music: null, programs: [main, idle], activeProgram: main.id, schedule,
  };
}

/** Vị trí thời gian trên danh sách cảnh: cảnh đang chiếu, cảnh kế và tiến độ chuyển cảnh. */
export interface Cursor {
  index: number;
  /** thời gian cục bộ trong cảnh (giây) */
  local: number;
  /** cảnh kế tiếp đang được trộn vào (null nếu chưa tới lúc chuyển) */
  next: number | null;
  /** 0..1 tiến độ chuyển cảnh */
  progress: number;
  /** thời gian cục bộ của cảnh kế */
  nextLocal: number;
}

export const sceneDuration = (s: Scene): number => Math.max(0.1, s.duration);

export function totalDuration(project: Project): number {
  return project.scenes.reduce((a, s) => a + sceneDuration(s), 0);
}

export function sceneStart(project: Project, index: number): number {
  let acc = 0;
  for (let i = 0; i < index; i++) acc += sceneDuration(project.scenes[i]);
  return acc;
}

export function locate(project: Project, t: number): Cursor | null {
  const n = project.scenes.length;
  if (n === 0) return null;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const s = project.scenes[i];
    const d = sceneDuration(s);
    if (t < acc + d || i === n - 1) {
      const local = Math.max(0, Math.min(t - acc, d));
      const hasNext = i < n - 1 || project.loop;
      const td = Math.min(Math.max(0, s.transitionDuration), d);
      if (hasNext && s.transition !== 'cut' && td > 0 && local >= d - td) {
        const nextLocal = local - (d - td);
        return { index: i, local, next: (i + 1) % n, progress: Math.min(1, nextLocal / td), nextLocal };
      }
      return { index: i, local, next: null, progress: 0, nextLocal: 0 };
    }
    acc += d;
  }
  return null;
}
