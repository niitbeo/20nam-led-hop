// Màn hiệu chỉnh camera: hiện hình camera, người dùng bấm 4 điểm trên ảnh theo thứ tự
// (1) góc lối vào TRÁI, (2) lối vào PHẢI, (3) cuối cổng PHẢI, (4) cuối cổng TRÁI — toạ độ sàn của
// 4 điểm đó sửa được (mặc định 4 góc sàn cổng). Vẽ luôn khung người đang nhận diện + vị trí sàn suy ra
// để kiểm tra ngay tại chỗ.
import type { CameraCalib, PortalSpec } from '../model';
import { applyHomography, solveHomography } from './homography';
import type { CameraSource } from './sources';

const LABELS = ['1 · lối vào trái', '2 · lối vào phải', '3 · cuối cổng phải', '4 · cuối cổng trái'];

export function defaultFloorPoints(p: PortalSpec): [number, number][] {
  return [[-p.width / 2, 0], [p.width / 2, 0], [p.width / 2, p.length], [-p.width / 2, p.length]];
}

export function openCalibration(source: CameraSource, portal: PortalSpec, current: CameraCalib | null, onSave: (c: CameraCalib) => void): void {
  const img: [number, number][] = current ? current.img.map((p) => [p[0], p[1]] as [number, number]) : [];
  const floor: [number, number][] = current && current.floor.length === 4 ? current.floor.map((p) => [p[0], p[1]] as [number, number]) : defaultFloorPoints(portal);

  const modal = document.createElement('div');
  modal.id = 'calibModal';
  const box = document.createElement('div');
  box.className = 'box';
  const title = document.createElement('h3');
  title.textContent = 'Hiệu chỉnh camera → sàn cổng';
  const hint = document.createElement('div');
  hint.className = 'hint';
  const wrap = document.createElement('div');
  wrap.className = 'camwrap';
  const canvas = document.createElement('canvas');
  wrap.append(canvas);
  const table = document.createElement('div');
  table.className = 'calib-pts';
  const btns = document.createElement('div');
  btns.className = 'btns';
  const bUndo = button('Xoá điểm cuối', () => { img.pop(); renderTable(); });
  const bReset = button('Xoá hết', () => { img.length = 0; renderTable(); });
  const bSave = button('Lưu hiệu chỉnh', () => {
    if (img.length < 4) { alert('Cần đủ 4 điểm trên ảnh.'); return; }
    onSave({ img: img.slice(0, 4), floor: floor.slice(0, 4) });
    close();
  });
  const bClose = button('Đóng', () => close());
  btns.append(bUndo, bReset, bSave, bClose);
  box.append(title, hint, wrap, table, btns);
  modal.append(box);
  document.body.append(modal);

  function button(text: string, onclick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.textContent = text;
    b.onclick = onclick;
    return b;
  }

  function renderTable(): void {
    table.replaceChildren();
    for (let i = 0; i < 4; i++) {
      const rowEl = document.createElement('div');
      rowEl.className = 'row';
      const lab = document.createElement('label');
      lab.textContent = LABELS[i];
      const im = document.createElement('span');
      im.className = 'hint';
      im.textContent = img[i] ? `ảnh (${img[i][0].toFixed(3)}, ${img[i][1].toFixed(3)})` : 'chưa bấm';
      const fx = numInput(floor[i][0], (v) => { floor[i][0] = v; });
      const fd = numInput(floor[i][1], (v) => { floor[i][1] = v; });
      rowEl.append(lab, im, 'x', fx, 'd', fd, 'm');
      table.append(rowEl);
    }
    hint.textContent = img.length < 4
      ? `Bấm vào ảnh điểm ${LABELS[img.length]} (x: ngang, 0 = tim cổng; d: độ sâu, 0 = lối vào). Đặt vật đánh dấu ở 4 góc sàn cổng để bấm cho chính xác.`
      : 'Đủ 4 điểm. Đi thử trong cổng: chấm vàng dưới khung người phải ra đúng x, d. Bấm "Lưu hiệu chỉnh".';
  }
  function numInput(v: number, on: (v: number) => void): HTMLInputElement {
    const i = document.createElement('input');
    i.type = 'number';
    i.step = '0.1';
    i.value = String(v);
    i.onchange = () => { const n = parseFloat(i.value); if (Number.isFinite(n)) on(n); };
    return i;
  }

  canvas.onclick = (e) => {
    if (img.length >= 4) return;
    const r = canvas.getBoundingClientRect();
    img.push([(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]);
    renderTable();
  };

  let raf = 0;
  function draw(): void {
    raf = requestAnimationFrame(draw);
    const v = source.video;
    if (v.videoWidth === 0) return;
    if (canvas.width !== v.videoWidth) { canvas.width = v.videoWidth; canvas.height = v.videoHeight; }
    const ctx = canvas.getContext('2d')!;
    const W = canvas.width, H = canvas.height;
    ctx.drawImage(v, 0, 0, W, H);
    // lưới sàn theo hiệu chỉnh tạm (4 điểm hiện có), để thấy phối cảnh có hợp lý không
    const h = img.length >= 4 ? solveHomography(floor, img) : null; // sàn -> ảnh
    if (h) {
      ctx.strokeStyle = 'rgba(56,214,255,0.7)';
      ctx.lineWidth = 2;
      const xs = [floor[0][0], floor[1][0]];
      const ds = [floor[0][1], floor[2][1]];
      const nx = 4, nd = 6;
      for (let i = 0; i <= nx; i++) {
        const x = xs[0] + ((xs[1] - xs[0]) * i) / nx;
        ctx.beginPath();
        for (let j = 0; j <= nd; j++) { const d = ds[0] + ((ds[1] - ds[0]) * j) / nd; const [u, vv] = applyHomography(h, x, d); j ? ctx.lineTo(u * W, vv * H) : ctx.moveTo(u * W, vv * H); }
        ctx.stroke();
      }
      for (let j = 0; j <= nd; j++) {
        const d = ds[0] + ((ds[1] - ds[0]) * j) / nd;
        ctx.beginPath();
        for (let i = 0; i <= nx; i++) { const x = xs[0] + ((xs[1] - xs[0]) * i) / nx; const [u, vv] = applyHomography(h, x, d); i ? ctx.lineTo(u * W, vv * H) : ctx.moveTo(u * W, vv * H); }
        ctx.stroke();
      }
    }
    // điểm đã bấm
    img.forEach((p, i) => {
      ctx.fillStyle = '#ffd400';
      ctx.beginPath(); ctx.arc(p[0] * W, p[1] * H, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#000'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), p[0] * W, p[1] * H);
    });
    // khung người + vị trí sàn
    const inv = img.length >= 4 ? solveHomography(img, floor) : null;
    for (const d of source.lastDetections) {
      ctx.strokeStyle = '#38d6ff';
      ctx.lineWidth = 2;
      const u = d.u * W, bottom = d.v * H, bw = d.w * W, bh = d.h * H;
      ctx.strokeRect(u - bw / 2, bottom - bh, bw, bh);
      ctx.fillStyle = '#ffd400';
      ctx.beginPath(); ctx.arc(u, bottom, 5, 0, Math.PI * 2); ctx.fill();
      if (inv) {
        const [x, dd] = applyHomography(inv, d.u, d.v);
        ctx.fillStyle = '#fff'; ctx.font = '13px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
        ctx.fillText(`x ${x.toFixed(2)}  d ${dd.toFixed(2)}  ${(d.score * 100).toFixed(0)}%`, u + 8, bottom - 4);
      }
    }
  }
  function close(): void {
    cancelAnimationFrame(raf);
    modal.remove();
  }
  renderTable();
  draw();
}
