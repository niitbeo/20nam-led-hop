# LED Portal Studio

Mô phỏng và (giai đoạn 2) điều khiển cổng LED dạng hộp: tường trái, tường phải, trần và mặt dựng phía trước.
Dự án đầu tiên: "Cổng Kiến Tạo DAU" (ĐH Kiến trúc Đà Nẵng), lối đi 4 × 3 × 6 m, mặt dựng 6 × 4,2 m, P2.5.

## Chạy

- `npm run dev` → http://localhost:5184 · `npm run typecheck` phải sạch trước khi commit.
- Trong Claude Code: preview `led-portal` (launch.json ở `D:\ai\.claude` và ở đây). Console có `window.ledportal` = { app, preview, compositor, media } để gỡ lỗi.
- Chưa có Electron/cửa sổ xuất (giai đoạn 2); kiến trúc đã chừa sẵn: chỉ cần vẽ `compositor.output` ra cửa sổ thứ hai.

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
  người mẫu, đèn sảnh; camera đặt sẵn + đi xuyên tự động. `FlatView` = xem bản đồ pixel.
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
