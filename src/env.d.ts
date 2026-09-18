/// <reference types="vite/client" />

/** Cấu hình một cửa sổ xuất (xem electron/main.cjs). */
interface OutputOpts {
  displayId: number;
  /** vùng cửa sổ (px) tính từ góc trên-trái màn hình; bỏ trống = phủ kín màn hình */
  rect?: { x: number; y: number; width: number; height: number };
  /** vùng của bản đồ pixel cần hiện; bỏ trống = toàn bộ */
  src?: { x: number; y: number; w: number; h: number };
  /** co vùng nguồn vào vừa cửa sổ thay vì 1:1 */
  fit?: boolean;
  label?: string;
}

interface DisplayInfo {
  id: number;
  label: string;
  primary: boolean;
  width: number;
  height: number;
  scaleFactor: number;
}

/** API do electron/preload.cjs lộ ra; không có khi chạy trong trình duyệt thường. */
interface LedPortalBridge {
  listDisplays(): Promise<DisplayInfo[]>;
  openOutput(opts: OutputOpts): Promise<number>;
  closeOutput(id: number): Promise<boolean>;
  closeAllOutputs(): Promise<boolean>;
  listOutputs(): Promise<(OutputOpts & { id: number })[]>;
  onOutputsChanged(fn: (list: (OutputOpts & { id: number })[]) => void): void;
  onDisplaysChanged(fn: () => void): void;
}

interface Window {
  ledPortal?: LedPortalBridge;
}
