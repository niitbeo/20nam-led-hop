// Hộp thoại xuất video MP4: chọn độ phân giải, fps, camera, đoạn thời gian, âm thanh; hiện tiến độ; huỷ được.
import { exportVideo, type ExportOptions, type ExportProgress } from './export';
import { totalDuration, type Project } from './model';
import { CAMERA_LABEL, type CameraPreset } from './render/preview';

const RES: [string, [number, number]][] = [['1280×720', [1280, 720]], ['1920×1080', [1920, 1080]], ['2560×1440', [2560, 1440]]];

export function openExportModal(project: Project, camera: CameraPreset, busy: (on: boolean) => void = () => {}): void {
  const total = totalDuration(project);
  const modal = document.createElement('div');
  modal.id = 'exportModal';
  const box = document.createElement('div');
  box.className = 'box';
  modal.append(box);
  document.body.append(modal);

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] => {
    const e = document.createElement(tag);
    Object.assign(e, props);
    e.append(...kids);
    return e;
  };
  const row = (label: string, ...kids: (Node | string)[]): HTMLDivElement => { const r = el('div', { className: 'row' }, el('label', { textContent: label }), ...kids); return r; };
  const select = (opts: [string, string][], value: string): HTMLSelectElement => {
    const s = el('select');
    for (const [v, l] of opts) s.append(el('option', { value: v, textContent: l }));
    s.value = value;
    return s;
  };
  const num = (v: number, step: number, min: number, max: number): HTMLInputElement => el('input', { type: 'number', value: String(v), step: String(step), min: String(min), max: String(max) });

  const resSel = select(RES.map(([l]) => [l, l]), '1920×1080');
  const fpsSel = select([['30', '30 fps'], ['60', '60 fps'], ['25', '25 fps']], '30');
  const camSel = select(Object.entries(CAMERA_LABEL), camera);
  const fromIn = num(0, 0.5, 0, total);
  const toIn = num(Math.round(total * 10) / 10, 0.5, 0, total);
  const audioChk = el('input', { type: 'checkbox', checked: true });
  const personsChk = el('input', { type: 'checkbox', checked: project.interaction.enabled });
  const bar = el('div', { className: 'bar' }, el('i'));
  const status = el('div', { className: 'what', textContent: `Chương trình dài ${total.toFixed(1)} s. Video dựng từng khung nên mất vài phút với 1080p.` });
  const startBtn = el('button', { textContent: 'Bắt đầu xuất…' });
  const cancelBtn = el('button', { textContent: 'Đóng' });
  const cancel = { requested: false };
  let running = false;

  box.append(
    el('h3', { textContent: 'Xuất video MP4 mô phỏng' }),
    row('Độ phân giải', resSel),
    row('Khung hình', fpsSel),
    row('Camera', camSel),
    el('div', { className: 'row' }, el('label', { textContent: 'Đoạn (giây)' }), fromIn, '→', toIn),
    el('div', { className: 'row' }, el('label', {}, audioChk, ' Kèm âm thanh'), el('label', {}, personsChk, ' Người ảo đi trong cổng')),
    status, bar,
    el('div', { className: 'btns' }, startBtn, cancelBtn),
  );

  cancelBtn.onclick = () => {
    if (running) { cancel.requested = true; cancelBtn.disabled = true; cancelBtn.textContent = 'Đang huỷ…'; }
    else modal.remove();
  };

  startBtn.onclick = async () => {
    const [w, h] = RES.find(([l]) => l === resSel.value)![1];
    const from = Math.max(0, Math.min(parseFloat(fromIn.value) || 0, total));
    const to = Math.max(from + 0.5, Math.min(parseFloat(toIn.value) || total, total));
    const opts: ExportOptions = { width: w, height: h, fps: parseInt(fpsSel.value, 10), from, to, camera: camSel.value as CameraPreset, audio: audioChk.checked, persons: personsChk.checked };
    const name = `${project.name.replace(/[^\p{L}\p{N}_-]+/gu, '-') || 'cong-led'}-${w}x${h}.mp4`;
    const picker = (window as unknown as { showSaveFilePicker?: (o: unknown) => Promise<FileSystemFileHandle> }).showSaveFilePicker;
    if (picker) {
      try { opts.file = await picker({ suggestedName: name, types: [{ description: 'Video MP4', accept: { 'video/mp4': ['.mp4'] } }] }); }
      catch { return; } // người dùng bấm huỷ hộp chọn tệp
    }
    running = true;
    busy(true);
    startBtn.disabled = true;
    cancelBtn.textContent = 'Huỷ';
    const t0 = performance.now();
    try {
      const res = await exportVideo(project, opts, (p: ExportProgress) => {
        const pct = p.stage === 'video' ? (p.frame / p.total) * 100 : p.stage === 'finalize' ? 100 : 0;
        (bar.firstChild as HTMLElement).style.width = `${pct}%`;
        const eta = p.speed > 0 ? ` · còn ~${Math.ceil((p.total - p.frame) / p.speed)} s` : '';
        status.textContent = p.stage === 'prepare' ? 'Đang nạp media và mô hình…' : p.stage === 'audio' ? 'Đang trộn âm thanh…'
          : p.stage === 'video' ? `Đang dựng khung ${p.frame}/${p.total} (${p.speed.toFixed(1)} khung/s)${eta}` : 'Đang ghép tệp…';
      }, cancel);
      if (res.blob) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(res.blob);
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      }
      status.textContent = `Xong: ${res.frames} khung trong ${res.seconds.toFixed(0)} s (${res.encoder}${res.hasAudio ? ', có tiếng' : ', không tiếng'})${opts.file ? '. Đã lưu tệp.' : '. Đã tải xuống.'}`;
    } catch (err) {
      status.textContent = (err as Error).name === 'AbortError' ? 'Đã huỷ.' : `Lỗi: ${(err as Error).message}`;
    } finally {
      running = false;
      busy(false);
      cancel.requested = false;
      startBtn.disabled = false;
      cancelBtn.disabled = false;
      cancelBtn.textContent = 'Đóng';
      void t0;
    }
  };
}
