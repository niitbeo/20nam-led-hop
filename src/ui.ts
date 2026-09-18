// Giao diện: bảng trái (cổng, danh sách cảnh, thuộc tính cảnh, góc nhìn, bố cục, dự án) + thanh phát dưới.
// Chỉ sửa `app.project` rồi gọi hooks.changed(...); không đụng tới render trực tiếp.
import { loadAutostart, openSavedOutputs, saveAutostart, type SavedOutput } from './autostart';
import { putMedia } from './media';
import {
  addProgram, BUILTIN_IMAGES, canvasSize, DAY_LABEL, layoutFill, totalWidth, defaultLayout, FIT_LABEL, INTERACT_LABEL, makeOverlay, makeRule, makeScene, MAPPING_LABEL, OVERLAY_KIND_LABEL, sceneStart, WALL_ZONE_LABEL, ZONE_LABEL,
  screenPixels, SCREEN_IDS, SCREEN_LABEL, storeActiveProgram, TRACK_SOURCE_LABEL, TRANSITION_LABEL, uid, type Cursor, type InteractMode,
  type AudioRef, type FacadeZone, type MediaFit, type MediaMapping, type OverlayKind, type Project, type Scene, type ScreenId, type TrackSource, type TransitionType,
} from './model';
import { effectName, SOURCE_OPTIONS } from './names';
import { MEDIA_EFFECT_ID, paramsFor, resolveParams } from './render/effects';
import { CAMERA_LABEL, type CameraPreset } from './render/preview';
import { buildTimeline, type TimelineHost } from './timeline';
import { listCameras } from './tracking/sources';

export interface App {
  project: Project;
  t: number;
  playing: boolean;
  selected: number;
  view: 'preview' | 'flat';
  camera: CameraPreset;
  showPeople: boolean;
  reflection: boolean;
  showRobot: boolean;
  renderScale: number;
  /** trạng thái nguồn vị trí người, do control.ts cập nhật mỗi khung */
  track: { status: string; count: number; fps: number };
  /** lịch phát đang tắt màn */
  blackout: boolean;
  /** dòng mô tả lịch phát đang áp dụng */
  scheduleNote: string;
  masterVolume: number;
  muted: boolean;
}

export type ChangeKind = 'portal' | 'layout' | 'scenes' | 'scene' | 'view' | 'interaction' | 'program';
export interface Hooks {
  changed(kind: ChangeKind): void;
  seek(t: number): void;
  play(on: boolean): void;
  loadSample(): void;
  save(): void;
  open(): void;
  /** mở màn hiệu chỉnh camera (cần nguồn camera đang chạy) */
  calibrate(): void;
  /** xoá người ảo đặt tay (nguồn mô phỏng) */
  clearManual(): void;
  /** đổi chương trình đang phát (chọn tay) */
  playProgram(id: string): void;
  /** mở hộp thoại xuất video MP4 */
  exportVideo(): void;
}

export interface Ui {
  refreshAll(): void;
  refreshScenes(): void;
  refreshProps(): void;
  refreshTimeline(): void;
  refreshInteraction(): void;
  tick(cursor: Cursor | null): void;
}

type Child = Node | string | null | undefined | false;
type Props<K extends keyof HTMLElementTagNameMap> = Partial<Omit<HTMLElementTagNameMap[K], 'style'>> & { class?: string; style?: string };
function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props<K> = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  const { class: cls, style, ...rest } = props;
  if (cls) e.className = cls;
  if (style) e.style.cssText = style;
  Object.assign(e, rest);
  for (const c of children) if (c) e.append(c);
  return e;
}
const row = (label: string, ...controls: Child[]): HTMLDivElement => el('div', { class: 'row' }, el('label', {}, label), ...controls);

function num(value: number, opts: { step?: number; min?: number; max?: number }, onChange: (v: number) => void): HTMLInputElement {
  const i = el('input', { type: 'number', value: String(value) });
  if (opts.step !== undefined) i.step = String(opts.step);
  if (opts.min !== undefined) i.min = String(opts.min);
  if (opts.max !== undefined) i.max = String(opts.max);
  i.onchange = () => {
    let v = parseFloat(i.value);
    if (!Number.isFinite(v)) v = value;
    if (opts.min !== undefined) v = Math.max(opts.min, v);
    if (opts.max !== undefined) v = Math.min(opts.max, v);
    i.value = String(v);
    onChange(v);
  };
  return i;
}

function select<T extends string>(options: [T, string][], value: T, onChange: (v: T) => void): HTMLSelectElement {
  const s = el('select');
  for (const [v, label] of options) s.append(el('option', { value: v, textContent: label }));
  s.value = value;
  s.onchange = () => onChange(s.value as T);
  return s;
}

function rangeRow(label: string, value: number, min: number, max: number, step: number, onChange: (v: number) => void): HTMLDivElement {
  const out = el('output', { textContent: fmt(value) });
  const i = el('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value) });
  i.oninput = () => { const v = parseFloat(i.value); out.textContent = fmt(v); onChange(v); };
  return row(label, i, out);
}
const fmt = (v: number): string => (Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(2).replace(/\.?0+$/, ''));

function check(label: string, value: boolean, onChange: (v: boolean) => void): HTMLLabelElement {
  const c = el('input', { type: 'checkbox', checked: value });
  c.onchange = () => onChange(c.checked);
  return el('label', { style: 'display:flex;gap:4px;align-items:center' }, c, label);
}

const PITCHES: [string, string][] = [['1.5', 'P1.5'], ['1.8', 'P1.8'], ['2', 'P2'], ['2.5', 'P2.5'], ['3', 'P3'], ['4', 'P4'], ['5', 'P5']];
const hueOf = (i: number): number => (i * 47 + 200) % 360;

/** Mục gập được trong bảng trái; nhớ trạng thái mở/đóng theo khoá. */
const OPEN_KEY = 'ledportal.panel.open.v1';
function loadOpen(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(OPEN_KEY) ?? '{}') as Record<string, boolean>; } catch { return {}; }
}

export function buildUi(app: App, hooks: Hooks): Ui {
  const panel = document.getElementById('panel')!;

  const openState = loadOpen();
  const saveOpen = (): void => { try { localStorage.setItem(OPEN_KEY, JSON.stringify(openState)); } catch { /* bỏ qua */ } };
  /** Một mục gập được: tiêu đề bấm để mở/đóng, nhớ trạng thái. */
  function section(key: string, title: string, body: HTMLElement, defaultOpen = true, extra?: Node): HTMLElement {
    const open = openState[key] ?? defaultOpen;
    const caret = el('span', { class: 'caret', textContent: open ? '▾' : '▸' });
    const head = el('h2', { class: 'sec-head' }, caret, el('span', { class: 'grow' }, title));
    if (extra) head.append(extra);
    const wrap = el('div', { class: 'sec' + (open ? '' : ' closed') }, head, body);
    head.onclick = (e) => {
      if ((e.target as HTMLElement).closest('button')) return; // nút trong tiêu đề không gập mục
      const now = !wrap.classList.contains('closed');
      wrap.classList.toggle('closed', now);
      caret.textContent = now ? '▸' : '▾';
      openState[key] = !now;
      saveOpen();
    };
    return wrap;
  }

  const nameInput = el('input', { type: 'text', value: app.project.name, style: 'width:100%' });
  nameInput.onchange = () => { app.project.name = nameInput.value; hooks.changed('scene'); };
  const secPortal = el('div');
  const secScenes = el('div');
  const secProps = el('div');
  const secView = el('div');
  const secLayout = el('div');
  const secOutput = el('div');
  const secInteract = el('div');
  const secProgram = el('div');

  // Hai tab: NỘI DUNG (dựng chương trình) và THIẾT BỊ (cổng, khung xuất, camera, dự án)
  const tabContent = el('div', { class: 'tabpage' });
  const tabSetup = el('div', { class: 'tabpage hidden' });
  const btnContent = el('button', { class: 'tab on', textContent: 'Nội dung' });
  const btnSetup = el('button', { class: 'tab', textContent: 'Thiết bị' });
  const showTab = (content: boolean): void => {
    tabContent.classList.toggle('hidden', !content);
    tabSetup.classList.toggle('hidden', content);
    btnContent.classList.toggle('on', content);
    btnSetup.classList.toggle('on', !content);
    openState['tab'] = content;
    saveOpen();
  };
  btnContent.onclick = () => showTab(true);
  btnSetup.onclick = () => showTab(false);

  tabContent.append(
    section('program', 'Chương trình & lịch phát', secProgram),
    section('scenes', 'Danh sách cảnh', secScenes, true, addSceneButton()),
    section('props', 'Thuộc tính cảnh', secProps),
  );
  tabSetup.append(
    section('portal', 'Cổng LED', secPortal),
    section('view', 'Góc nhìn', secView),
    section('interact', 'Tương tác theo vị trí người', secInteract, false),
    section('layout', 'Bố cục khung xuất', secLayout, false),
    section('output', 'Xuất ra LED', secOutput),
    section('project', 'Dự án', el('div', {},
      row('Tên dự án', nameInput),
      el('div', { class: 'btns' },
        el('button', { textContent: 'Lưu JSON', onclick: () => hooks.save() }),
        el('button', { textContent: 'Mở JSON', onclick: () => hooks.open() }),
        el('button', { textContent: 'Dự án mẫu', onclick: () => { if (confirm('Thay dự án hiện tại bằng dự án mẫu?')) hooks.loadSample(); } }),
      ),
      el('div', { class: 'btns' }, el('button', { textContent: '🎬 Xuất video MP4 mô phỏng…', onclick: () => hooks.exportVideo() })),
      el('div', { class: 'hint' }, 'Video dựng từng khung từ mô phỏng 3D (camera chọn được), kèm âm thanh, để gửi khách duyệt.'),
    )),
  );

  panel.append(
    el('h1', {}, 'LED Portal Studio ', el('small', {}, 'mô phỏng cổng LED 4 mặt')),
    el('div', { class: 'tabs' }, btnContent, btnSetup),
    tabContent, tabSetup,
    el('div', { class: 'hint keys' }, 'Space phát/dừng · ← → tua 1 s (Shift 5 s) · [ ] cảnh trước/sau · Ctrl+D nhân đôi · Delete xoá · Ctrl+Z hoàn tác · Ctrl + lăn chuột để phóng to thanh thời gian'),
  );
  showTab(openState['tab'] ?? true);

  function addSceneButton(): HTMLButtonElement {
    return el('button', { class: 'icon', textContent: '+ Thêm cảnh', onclick: () => {
      const s = makeScene('rings');
      app.project.scenes.splice(app.selected + 1, 0, s);
      app.selected = Math.min(app.selected + 1, app.project.scenes.length - 1);
      hooks.changed('scenes');
    } });
  }

  /** Hàng chọn tệp âm thanh + âm lượng (+ lặp) dùng chung cho nhạc nền và tiếng cảnh. */
  function audioRows(label: string, get: () => AudioRef | null, set: (a: AudioRef | null) => void, withLoop: boolean, onChange: () => void, rerender: () => void): Child[] {
    const cur = get();
    const pick = el('button', { textContent: cur ? 'Đổi tệp…' : 'Chọn tệp âm thanh…', onclick: () => {
      const input = el('input', { type: 'file', accept: 'audio/*' });
      input.onchange = async () => {
        const f = input.files?.[0];
        if (!f) return;
        const m = await putMedia(f);
        set({ id: m.id, name: m.name, volume: cur?.volume ?? 0.8, loop: cur?.loop ?? true });
        onChange();
        rerender();
      };
      input.click();
    } });
    const name = el('span', { class: 'hint', style: 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, cur?.name ?? 'không có');
    const rows: Child[] = [row(label, pick, name)];
    if (cur) {
      rows.push(rangeRow('Âm lượng', cur.volume, 0, 1, 0.01, (v) => { cur.volume = v; onChange(); }));
      rows.push(el('div', { class: 'row' },
        withLoop ? check('Lặp khi tệp ngắn hơn cảnh', cur.loop, (v) => { cur.loop = v; onChange(); }) : null,
        el('button', { class: 'icon', textContent: 'Bỏ âm thanh', onclick: () => { set(null); onChange(); rerender(); } })));
    }
    return rows;
  }

  // ---------- Cổng ----------
  function renderPortal(): void {
    const p = app.project.portal;
    const change = (): void => {
      app.project.layout = defaultLayout(p);
      hooks.changed('portal');
      renderPortal();
      renderLayout();
    };
    const dims = el('div', { class: 'grid2' },
      row('Lối đi thực tế', num(p.width, { step: 0.1, min: 1, max: 20 }, (v) => { p.width = v; change(); }), 'm'),
      row('Cao lối đi', num(p.height, { step: 0.1, min: 1, max: 12 }, (v) => { p.height = v; change(); }), 'm'),
      row('Dài cổng', num(p.length, { step: 0.1, min: 1, max: 40 }, (v) => { p.length = v; change(); }), 'm'),
      row('Khung mỗi bên', num(p.frameThickness, { step: 0.05, min: 0.05, max: 2 }, (v) => { p.frameThickness = v; change(); }), 'm'),
      row('Bước điểm', select(PITCHES, String(p.pitchMm), (v) => { p.pitchMm = parseFloat(v); change(); })),
      row('Mặt dựng rộng', num(p.facadeWidth, { step: 0.1, min: 1, max: 40 }, (v) => { p.facadeWidth = Math.max(v, p.width); change(); }), 'm'),
      row('Mặt dựng cao', num(p.facadeHeight, { step: 0.1, min: 1, max: 20 }, (v) => { p.facadeHeight = Math.max(v, p.height); change(); }), 'm'),
    );
    const px = screenPixels(p);
    const c = canvasSize(app.project);
    let total = 0;
    const info = el('div', { class: 'info' });
    for (const id of SCREEN_IDS) {
      total += px[id].w * px[id].h;
      info.append(el('div', {}, el('span', {}, SCREEN_LABEL[id]), el('b', {}, `${px[id].w} × ${px[id].h} px`)));
    }
    info.append(el('div', {}, el('span', {}, 'Bề rộng tổng'), el('b', {}, `${totalWidth(p).toFixed(2)} m`)));
    info.append(el('div', {}, el('span', {}, 'Khung xuất'), el('b', {}, `${c.w} × ${c.h} px`)));
    info.append(el('div', {}, el('span', {}, 'Lấp đầy khung'), el('b', {}, `${(layoutFill(app.project) * 100).toFixed(0)} %`)));
    info.append(el('div', {}, el('span', {}, 'Tổng điểm ảnh'), el('b', {}, `${(total / 1e6).toFixed(2)} Mpx`)));
    secPortal.replaceChildren(dims,
      el('div', { class: 'hint' }, 'Theo bản vẽ: bề rộng TỔNG 4,0 m = lối đi thực tế 3,0 m + khung thép và tấm LED 0,5 m mỗi bên. Mặt dựng ôm quanh lối vào, chừa lỗ đúng bằng lối đi.'),
      info);
  }

  // ---------- Góc nhìn ----------
  function renderView(): void {
    const viewBtns = el('div', { class: 'btns' });
    const b3d = el('button', { textContent: 'Mô phỏng 3D' });
    const bFlat = el('button', { textContent: 'Bản đồ pixel' });
    const sync = (): void => { b3d.classList.toggle('on', app.view === 'preview'); bFlat.classList.toggle('on', app.view === 'flat'); };
    b3d.onclick = () => { app.view = 'preview'; sync(); hooks.changed('view'); };
    bFlat.onclick = () => { app.view = 'flat'; sync(); hooks.changed('view'); };
    sync();
    viewBtns.append(b3d, bFlat);
    const cam = select(Object.entries(CAMERA_LABEL) as [CameraPreset, string][], app.camera, (v) => { app.camera = v; hooks.changed('view'); });
    const scale = select([['0.25', 'Nhẹ (¼)'], ['0.5', 'Vừa (½)'], ['1', 'Đủ nét (1:1)']], String(app.renderScale), (v) => { app.renderScale = parseFloat(v); hooks.changed('view'); });
    secView.replaceChildren(
      viewBtns,
      row('Camera', cam),
      row('Chất lượng', scale),
      el('div', { class: 'row wrap' },
        check('Người mẫu', app.showPeople, (v) => { app.showPeople = v; hooks.changed('view'); }),
        check('Sàn phản chiếu', app.reflection, (v) => { app.reflection = v; hooks.changed('view'); }),
        check('Robot (đón khách + đi lại)', app.showRobot, (v) => { app.showRobot = v; hooks.changed('view'); }),
      ),
    );
  }

  // ---------- Danh sách cảnh ----------
  const sceneCards: HTMLElement[] = [];
  function renderScenes(): void {
    sceneCards.length = 0;
    const list = app.project.scenes;
    const frag = document.createDocumentFragment();
    list.forEach((s, i) => {
      const card = el('div', { class: 'scene' + (i === app.selected ? ' active' : '') });
      card.style.setProperty('--h', String(hueOf(i)));
      const name = el('input', { type: 'text', value: s.name, placeholder: effectName(s.effect) });
      name.onchange = () => { s.name = name.value; hooks.changed('scene'); timeline.refresh(); };
      const move = (d: number): void => {
        const j = i + d;
        if (j < 0 || j >= list.length) return;
        [list[i], list[j]] = [list[j], list[i]];
        app.selected = j;
        hooks.changed('scenes');
      };
      const head = el('div', { class: 'head' },
        el('b', {}, String(i + 1)),
        el('span', { class: 'swatch', style: `background:hsl(${hueOf(i)} 70% 58%)` }),
        name,
        el('button', { class: 'icon', title: 'Lên', textContent: '▲', onclick: () => move(-1) }),
        el('button', { class: 'icon', title: 'Xuống', textContent: '▼', onclick: () => move(1) }),
        el('button', { class: 'icon', title: 'Nhân đôi', textContent: '⧉', onclick: () => {
          list.splice(i + 1, 0, { ...structuredClone(s), id: makeScene('x').id });
          app.selected = i + 1;
          hooks.changed('scenes');
        } }),
        el('button', { class: 'icon', title: 'Xoá', textContent: '✕', onclick: () => {
          list.splice(i, 1);
          app.selected = Math.max(0, Math.min(app.selected, list.length - 1));
          hooks.changed('scenes');
        } }),
      );
      const src = select(SOURCE_OPTIONS, s.effect, (v) => {
        s.effect = v;
        s.params = {};
        hooks.changed('scene');
        renderProps();
        timeline.refresh();
      });
      const dur = num(s.duration, { step: 0.5, min: 0.5, max: 600 }, (v) => { s.duration = v; hooks.changed('scene'); timeline.refresh(); });
      dur.classList.add('dur');
      const tr = select(Object.entries(TRANSITION_LABEL) as [TransitionType, string][], s.transition, (v) => { s.transition = v; hooks.changed('scene'); timeline.refresh(); });
      const trd = num(s.transitionDuration, { step: 0.1, min: 0, max: 30 }, (v) => { s.transitionDuration = v; hooks.changed('scene'); timeline.refresh(); });
      trd.classList.add('dur');
      card.append(head, el('div', { class: 'sub' }, 'Nguồn', src, dur, 's'), el('div', { class: 'sub' }, 'Chuyển', tr, trd, 's'));
      card.onclick = (e) => {
        const t = e.target as HTMLElement;
        if (['INPUT', 'SELECT', 'BUTTON', 'OPTION'].includes(t.tagName)) return;
        app.selected = i;
        hooks.seek(sceneStart(app.project, i));
        renderScenes();
        renderProps();
      };
      sceneCards.push(card);
      frag.append(card);
    });
    if (list.length === 0) frag.append(el('div', { class: 'hint' }, 'Chưa có cảnh nào. Bấm "+ Thêm cảnh".'));
    secScenes.replaceChildren(frag);
  }

  // ---------- Thuộc tính cảnh ----------
  function renderProps(): void {
    const s: Scene | undefined = app.project.scenes[app.selected];
    if (!s) { secProps.replaceChildren(el('div', { class: 'hint' }, 'Chọn một cảnh để chỉnh.')); return; }
    const parts: Child[] = [];
    const change = (): void => hooks.changed('scene');
    if (s.effect === MEDIA_EFFECT_ID) {
      const nameSpan = el('span', { class: 'hint', style: 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, s.media?.name ?? 'chưa chọn tệp');
      const pick = el('button', { textContent: 'Chọn ảnh/video…', onclick: () => {
        const input = el('input', { type: 'file', accept: 'image/*,video/*' });
        input.onchange = async () => {
          const f = input.files?.[0];
          if (!f) return;
          const m = await putMedia(f);
          if (m.kind === 'audio') { alert('Đây là tệp âm thanh; hãy nạp ở mục "Âm thanh cảnh" bên dưới.'); return; }
          s.media = { id: m.id, name: m.name, kind: m.kind, mapping: s.media?.mapping ?? 'unfold', fit: s.media?.fit ?? 'cover' };
          change();
          renderProps();
        };
        input.click();
      } });
      parts.push(row('Tệp', pick, nameSpan));
      const m = s.media ?? { mapping: 'unfold' as MediaMapping, fit: 'cover' as MediaFit };
      parts.push(row('Dán lên', select(Object.entries(MAPPING_LABEL) as [MediaMapping, string][], m.mapping, (v) => { if (s.media) { s.media.mapping = v; change(); } })));
      parts.push(row('Tỉ lệ', select(Object.entries(FIT_LABEL) as [MediaFit, string][], m.fit, (v) => { if (s.media) { s.media.fit = v; change(); } })));
      parts.push(el('div', { class: 'hint' }, 'Trải phẳng chữ U: một tệp tỉ lệ (2H+W)/L, trần ở giữa, hai tường gập xuống hai bên. Mặt dựng nhận bản riêng.'));
    }
    const values = resolveParams(s.effect, s.params);
    for (const p of paramsFor(s.effect)) {
      if (p.type === 'color') {
        const c = el('input', { type: 'color', value: String(values[p.key]) });
        c.oninput = () => { s.params[p.key] = c.value; change(); };
        parts.push(row(p.label, c));
      } else {
        parts.push(rangeRow(p.label, Number(values[p.key]), p.min ?? 0, p.max ?? 1, p.step ?? 0.01, (v) => { s.params[p.key] = v; change(); }));
      }
    }
    // phản ứng theo người
    const ia = s.interact;
    const numericParams = paramsFor(s.effect).filter((p) => p.type === 'range');
    const driveOptions: [string, string][] = [['', 'Không'], ...numericParams.map((p) => [p.key, p.label] as [string, string])];
    const iaColor = el('input', { type: 'color', value: ia.color });
    iaColor.oninput = () => { ia.color = iaColor.value; change(); };
    parts.push(
      el('h2', {}, 'Phản ứng theo người'),
      el('div', { class: 'row' },
        el('label', {}, 'Kiểu'),
        select(Object.entries(INTERACT_LABEL) as [InteractMode, string][], ia.mode, (v) => { ia.mode = v; change(); renderProps(); }),
        iaColor),
      ia.mode !== 'none' ? rangeRow('Bán kính (m)', ia.radius, 0.3, 6, 0.1, (v) => { ia.radius = v; change(); }) : null,
      ia.mode !== 'none' ? rangeRow('Độ mạnh', ia.intensity, 0, 2, 0.05, (v) => { ia.intensity = v; change(); }) : null,
      ia.mode === 'ripple' ? rangeRow('Tốc độ lan (m/s)', ia.speed, 0.2, 5, 0.1, (v) => { ia.speed = v; change(); }) : null,
      row('Lái tham số', select(driveOptions, driveOptions.some((o) => o[0] === ia.driveParam) ? ia.driveParam : '', (v) => { ia.driveParam = v; change(); renderProps(); })),
      ia.driveParam ? el('div', { class: 'row' }, el('label', {}, 'Lối vào → cuối'),
        num(ia.driveFrom, { step: 0.1 }, (v) => { ia.driveFrom = v; change(); }), '→',
        num(ia.driveTo, { step: 0.1 }, (v) => { ia.driveTo = v; change(); })) : null,
      el('div', { class: 'hint' }, 'Chỉ có tác dụng khi bật "Tương tác theo vị trí người". "Lái tham số": giá trị đi từ mức lối vào tới mức cuối cổng theo người đi xa nhất.'),
    );

    // lớp phủ: chữ nhiều dòng / logo / mốc thời gian
    const ovs = s.overlays;
    const addOv = (kind: OverlayKind): void => { ovs.push(makeOverlay(kind)); change(); renderProps(); };
    parts.push(
      el('h2', {}, 'Lớp phủ: chữ, logo, mốc thời gian'),
      el('div', { class: 'btns' },
        el('button', { textContent: '+ Chữ', onclick: () => addOv('text') }),
        el('button', { textContent: '+ Logo / ảnh', onclick: () => addOv('image') }),
        el('button', { textContent: '+ Dãy ảnh', onclick: () => addOv('gallery') }),
        el('button', { textContent: '+ Mốc thời gian', onclick: () => addOv('timeline') })),
    );
    ovs.forEach((o, i) => {
      const card = el('div', { class: 'scene' });
      const head = el('div', { class: 'head' }, el('b', {}, String(i + 1)), el('span', { style: 'flex:1' }, OVERLAY_KIND_LABEL[o.kind]),
        el('button', { class: 'icon', textContent: '▲', onclick: () => { if (i > 0) { [ovs[i - 1], ovs[i]] = [ovs[i], ovs[i - 1]]; change(); renderProps(); } } }),
        el('button', { class: 'icon', textContent: '▼', onclick: () => { if (i < ovs.length - 1) { [ovs[i + 1], ovs[i]] = [ovs[i], ovs[i + 1]]; change(); renderProps(); } } }),
        el('button', { class: 'icon', textContent: '✕', onclick: () => { ovs.splice(i, 1); change(); renderProps(); } }));
      const screens = el('div', { class: 'row wrap' });
      for (const id of SCREEN_IDS) screens.append(check(SCREEN_LABEL[id], o.screens[id], (v) => { o.screens[id] = v; change(); renderProps(); }));
      card.append(head, screens);
      const zoneLabels = o.screens.facade && !o.screens.left && !o.screens.right && !o.screens.ceiling ? ZONE_LABEL : WALL_ZONE_LABEL;
      card.append(row('Vùng', select(Object.entries(zoneLabels) as [FacadeZone, string][], o.zone, (v) => { o.zone = v; change(); })));
      if (o.kind === 'text') {
        const ta = el('textarea', { value: o.text, rows: 3 });
        ta.oninput = () => { o.text = ta.value; change(); };
        const col = el('input', { type: 'color', value: o.color });
        col.oninput = () => { o.color = col.value; change(); };
        card.append(row('Nội dung', ta),
          el('div', { class: 'row' }, el('label', {}, 'Màu / kiểu'), col,
            select<'bold' | 'normal'>([['bold', 'Đậm'], ['normal', 'Thường']], o.weight, (v) => { o.weight = v; change(); }),
            select<'left' | 'center' | 'right'>([['left', 'Trái'], ['center', 'Giữa'], ['right', 'Phải']], o.align, (v) => { o.align = v; change(); })));
      } else if (o.kind === 'image') {
        const name = el('span', { class: 'hint', style: 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, o.mediaName || 'chưa chọn');
        const builtin = select<string>([['', 'Ảnh có sẵn…'], ...BUILTIN_IMAGES], BUILTIN_IMAGES.some((b) => b[0] === o.mediaId) ? o.mediaId : '', (v) => {
          if (!v) return; o.mediaId = v; o.mediaName = BUILTIN_IMAGES.find((b) => b[0] === v)?.[1] ?? v; change(); renderProps();
        });
        const acc = el('input', { type: 'color', value: o.accent });
        acc.oninput = () => { o.accent = acc.value; change(); };
        card.append(el('div', { class: 'row' }, el('label', {}, 'Ảnh'), builtin,
          el('button', { class: 'icon', textContent: 'Chọn ảnh…', onclick: () => {
            const input = el('input', { type: 'file', accept: 'image/png,image/webp,image/jpeg' });
            input.onchange = async () => { const f = input.files?.[0]; if (!f) return; const m = await putMedia(f); o.mediaId = m.id; o.mediaName = m.name; change(); renderProps(); };
            input.click();
          } })), row('Đang dùng', name),
          el('div', { class: 'row' }, check('Khung sáng', o.frame, (v) => { o.frame = v; change(); }), acc));
      } else if (o.kind === 'gallery') {
        const list = el('div');
        o.items.forEach((it, j) => {
          const cap = el('input', { type: 'text', value: it.caption, placeholder: 'chú thích' });
          cap.oninput = () => { it.caption = cap.value; change(); };
          list.append(el('div', { class: 'row' },
            el('span', { class: 'hint', style: 'flex:0 0 90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap', title: it.name }, it.name),
            cap,
            el('button', { class: 'icon', textContent: '✕', onclick: () => { o.items.splice(j, 1); change(); renderProps(); } })));
        });
        const builtin = select<string>([['', '+ Ảnh có sẵn…'], ...BUILTIN_IMAGES.filter((b) => b[0] !== 'builtin:dau-logo')], '', (v) => {
          if (!v) return; o.items.push({ mediaId: v, name: BUILTIN_IMAGES.find((b) => b[0] === v)?.[1] ?? v, caption: '' }); change(); renderProps();
        });
        const col = el('input', { type: 'color', value: o.color });
        col.oninput = () => { o.color = col.value; change(); };
        const acc = el('input', { type: 'color', value: o.accent });
        acc.oninput = () => { o.accent = acc.value; change(); };
        card.append(list,
          el('div', { class: 'row' }, builtin, el('button', { class: 'icon', textContent: '+ Chọn ảnh…', onclick: () => {
            const input = el('input', { type: 'file', accept: 'image/png,image/webp,image/jpeg', multiple: true });
            input.onchange = async () => {
              for (const f of Array.from(input.files ?? [])) { const m = await putMedia(f); o.items.push({ mediaId: m.id, name: m.name, caption: '' }); }
              change(); renderProps();
            };
            input.click();
          } })),
          el('div', { class: 'row' }, el('label', {}, 'Chữ / khung'), col, acc, check('Khung sáng', o.frame, (v) => { o.frame = v; change(); })));
      } else {
        const ta = el('textarea', { value: o.milestones, rows: 4 });
        ta.oninput = () => { o.milestones = ta.value; change(); };
        const col = el('input', { type: 'color', value: o.color });
        col.oninput = () => { o.color = col.value; change(); };
        const acc = el('input', { type: 'color', value: o.accent });
        acc.oninput = () => { o.accent = acc.value; change(); };
        card.append(row('Mỗi dòng: năm + nhãn', ta), el('div', { class: 'row' }, el('label', {}, 'Màu chữ / đường'), col, acc));
      }
      card.append(
        rangeRow('Cỡ (theo vùng)', o.size, 0.05, 1, 0.01, (v) => { o.size = v; change(); }),
        rangeRow('Ngang', o.x, 0, 1, 0.01, (v) => { o.x = v; change(); }),
        rangeRow('Dọc', o.y, 0, 1, 0.01, (v) => { o.y = v; change(); }),
        rangeRow('Chạy ngang', o.speed, 0, 0.6, 0.01, (v) => { o.speed = v; change(); }),
        rangeRow('Độ mờ', o.opacity, 0, 1, 0.01, (v) => { o.opacity = v; change(); }),
      );
      parts.push(card);
    });
    if (ovs.length) parts.push(el('div', { class: 'hint' }, 'Cỡ tính theo chiều cao vùng; "Chạy ngang" > 0 thì lớp chạy từ phải sang trái trong vùng. Ảnh PNG nền trong suốt cho logo.'));

    // tiếng riêng của cảnh
    parts.push(el('h2', {}, 'Âm thanh cảnh'), ...audioRows('Tệp', () => s.audio, (a) => { s.audio = a; }, true, change, renderProps),
      el('div', { class: 'hint' }, 'Bắt đầu cùng cảnh; khi chuyển cảnh, tiếng cảnh cũ nhỏ dần, cảnh mới lớn dần. Tiếng phát từ máy chạy bảng điều khiển.'));

    // chữ
    const tx = s.text;
    const txt = el('input', { type: 'text', value: tx.text });
    txt.oninput = () => { tx.text = txt.value; change(); };
    const col = el('input', { type: 'color', value: tx.color });
    col.oninput = () => { tx.color = col.value; change(); };
    const screens = el('div', { class: 'row wrap' });
    for (const id of SCREEN_IDS) screens.append(check(SCREEN_LABEL[id], tx.screens[id], (v) => { tx.screens[id] = v; change(); }));
    parts.push(
      el('h2', {}, 'Chữ trên cảnh'),
      el('div', { class: 'row' }, check('Hiện chữ', tx.enabled, (v) => { tx.enabled = v; change(); }), col),
      row('Nội dung', txt),
      rangeRow('Cỡ chữ', tx.size, 0.08, 1, 0.01, (v) => { tx.size = v; change(); }),
      rangeRow('Tốc độ chạy', tx.speed, 0, 1.5, 0.01, (v) => { tx.speed = v; change(); }),
      screens,
      el('div', { class: 'hint' }, 'Tốc độ 0 = đứng yên, căn giữa. Trên mặt dựng chữ nằm ở dải phía trên lối vào.'),
    );
    secProps.replaceChildren(...parts.filter((x): x is Node => !!x));
  }

  // ---------- Bố cục ----------
  function renderLayout(): void {
    const px = screenPixels(app.project.portal);
    const rows: Child[] = [];
    for (const id of SCREEN_IDS) {
      const r = app.project.layout[id];
      rows.push(row(SCREEN_LABEL[id],
        'x', num(r.x, { step: 1, min: 0, max: 16384 }, (v) => { r.x = Math.round(v); hooks.changed('layout'); renderPortal(); }),
        'y', num(r.y, { step: 1, min: 0, max: 16384 }, (v) => { r.y = Math.round(v); hooks.changed('layout'); renderPortal(); }),
        el('span', { class: 'hint' }, `${px[id].w}×${px[id].h}`)));
    }
    const details = el('details', {}, el('summary', { class: 'hint' }, 'Vị trí từng màn trong khung xuất (px, gốc trên-trái)'), ...rows,
      el('div', { class: 'btns' }, el('button', { textContent: 'Xếp gọn tự động', onclick: () => { app.project.layout = defaultLayout(app.project.portal); hooks.changed('layout'); renderLayout(); renderPortal(); } })),
      el('div', { class: 'hint' }, 'Xếp gọn = dồn 4 màn vào khung nhỏ nhất có thể, bớt pixel thừa cho bộ xử lý LED. Muốn khớp cách cắt vùng của bên kỹ thuật thì nhập tay x, y từng màn.'));
    secLayout.replaceChildren(details);
  }

  // ---------- Chương trình & lịch phát ----------
  const scheduleStatus = el('div', { class: 'track-status' });
  function renderProgram(): void {
    const p = app.project;
    storeActiveProgram(p);
    const cur = p.programs.find((x) => x.id === p.activeProgram)!;
    const progOptions = (): [string, string][] => p.programs.map((x) => [x.id, x.name] as [string, string]);
    const nameInput = el('input', { type: 'text', value: cur.name });
    nameInput.onchange = () => { cur.name = nameInput.value.trim() || cur.name; hooks.changed('scene'); renderProgram(); };
    const progSel = select(progOptions(), p.activeProgram, (v) => hooks.playProgram(v));
    const btns = el('div', { class: 'btns' },
      el('button', { textContent: '+ Mới', onclick: () => {
        const np = addProgram(p, `Chương trình ${p.programs.length + 1}`, [makeScene('nebula')]);
        hooks.playProgram(np.id);
      } }),
      el('button', { textContent: 'Nhân đôi', onclick: () => {
        const np = addProgram(p, `${cur.name} (bản sao)`, structuredClone(p.scenes).map((s) => ({ ...s, id: uid() })), p.loop);
        hooks.playProgram(np.id);
      } }),
      el('button', { textContent: 'Xoá', disabled: p.programs.length <= 1, onclick: () => {
        if (!confirm(`Xoá chương trình "${cur.name}"?`)) return;
        const idx = p.programs.findIndex((x) => x.id === cur.id);
        p.programs.splice(idx, 1);
        for (const r of p.schedule.rules) if (r.programId === cur.id) r.programId = p.programs[0].id;
        if (p.schedule.offProgram === cur.id) p.schedule.offProgram = '';
        // ép chuyển: activeProgram không còn -> đặt tạm rồi switch
        p.activeProgram = '';
        hooks.playProgram(p.programs[Math.max(0, idx - 1)].id);
      } }),
    );

    // ---- lịch ----
    const sc = p.schedule;
    const change = (): void => hooks.changed('scene');
    const rules = el('div');
    sc.rules.forEach((r, i) => {
      const days = el('div', { class: 'row wrap', style: 'gap:3px' });
      DAY_LABEL.forEach((lab, di) => {
        const b = el('button', { class: 'icon' + (r.days[di] ? ' on' : ''), textContent: lab, onclick: () => { r.days[di] = !r.days[di]; b.classList.toggle('on', r.days[di]); change(); } });
        days.append(b);
      });
      const start = el('input', { type: 'time', value: r.start });
      start.onchange = () => { r.start = start.value || r.start; change(); };
      const end = el('input', { type: 'time', value: r.end });
      end.onchange = () => { r.end = end.value || r.end; change(); };
      const prog = select(progOptions(), p.programs.some((x) => x.id === r.programId) ? r.programId : p.programs[0].id, (v) => { r.programId = v; change(); });
      const card = el('div', { class: 'scene' },
        el('div', { class: 'head' }, el('b', {}, String(i + 1)), start, '→', end,
          el('button', { class: 'icon', title: 'Lên', textContent: '▲', onclick: () => { if (i > 0) { [sc.rules[i - 1], sc.rules[i]] = [sc.rules[i], sc.rules[i - 1]]; change(); renderProgram(); } } }),
          el('button', { class: 'icon', title: 'Xoá', textContent: '✕', onclick: () => { sc.rules.splice(i, 1); change(); renderProgram(); } })),
        days,
        el('div', { class: 'sub' }, 'Phát', prog));
      rules.append(card);
    });
    const offSel = select<string>([['black', 'Tắt màn (đen)'], ...progOptions().map(([id, n]) => [`p:${id}`, `Phát: ${n}`] as [string, string])],
      sc.offMode === 'program' && sc.offProgram ? `p:${sc.offProgram}` : 'black',
      (v) => { if (v === 'black') { sc.offMode = 'black'; sc.offProgram = ''; } else { sc.offMode = 'program'; sc.offProgram = v.slice(2); } change(); });

    const muteBtn = el('button', { class: 'icon' + (app.muted ? ' on' : ''), textContent: app.muted ? 'Đang tắt tiếng' : 'Tắt tiếng', onclick: () => { app.muted = !app.muted; renderProgram(); } });
    secProgram.replaceChildren(el('div', {},
      row('Đang phát', progSel),
      row('Tên', nameInput),
      btns,
      el('div', { class: 'hint' }, 'Mỗi chương trình có danh sách cảnh riêng (bên dưới). Đổi chương trình là phát từ đầu.'),
      ...audioRows('Nhạc nền', () => p.music, (a) => { p.music = a; }, false, change, renderProgram),
      el('div', { class: 'row' }, el('label', {}, 'Âm lượng chung'),
        (() => { const i = el('input', { type: 'range', min: '0', max: '1', step: '0.01', value: String(app.masterVolume) }); i.oninput = () => { app.masterVolume = parseFloat(i.value); }; return i; })(),
        muteBtn),
      el('div', { class: 'row' }, check('Bật lịch phát theo giờ', sc.enabled, (v) => { sc.enabled = v; change(); renderProgram(); })),
      rules,
      el('div', { class: 'btns' }, el('button', { textContent: '+ Thêm khung giờ', onclick: () => { sc.rules.push(makeRule(p.activeProgram)); change(); renderProgram(); } })),
      row('Ngoài giờ', offSel),
      el('div', { class: 'hint' }, 'Khung giờ trên có ưu tiên. Giờ kết thúc nhỏ hơn bắt đầu = qua đêm. Lịch chỉ đổi khi tới mốc giờ, giữa chừng bạn vẫn chọn tay được.'),
      scheduleStatus,
    ));
  }

  // ---------- Tương tác theo vị trí người ----------
  const trackStatus = el('div', { class: 'track-status' });
  function renderInteraction(): void {
    const ia = app.project.interaction;
    const change = (): void => hooks.changed('interaction');
    const parts: Child[] = [
      el('div', { class: 'row' }, check('Bật tương tác', ia.enabled, (v) => { ia.enabled = v; change(); renderInteraction(); })),
      row('Nguồn vị trí', select(Object.entries(TRACK_SOURCE_LABEL) as [TrackSource, string][], ia.source, (v) => { ia.source = v; change(); renderInteraction(); })),
    ];
    if (ia.source === 'sim') {
      parts.push(
        row('Người ảo tự đi', num(ia.sim.walkers, { step: 1, min: 0, max: 6 }, (v) => { ia.sim.walkers = v; change(); })),
        el('div', { class: 'hint' }, 'Shift + kéo chuột trên sàn 3D để đặt thêm một người và di chuyển.'),
        el('div', { class: 'btns' }, el('button', { textContent: 'Xoá người đặt tay', onclick: () => hooks.clearManual() })),
      );
    } else if (ia.source === 'ws') {
      const url = el('input', { type: 'text', value: ia.wsUrl });
      url.onchange = () => { ia.wsUrl = url.value.trim(); change(); };
      parts.push(
        row('Địa chỉ', url),
        el('div', { class: 'hint' }, 'Hệ tracking gửi JSON mỗi khung: {"persons":[{"id":1,"x":0.4,"d":2.5}]} — x ngang (m, 0 = tim cổng), d độ sâu (m, 0 = lối vào). id tuỳ chọn.'),
      );
    } else {
      const devSel = select<string>([['', 'Camera mặc định']], ia.camera.deviceId, (v) => { ia.camera.deviceId = v; change(); });
      void listCameras().then((cams) => {
        for (const c of cams) devSel.append(el('option', { value: c.id, textContent: c.label }));
        devSel.value = cams.some((c) => c.id === ia.camera.deviceId) ? ia.camera.deviceId : '';
      });
      parts.push(
        row('Camera', devSel),
        el('div', { class: 'row' }, check('Lật ngang ảnh', ia.camera.flipX, (v) => { ia.camera.flipX = v; change(); })),
        rangeRow('Ngưỡng nhận', ia.camera.minScore, 0.1, 0.9, 0.05, (v) => { ia.camera.minScore = v; }),
        el('div', { class: 'btns' },
          el('button', { textContent: ia.camera.calib ? 'Hiệu chỉnh lại sàn…' : '⚠ Hiệu chỉnh sàn…', onclick: () => hooks.calibrate() }),
          el('button', { textContent: 'Áp ngưỡng', onclick: () => change() })),
        el('div', { class: 'hint' }, ia.camera.calib
          ? 'Đã hiệu chỉnh 4 điểm sàn. Nếu dời camera phải hiệu chỉnh lại.'
          : 'Chưa hiệu chỉnh: camera nhận diện được nhưng chưa biết người đứng ở đâu trên sàn.'),
      );
    }
    parts.push(trackStatus);
    secInteract.replaceChildren(el('div', {}, ...parts));
  }

  // ---------- Xuất ra LED ----------
  interface OutForm {
    displayId: number | null;
    mode: 'full' | 'rect';
    rect: { x: number; y: number; width: number; height: number };
    source: 'all' | ScreenId | 'custom';
    src: { x: number; y: number; w: number; h: number };
    fit: boolean;
  }
  const OUT_KEY = 'ledportal.output.form.v1';
  const outForm: OutForm = (() => {
    const def: OutForm = { displayId: null, mode: 'full', rect: { x: 0, y: 0, width: 1920, height: 1080 }, source: 'all', src: { x: 0, y: 0, w: 1920, h: 1080 }, fit: false };
    try { return { ...def, ...JSON.parse(localStorage.getItem(OUT_KEY) ?? '{}') }; } catch { return def; }
  })();
  const saveOutForm = (): void => { try { localStorage.setItem(OUT_KEY, JSON.stringify(outForm)); } catch { /* bỏ qua */ } };

  function sourceRegion(): { x: number; y: number; w: number; h: number } | undefined {
    if (outForm.source === 'all') return undefined;
    if (outForm.source === 'custom') return { ...outForm.src };
    const px = screenPixels(app.project.portal)[outForm.source];
    const l = app.project.layout[outForm.source];
    return { x: l.x, y: l.y, w: px.w, h: px.h };
  }
  function outputOpts(): OutputOpts {
    return {
      displayId: outForm.displayId ?? -1,
      rect: outForm.mode === 'rect' ? { ...outForm.rect } : undefined,
      src: sourceRegion(),
      fit: outForm.fit,
      label: outForm.source === 'all' ? 'Toàn bộ' : outForm.source === 'custom' ? 'Tuỳ chỉnh' : SCREEN_LABEL[outForm.source],
    };
  }
  function outputUrl(): string {
    const q = new URLSearchParams({ output: '1' });
    const s = sourceRegion();
    if (s) q.set('src', `${s.x},${s.y},${s.w},${s.h}`);
    if (outForm.fit) q.set('fit', '1');
    return `${location.pathname}?${q.toString()}`;
  }

  let outListening = false;
  function renderOutput(): void {
    const bridge = window.ledPortal;
    const c = canvasSize(app.project);
    const sourceRow = row('Vùng nguồn', select<OutForm['source']>(
      [['all', `Toàn bộ khung (${c.w}×${c.h})`], ...SCREEN_IDS.map((id) => [id, SCREEN_LABEL[id]] as [ScreenId, string]), ['custom', 'Tuỳ chỉnh…']],
      outForm.source, (v) => { outForm.source = v; saveOutForm(); renderOutput(); }));
    const srcRow = outForm.source === 'custom'
      ? el('div', { class: 'row wrap' }, 'x', num(outForm.src.x, { step: 1, min: 0 }, (v) => { outForm.src.x = v; saveOutForm(); }),
        'y', num(outForm.src.y, { step: 1, min: 0 }, (v) => { outForm.src.y = v; saveOutForm(); }),
        'rộng', num(outForm.src.w, { step: 1, min: 1 }, (v) => { outForm.src.w = v; saveOutForm(); }),
        'cao', num(outForm.src.h, { step: 1, min: 1 }, (v) => { outForm.src.h = v; saveOutForm(); }))
      : null;
    const fitRow = el('div', { class: 'row' }, check('Co vừa cửa sổ (mặc định 1:1, góc trên-trái)', outForm.fit, (v) => { outForm.fit = v; saveOutForm(); }));

    if (!bridge) {
      secOutput.replaceChildren(el('div', {},
        el('div', { class: 'hint' }, 'Đang chạy trong trình duyệt: chỉ mở được TAB xuất thử. Bản Electron (npm run app) mới mở được cửa sổ phủ kín màn hình LED.'),
        sourceRow, srcRow, fitRow,
        el('div', { class: 'btns' }, el('button', { textContent: 'Mở tab xuất thử', onclick: () => window.open(outputUrl(), '_blank') })),
      ));
      return;
    }
    if (!outListening) {
      outListening = true;
      bridge.onDisplaysChanged(() => renderOutput());
      bridge.onOutputsChanged(() => renderOutput());
    }
    void (async () => {
      const displays = await bridge.listDisplays();
      const outputs = await bridge.listOutputs();
      if (outForm.displayId === null || !displays.some((d) => d.id === outForm.displayId)) outForm.displayId = displays.find((d) => !d.primary)?.id ?? displays[0]?.id ?? null;
      const dispSel = select(displays.map((d) => [String(d.id), d.label] as [string, string]), String(outForm.displayId), (v) => { outForm.displayId = Number(v); saveOutForm(); });
      const modeSel = select<OutForm['mode']>([['full', 'Phủ kín màn hình'], ['rect', 'Vùng tuỳ chỉnh…']], outForm.mode, (v) => { outForm.mode = v; saveOutForm(); renderOutput(); });
      const rectRow = outForm.mode === 'rect'
        ? el('div', { class: 'row wrap' }, 'x', num(outForm.rect.x, { step: 1, min: 0 }, (v) => { outForm.rect.x = v; saveOutForm(); }),
          'y', num(outForm.rect.y, { step: 1, min: 0 }, (v) => { outForm.rect.y = v; saveOutForm(); }),
          'rộng', num(outForm.rect.width, { step: 1, min: 64 }, (v) => { outForm.rect.width = v; saveOutForm(); }),
          'cao', num(outForm.rect.height, { step: 1, min: 64 }, (v) => { outForm.rect.height = v; saveOutForm(); }))
        : null;
      // ---- tự chạy ----
      const auto = loadAutostart();
      const isPackaged = await bridge.isPackaged();
      const loginOn = await bridge.getLoginItem();
      const savedInfo = el('span', { class: 'hint' }, auto.outputs.length ? `Đã lưu ${auto.outputs.length} cửa sổ` : 'Chưa lưu bộ nào');
      const autoBox = el('div', { class: 'info' },
        el('div', { class: 'btns' },
          el('button', { textContent: 'Lưu bộ cửa sổ hiện tại', disabled: outputs.length === 0, onclick: () => {
            const saved: SavedOutput[] = outputs.map((o) => ({
              displayId: o.displayId, displayIndex: Math.max(0, displays.findIndex((d) => d.id === o.displayId)),
              rect: o.rect, src: o.src, fit: o.fit, label: o.label,
            }));
            saveAutostart({ ...loadAutostart(), outputs: saved });
            renderOutput();
          } }),
          el('button', { textContent: 'Mở bộ đã lưu', disabled: auto.outputs.length === 0, onclick: () => void openSavedOutputs(bridge, loadAutostart().outputs) }),
        ),
        savedInfo,
        el('div', { class: 'row' }, check('Tự mở bộ đã lưu khi khởi động app', auto.openOnStart, (v) => saveAutostart({ ...loadAutostart(), openOnStart: v }))),
        el('div', { class: 'row' }, check('Chạy app khi đăng nhập Windows', loginOn, (v) => void bridge.setLoginItem(v).then(() => renderOutput()))),
        el('div', { class: 'hint' }, isPackaged
          ? 'Tại hiện trường: bật cả hai ô, mở đúng các cửa sổ xuất rồi bấm "Lưu bộ cửa sổ hiện tại". Bật máy là LED tự chạy, không cần bấm gì.'
          : 'Đang chạy bản dev: "Chạy khi đăng nhập" chỉ có tác dụng với bản đã cài (npm run dist).'),
      );

      const list = el('div');
      for (const o of outputs) {
        const d = displays.find((x) => x.id === o.displayId);
        const where = o.rect ? `${o.rect.width}×${o.rect.height} @ ${o.rect.x},${o.rect.y}` : 'phủ kín';
        list.append(el('div', { class: 'out-item' },
          el('span', {}, `#${o.id} ${o.label ?? ''} → ${d?.label ?? 'màn hình ?'} · ${where}`),
          el('button', { class: 'icon', textContent: 'Đóng', onclick: () => void bridge.closeOutput(o.id) })));
      }
      secOutput.replaceChildren(el('div', {},
        row('Màn hình', dispSel),
        row('Cửa sổ', modeSel), rectRow,
        sourceRow, srcRow, fitRow,
        el('div', { class: 'btns' },
          el('button', { textContent: '▶ Mở cửa sổ xuất', onclick: () => void bridge.openOutput(outputOpts()) }),
          outputs.length ? el('button', { textContent: 'Đóng tất cả', onclick: () => void bridge.closeAllOutputs() }) : null),
        outputs.length ? list : el('div', { class: 'hint' }, 'Chưa có cửa sổ xuất nào. Esc trên cửa sổ xuất để đóng nó.'),
        el('h2', {}, 'Tự chạy khi bật máy'),
        autoBox,
      ));
    })();
  }

  // ---------- Thanh thời gian ----------
  const tlHost: TimelineHost = {
    select: (k) => { app.selected = k; renderScenes(); renderProps(); },
    scenesChanged: () => { hooks.changed('scenes'); timeline.refresh(); },
    sceneChanged: () => { hooks.changed('scene'); },
    seek: (t) => hooks.seek(t),
    play: (on) => hooks.play(on),
  };
  const timeline = buildTimeline(app, tlHost);

  let lastIndex = -1;
  let lastTrack = '';
  let lastSched = '';
  function tick(cursor: Cursor | null): void {
    timeline.tick();
    const tr = app.project.interaction.enabled
      ? `${app.track.status} · <b>${app.track.count}</b> người${app.track.fps ? ` · ${app.track.fps} fps nhận diện` : ''}`
      : 'Tương tác đang tắt.';
    if (tr !== lastTrack) { trackStatus.innerHTML = tr; lastTrack = tr; }
    const now = new Date();
    const sched = `Bây giờ ${DAY_LABEL[(now.getDay() + 6) % 7]} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} · ${
      app.project.schedule.enabled ? `lịch: <b>${app.scheduleNote || '…'}</b>` : 'lịch đang tắt'}${app.blackout ? ' · <b>ĐANG TẮT MÀN</b>' : ''}`;
    if (sched !== lastSched) { scheduleStatus.innerHTML = sched; lastSched = sched; }
    const idx = cursor?.index ?? -1;
    if (idx !== lastIndex) {
      sceneCards.forEach((c, i) => c.classList.toggle('playing', i === idx));
      lastIndex = idx;
    }
  }

  const ui: Ui = {
    refreshAll() {
      nameInput.value = app.project.name;
      renderPortal(); renderView(); renderInteraction(); renderProgram(); renderScenes(); renderProps(); renderLayout(); renderOutput(); timeline.refresh();
    },
    refreshScenes() { renderScenes(); timeline.refresh(); },
    refreshProps() { renderProps(); },
    refreshTimeline() { timeline.refresh(); },
    refreshInteraction() { renderInteraction(); },
    tick,
  };
  ui.refreshAll();
  return ui;
}

export type { ScreenId };
