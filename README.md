# LED Portal Studio

Phần mềm mô phỏng và điều khiển cổng LED dạng hộp (tường trái, tường phải, trần, mặt dựng).

- Giai đoạn 1 (hiện tại): mô phỏng 3D, thư viện hiệu ứng có sẵn chạy liền qua 4 mặt, nạp ảnh/video,
  chuyển cảnh mượt, xem bản đồ pixel đúng độ phân giải LED.
- Giai đoạn 2: tự làm media server (cửa sổ xuất phủ màn hình gửi cho bộ xử lý LED, Electron).
- Giai đoạn 3: tương tác theo vị trí người (camera AI tracking).

```bash
npm install
npm run dev
```

Mở http://localhost:5184. Xem `CLAUDE.md` để biết kiến trúc.
