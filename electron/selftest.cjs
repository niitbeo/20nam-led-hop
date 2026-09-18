// Tự kiểm tra (chỉ chạy khi có biến môi trường LEDPORTAL_SELFTEST=<thư mục>): mở một cửa sổ xuất ở vùng
// nhỏ (co vừa), chờ hai bên chạy, chụp cả hai cửa sổ ra PNG, ghi report.json (thời gian hai bên) rồi thoát.
// Dùng để xác nhận trên ứng dụng thật rằng cửa sổ xuất nhận được dự án và chạy cùng thời gian với bảng điều khiển.
const fs = require('node:fs');
const path = require('node:path');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run({ app, openOutput, getControl, getOutputs }, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const report = { ok: false, steps: [] };
  try {
    const control = getControl();
    const js = (win, code) => win.webContents.executeJavaScript(code, true);
    const waitFor = async (win, code, what) => {
      for (let i = 0; i < 120; i++) {
        if (await js(win, code).catch(() => false)) return;
        await sleep(500);
      }
      throw new Error(`hết giờ chờ: ${what}`);
    };
    await waitFor(control, 'typeof window.ledportal !== "undefined"', 'bảng điều khiển nạp xong');
    report.steps.push('control ready');
    openOutput({ displayId: -1, rect: { x: 40, y: 40, width: 960, height: 720 }, fit: true, label: 'selftest' });
    const output = getOutputs()[0];
    await waitFor(output, 'document.body.classList.contains("output") && document.getElementById("status").textContent === ""', 'cửa sổ xuất nhận dự án');
    report.steps.push('output received project');
    await sleep(3000);
    const tControl = await js(control, 'window.ledportal.app.t');
    const tOutput = await js(output, 'window.ledportalOutput ? window.ledportalOutput.t() : null');
    report.tControl = tControl;
    report.tOutput = tOutput;
    report.drift = tOutput === null ? null : Math.abs(tControl - tOutput);
    fs.writeFileSync(path.join(dir, 'control.png'), (await control.webContents.capturePage()).toPNG());
    fs.writeFileSync(path.join(dir, 'output.png'), (await output.webContents.capturePage()).toPNG());
    report.ok = report.drift !== null && report.drift < 0.5;
  } catch (err) {
    report.error = String(err && err.stack ? err.stack : err);
  }
  fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(report, null, 2));
  app.exit(report.ok ? 0 : 1);
}

module.exports.maybeRun = (ctx) => {
  const dir = process.env.LEDPORTAL_SELFTEST;
  if (dir) void run(ctx, dir);
};
