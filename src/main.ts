// Điểm vào: ?output=1 -> cửa sổ XUẤT ra LED (không giao diện); mặc định -> cửa sổ ĐIỀU KHIỂN.
// Font nhúng theo dự án (woff2 đi kèm bản build) -> máy phát LED nào cũng ra đúng font chữ chạy.
import '@fontsource/be-vietnam-pro/500.css';
import '@fontsource/be-vietnam-pro/800.css';

const IS_OUTPUT = new URLSearchParams(location.search).has('output');
if (IS_OUTPUT) void import('./output').then((m) => m.startOutput());
else void import('./control').then((m) => m.startControl());
