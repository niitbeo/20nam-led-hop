// Tiến trình chính của Electron.
//  - Cửa sổ ĐIỀU KHIỂN: bảng dựng + mô phỏng (màn hình làm việc).
//  - Cửa sổ XUẤT (có thể nhiều): cùng ứng dụng với ?output=1, không viền, phủ kín màn hình LED chọn
//    hoặc một vùng pixel tuỳ chỉnh; mỗi cửa sổ hiện MỘT VÙNG của bản đồ pixel (src) ở tỉ lệ 1:1.
//    Hai loại cửa sổ cùng origin nên tự đồng bộ qua BroadcastChannel ở renderer; tiến trình chính
//    chỉ lo chuyện màn hình và cửa sổ.
const { app, BrowserWindow, ipcMain, net, protocol, screen } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const DEV = process.argv.includes('--dev');
const DEV_URL = 'http://localhost:5184';
const DIST = path.join(__dirname, '..', 'dist');
// Bản build nạp qua app:// thay vì file://: trang file:// có origin "null" nên localStorage,
// IndexedDB (media) và BroadcastChannel (đồng bộ) không dùng chung được giữa các cửa sổ.
const APP_URL = DEV ? DEV_URL : 'app://studio';

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// Video/hiệu ứng nặng: không giới hạn fps khi cửa sổ bị che, và cho phép texture lớn.
app.commandLine.appendSwitch('disable-renderer-backgrounding');

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

let control = null;
/** id -> { win, opts } */
const outputs = new Map();
let outputSeq = 0;

const webPreferences = {
  preload: path.join(__dirname, 'preload.cjs'),
  contextIsolation: true,
  nodeIntegration: false,
  backgroundThrottling: false,
};

const ICON = path.join(__dirname, '..', 'build', 'icon.png');

function createControl() {
  control = new BrowserWindow({ width: 1500, height: 900, backgroundColor: '#000000', title: 'LED Portal Studio', icon: ICON, autoHideMenuBar: true, webPreferences });
  control.loadURL(APP_URL);
  control.on('closed', () => {
    control = null;
    closeAllOutputs();
  });
}

function listDisplays() {
  const primary = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((d, i) => ({
    id: d.id,
    label: `Màn hình ${i + 1}${d.id === primary ? ' (chính)' : ''} — ${Math.round(d.bounds.width * d.scaleFactor)}×${Math.round(d.bounds.height * d.scaleFactor)}`,
    primary: d.id === primary,
    width: d.bounds.width,
    height: d.bounds.height,
    scaleFactor: d.scaleFactor,
  }));
}

function listOutputs() {
  return [...outputs.entries()].map(([id, o]) => ({ id, ...o.opts }));
}

function notifyOutputs() {
  if (control) control.webContents.send('outputs:changed', listOutputs());
}

/**
 * opts: {
 *   displayId, rect?: {x, y, width, height} (px tính từ góc trên-trái màn hình đó),
 *   src: {x, y, w, h} vùng bản đồ pixel cần hiện, fit: boolean (co vào cửa sổ thay vì 1:1), label
 * }
 */
function openOutput(opts) {
  const display = screen.getAllDisplays().find((d) => d.id === opts.displayId) ?? screen.getPrimaryDisplay();
  const r = opts.rect;
  const bounds = r
    ? { x: display.bounds.x + Math.round(r.x), y: display.bounds.y + Math.round(r.y), width: Math.max(64, Math.round(r.width)), height: Math.max(64, Math.round(r.height)) }
    : display.bounds;
  const id = ++outputSeq;
  const win = new BrowserWindow({
    ...bounds,
    frame: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    backgroundColor: '#000000',
    alwaysOnTop: true,
    fullscreen: !r,
    enableLargerThanScreen: true,
    webPreferences,
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setMenuBarVisibility(false);
  const q = new URLSearchParams({ output: '1', id: String(id) });
  if (opts.src) q.set('src', `${opts.src.x},${opts.src.y},${opts.src.w},${opts.src.h}`);
  if (opts.fit) q.set('fit', '1');
  win.loadURL(`${APP_URL}/?${q.toString()}`);
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') win.close();
  });
  win.on('closed', () => {
    outputs.delete(id);
    notifyOutputs();
  });
  // Cửa sổ xuất chết (hết bộ nhớ GPU, lỗi driver...) -> mở lại cùng cấu hình sau 1,5 s để LED không đen lâu.
  win.webContents.on('render-process-gone', (_e, details) => {
    console.warn(`Cửa sổ xuất #${id} chết: ${details.reason}; mở lại`);
    const again = { ...opts };
    setTimeout(() => { if (!win.isDestroyed()) win.destroy(); if (control) openOutput(again); }, 1500);
  });
  outputs.set(id, { win, opts: { ...opts, displayId: display.id } });
  notifyOutputs();
  return id;
}

function closeOutput(id) {
  const o = outputs.get(id);
  if (o) o.win.close();
  return true;
}

function closeAllOutputs() {
  for (const o of [...outputs.values()]) o.win.close();
}

app.whenReady().then(() => {
  if (!DEV)
    protocol.handle('app', (request) => {
      const { pathname } = new URL(request.url);
      const file = path.normalize(path.join(DIST, decodeURIComponent(pathname === '/' ? '/index.html' : pathname)));
      if (!file.startsWith(DIST)) return new Response('forbidden', { status: 403 });
      return net.fetch(pathToFileURL(file).toString());
    });

  ipcMain.handle('displays:list', listDisplays);
  ipcMain.handle('output:open', (_e, opts) => openOutput(opts ?? {}));
  ipcMain.handle('output:close', (_e, id) => closeOutput(id));
  ipcMain.handle('output:closeAll', () => { closeAllOutputs(); return true; });
  ipcMain.handle('output:list', listOutputs);
  // Chạy app khi đăng nhập Windows (chỉ có ý nghĩa với bản đã đóng gói; bản dev trỏ vào electron.exe nên bỏ qua).
  ipcMain.handle('login:get', () => (app.isPackaged ? app.getLoginItemSettings().openAtLogin : false));
  ipcMain.handle('login:set', (_e, on) => {
    if (!app.isPackaged) return false;
    app.setLoginItemSettings({ openAtLogin: !!on, path: process.execPath, args: ['--autostart'] });
    return app.getLoginItemSettings().openAtLogin;
  });
  ipcMain.handle('app:isPackaged', () => app.isPackaged);

  createControl();
  for (const ev of ['display-added', 'display-removed', 'display-metrics-changed'])
    screen.on(ev, () => control && control.webContents.send('displays:changed'));

  require('./selftest.cjs').maybeRun({ app, openOutput, getControl: () => control, getOutputs: () => [...outputs.values()].map((o) => o.win) });
});

app.on('window-all-closed', () => app.quit());
