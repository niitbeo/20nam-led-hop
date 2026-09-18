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

/** Kích thước cổng (mét) và mật độ điểm ảnh LED. */
export interface PortalSpec {
  /** bề rộng lối đi (khoảng cách hai tường) */
  width: number;
  /** chiều cao lối đi */
  height: number;
  /** chiều dài cổng */
  length: number;
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
  text: TextOverlay;
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

export interface Project {
  version: 1;
  name: string;
  portal: PortalSpec;
  interaction: InteractionConfig;
  /** vị trí (px) góc trên-trái của từng màn trong khung hình xuất; kích thước suy từ portal */
  layout: Record<ScreenId, LayoutRect>;
  scenes: Scene[];
  loop: boolean;
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
    text: defaultText(),
    interact: defaultInteract(),
    transition: 'fade',
    transitionDuration: 1.5,
    ...partial,
  };
}

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

/** Bố cục mặc định: hai tường hàng trên, trần + mặt dựng hàng dưới. */
export function defaultLayout(p: PortalSpec): Record<ScreenId, LayoutRect> {
  const s = screenPixels(p);
  return {
    left: { x: 0, y: 0 },
    right: { x: s.left.w, y: 0 },
    ceiling: { x: 0, y: s.left.h },
    facade: { x: s.ceiling.w, y: s.left.h },
  };
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

export function defaultProject(): Project {
  const portal: PortalSpec = { width: 4, height: 3, length: 6, facadeWidth: 6, facadeHeight: 4.2, pitchMm: 2.5 };
  const scenes: Scene[] = [
    makeScene('nebula', {
      name: '1. Bước vào cổng',
      duration: 14,
      text: { ...defaultText(), enabled: true, text: 'DI SẢN  ·  SÁNG TẠO  ·  KẾT NỐI  ·  VƯƠN XA', size: 0.26 },
      interact: { ...defaultInteract(), mode: 'reveal', radius: 2.2, intensity: 1 },
      transition: 'wipeIn',
      transitionDuration: 2,
    }),
    makeScene('blueprint', {
      name: '2. Bản vẽ kiến trúc', duration: 12, transition: 'dissolve', transitionDuration: 2,
      interact: { ...defaultInteract(), mode: 'spotlight', color: '#9df3ff', radius: 1.4, intensity: 0.8 },
    }),
    makeScene('portal', {
      name: '3. Cổng thời gian', duration: 12, transition: 'iris', transitionDuration: 2.5,
      interact: { ...defaultInteract(), mode: 'spotlight', color: '#7fe6ff', radius: 1.2, intensity: 0.5, driveParam: 'p2', driveFrom: 0.2, driveTo: 2 },
    }),
    makeScene('rings', {
      name: '4. Bước qua', duration: 10, transition: 'flash', transitionDuration: 1.2,
      interact: { ...defaultInteract(), mode: 'ripple', color: '#ffe27a', radius: 3, intensity: 0.9, speed: 2 },
    }),
    makeScene('aurora', {
      name: '5. Thế giới mới',
      duration: 14,
      text: { ...defaultText(), enabled: true, text: '20 NĂM KIẾN TẠO TƯƠNG LAI', size: 0.34, speed: 0 },
      transition: 'fade',
      transitionDuration: 2,
    }),
  ];
  return { version: 1, name: 'Cổng Kiến Tạo DAU', portal, interaction: defaultInteraction(), layout: defaultLayout(portal), scenes, loop: true };
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
