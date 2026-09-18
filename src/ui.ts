// Giao diện: bảng trái (cổng, danh sách cảnh, thuộc tính cảnh, góc nhìn, bố cục, dự án) + thanh phát dưới.
// Chỉ sửa `app.project` rồi gọi hooks.changed(...); không đụng tới render trực tiếp.
import { putMedia } from './media';
import {
  canvasSize, defaultLayout, FIT_LABEL, INTERACT_LABEL, makeScene, MAPPING_LABEL, sceneDuration, sceneStart, screenPixels, SCREEN_IDS, SCREEN_LABEL,
  totalDuration, TRACK_SOURCE_LABEL, TRANSITION_LABEL, type Cursor, type InteractMode, type MediaFit, type MediaMapping, type Project, type Scene,
  type ScreenId, type TrackSource, type TransitionType,
} from './model';
import { EFFECTS, MEDIA_EFFECT_ID, paramsFor, resolveParams } from './render/effects';
import { CAMERA_LABEL, type CameraPreset } from './render/preview';
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
  renderScale: number;
  /** trạng thái nguồn vị trí người, do control.ts cập nhật mỗi khung */
  track: { status: string; count: number; fps: number };
}

export type ChangeKind = 'portal' | 'layout' | 'scenes' | 'scene' | 'view' | 'interaction';
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

const mmss = (t: number): string => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

const PITCHES: [string, string][] = [['1.5', 'P1.5'], ['1.8', 'P1.8'], ['2', 'P2'], ['2.5', 'P2.5'], ['3', 'P3'], ['4', 'P4'], ['5', 'P5']];
const SOURCE_OPTIONS: [string, string][] = [...EFFECTS.map((e) => [e.id, e.name] as [string, string]), [MEDIA_EFFECT_ID, 'Ảnh / video (nạp tệp)']];
const effectName = (id: string): string => SOURCE_OPTIONS.find((o) => o[0] === id)?.[1] ?? id;
const hueOf = (i: number): number => (i * 47 + 200) % 360;

export function buildUi(app: App, hooks: Hooks): Ui {
  const panel = document.getElementById('panel')!;
  const transport = document.getElementById('transport')!;

  const nameInput = el('input', { type: 'text', value: app.project.name, style: 'width:100%' });
  nameInput.onchange = () => { app.project.name = nameInput.value; hooks.changed('scene'); };
  const secPortal = el('div');
  const secScenes = el('div');
  const secProps = el('div');
  const secView = el('div');
  const secLayout = el('div');
  const secOutput = el('div');
  const secInteract = el('div');

  panel.append(
    el('h1', {}, 'LED Portal Studio ', el('small', {}, 'mô phỏng cổng LED 4 mặt')),
    el('div', { class: 'hint' }, 'Kéo chuột để xoay góc nhìn · Space để phát/dừng'),
    row('Tên dự án', nameInput),
    el('h2', {}, 'Cổng LED'), secPortal,
    el('h2', {}, 'Góc nhìn'), secView,
    el('h2', {}, 'Tương tác theo vị trí người'), secInteract,
    el('h2', {}, el('span', { class: 'grow' }, 'Danh sách cảnh'), addSceneButton()), secScenes,
    el('h2', {}, 'Thuộc tính cảnh'), secProps,
    el('h2', {}, 'Bố cục khung xuất'), secLayout,
    el('h2', {}, 'Xuất ra LED'), secOutput,
    el('h2', {}, 'Dự án'),
    el('div', { class: 'btns' },
      el('button', { textContent: 'Lưu JSON', onclick: () => hooks.save() }),
      el('button', { textContent: 'Mở JSON', onclick: () => hooks.open() }),
      el('button', { textContent: 'Dự án mẫu', onclick: () => { if (confirm('Thay dự án hiện tại bằng dự án mẫu?')) hooks.loadSample(); } }),
    ),
  );

  function addSceneButton(): HTMLButtonElement {
    return el('button', { class: 'icon', textContent: '+ Thêm cảnh', onclick: () => {
      const s = makeScene('rings');
      app.project.scenes.splice(app.selected + 1, 0, s);
      app.selected = Math.min(app.selected + 1, app.project.scenes.length - 1);
      hooks.changed('scenes');
    } });
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
      row('Rộng lối đi', num(p.width, { step: 0.1, min: 1, max: 20 }, (v) => { p.width = v; change(); }), 'm'),
      row('Cao lối đi', num(p.height, { step: 0.1, min: 1, max: 12 }, (v) => { p.height = v; change(); }), 'm'),
      row('Dài cổng', num(p.length, { step: 0.1, min: 1, max: 40 }, (v) => { p.length = v; change(); }), 'm'),
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
    info.append(el('div', {}, el('span', {}, 'Khung xuất'), el('b', {}, `${c.w} × ${c.h} px`)));
    info.append(el('div', {}, el('span', {}, 'Tổng điểm ảnh'), el('b', {}, `${(total / 1e6).toFixed(2)} Mpx`)));
    secPortal.replaceChildren(dims, el('div', { class: 'hint' }, 'Mặt dựng ôm quanh lối vào, chừa lỗ đúng bằng lối đi.'), info);
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
      name.onchange = () => { s.name = name.value; hooks.changed('scene'); renderTimeline(); };
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
        renderTimeline();
      });
      const dur = num(s.duration, { step: 0.5, min: 0.5, max: 600 }, (v) => { s.duration = v; hooks.changed('scene'); renderTimeline(); });
      dur.classList.add('dur');
      const tr = select(Object.entries(TRANSITION_LABEL) as [TransitionType, string][], s.transition, (v) => { s.transition = v; hooks.changed('scene'); renderTimeline(); });
      const trd = num(s.transitionDuration, { step: 0.1, min: 0, max: 30 }, (v) => { s.transitionDuration = v; hooks.changed('scene'); renderTimeline(); });
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
          s.media = { ...m, mapping: s.media?.mapping ?? 'unfold', fit: s.media?.fit ?? 'cover' };
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
      el('div', { class: 'btns' }, el('button', { textContent: 'Bố cục mặc định', onclick: () => { app.project.layout = defaultLayout(app.project.portal); hooks.changed('layout'); renderLayout(); renderPortal(); } })));
    secLayout.replaceChildren(details);
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
      ));
    })();
  }

  // ---------- Thanh phát ----------
  const playBtn = el('button', { textContent: '▶', style: 'width:34px' });
  playBtn.onclick = () => hooks.play(!app.playing);
  const loopBtn = el('button', { textContent: 'Lặp', class: app.project.loop ? 'on' : '' });
  loopBtn.onclick = () => { app.project.loop = !app.project.loop; loopBtn.classList.toggle('on', app.project.loop); hooks.changed('scene'); };
  const homeBtn = el('button', { textContent: '⏮', onclick: () => hooks.seek(0) });
  const nowSpan = el('span', { class: 'now' });
  const timeSpan = el('span', { class: 'time' });
  const tl = el('div', { id: 'tl' });
  const ph = el('div', { class: 'ph' });
  tl.onpointerdown = (e) => {
    const r = tl.getBoundingClientRect();
    const seekTo = (x: number): void => hooks.seek(Math.max(0, Math.min(1, (x - r.left) / r.width)) * totalDuration(app.project));
    seekTo(e.clientX);
    const move = (ev: PointerEvent): void => seekTo(ev.clientX);
    const up = (): void => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  transport.append(el('div', { class: 'bar' }, homeBtn, playBtn, loopBtn, el('span', { class: 'sep' }), nowSpan, timeSpan), tl);

  let blocks: HTMLElement[] = [];
  function renderTimeline(): void {
    const total = totalDuration(app.project);
    blocks = [];
    tl.replaceChildren();
    let acc = 0;
    app.project.scenes.forEach((s, i) => {
      const d = sceneDuration(s);
      const b = el('div', { class: 'blk' + (i === app.selected ? ' sel' : ''), textContent: s.name || effectName(s.effect), title: `${s.name || effectName(s.effect)} · ${d}s` });
      b.style.setProperty('--h', String(hueOf(i)));
      b.style.left = `${(acc / total) * 100}%`;
      b.style.width = `calc(${(d / total) * 100}% - 2px)`;
      if (s.transition !== 'cut' && s.transitionDuration > 0) {
        const tr = el('div', { class: 'tr' });
        tr.style.width = `${Math.min(100, (Math.min(s.transitionDuration, d) / d) * 100)}%`;
        b.append(tr);
      }
      blocks.push(b);
      tl.append(b);
      acc += d;
    });
    tl.append(ph);
  }

  let lastIndex = -1;
  let lastTrack = '';
  function tick(cursor: Cursor | null): void {
    playBtn.textContent = app.playing ? '⏸' : '▶';
    const tr = app.project.interaction.enabled
      ? `${app.track.status} · <b>${app.track.count}</b> người${app.track.fps ? ` · ${app.track.fps} fps nhận diện` : ''}`
      : 'Tương tác đang tắt.';
    if (tr !== lastTrack) { trackStatus.innerHTML = tr; lastTrack = tr; }
    const total = totalDuration(app.project);
    timeSpan.textContent = `${mmss(app.t)} / ${mmss(total)}`;
    ph.style.left = `${total > 0 ? (app.t / total) * 100 : 0}%`;
    const idx = cursor?.index ?? -1;
    if (idx !== lastIndex) {
      sceneCards.forEach((c, i) => c.classList.toggle('playing', i === idx));
      lastIndex = idx;
    }
    if (cursor) {
      const s = app.project.scenes[cursor.index];
      const nx = cursor.next !== null ? ` → ${app.project.scenes[cursor.next].name || effectName(app.project.scenes[cursor.next].effect)} (${TRANSITION_LABEL[s.transition]})` : '';
      nowSpan.textContent = `${cursor.index + 1}. ${s.name || effectName(s.effect)}${nx}`;
    } else nowSpan.textContent = '';
  }

  const ui: Ui = {
    refreshAll() {
      nameInput.value = app.project.name;
      loopBtn.classList.toggle('on', app.project.loop);
      renderPortal(); renderView(); renderInteraction(); renderScenes(); renderProps(); renderLayout(); renderOutput(); renderTimeline();
    },
    refreshScenes() { renderScenes(); renderTimeline(); },
    refreshProps() { renderProps(); },
    refreshTimeline() { renderTimeline(); },
    refreshInteraction() { renderInteraction(); },
    tick,
  };
  ui.refreshAll();
  return ui;
}

export type { ScreenId };
