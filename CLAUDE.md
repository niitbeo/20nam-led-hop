# LED Portal Studio

Mô phỏng và (giai đoạn 2) điều khiển cổng LED dạng hộp: tường trái, tường phải, trần và mặt dựng phía trước.
Dự án đầu tiên: "Cổng Kiến Tạo DAU" (ĐH Kiến trúc Đà Nẵng), lối đi 4 × 3 × 6 m, mặt dựng 6 × 4,2 m, P2.5.

## Chạy

- `npm run dev` → http://localhost:5184 · `npm run typecheck` phải sạch trước khi commit.
- `npm run app` → build rồi mở bản Electron (nạp `dist` qua `app://studio`). `npm run app:dev` → Electron nạp dev server (phải đang chạy `npm run dev`).
- `npm run dist` → `release/LEDPortalStudio-Setup-<version>.exe` (NSIS, x64). Icon: `build/icon.ico|png` sinh bởi `npm run icon`
  (`build/make-icon.py`, cần Pillow); đổi icon = sửa script rồi chạy lại. CHƯA ký số (người dùng chốt để sau): khi có chứng chỉ
  .pfx chỉ cần đặt `CSC_LINK=<đường dẫn .pfx>` + `CSC_KEY_PASSWORD` rồi `npm run dist`, electron-builder tự ký exe + bộ cài
  (đã thử với chứng chỉ tự ký, chạy được; cảnh báo 7z symlink darwin là vô hại).
- Trong Claude Code: preview `led-portal` (launch.json ở `D:\ai\.claude` và ở đây). Console có `window.ledportal` = { app, preview, compositor, media, sync } (bảng điều khiển) và `window.ledportalOutput` = { t(), project } (cửa sổ xuất).
- Tự kiểm tra bản Electron: đặt `LEDPORTAL_SELFTEST=<thư mục>` rồi `npx electron .` (hoặc `--dev`) → mở một cửa sổ xuất 960×720 co vừa, chụp `control.png` + `output.png`, ghi `report.json` (t hai bên, `drift` phải < 0,5 s), tự thoát. Chạy sau mỗi lần sửa `electron/`, `sync.ts`, `output.ts`.

## Cửa sổ xuất (media server)

- `electron/main.cjs`: cửa sổ điều khiển + NHIỀU cửa sổ xuất (`?output=1&src=x,y,w,h&fit=1`), mỗi cái: màn hình, phủ kín hoặc vùng px tuỳ chỉnh, vùng nguồn của bản đồ pixel, luôn trên cùng, Esc để đóng. `preload.cjs` chỉ lộ API màn hình/cửa sổ (`window.ledPortal`, kiểu trong `src/env.d.ts`).
- `src/output.ts`: cửa sổ xuất TỰ dựng bản đồ pixel ở tỉ lệ 1 (`Compositor(p, 1)`, `setPixelRatio(1)`) và vẽ vùng `src` lên góc trên-trái 1:1 (hoặc co vừa nếu `fit`). Không có giao diện.
- `src/sync.ts`: BroadcastChannel `ledportal.sync.v1`. Bảng điều khiển gửi `project` khi có thay đổi và `state` {t, playing, sentAt} khi phát/dừng/tua + nhịp 500 ms; cửa sổ xuất ngoại suy t từ `sentAt` → mượt kể cả khi bảng điều khiển bị che (tab nền chỉ ~4 fps).
- VÌ HAI BÊN TỰ DỰNG RIÊNG, khung hình phải tất định theo (project, t): hiệu ứng chỉ dùng `uTime` = thời gian cục bộ cảnh; không `Math.random`, không phụ thuộc fps. Media cùng origin nên IndexedDB dùng chung; video mỗi bên tự đồng bộ theo t.
- Bản build phải nạp qua `app://`, không phải `file://` (origin "null" làm hỏng localStorage, IndexedDB và BroadcastChannel).
- `Compositor.MAX_DIM = 8192`: khung xuất lớn hơn sẽ bị co và không còn 1:1.
- Tự chạy khi bật máy (`src/autostart.ts`): "bộ cửa sổ xuất" lưu ở localStorage `ledportal.autostart.v1` (kèm `displayIndex` để
  tìm lại màn hình khi id đổi sau khởi động lại); `control.ts` mở lại sau 1,5 s nếu `openOnStart` và chưa có cửa sổ nào.
  "Chạy khi đăng nhập Windows" = `app.setLoginItemSettings` (chỉ bản đóng gói). Cửa sổ xuất chết (`render-process-gone`)
  được tiến trình chính mở lại cùng cấu hình sau 1,5 s. Selftest có bước kiểm tra tự mở lại (`autostartOutputs` phải = 1).

## Chương trình & lịch phát theo giờ

- `Project.programs[]` = nhiều danh sách cảnh; `Project.scenes`/`loop` LUÔN là nội dung của chương trình đang phát (`activeProgram`).
  Đổi chương trình bằng `switchProgram()` (cất scenes hiện tại vào programs rồi lấy scenes mới); `storeActiveProgram()` trước khi lưu/xuất JSON.
  Dự án cũ không có `programs` được `normalize()` gói thành một chương trình.
- `Project.schedule`: các `ScheduleRule` {days[7] (T2..CN), start, end HH:MM, programId}; luật đứng trước ưu tiên; end < start = qua đêm
  (`activeRule()` xét cả ngày hôm trước). Ngoài mọi khung giờ: `offMode` 'black' (tắt màn) hoặc 'program' (chương trình chờ).
- `control.ts` xét lịch mỗi giây (`scheduledProgram`) nhưng CHỈ tác động khi kết quả đổi (edge-triggered) → tới mốc giờ mới chuyển,
  giữa chừng người dùng chọn tay được. Tắt màn = `app.blackout` → cursor null → khung đen; cờ `blackout` đi trong `SyncState` tới cửa sổ xuất.
- Đổi chương trình = `hooks.changed('program')`: t = 0, phát từ đầu, làm mới toàn bộ giao diện, gửi dự án cho cửa sổ xuất.

## Âm thanh

- `src/audio.ts` (`AudioEngine`): nhạc nền của chương trình (`Project.music`, theo thời gian chương trình, lặp) + tiếng riêng
  từng cảnh (`Scene.audio`, theo thời gian cục bộ cảnh, lặp tuỳ chọn). Chỉ bảng điều khiển phát tiếng; cửa sổ xuất không.
- Đồng bộ mềm: chỉ chỉnh `currentTime` khi lệch > 0,15 s. Chuyển cảnh: tiếng cảnh cũ × (1 − p), cảnh mới × p. Tắt màn theo lịch = im lặng.
- Tệp cất trong IndexedDB cùng kho ảnh/video (`putMedia` nhận `audio/*`), KHÔNG nằm trong JSON dự án — chép dự án sang máy khác
  phải nạp lại tệp. `app.masterVolume`/`app.muted` không lưu.
- Bố cục: `#stage` (canvas) nằm bên phải bảng điều khiển (left 360 px) để cổng ở giữa phần trống; mọi phép đo dùng
  `canvas.clientWidth/Height` và `getBoundingClientRect()`, không dùng `window.innerWidth`. Cửa sổ xuất: canvas phủ toàn bộ.

## Tương tác theo vị trí người (giai đoạn 3)

- `src/tracking/sources.ts` — 3 nguồn cùng trả `Person[]` {id, x, d, age} (x ngang m, 0 = tim cổng; d độ sâu m, 0 = lối vào, âm = ngoài sân):
  `SimSource` (người ảo tự đi + người đặt tay bằng Shift-kéo trên sàn 3D), `WsSource` (WebSocket, JSON `{"persons":[{"id":1,"x":0.4,"d":2.5}]}`,
  tự kết nối lại, im lặng > 1 s = không có ai), `CameraSource` (getUserMedia + MediaPipe ObjectDetector lớp "person";
  điểm chân = giữa mép dưới khung → homography 4 điểm → sàn; `Tracker` ghép id + làm mượt).
- MediaPipe chạy OFFLINE: wasm ở `public/mediapipe/wasm/`, model `public/models/efficientdet_lite0.tflite` (đã commit, ~30 MB).
  Nạp qua `new URL('/mediapipe/wasm', location.href)` nên chạy được cả `http://localhost` lẫn `app://studio`. Thử GPU trước, rớt về CPU.
- `src/tracking/calibration.ts` — màn hiệu chỉnh: bấm 4 điểm trên ảnh theo thứ tự lối vào trái → lối vào phải → cuối phải → cuối trái,
  toạ độ sàn của 4 điểm sửa được (mặc định 4 góc sàn cổng). Vẽ lưới sàn + khung người + (x,d) suy ra để kiểm tra ngay.
- Chỉ bảng điều khiển chạy nguồn tracking; `persons` phát cho cửa sổ xuất mỗi khung qua BroadcastChannel (`sync.ts`), cửa sổ xuất dùng gói mới nhất.
- Trong `Compositor`, mỗi lớp có thêm pass tương tác (`INTERACT_FRAG`): quầng = khoảng cách 3D thật từ điểm bề mặt tới người
  (tâm cao 1,1 m) nên liền qua 4 màn kể cả mặt dựng khi người còn ở ngoài; sóng lan theo tuổi người. Chế độ quầng/sóng cộng sáng
  (blend One/One), hé mở nhân (Zero/SrcColor). `driveParam` lái một tham số hiệu ứng theo tiến độ người xa nhất (d/L).
- Tối đa 8 người trong shader (`MAX_PERSONS`). Tắt tương tác = bỏ qua pass, khung hình lại tất định.

## Kiến trúc (một nguồn sự thật: bản đồ pixel)

- `src/model.ts` — `Project` (JSON duy nhất được lưu): kích thước cổng, bước điểm, bố cục px từng màn, danh sách `Scene`.
  `locate(project, t)` → cảnh đang chiếu + cảnh kế + tiến độ chuyển cảnh (chuyển cảnh nằm ở CUỐI cảnh trước).
- `src/geometry.ts` — hệ trục: x phải, y lên, z ra sân; lối vào z = 0, cổng kéo về −z, độ sâu d = −z.
  Mỗi màn có toạ độ (s,t) đúng chiều NGƯỜI XEM thấy → khung xuất là ảnh thẳng để bộ xử lý LED cắt vùng.
  Trần: "trên" ảnh = phía lối vào (người ngửa đầu ra sau). Mặt dựng = 3 tấm quanh lối vào (2 trụ + dải trên).
- `src/render/shaders.ts` — GLSL chung. `tunnel()` đổi toạ độ thế giới → (u = độ sâu, v = vị trí trên chu vi 2H+W).
  Mặt dựng có u ÂM (khoảng cách tới mép lối vào) và góc trên là "quạt" → hoạ tiết tràn liền từ mặt dựng vào trong.
- `src/render/effects.ts` — thư viện hiệu ứng: mỗi mục = schema tham số + hàm GLSL `effect(u, v, un, vn)`.
  Thêm hiệu ứng = thêm một mục; UI tự sinh thanh trượt/màu từ schema.
- `src/render/compositor.ts` — 2 lớp (cảnh A, cảnh B) vẽ vào render target theo bố cục px, rồi pass chuyển cảnh
  trộn theo toạ độ hầm (quét dọc, mở tròn từ cuối cổng, tan hạt, chớp, rèm). Kết quả = `compositor.output`.
  Media: ảnh/video (`media.ts`, blob trong IndexedDB) với 3 cách dán: mỗi màn / trải phẳng chữ U / theo bản đồ pixel.
  Chữ: canvas 2D → texture (`text.ts`), trộn alpha lên lớp; trên mặt dựng chữ nằm ở dải trên lối vào.
- `src/render/preview.ts` — three.js: dán `output` lên hộp thật (uv = vị trí px/khung), vỏ tối, sàn Reflector,
  nhân vật, đèn sảnh; camera đặt sẵn + đi xuyên tự động. `FlatView` = xem bản đồ pixel.
- `src/render/characters.ts` — nhân vật glTF ở `public/models/`: `Soldier.glb`, `Xbot.glb` (Mixamo, lấy từ kho three.js;
  hoạt ảnh idle/walk/run) và `RobotExpressive.glb` (Tomás Laulhé, CC0; Idle/Wave/ThumbsUp/Dance…). Nạp một lần, nhân bản bằng
  SkeletonUtils, tự co về chiều cao mét và đặt chân chạm sàn. Chưa nạp xong thì hiện viên nang tạm. Xbot được nhuộm xám vì
  đường màu thô làm nó ngả đỏ. Người theo dõi được: đi thì `walk`, đứng thì `idle`, xoay mượt theo hướng di chuyển.
  Robot đứng ngoài sân bên phải lối vào, thỉnh thoảng vẫy tay; có người (tracking) tới gần < 2,6 m thì vẫy liên tục.
- `src/ui.ts` bảng trái + thanh phát; `src/main.ts` vòng lặp; `src/storage.ts` tự lưu localStorage `ledportal.project.v1`.

## Bẫy đã gặp

- Vỏ tối của hộp KHÔNG được trùng mặt phẳng với tấm LED (z-fighting làm tường đen/sọc) → lùi 2 cm (`G`).
- Chiều tam giác của mỗi màn suy từ (s,t): đổi chiều s hoặc t là mặt bị cull → phải xem lại khi sửa `screenPatches`.
- Renderer đặt `outputColorSpace = LinearSRGB`, texture `NoColorSpace`: KHÔNG có bước đổi màu nào — màu hex
  trong tham số lên LED đúng như vậy. Đừng bật tone mapping/sRGB ở bất kỳ vật liệu nào.
- Tab ẩn có thể báo `innerWidth = 0` → `resize()` bỏ qua kích thước < 2 để camera không dính NaN.
- `uTime` của hiệu ứng là thời gian CỤC BỘ của cảnh → tua được, hai cửa sổ (sau này) giống nhau.
- Tự lưu localStorage: sửa `defaultProject()` sẽ không thấy gì nếu còn bản lưu — bấm "Dự án mẫu".

## Luật

1. Mọi hiệu ứng/chuyển cảnh viết theo mét trên bề mặt cổng, không theo pixel, để đổi kích thước cổng vẫn đúng.
2. Không hard-code 4 màn ở nơi khác ngoài `model.ts`/`geometry.ts`; mọi chỗ khác lặp qua `SCREEN_IDS`.
3. Giao diện chỉ sửa `app.project` rồi gọi `hooks.changed(kind)`; không gọi render trực tiếp.
