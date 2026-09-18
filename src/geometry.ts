// Hình học cổng: toạ độ thế giới (mét) của từng màn và cách nó nằm trong khung hình xuất (px).
//
// Hệ trục (three.js, thuận tay phải): x sang phải, y lên trên, z hướng ra sân ngoài.
// Lối vào ở z = 0, cổng kéo dài về phía -z (đi vào cổng = đi theo -z). "Độ sâu" d = -z ∈ [0, L].
// Người đứng ngoài nhìn vào cổng thấy tường trái ở x < 0.
//
// Toạ độ màn (s, t) ∈ [0,1]²: đúng chiều người xem nhìn thấy (s sang phải, t lên trên) -> khung
// hình xuất là ảnh "thẳng" để bộ xử lý LED cắt theo vùng.
import { screenPixels, SCREEN_IDS, type PortalSpec, type Project, type ScreenId } from './model';

export const SCREEN_INDEX: Record<ScreenId, number> = { left: 0, right: 1, ceiling: 2, facade: 3 };

/** Một hình chữ nhật của màn: ánh xạ tuyến tính (s,t) -> thế giới. Mặt dựng gồm 3 tấm quanh lối vào. */
export interface ScreenPatch {
  screen: ScreenId;
  /** vùng (s,t) của tấm này trong màn (mặt dựng chia 3) */
  s0: number; s1: number; t0: number; t1: number;
  world: (s: number, t: number) => [number, number, number];
}

export function screenPatches(p: PortalSpec): ScreenPatch[] {
  const { width: W, height: H, length: L, facadeWidth: FW, facadeHeight: FH } = p;
  const patches: ScreenPatch[] = [
    // tường trái x = -W/2, người trong cổng nhìn sang trái: bên phải họ là vào sâu (s = d/L)
    { screen: 'left', s0: 0, s1: 1, t0: 0, t1: 1, world: (s, t) => [-W / 2, t * H, -s * L] },
    // tường phải x = +W/2: bên phải người xem là hướng lối vào (s = 1 - d/L)
    { screen: 'right', s0: 0, s1: 1, t0: 0, t1: 1, world: (s, t) => [W / 2, t * H, -(1 - s) * L] },
    // trần y = H: người đi vào ngửa đầu nhìn lên -> bên phải vẫn là +x, "trên" ảnh là phía SAU lưng (lối vào).
    // (Ngửa đầu ra sau thì đỉnh khung nhìn quay về phía lối vào; đây cũng là chiều làm tam giác hướng đúng mặt.)
    { screen: 'ceiling', s0: 0, s1: 1, t0: 0, t1: 1, world: (s, t) => [(s - 0.5) * W, H, -(1 - t) * L] },
  ];
  // mặt dựng z = 0, nhìn từ ngoài sân: s sang phải = +x. Lối vào W×H nằm giữa, sát đất.
  const facade = (s: number, t: number): [number, number, number] => [(s - 0.5) * FW, t * FH, 0];
  const sHoleL = Math.max(0, 0.5 - W / 2 / FW);
  const sHoleR = Math.min(1, 0.5 + W / 2 / FW);
  const tHole = Math.min(1, H / FH);
  if (sHoleL > 0) patches.push({ screen: 'facade', s0: 0, s1: sHoleL, t0: 0, t1: tHole, world: facade });
  if (sHoleR < 1) patches.push({ screen: 'facade', s0: sHoleR, s1: 1, t0: 0, t1: tHole, world: facade });
  if (tHole < 1) patches.push({ screen: 'facade', s0: 0, s1: 1, t0: tHole, t1: 1, world: facade });
  return patches;
}

export interface FlatRect { id: ScreenId; x: number; y: number; w: number; h: number }

export function flatRects(project: Project): FlatRect[] {
  const px = screenPixels(project.portal);
  return SCREEN_IDS.map((id) => ({ id, x: project.layout[id].x, y: project.layout[id].y, w: px[id].w, h: px[id].h }));
}

/** Đỉnh + chỉ số tam giác cho toàn bộ màn (dùng chung cho vẽ phẳng và dán lên hộp 3D). */
export interface ScreenBuffers {
  position: Float32Array; // thế giới (m)
  screenUv: Float32Array; // (s,t)
  layout: Float32Array;   // px trong khung hình xuất (gốc trên-trái, y xuống)
  screenId: Float32Array;
  index: Uint16Array;
}

export function buildScreenBuffers(project: Project): ScreenBuffers {
  const patches = screenPatches(project.portal);
  const rects = Object.fromEntries(flatRects(project).map((r) => [r.id, r])) as Record<ScreenId, FlatRect>;
  const pos: number[] = [];
  const suv: number[] = [];
  const lay: number[] = [];
  const sid: number[] = [];
  const idx: number[] = [];
  for (const patch of patches) {
    const r = rects[patch.screen];
    const base = pos.length / 3;
    const corners: [number, number][] = [[patch.s0, patch.t0], [patch.s1, patch.t0], [patch.s1, patch.t1], [patch.s0, patch.t1]];
    for (const [s, t] of corners) {
      pos.push(...patch.world(s, t));
      suv.push(s, t);
      lay.push(r.x + s * r.w, r.y + (1 - t) * r.h);
      sid.push(SCREEN_INDEX[patch.screen]);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return {
    position: new Float32Array(pos),
    screenUv: new Float32Array(suv),
    layout: new Float32Array(lay),
    screenId: new Float32Array(sid),
    index: new Uint16Array(idx),
  };
}
