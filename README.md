# LED Portal Studio

Phần mềm mô phỏng và điều khiển cổng LED dạng hộp (tường trái, tường phải, trần, mặt dựng).

- Giai đoạn 1 (hiện tại): mô phỏng 3D, thư viện hiệu ứng có sẵn chạy liền qua 4 mặt, nạp ảnh/video,
  chuyển cảnh mượt, xem bản đồ pixel đúng độ phân giải LED.
- Giai đoạn 2 (đã có): tự làm media server — bản Electron mở một hay nhiều cửa sổ xuất phủ màn hình gửi
  cho bộ xử lý LED, mỗi cửa sổ hiện một vùng của bản đồ pixel ở tỉ lệ 1:1, đồng bộ thời gian với bảng điều khiển.
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
`npm run dist` tạo bộ cài trong `release/`. Xem `CLAUDE.md` để biết kiến trúc.
