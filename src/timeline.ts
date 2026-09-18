// Thanh thời gian kiểu phần mềm dựng: thước giây, khối cảnh kéo đổi chỗ / kéo mép đổi thời lượng,
// phóng to thu nhỏ, sóng âm nhạc nền, đầu phát tự cuộn theo. Chỉ sửa `app.project` rồi báo host.
import { getMedia } from './media';
import { makeScene, sceneDuration, sceneStart, totalDuration, uid, type Scene } from './model';
import { effectName } from './names';
import type { App } from './ui';

export interface TimelineHost {
  select(index: number): void;
  /** thêm / xoá / đổi chỗ cảnh: phải vẽ lại cả danh sách và thuộc tính */
  scenesChanged(): void;
  /** chỉ đổi thời lượng: lưu và gửi cho cửa sổ xuất */
  sceneChanged(): void;
  seek(t: number): void;
  play(on: boolean): void;
}

const RULER_H = 20;
const EDGE = 6; // px: vùng bắt mép khối để kéo đổi thời lượng
const hueOf = (i: number): number => (i * 47 + 200) % 360;
const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const fmt = (t: number): string => `${String(Math.floor(t / 60)).padStart(2, '0')}:${(t % 60).toFixed(1).padStart(4, '0')}`;

type Drag =
  | { mode: 'seek' }
  | { mode: 'len'; k: number; anchor: number }
  | { mode: 'body' | 'move'; k: number; downX: number; insertAt: number };

export function buildTimeline(app: App, host: TimelineHost): { refresh: () => void; tick: () => void } {
  const root = document.getElementById('transport')!;
  root.innerHTML = `
    <div class="bar">
      <button id="tlHome" title="Home">⏮</button>
      <button id="tlPlay" title="Space">▶ Phát</button>
      <button id="tlLoop" title="Lặp lại chương trình">↻ Lặp</button>
      <span class="sep"></span>
      <button id="tlPrev" title="[ hoặc PageUp">⏪ Cảnh trước</button>
      <button id="tlNext" title="] hoặc PageDown">Cảnh sau ⏩</button>
      <span class="sep"></span>
      <button id="tlAdd" title="Thêm cảnh sau cảnh đang chọn">＋ Cảnh</button>
      <button id="tlDup" title="Ctrl+D">Nhân đôi</button>
      <button id="tlDel" title="Delete">Xoá</button>
      <button id="tlLeft" title="Đưa cảnh sang trái">◀</button>
      <button id="tlRight" title="Đưa cảnh sang phải">▶</button>
      <span class="sep"></span>
      <button id="tlZoomOut" title="Ctrl + lăn chuột">−</button>
      <button id="tlZoomIn">＋</button>
      <button id="tlZoomFit">Vừa khung</button>
      <span class="now" id="tlNow"></span><span class="time" id="tlTime">00:00.0</span>
    </div>
    <div id="tl-scroll"><div id="tl-inner">
      <div id="tl-ruler"></div><div id="tl-clips"></div><canvas id="tl-wave"></canvas><div id="tl-insert"></div><div id="playhead"></div>
    </div></div>`;

  const $ = <T extends HTMLElement>(id: string): T => root.querySelector('#' + id) as T;
  const scroll = $('tl-scroll'), inner = $('tl-inner'), ruler = $('tl-ruler'), clips = $('tl-clips');
  const insertMark = $('tl-insert'), playhead = $('playhead');
  const wave = $<HTMLCanvasElement>('tl-wave');
  const playBtn = $<HTMLButtonElement>('tlPlay'), loopBtn = $('tlLoop'), nowEl = $('tlNow'), timeEl = $('tlTime');

  let pps = 8; // pixel mỗi giây
  let fit = true;
  let drag: Drag | null = null;
  let playingClip = -1;

  const scenes = (): Scene[] => app.project.scenes;
  const duration = (): number => Math.max(0.001, totalDuration(app.project));

  // ---------- sóng âm nhạc nền ----------
  let peaks: Float32Array | null = null;
  let peaksFor = '';
  let peakDur = 0;
  async function ensurePeaks(): Promise<void> {
    const music = app.project.music;
    const id = music?.id ?? '';
    if (id === peaksFor) return;
    peaksFor = id;
    peaks = null;
    peakDur = 0;
    if (!id) { drawWave(); return; }
    try {
      const m = await getMedia(id);
      if (!m) return;
      const ctx = new OfflineAudioContext(1, 1, 44100);
      const buf = await ctx.decodeAudioData(await m.blob.arrayBuffer());
      const n = 2400;
      const data = buf.getChannelData(0);
      const out = new Float32Array(n);
      const step = Math.max(1, Math.floor(data.length / n));
      for (let i = 0; i < n; i++) {
        let peak = 0;
        const a = i * step;
        for (let j = a; j < a + step && j < data.length; j++) { const v = Math.abs(data[j]); if (v > peak) peak = v; }
        out[i] = peak;
      }
      if (peaksFor !== id) return; // đổi nhạc giữa chừng
      peaks = out;
      peakDur = buf.duration;
    } catch { /* tệp hỏng: không vẽ sóng */ }
    drawWave();
  }

  /** Canvas chỉ rộng bằng phần đang nhìn thấy và trượt theo thanh cuộn (phóng to thì timeline rộng hàng chục nghìn px). */
  function drawWave(): void {
    const music = app.project.music;
    inner.classList.toggle('has-audio', !!music);
    if (!music) return;
    const w = scroll.clientWidth, h = 26, dpr = Math.min(2, window.devicePixelRatio || 1);
    wave.style.left = `${scroll.scrollLeft}px`;
    wave.style.width = `${w}px`;
    wave.width = Math.round(w * dpr);
    wave.height = Math.round(h * dpr);
    const g = wave.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(56, 214, 255, 0.10)';
    g.fillRect(0, 0, Math.min(w, duration() * pps - scroll.scrollLeft), h);
    if (peaks && peakDur > 0) {
      g.fillStyle = 'rgba(56, 214, 255, 0.8)';
      const secPerPx = 1 / pps;
      for (let x = 0; x < w; x++) {
        const t = (x + scroll.scrollLeft) / pps;
        if (t > duration()) break;
        // nhạc nền lặp lại: lấy phần dư theo độ dài bản nhạc
        const u = (t % peakDur) / peakDur;
        const a = Math.floor(u * peaks.length);
        const b = Math.max(a + 1, Math.floor(((t + secPerPx) % peakDur) / peakDur * peaks.length));
        let m = 0;
        for (let i = a; i < b && i < peaks.length; i++) if (peaks[i] > m) m = peaks[i];
        const bar = Math.max(1, m * (h - 2));
        g.fillRect(x, (h - bar) / 2, 1, bar);
      }
    }
    g.fillStyle = 'rgba(210, 245, 255, 0.9)';
    g.font = '10px Segoe UI, sans-serif';
    g.fillText(`♪ ${music.name}${peaks ? '' : ' (đang đọc…)'}`, 4, 10);
  }
  scroll.addEventListener('scroll', drawWave);

  // ---------- vẽ ----------
  function render(): void {
    // Khi đang kéo thì giữ nguyên tỉ lệ, không thì mép khối chạy khỏi con trỏ.
    if (fit && !drag) pps = Math.max(0.5, (scroll.clientWidth - 2) / duration());
    inner.style.width = `${duration() * pps}px`;

    const tickSteps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
    const tick = tickSteps.find((s) => s * pps >= 64) ?? 600;
    let html = '';
    for (let t = 0; t <= duration(); t += tick) html += `<span style="left:${t * pps}px">${fmt(t).replace(/\.0$/, '')}</span>`;
    ruler.innerHTML = html;
    ruler.style.backgroundSize = `${(tick / 5) * pps}px 100%`;

    let acc = 0;
    clips.innerHTML = scenes().map((s, k) => {
      const d = sceneDuration(s);
      const left = acc * pps;
      acc += d;
      const name = s.name || effectName(s.effect);
      const tr = s.transition !== 'cut' ? Math.min(s.transitionDuration, d) : 0;
      const tip = `${name}\n${d.toFixed(1)} s${tr > 0 ? ` · chuyển cảnh ${tr.toFixed(1)} s` : ''}\nKéo mép phải để đổi thời lượng, kéo thân để đổi chỗ`;
      return `<div class="clip${k === app.selected ? ' sel' : ''}" data-k="${k}" style="left:${left}px;width:${Math.max(2, d * pps - 2)}px;--h:${hueOf(k)}" title="${esc(tip)}">
        ${tr > 0 ? `<div class="tr" style="width:${(tr / d) * 100}%"></div>` : ''}
        <span class="name">${k + 1}. ${esc(name)}</span><span class="dur">${d.toFixed(1)}s</span>
      </div>`;
    }).join('');
    playingClip = -1;
    void ensurePeaks();
    drawWave();
  }

  // ---------- toạ độ & bắt điểm ----------
  const localX = (e: PointerEvent | WheelEvent): number => e.clientX - inner.getBoundingClientRect().left;
  const localY = (e: PointerEvent): number => e.clientY - inner.getBoundingClientRect().top;

  function hit(x: number): { k: number; zone: 'len' | 'body' } | null {
    const list = scenes();
    // mép phải của khối (đổi thời lượng) — quét ngược để khối sau được ưu tiên
    let acc = 0;
    const ends: number[] = [];
    for (const s of list) { acc += sceneDuration(s); ends.push(acc); }
    for (let k = list.length - 1; k >= 0; k--) if (Math.abs(x - ends[k] * pps) <= EDGE) return { k, zone: 'len' };
    const k = ends.findIndex((end) => x < end * pps);
    return k >= 0 && x >= 0 ? { k, zone: 'body' } : null;
  }

  /** vị trí chèn khi kéo-thả: đếm khối (trừ khối đang kéo) có tâm nằm bên trái con trỏ */
  function insertIndex(x: number, dragged: number): number {
    let acc = 0;
    let idx = 0;
    scenes().forEach((s, k) => {
      const d = sceneDuration(s);
      if (k !== dragged && (acc + d / 2) * pps < x) idx++;
      acc += d;
    });
    return idx;
  }

  // ---------- chuột ----------
  inner.onpointerdown = (e) => {
    if (e.button !== 0) return;
    const x = localX(e);
    const h = localY(e) < RULER_H ? null : hit(x);
    try { inner.setPointerCapture(e.pointerId); } catch { /* con trỏ tổng hợp (kiểm thử) không bắt được */ }
    if (!h) {
      drag = { mode: 'seek' };
      host.seek(Math.max(0, Math.min(duration(), x / pps)));
      return;
    }
    host.select(h.k);
    if (h.zone === 'len') drag = { mode: 'len', k: h.k, anchor: sceneStart(app.project, h.k) * pps };
    else drag = { mode: 'body', k: h.k, downX: x, insertAt: h.k };
  };

  inner.onpointermove = (e) => {
    const x = localX(e);
    if (!drag) {
      const h = localY(e) < RULER_H ? null : hit(x);
      inner.style.cursor = !h ? 'text' : h.zone === 'body' ? 'grab' : 'ew-resize';
      return;
    }
    if (drag.mode === 'seek') { host.seek(Math.max(0, Math.min(duration(), x / pps))); return; }
    if (drag.mode === 'len') {
      const snap = e.shiftKey ? 0.1 : 0.5; // giữ Shift để chỉnh mịn
      const v = Math.max(0.5, Math.round((x - drag.anchor) / pps / snap) * snap);
      const s = scenes()[drag.k];
      if (s && s.duration !== v) { s.duration = +v.toFixed(2); host.sceneChanged(); render(); }
      return;
    }
    if (drag.mode === 'body' && Math.abs(x - drag.downX) > 6) drag = { ...drag, mode: 'move' };
    if (drag.mode === 'move') {
      inner.style.cursor = 'grabbing';
      drag.insertAt = insertIndex(x, drag.k);
      const others = scenes().filter((_, k) => k !== (drag as { k: number }).k);
      let at = 0;
      for (let i = 0; i < drag.insertAt && i < others.length; i++) at += sceneDuration(others[i]);
      insertMark.style.display = 'block';
      insertMark.style.left = `${at * pps}px`;
      clips.querySelector(`[data-k="${drag.k}"]`)?.classList.add('dragging');
    }
  };

  const endDrag = (e: PointerEvent): void => {
    const d = drag;
    drag = null;
    insertMark.style.display = 'none';
    if (!d) { render(); return; }
    if (d.mode === 'body') host.seek(Math.max(0, Math.min(duration(), localX(e) / pps)));
    else if (d.mode === 'move' && d.insertAt !== d.k) {
      const list = scenes();
      const [moved] = list.splice(d.k, 1);
      list.splice(d.insertAt, 0, moved);
      app.selected = d.insertAt;
      host.scenesChanged();
    }
    render();
  };
  inner.onpointerup = endDrag;
  inner.onpointercancel = endDrag;

  scroll.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    zoom(e.deltaY < 0 ? 1.25 : 0.8, localX(e));
  }, { passive: false });

  function zoom(factor: number, aroundX?: number): void {
    const x = aroundX ?? scroll.scrollLeft + scroll.clientWidth / 2;
    const t = x / pps;
    const minPps = (scroll.clientWidth - 2) / duration();
    fit = false;
    pps = Math.max(minPps, Math.min(200, pps * factor));
    if (pps <= minPps * 1.001) fit = true;
    render();
    scroll.scrollLeft = t * pps - (x - scroll.scrollLeft);
  }

  // ---------- thao tác trên cảnh ----------
  function addAfterSelected(): void {
    const at = Math.min(scenes().length, app.selected + 1);
    scenes().splice(at, 0, makeScene('rings'));
    app.selected = at;
    host.scenesChanged();
  }
  function duplicateSelected(): void {
    const src = scenes()[app.selected];
    if (!src) return;
    scenes().splice(app.selected + 1, 0, { ...structuredClone(src), id: uid() });
    app.selected++;
    host.scenesChanged();
  }
  function deleteSelected(): void {
    if (scenes().length <= 1) return;
    scenes().splice(app.selected, 1);
    app.selected = Math.max(0, Math.min(app.selected, scenes().length - 1));
    host.scenesChanged();
  }
  function moveSelected(dir: -1 | 1): void {
    const i = app.selected, j = i + dir;
    const list = scenes();
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    app.selected = j;
    host.scenesChanged();
  }
  function currentClip(): number {
    let acc = 0;
    const list = scenes();
    for (let k = 0; k < list.length; k++) {
      acc += sceneDuration(list[k]);
      if (app.t < acc) return k;
    }
    return list.length - 1;
  }
  function jumpClip(dir: -1 | 1): void {
    const starts = scenes().map((_, k) => sceneStart(app.project, k));
    const target = dir > 0 ? starts.find((m) => m > app.t + 0.05) : [...starts].reverse().find((m) => m < app.t - 0.35);
    if (target === undefined) { host.seek(dir > 0 ? duration() - 0.01 : 0); return; }
    host.seek(target);
    host.select(starts.indexOf(target));
  }

  $('tlHome').onclick = () => host.seek(0);
  playBtn.onclick = () => {
    if (!app.playing && app.t >= duration() - 0.02) host.seek(0);
    host.play(!app.playing);
  };
  loopBtn.onclick = () => { app.project.loop = !app.project.loop; host.sceneChanged(); };
  $('tlPrev').onclick = () => jumpClip(-1);
  $('tlNext').onclick = () => jumpClip(1);
  $('tlAdd').onclick = addAfterSelected;
  $('tlDup').onclick = duplicateSelected;
  $('tlDel').onclick = deleteSelected;
  $('tlLeft').onclick = () => moveSelected(-1);
  $('tlRight').onclick = () => moveSelected(1);
  $('tlZoomIn').onclick = () => zoom(1.4);
  $('tlZoomOut').onclick = () => zoom(1 / 1.4);
  $('tlZoomFit').onclick = () => { fit = true; render(); };

  window.addEventListener('keydown', (e) => {
    const el = e.target as HTMLElement;
    if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) return;
    if (e.key === 'Delete') deleteSelected();
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSelected(); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      if (app.camera === 'fpv') return; // đang tự đi: mũi tên để quay người
      e.preventDefault();
      host.seek(Math.max(0, Math.min(duration() - 0.01, app.t + (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 5 : 1))));
    } else if (e.key === '[' || (e.key === 'PageUp' && app.camera !== 'fpv')) { e.preventDefault(); jumpClip(-1); }
    else if (e.key === ']' || (e.key === 'PageDown' && app.camera !== 'fpv')) { e.preventDefault(); jumpClip(1); }
    else if (e.key === 'Home') host.seek(0);
    else if (e.key === 'End') host.seek(duration() - 0.01);
  });
  window.addEventListener('resize', () => { if (fit) render(); });

  return {
    refresh: render,
    tick: () => {
      const x = app.t * pps;
      playhead.style.left = `${x}px`;
      timeEl.textContent = `${fmt(app.t)} / ${fmt(duration())}`;
      playBtn.textContent = app.playing ? '❚❚ Dừng' : '▶ Phát';
      loopBtn.classList.toggle('on', app.project.loop);

      const k = currentClip();
      const list = scenes();
      if (k >= 0 && list[k]) {
        const s = list[k];
        nowEl.textContent = `${k + 1}/${list.length} · ${s.name || effectName(s.effect)}`;
        if (k !== playingClip) {
          clips.querySelector('.clip.playing')?.classList.remove('playing');
          clips.querySelector(`[data-k="${k}"]`)?.classList.add('playing');
          playingClip = k;
        }
      } else nowEl.textContent = '';

      if (app.playing && !drag && (x < scroll.scrollLeft + 10 || x > scroll.scrollLeft + scroll.clientWidth - 30))
        scroll.scrollLeft = x - scroll.clientWidth * 0.25;
    },
  };
}
