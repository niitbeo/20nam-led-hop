# LED Portal Studio

Mô phỏng và (giai đoạn 2) điều khiển cổng LED dạng hộp: tường trái, tường phải, trần và mặt dựng phía trước.
Dự án đầu tiên: "Cổng Kiến Tạo DAU" (ĐH Kiến trúc Đà Nẵng). ĐÚNG BẢN VẼ của poster: bề rộng TỔNG 4,0 m =
lối đi thực tế 3,0 m + khung thép & tấm LED 0,5 m mỗi bên (`PortalSpec.frameThickness`, cũng là độ dày vỏ trong
mô phỏng); cao 3,0 m; dài cổng 6,0 m; mặt dựng 6 × 4,2 m (trụ 1,5 m mỗi bên, dải trên 1,2 m); P2.5.
Đừng nhầm 4,0 m thành bề rộng lối đi — `totalWidth()` mới là con số ghi trên bản vẽ.

## Chạy

- `npm run dev` → http://localhost:5184 · `npm run typecheck` phải sạch trước khi commit.
- `npm run app` → build rồi mở bản Electron (nạp `dist` qua `app://studio`). `npm run app:dev` → Electron nạp dev server (phải đang chạy `npm run dev`).
- `npm run dist` → `release/LEDPortalStudio-Setup-<version>.exe` (NSIS, x64). Icon: `build/icon.ico|png` sinh bởi `npm run icon`
  (`build/make-icon.py`, cần Pillow); đổi icon = sửa script rồi chạy lại. CHƯA ký số (người dùng chốt để sau): khi có chứng chỉ
  .pfx chỉ cần đặt `CSC_LINK=<đường dẫn .pfx>` + `CSC_KEY_PASSWORD` rồi `npm run dist`, electron-builder tự ký exe + bộ cài
  (đã thử với chứng chỉ tự ký, chạy được; cảnh báo 7z symlink darwin là vô hại).
- Trong Claude Code: preview `led-portal` (launch.json ở `D:\ai\.claude` và ở đây). Console có `window.ledportal` = { app, preview, compositor, media, sync } (bảng điều khiển) và `window.ledportalOutput` = { t(), project } (cửa sổ xuất).
- `npm run shots` (cần `npm run dev` chạy sẵn) → `docs/screenshots/*.png`: chụp 7 ảnh giới thiệu từ dự án mẫu bằng Electron
  (`build/make-screenshots.cjs`, ẩn giao diện, đặt camera/thời điểm sẵn). Dùng để gửi khách duyệt và làm ảnh README.
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

## Lớp phủ (chữ nhiều dòng, logo, mốc thời gian) và chủ đề 20 năm

- `Scene.overlays[]` (`Overlay` trong model.ts): kind text | image | timeline; đặt vào vùng của màn: mặt dựng có 4 vùng
  (`FacadeZone`: cả màn / dải trên lối vào / trụ trái / trụ phải), màn khác luôn cả màn. `size` = chiều cao lớp theo chiều cao
  vùng, (x, y) = tâm trong vùng, `speed` > 0 = chạy ngang phải→trái. Shader `OVERLAY_FRAG` giữ tỉ lệ texture theo aspect px
  của màn; lớp đứng yên rộng hơn vùng thì tự co vừa (trụ hẹp).
- Texture: chữ nhiều dòng `getBlockTextTexture`, mốc thời gian `getTimelineTexture` (mỗi dòng "năm nhãn"; đường + chấm + mũi tên),
  ảnh qua `MediaCache` — id `builtin:<tên>` nạp từ `public/assets/<tên>.png` (logo trường: `builtin:dau-logo`, `BUILTIN_LOGO`).
- Vùng trên tường/trần (`wallZone`): nửa trái / nửa phải THEO MẮT NGƯỜI XEM (tường trái: nửa trái = gần lối vào; tường phải:
  nửa phải = gần lối vào) hoặc dải trên. Lớp `gallery` = dãy ảnh có khung sáng + chú thích, ghép thành MỘT canvas
  (`getGalleryTexture`, cần mọi ảnh đã nạp; ảnh là `texture.image`); lớp `image` có `frame` vẽ khung + quầng trong shader.
- Tài nguyên tự vẽ `build/make-assets.py` (Pillow): `skyline-1..3` (phác thảo công trình phát sáng), `20-nam` (số 20 chuyển sắc
  xanh→đỏ); danh sách trong `BUILTIN_IMAGES`. Người dùng thay bằng ảnh thật qua "Chọn ảnh…" (nhiều tệp cho dãy ảnh).
- Lớp `fly` = VẬT BAY XUYÊN 4 MÀN (`FLY_FRAG`): tâm vật sống trong hệ toạ độ hầm (u = độ sâu, v = chu vi, bọc vòng theo
  P = 2H + W) nên nó trượt liên tục mặt dựng → tường → trần → tường kia, không thấy mối nối. Tham số: `size` = chiều cao THẬT
  (mét), `speed` = m/s theo chiều sâu, `spin` = vòng quanh chu vi mỗi giây, `selfSpin` = vòng tự xoay, `count` ≤ 5 bản rải đều
  trên đường bay. Mờ dần ở hai đầu đường bay. Lớp này KHÔNG dùng `zone`.
- Tối đa 8 lớp/cảnh (`MAX_OVERLAYS`) — nhớ kiểm khi thêm lớp vào cảnh đã nhiều lớp. `Scene.text` (một dòng chạy) vẫn giữ để tương thích.
- Hiệu ứng `ribbon` "Lụa đỏ kỷ niệm" theo tông banner 20 năm; dự án mẫu dùng bộ `facadeSet()` (dải trên + trụ trái 4 từ khoá
  + trụ phải logo & 5 dòng) ở cảnh 1 và 5, cảnh 5 thêm mốc thời gian 2006→2026 chạy trên tường.

## Xuất video MP4 mô phỏng

- `src/export.ts`: DỰNG NGOẠI TUYẾN từng khung t = k/fps bằng bộ riêng (canvas + renderer + Compositor scale 0,5–0,6 + Preview
  + SimSource nếu bật tương tác) → WebCodecs `VideoEncoder` H.264 → `mp4-muxer`. Nạp trước media/mô hình (`preview.ready()`),
  video trong cảnh được tua bằng `seekVideo` + chờ `seeked` từng khung. Tiếng: `mixAudio` (OfflineAudioContext) — nhạc nền lặp
  + tiếng cảnh với gain ramp theo đúng luật chồng mờ của AudioEngine → AAC (lùi Opus).
- `src/exportUi.ts`: hộp thoại (độ phân giải, fps, camera, đoạn, tiếng, người ảo); ghi thẳng đĩa qua `showSaveFilePicker`,
  không có thì gom bộ nhớ rồi tải xuống. Trong lúc xuất `control.ts` DỪNG vòng lặp dựng chính (`exporting`) để GPU dồn cho bộ xuất.
- WebCodecs chỉ có ở ngữ cảnh bảo mật (localhost, app://). Đo trên máy dev (iGPU): 720p ≈ 10 khung/s khi đã dừng vòng lặp chính (640×360 chỉ 4,4 khung/s nếu còn vẽ song song) — 1080p cả chương trình 70 s mất khoảng 5–7 phút.
- Kiểm tra tệp: `C:fmpeginfprobe.exe` (máy dev). Xuất thử 1,5 s 320×180 ra đúng h264 30 fps + aac.

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
- `defaultLayout()` (model.ts) KHÔNG còn là bố cục cố định: nó xếp gọn 4 màn bằng cách thử mọi bề rộng khung là tổng bề rộng
  của một nhóm màn, mỗi lần dồn xuống-rồi-sang-trái, chọn khung diện tích nhỏ nhất (4 hình nên duyệt hết được).
  Với cổng mẫu: 6000×2400 (14,40 Mpx, lấp đầy 88%) thay cho 4800×3600 (17,28 Mpx, 73%). `layoutFill()` = tỉ lệ có nội dung.
  Đổi kích thước cổng là xếp lại; muốn khớp cách cắt vùng của bên kỹ thuật thì nhập tay x, y từng màn.
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
- Camera `fpv` "Tự đi": ↑ ↓ đi tới lui, ← → QUAY người, A/D (hoặc Q/E) bước ngang, Shift chạy; bấm vào khung 3D để khoá chuột
  nhìn quanh: KÉO chuột (không khoá, vẫn bấm được giao diện); bấm ĐÚP mới khoá chuột, Esc thả (khung xem nhúng chặn khoá
  chuột — lỗi đã được nuốt). Bàn phím đủ hướng: ↑ ↓ đi, ← → quay, A D / Q E bước ngang, R F hoặc PageUp/PageDown ngẩng-cúi,
  Shift chạy; các phím này bị chặn cuộn trang khi đang tự đi. Nút nổi `#viewreset` (hoặc phím 0) đưa góc nhìn về mặc định. Đổi sang góc nhìn khác
  thì tự thả khoá và trả con trỏ về bình thường. Có nhún bước chân; kẹp trong lối đi khi ở trong cổng, kẹp trong quảng trường khi ở ngoài.
  Timeline BỎ QUA phím ← → khi `app.camera === 'fpv'` để không vừa đi vừa tua.
  `preview.viewerPerson()` trả vị trí sàn của người đang đi; `control.ts` ghép vào danh sách `persons` (id −99) khi bật tương tác
  → đi tới đâu hiệu ứng theo người bám tới đó, và cũng gửi sang cửa sổ xuất. Không dựng mô hình nhân vật cho chính người xem.
  Không đưa `fpv` vào danh sách camera lúc xuất video (camera sẽ đứng yên).
- `src/render/preview.ts` — three.js: dán `output` lên hộp thật (uv = vị trí px/khung), vỏ tối, sàn Reflector,
  nhân vật, đèn sảnh; camera đặt sẵn + đi xuyên tự động. `FlatView` = xem bản đồ pixel.
- `src/render/characters.ts` — nhân vật glTF ở `public/models/`: CHỈ `Xbot.glb` (mannequin trung tính, Mixamo qua kho three.js;
  hoạt ảnh idle/walk/run) và `RobotExpressive.glb` (Tomás Laulhé, CC0). Nạp một lần, nhân bản bằng SkeletonUtils, tự co về
  chiều cao mét và đặt chân chạm sàn; chưa nạp xong thì hiện viên nang tạm. Xbot được nhuộm xám vì đường màu thô làm nó ngả đỏ.
  Chiều cao và pha hoạt ảnh lệch nhau theo CHỈ SỐ nhân vật (tất định, để xuất video lặp lại được), không dùng Math.random.
  Người theo dõi được: đi thì `walk`, đứng thì `idle`, xoay mượt theo hướng di chuyển.
  CHỈ dùng mannequin trắng, nhân bản nhiều bản: 3 người đứng xem + 3 người đi (xuyên cổng, đi ngược ra, đi ngang trước mặt dựng).
  Robot vàng MẶC ĐỊNH TẮT (`app.showRobot = false`), bật lại ở mục Góc nhìn. Mô hình lính đã bỏ hẳn.
- `src/ui.ts` bảng trái: HAI TAB (Nội dung / Thiết bị), mỗi mục gập được và nhớ trạng thái ở localStorage
  `ledportal.panel.open.v1`. Bề rộng kéo được (280–640 px) qua biến CSS `--panel-w`, nhớ ở `ledportal.panel.width.v1`;
  `#stage`, `#transport`, `#labels` đều tính vị trí theo biến này. Phím `H` (hoặc nút ⟨ / ☰) ẩn-hiện cả bảng
  (`body.nopanel`). Mỗi lớp phủ là một thẻ GẬP ĐƯỢC có dòng tóm tắt `overlaySummary()`; thẻ vừa thêm mở sẵn.
  Chọn cảnh từ thanh thời gian thì thẻ cảnh tự cuộn vào tầm nhìn. `src/names.ts` giữ tên nguồn hình nền dùng chung cho bảng trái và thanh thời gian.
- `src/timeline.ts` thanh thời gian kiểu phần mềm dựng: thước giây, khối cảnh (bấm để chọn, kéo thân đổi chỗ,
  kéo mép phải đổi thời lượng — bước 0,5 s, giữ Shift còn 0,1 s), phóng to bằng Ctrl + lăn chuột, sóng âm nhạc nền
  (đỉnh sóng đọc một lần rồi vẽ lặp theo độ dài bản nhạc), đầu phát tự cuộn khi đang phát.
  Phím tắt: Space, ← →, Shift + ← → (5 s), [ ], Home/End, Ctrl+D, Delete.
- HOÀN TÁC ở `control.ts`: chụp JSON cả dự án; các thay đổi liên tiếp trong 450 ms gộp thành MỘT bước (kéo thanh
  trượt không sinh trăm bước). Ctrl+Z hoàn tác, Ctrl+Y hoặc Ctrl+Shift+Z làm lại, tối đa 60 bước, có lời nhắc `#toast`.
- `src/main.ts` vòng lặp; `src/storage.ts` tự lưu localStorage `ledportal.project.v1`.

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
