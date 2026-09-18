// Chụp ảnh giới thiệu từ dự án mẫu (để gửi khách duyệt / đưa vào README).
// Chạy:  npm run dev   (cửa sổ khác)  rồi:  npx electron build/make-screenshots.cjs
// Ảnh ra: docs/screenshots/*.png
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const URL_APP = process.env.LEDPORTAL_URL || 'http://localhost:5184';
const OUT = path.join(__dirname, '..', 'docs', 'screenshots');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Mỗi ảnh: tên, thời điểm trên chương trình (giây), vị trí camera và điểm nhìn (mét).
const SHOTS = [
  { name: '0-giao-dien', t: 20, pos: [0.6, 1.9, 4.6], look: [0, 1.9, -2], ui: true },
  { name: '1-ngoai-san', t: 4, pos: [0.6, 1.9, 4.6], look: [0, 1.9, -2] },
  { name: '2-cua-cong', t: 6, pos: [0, 1.6, 1.6], look: [0, 1.5, -6] },
  { name: '3-trong-cong', t: 20, pos: [0, 1.62, -0.9], look: [0, 1.62, -8] },
  { name: '4-tuong-ben', t: 22, pos: [1.2, 1.6, -0.3], look: [-1.5, 1.6, -3.2] },
  { name: '5-cong-thoi-gian', t: 39, pos: [0.35, 1.65, -0.6], look: [-0.3, 1.6, -7] },
  { name: '6-the-gioi-moi', t: 58, pos: [-0.6, 1.9, 4.6], look: [0, 1.9, -2] },
  { name: '7-vat-bay', t: 47, pos: [0, 1.62, 0.6], look: [0, 1.7, -8] },
  { name: '8-ban-do-pixel', t: 20, flat: true },
];

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({ width: 1600, height: 900, show: false, backgroundColor: '#000000', webPreferences: { backgroundThrottling: false, offscreen: false } });
  await win.loadURL(URL_APP);
  const js = (code) => win.webContents.executeJavaScript(code, true);
  for (let i = 0; i < 240; i++) {
    if (await js('typeof window.ledportal !== "undefined"').catch(() => false)) break;
    await sleep(500);
  }
  // dùng dự án mẫu, ẩn giao diện, chờ nạp mô hình nhân vật
  await js(`(() => { const L = window.ledportal; localStorage.removeItem('ledportal.project.v1');
    document.getElementById('panel').style.display = 'none';
    document.getElementById('transport').style.display = 'none';
    document.getElementById('status').style.display = 'none';
    document.getElementById('labels').style.display = 'none';
    const c = document.getElementById('stage'); c.style.left = '0'; c.style.width = '100%';
    window.dispatchEvent(new Event('resize'));
    L.app.project.interaction.enabled = false; L.app.playing = true; return true; })()`);
  await sleep(8000);
  for (const s of SHOTS) {
    // ảnh giao diện: hiện lại bảng trái + thanh thời gian
    await js(`(() => { const show = ${s.ui ? 'true' : 'false'};
      for (const id of ['panel', 'transport']) document.getElementById(id).style.display = show ? '' : 'none';
      const c = document.getElementById('stage');
      c.style.left = show ? '360px' : '0'; c.style.width = show ? 'calc(100% - 360px)' : '100%';
      const r = document.getElementById('viewreset'); if (r) r.style.display = show ? '' : 'none';
      window.dispatchEvent(new Event('resize')); return true; })()`);
    await js(`(() => { const L = window.ledportal; L.app.t = ${s.t}; L.app.playing = true;
      L.app.view = ${s.flat ? "'flat'" : "'preview'"};
      ${s.pos ? `L.preview.camera.position.set(${s.pos.join(',')}); L.preview.controls.target.set(${s.look.join(',')}); L.preview.controls.update();` : ''}
      return true; })()`);
    await sleep(2500);
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUT, `${s.name}.png`), img.toPNG());
    console.log('chụp', s.name);
  }
  app.exit(0);
});
