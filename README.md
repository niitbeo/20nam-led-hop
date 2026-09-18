# LED Portal Studio

Phần mềm mô phỏng và điều khiển cổng LED dạng hộp (tường trái, tường phải, trần, mặt dựng).

- Giai đoạn 1 (hiện tại): mô phỏng 3D, thư viện hiệu ứng có sẵn chạy liền qua 4 mặt, nạp ảnh/video,
  chuyển cảnh mượt, xem bản đồ pixel đúng độ phân giải LED.
- Giai đoạn 2 (đã có): tự làm media server — bản Electron mở một hay nhiều cửa sổ xuất phủ màn hình gửi
  cho bộ xử lý LED, mỗi cửa sổ hiện một vùng của bản đồ pixel ở tỉ lệ 1:1, đồng bộ thời gian với bảng điều khiển.
- Nhiều chương trình + lịch phát theo giờ: mỗi chương trình một danh sách cảnh; khung giờ theo thứ trong tuần
  chọn chương trình, ngoài giờ tắt màn hoặc phát chương trình chờ. Tự chạy khi bật máy (bộ cửa sổ xuất đã lưu,
  chạy khi đăng nhập Windows, cửa sổ xuất treo tự mở lại).
- Lớp phủ theo cảnh: chữ nhiều dòng đặt đúng vùng mặt dựng (dải trên, trụ trái, trụ phải), logo trường có sẵn hoặc ảnh tự nạp,
  dải mốc thời gian 2006→2026 chạy trên tường; dãy ảnh công trình có khung sáng + chú thích đặt theo nửa tường;
  hiệu ứng nền "Lụa đỏ kỷ niệm". Dự án mẫu dựng theo poster "Cổng Kiến Tạo DAU" cả mặt dựng lẫn hai tường bên trong.
- Xuất video MP4 mô phỏng (H.264 + AAC, camera chọn được, kể cả đi xuyên) để gửi khách duyệt phương án.
- Âm thanh: nhạc nền theo chương trình + tiếng riêng từng cảnh, chồng mờ khi chuyển cảnh, phát từ máy điều khiển.
- Giai đoạn 3 (đã có): tương tác theo vị trí người. Ba nguồn: người ảo mô phỏng, WebSocket từ hệ tracking ngoài,
  hoặc camera + AI ngay trong app (MediaPipe, chạy offline, hiệu chỉnh 4 điểm sàn). Mỗi cảnh chọn cách phản ứng:
  quầng sáng theo người, sóng lan từ chân, chỉ hé mở quanh người, và lái tham số hiệu ứng theo tiến độ đi vào.

```bash
npm install
npm run dev
```

Mở http://localhost:5184 (bản trình duyệt: mô phỏng + "Mở tab xuất thử").

```bash
npm run app
```

Bản Electron: mục "Xuất ra LED" trong bảng trái → chọn màn hình, vùng nguồn → "Mở cửa sổ xuất". Esc trên cửa sổ xuất để đóng.
Tại hiện trường: mở đúng các cửa sổ xuất, bấm "Lưu bộ cửa sổ hiện tại", bật "Tự mở bộ đã lưu khi khởi động app" và
"Chạy app khi đăng nhập Windows" → bật máy là LED tự chạy; cửa sổ xuất bị treo sẽ tự mở lại.
`npm run dist` tạo bộ cài trong `release/`. Xem `CLAUDE.md` để biết kiến trúc.
