# Sổ tay phát triển LED Portal Studio

Tài liệu này dành cho người tiếp tục viết mã. Người dùng cuối đọc [README](../README.md).
Ghi chú vận hành ngắn gọn cho trợ lý AI nằm ở [CLAUDE.md](../CLAUDE.md) và [AGENTS.md](../AGENTS.md).

Cập nhật: 18/09/2026 · khoảng 6.600 dòng TypeScript và JavaScript.

---

## 1. Dựng môi trường

Cần **Node.js 20 trở lên**, Windows 10/11 để đóng gói. Python kèm Pillow chỉ cần khi vẽ lại icon hoặc tài nguyên mẫu.

```bash
git clone https://github.com/niitbeo/20nam-led-hop.git
cd 20nam-led-hop
npm install
npm run dev          # http://localhost:5184
```

| Lệnh | Việc |
|---|---|
| `npm run dev` | Vite dev server, sửa mã là tự nạp lại |
| `npm run typecheck` | Bắt buộc sạch trước khi commit |
| `npm run app` | Build rồi mở bản Electron (có cửa sổ xuất LED) |
| `npm run app:dev` | Electron nạp dev server, cần `npm run dev` chạy sẵn |
| `npm run dist` | Bộ cài NSIS vào `release/` |
| `npm run icon` | Vẽ lại `build/icon.ico` và `icon.png` |
| `npm run shots` | Chụp 16 ảnh giới thiệu vào `docs/screenshots/` |
| `npm run video` | Xuất video MP4 bằng dòng lệnh |

Bản Electron đang chạy sẽ **khoá tệp trong `release/win-unpacked`**, đóng nó trước khi chạy `npm run dist`, nếu không sẽ gặp lỗi `EPERM ... unlink d3dcompiler_47.dll`.

---

## 2. Ý tưởng cốt lõi: một nguồn sự thật

Toàn bộ phần mềm xoay quanh **bản đồ pixel** — một texture duy nhất chứa nội dung của cả bốn màn, đúng độ phân giải LED.

```
Project (JSON)
   │
   ├─ geometry.ts ──── toạ độ mét của 4 màn + vị trí pixel trong khung xuất
   │
   ├─ Compositor ───── lớp cảnh A ┐
   │                   lớp cảnh B ┼─ pass chuyển cảnh ─► texture "bản đồ pixel"
   │                   lớp phủ    │                           │
   │                   lớp tương tác ┘                        ├─► Preview 3D (bảng điều khiển)
   │                                                          └─► cửa sổ xuất ra LED (cắt 1:1)
   │
   └─ tracking/ ────── mô phỏng / WebSocket / camera AI ─► Person[] ─► lớp tương tác
```

Hệ quả cần nhớ khi viết mã mới:

1. **Mọi hiệu ứng viết theo mét trên bề mặt cổng**, không theo pixel. Đổi kích thước cổng là mọi thứ vẫn đúng tỉ lệ.
2. **Khung hình phải tất định** theo cặp (dự án, thời gian). Bảng điều khiển và cửa sổ xuất dựng hình riêng biệt, chỉ trao đổi dự án và mốc thời gian. Dùng `Math.random()` hay phụ thuộc tốc độ khung hình là hai cửa sổ lệch nhau ngay.
3. **Không đổi màu ở bất kỳ khâu nào.** `THREE.ColorManagement.enabled = false`, renderer dùng `LinearSRGBColorSpace`, texture dùng `NoColorSpace`. Màu hex người dùng nhập lên LED đúng như vậy.

### Hệ toạ độ

`geometry.ts` quy ước: x sang phải, y lên trên, z hướng ra sân. Lối vào ở z = 0, cổng kéo dài về −z, nên **độ sâu d = −z**.

Mỗi màn có toạ độ riêng `(s, t) ∈ [0,1]²` đúng chiều người xem nhìn thấy, để khung xuất là ảnh thẳng cho bộ xử lý LED cắt vùng. Trần quy ước "trên ảnh" là phía lối vào, vì người đi vào ngửa đầu ra sau.

`shaders.ts` cung cấp hàm `tunnel()` đổi toạ độ thế giới sang **toạ độ hầm**:

- `u` = độ sâu tính từ lối vào. Mặt dựng có `u` **âm**, là khoảng cách ra ngoài mép lối vào.
- `v` = vị trí trên chu vi, chạy 0 ở chân tường trái → `H` đỉnh tường trái → `H+W` mép trần phải → `2H+W` chân tường phải.

Nhờ cặp `(u, v)` này mà hoạ tiết, vật bay, sóng chạm đều trượt liền qua bốn mặt.

---

## 3. Cây tệp

```
src/
  model.ts        633 dòng. Kiểu dữ liệu Project, Scene, Overlay, Program, Schedule, InteractionConfig.
                  Hàm thuần: screenPixels, defaultLayout (xếp gọn khung xuất), canvasSize, locate,
                  switchProgram, activeRule, scheduledProgram, defaultProject.
  geometry.ts      86 dòng. screenPatches (4 màn thành các hình chữ nhật), buildScreenBuffers.
  storage.ts       92 dòng. Tự lưu localStorage, normalize (điền mặc định cho dự án cũ), xuất/nhập JSON.
  control.ts      430 dòng. Cửa sổ điều khiển: vòng lặp chính, lịch phát, hoàn tác, nguồn tracking,
                  ghép người xem vào danh sách người, gửi đồng bộ.
  output.ts       112 dòng. Cửa sổ xuất: tự dựng bản đồ pixel ở tỉ lệ 1, cắt vùng src, ngoại suy thời gian.
  sync.ts          46 dòng. BroadcastChannel: project, state {t, playing, blackout, sentAt}, persons.
  ui.ts          1042 dòng. Bảng trái: hai tab, mục gập được, danh sách cảnh, thuộc tính cảnh, lớp phủ,
                  chương trình, lịch, tương tác, bố cục, xuất LED, tự chạy.
  timeline.ts     380 dòng. Thanh thời gian: thước giây, kéo thả, kéo mép, phóng to, sóng âm.
  audio.ts         85 dòng. Nhạc nền chương trình và tiếng từng cảnh, đồng bộ mềm.
  media.ts        100 dòng. Kho ảnh/video/âm thanh trong IndexedDB, bộ nhớ đệm texture, tài nguyên builtin.
  export.ts       271 dòng. Xuất MP4: dựng ngoại tuyến từng khung, trộn tiếng, WebCodecs + mp4-muxer.
  exportUi.ts     107 dòng. Hộp thoại xuất video.
  autostart.ts     41 dòng. Bộ cửa sổ xuất đã lưu, mở lại khi khởi động.
  names.ts          9 dòng. Tên nguồn hình nền dùng chung.
  env.d.ts         41 dòng. Kiểu của cầu nối Electron (window.ledPortal).
  main.ts           7 dòng. Điểm vào: ?output=1 thì chạy output.ts, không thì control.ts.
  render/
    shaders.ts     82 dòng. GLSL dùng chung: nhiễu, tunnel(), unfold(), đỉnh vẽ phẳng.
    effects.ts    295 dòng. 12 hiệu ứng, mỗi cái gồm schema tham số và một hàm GLSL.
    compositor.ts 856 dòng. Trái tim: 2 lớp cảnh, chuyển cảnh, media, chữ, 5 loại lớp phủ, lớp tương tác.
    preview.ts    630 dòng. Mô phỏng 3D: hình học cổng, vỏ, sàn, sảnh, nhân vật, 7 góc máy, tự đi.
    text.ts       191 dòng. Canvas 2D thành texture: chữ chạy, khối chữ, mốc thời gian, dãy ảnh.
    characters.ts  88 dòng. Nạp glTF, nhân bản bằng SkeletonUtils, đổi hoạt ảnh.
  tracking/
    sources.ts    232 dòng. SimSource, WsSource, CameraSource (MediaPipe).
    calibration.ts 149 dòng. Màn hiệu chỉnh camera 4 điểm.
    homography.ts  31 dòng. Giải ma trận chiếu phối cảnh 8 ẩn.
    tracker.ts     35 dòng. Ghép phát hiện giữa các khung thành người có id ổn định.
electron/
  main.cjs       156 dòng. Tiến trình chính: cửa sổ điều khiển, nhiều cửa sổ xuất, giao thức app://,
                 tự mở lại khi cửa sổ xuất chết, login item.
  preload.cjs     15 dòng. Cầu nối tối thiểu.
  selftest.cjs    58 dòng. Tự kiểm tra: chụp hai cửa sổ, đo lệch thời gian, kiểm tra tự mở lại.
build/
  make-icon.py         Vẽ icon ứng dụng.
  make-assets.py       Vẽ tài nguyên mẫu: phác thảo công trình, số 20 NĂM.
  make-screenshots.cjs Chụp bộ ảnh giới thiệu.
  make-video.cjs       Xuất video bằng dòng lệnh.
public/
  models/     Xbot.glb (người), RobotExpressive.glb (robot), efficientdet_lite0.tflite (nhận diện người).
  mediapipe/  wasm của MediaPipe, đóng gói để chạy offline.
  assets/     dau-logo.png, 20-nam.png, skyline-1..3.png (tài nguyên builtin).
```

---

## 4. Thêm tính năng: công thức có sẵn

### 4.1 Thêm một hiệu ứng nền

Sửa `src/render/effects.ts`, thêm một mục vào mảng `EFFECTS`:

```ts
{
  id: 'ten-moi',
  name: 'Tên hiển thị',
  params: common('#001122', '#3366ff', '#ffffff', [range('p1', 'Tham số riêng', 1, 0, 2)]),
  glsl: `
vec3 effect(float u, float v, float un, float vn) {
  // u, v: mét trên bề mặt cổng · un = u/L · vn = v/(2H+W)
  // dùng được: uC1..uC3, uSpeed, uScale, uIntensity, uP1, uP2, uTime, fbm(), noise(), hash22()
  return mix(uC1, uC2, fbm(vec2(u, v) * uScale + uTime * uSpeed)) * uIntensity;
}`,
}
```

Không phải sửa gì khác: giao diện tự sinh ô màu và thanh trượt từ `params`, danh sách nguồn trong `names.ts` tự có mục mới.

`uTime` là **thời gian cục bộ của cảnh**, không phải thời gian chương trình, nên tua được và hai cửa sổ khớp nhau.

### 4.2 Thêm một kiểu chuyển cảnh

1. `model.ts`: thêm tên vào `TransitionType`, `TRANSITION_LABEL`, `TRANSITION_INDEX` (số kế tiếp).
2. `compositor.ts`: thêm nhánh `else if (uType == N)` trong `TRANSITION_FRAG`, tính `m` là tỉ lệ trộn 0..1 theo `u`, `v` hoặc `vWorld`.

### 4.3 Thêm một loại lớp phủ

1. `model.ts`: thêm vào `OverlayKind` và `OVERLAY_KIND_LABEL`; thêm trường riêng vào `Overlay` cùng giá trị mặc định trong `makeOverlay`.
2. `compositor.ts`: nếu vẽ bằng texture thì làm như `text`/`image` (dùng `OVERLAY_FRAG`); nếu cần toán riêng thì viết shader mới và thêm một mảng vật liệu song song như `flyMats`.
3. `ui.ts`: thêm nút `+ ...` và phần soạn trong `renderProps`; cập nhật `overlaySummary` cho dòng tóm tắt.
4. `storage.ts` không cần sửa: `makeOverlay` spread lo phần điền mặc định cho dự án cũ.

Giới hạn: `MAX_OVERLAYS = 8` lớp mỗi cảnh.

### 4.4 Thêm một chế độ tương tác

1. `model.ts`: thêm vào `InteractMode` và `INTERACT_LABEL`.
2. `compositor.ts`: thêm nhánh trong `INTERACT_FRAG`, đọc `uPersons[]` (x, d, tuổi) hoặc `uTouch[]` (u, v, tuổi, mặt); thêm số hiệu vào bảng ánh xạ `{ spotlight: 1, ripple: 2, ... }`.
3. Nếu chế độ cần **nhân** thay vì **cộng sáng** thì xử lý ở chỗ đặt `blendSrc`/`blendDst` (hiện chỉ `reveal` nhân).

### 4.5 Thêm một nguồn vị trí người

Viết một lớp trong `src/tracking/` theo giao diện `PersonSource`:

```ts
interface PersonSource {
  start(): Promise<void>;
  stop(): void;
  update(dt: number): Person[];   // x ngang (m), d độ sâu (m), age (s)
  readonly status: string;        // hiện trên bảng điều khiển
}
```

Rồi thêm vào `TrackSource`, `TRACK_SOURCE_LABEL` trong `model.ts`, khởi tạo trong `syncSource()` của `control.ts`, và phần cấu hình trong `renderInteraction()` của `ui.ts`.

### 4.6 Thêm một góc máy

`preview.ts`: thêm tên vào `CameraPreset` và `CAMERA_LABEL`, thêm nhánh trong `setPreset()`. Nếu góc máy chuyển động thì xử lý trong `update(dt)`. Nếu góc máy không dùng được khi xuất video thì lọc bỏ trong `exportUi.ts` như `fpv`.

---

## 5. Quy ước viết mã

- **TypeScript nghiêm**: `strict`, `noUnusedLocals`, `noUnusedParameters`. `npm run typecheck` phải sạch.
- **Không framework giao diện.** Bảng trái dựng bằng hàm `el()` gọn trong `ui.ts`. Đừng thêm React hay thư viện UI, dự án cố ý giữ gọn để build nhanh và dễ đọc.
- **Chú thích bằng tiếng Việt**, giải thích *vì sao* chứ không mô tả lại mã. Chú thích nói rõ cái bẫy nếu có.
- **Giao diện chỉ sửa `app.project`** rồi gọi `hooks.changed(kind)`. Không gọi thẳng vào render từ `ui.ts`.
- `ChangeKind` quyết định việc phải làm lại: `portal`/`layout` dựng lại hình học, `scenes` vẽ lại danh sách, `interaction` khởi động lại nguồn tracking, `view` chỉ đổi cách hiển thị và **không** ghi vào lịch sử hoàn tác.
- **Đơn vị là mét**, góc là radian, màu là chuỗi hex trong dữ liệu.
- Mọi chuỗi hiển thị đều tiếng Việt, kể cả thông báo lỗi.

---

## 6. Kiểm thử

Chưa có bộ kiểm thử tự động theo kiểu unit test. Cách kiểm hiện dùng, theo thứ tự rẻ tới đắt:

1. `npm run typecheck`.
2. **Thử trên dev server**: `npm run dev`, mở trình duyệt, xem console không có lỗi đỏ. `window.ledportal` cho truy cập app, preview, compositor, audio, sync, source để gọi tay trong console.
3. **Tự kiểm tra bản Electron**:
   ```bash
   set LEDPORTAL_SELFTEST=C:\tmp\selftest
   npx electron .
   ```
   Mở một cửa sổ xuất 960×720, chụp `control.png` và `output.png`, kiểm tra lệch thời gian giữa hai cửa sổ phải dưới 0,5 giây, kiểm tra tự mở lại cửa sổ xuất, ghi `report.json` rồi tự thoát. Chạy sau mỗi lần đụng vào `electron/`, `sync.ts`, `output.ts`, `autostart.ts`.
4. **Chụp ảnh và xuất video** để soi mắt thường: `npm run shots`, `npm run video`.

---

## 7. Quy trình phát hành

```bash
npm run typecheck
npm run dist                 # đóng cửa sổ app đang chạy trước
# chạy tự kiểm tra trên release/win-unpacked
git add -A && git commit && git push
```

Bộ cài ra `release/LEDPortalStudio-Setup-<version>.exe`. Đổi số phiên bản ở `package.json`.

**Ký số** chưa làm. Khi có chứng chỉ `.pfx` chỉ cần đặt hai biến môi trường rồi chạy lại `npm run dist`, electron-builder tự ký cả exe lẫn bộ cài:

```bash
set CSC_LINK=D:\duong-dan\chung-chi.pfx
set CSC_KEY_PASSWORD=matkhau
```

---

## 8. Bẫy đã trả giá

| Bẫy | Cách tránh |
|---|---|
| Vỏ hộp trùng mặt phẳng với tấm LED trong mô phỏng | Lùi vỏ ra ngoài 2 cm (`G` trong `buildStructure`), nếu không tường bị sọc đen do z-fighting |
| Chiều tam giác của màn suy từ `(s, t)` | Đổi chiều `s` hoặc `t` là mặt bị cull, phải xem lại khi sửa `screenPatches` |
| Tab ẩn báo `innerWidth = 0` | `resize()` bỏ qua kích thước dưới 2 px, nếu không camera dính NaN |
| Bản build nạp qua `file://` | Phải dùng `app://`, vì `file://` có origin "null" làm hỏng localStorage, IndexedDB và BroadcastChannel |
| Sửa `defaultProject()` mà không thấy gì | Còn bản tự lưu trong localStorage, bấm "Dự án mẫu" hoặc xoá khoá `ledportal.project.v1` |
| Bật tương tác bằng cách gán thẳng `interaction.enabled = true` | Nguồn tracking không khởi động; phải đi qua ô tích của giao diện hoặc gọi `hooks.changed('interaction')` |
| `npm run dist` báo EPERM | Bản Electron đang chạy khoá tệp, đóng nó trước |
| Khoá chuột trong khung xem nhúng | Trình duyệt chặn `requestPointerLock`, lỗi đã được nuốt, kéo chuột vẫn nhìn quanh được |
| Khung xuất trên 8192 px | `Compositor.MAX_DIM` sẽ co lại, mất tỉ lệ 1:1 với LED |

---

## 9. Việc còn tồn

Xếp theo mức cần thiết:

1. **Nghiệm thu tại hiện trường**: camera thật và bộ xử lý LED thật. Đây là rủi ro lớn nhất còn lại.
2. **Chạm tường mức 2 hoặc 3**: hiện mới quy ước "đứng sát tường là chạm". Mức 2 dùng camera đặt dọc tường, mức 3 dùng camera chiều sâu để biết tay cách tường bao nhiêu.
3. **Điều khiển từ điện thoại** trong cùng mạng: đổi chương trình, tắt bật màn, không phải chạy tới máy phát.
4. **Ký số bộ cài** để bỏ cảnh báo SmartScreen.
5. **Hướng dẫn vận hành một trang** cho người trực sự kiện.
6. Thay ba ảnh công trình và số 20 tự vẽ bằng ảnh thật của trường.
7. Đồng bộ nhiều máy phát, chỉ cần khi LED lớn quá sức một máy.
8. Bộ kiểm thử tự động cho phần toán thuần: `locate`, `activeRule`, `defaultLayout`, `solveHomography`.
