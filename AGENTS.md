# Hướng dẫn cho trợ lý AI làm việc trên kho mã này

Đọc theo thứ tự này trước khi sửa bất cứ thứ gì:

1. [docs/PHAT-TRIEN.md](docs/PHAT-TRIEN.md) — sổ tay phát triển: kiến trúc, cây tệp, công thức thêm tính năng, bẫy đã gặp.
2. [CLAUDE.md](CLAUDE.md) — ghi chú vận hành ngắn: lệnh hay dùng, chi tiết từng hệ con, số đo đã kiểm chứng.
3. [README.md](README.md) — góc nhìn người dùng cuối, để biết tính năng nào đã hứa với khách.

## Luật bất di bất dịch

1. **Khung hình phải tất định** theo cặp (dự án, thời gian). Bảng điều khiển và cửa sổ xuất dựng hình riêng, chỉ đồng bộ dự án và mốc thời gian. Không `Math.random()`, không phụ thuộc tốc độ khung hình trong đường dựng hình.
2. **Không đổi màu** ở bất kỳ khâu nào: `ColorManagement` tắt, renderer `LinearSRGBColorSpace`, texture `NoColorSpace`. Màu hex người dùng nhập phải lên LED y như vậy.
3. **Hiệu ứng viết theo mét trên bề mặt cổng** (toạ độ hầm `u`, `v`), không theo pixel, để đổi kích thước cổng vẫn đúng.
4. **Giao diện chỉ sửa `app.project`** rồi gọi `hooks.changed(kind)`; không gọi thẳng vào render.
5. **Không thêm framework giao diện.** Dự án cố ý giữ gọn: TypeScript thuần, three.js, Vite, Electron.
6. **Chú thích bằng tiếng Việt**, nói rõ *vì sao*, nhất là chỗ có bẫy. Chuỗi hiển thị cũng tiếng Việt.

## Trước khi báo là xong

- `npm run typecheck` sạch.
- Thử thật trên `npm run dev`, xem console không có lỗi.
- Nếu đụng `electron/`, `sync.ts`, `output.ts`, `autostart.ts`: chạy tự kiểm tra với biến `LEDPORTAL_SELFTEST` và xem `report.json` có `ok: true`.
- Nếu đổi hình ảnh: `npm run shots` rồi nhìn ảnh, đừng tin suông.
- Đóng bản Electron đang chạy trước khi `npm run dist`, nếu không sẽ lỗi EPERM.

## Thói quen làm việc của chủ dự án

- Sửa xong thì thử trên dev trước, chỉ build bộ cài khi được yêu cầu hoặc khi đã chắc.
- Báo kết quả bằng tiếng Việt, ngắn gọn, nói thẳng cái gì chưa kiểm chứng được.
- Ảnh và video kết quả gửi kèm khi có, đừng chỉ mô tả bằng lời.
