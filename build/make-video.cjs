// Xuất video MP4 của chương trình bằng bộ xuất trong app (dựng ngoại tuyến từng khung).
// Chạy:  npm run dev  (cửa sổ khác)  rồi:  npx electron build/make-video.cjs
// Biến môi trường: VIDEO_W, VIDEO_H, VIDEO_FPS, VIDEO_FROM, VIDEO_TO, VIDEO_CAM, LEDPORTAL_VIDEO (đường dẫn ra).
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const URL_APP = process.env.LEDPORTAL_URL || 'http://localhost:5184';
const OUT = process.env.LEDPORTAL_VIDEO || path.join(__dirname, '..', 'docs', 'hanh-trinh-5-buoc.mp4');
const W = Number(process.env.VIDEO_W || 1280);
const H = Number(process.env.VIDEO_H || 720);
const FPS = Number(process.env.VIDEO_FPS || 30);
const FROM = Number(process.env.VIDEO_FROM || 0);
const TO = Number(process.env.VIDEO_TO || 70);
const CAM = process.env.VIDEO_CAM || 'entrance';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1400, height: 820, show: false, backgroundColor: '#000000', webPreferences: { backgroundThrottling: false } });
  await win.loadURL(URL_APP);
  const js = (code) => win.webContents.executeJavaScript(code, true);
  for (let i = 0; i < 240; i++) {
    if (await js('typeof window.ledportal !== "undefined"').catch(() => false)) break;
    await sleep(500);
  }
  // dùng dự án mẫu, bật tương tác qua ô tích để nguồn vị trí người khởi động
  await js(`(() => { localStorage.removeItem('ledportal.project.v1'); return true; })()`);
  win.webContents.reload();
  await sleep(6000);
  for (let i = 0; i < 240; i++) {
    if (await js('typeof window.ledportal !== "undefined"').catch(() => false)) break;
    await sleep(500);
  }
  await js(`(() => {
    const lab = [...document.querySelectorAll('#panel label')].find((l) => l.textContent.includes('Bật tương tác'));
    const cb = lab && lab.querySelector('input[type=checkbox]');
    if (cb && !cb.checked) cb.click();
    return true; })()`);
  await sleep(1500);
  await js(`(() => { window.ledportal.app.project.interaction.sim.walkers = 3; return true; })()`);

  console.log(`Đang dựng ${W}×${H} @ ${FPS} fps, đoạn ${FROM}–${TO}s, camera ${CAM}…`);
  const t0 = Date.now();
  const len = await js(`(async () => {
    const L = window.ledportal;
    L.exporting = true;
    window.__prog = '';
    const res = await L.exportVideo(L.app.project,
      { width: ${W}, height: ${H}, fps: ${FPS}, from: ${FROM}, to: ${TO}, camera: '${CAM}', audio: true, persons: true },
      (p) => { window.__prog = p.stage + ' ' + p.frame + '/' + p.total; }, { requested: false });
    L.exporting = false;
    window.__vid = new Uint8Array(await res.blob.arrayBuffer());
    window.__info = { frames: res.frames, seconds: res.seconds, encoder: res.encoder, hasAudio: res.hasAudio };
    return window.__vid.length;
  })()`);
  const info = await js('window.__info');
  console.log(`Xong ${info.frames} khung trong ${info.seconds.toFixed(0)}s (${info.encoder}), tệp ${(len / 1048576).toFixed(1)} MB`);

  // chuyển về đĩa theo từng mảnh để không dồn chuỗi khổng lồ qua một lần gọi
  const CH = 3_000_000;
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const fd = fs.openSync(OUT, 'w');
  for (let off = 0; off < len; off += CH) {
    const end = Math.min(off + CH, len);
    const b64 = await js(`(() => { const u = window.__vid.subarray(${off}, ${end}); let s = ''; const K = 0x8000;
      for (let i = 0; i < u.length; i += K) s += String.fromCharCode.apply(null, u.subarray(i, i + K));
      return btoa(s); })()`);
    fs.writeSync(fd, Buffer.from(b64, 'base64'));
  }
  fs.closeSync(fd);
  console.log(`Đã ghi ${OUT} · tổng ${(Date.now() - t0) / 1000}s`);
  app.exit(0);
});
