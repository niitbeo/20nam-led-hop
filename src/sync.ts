// Đồng bộ cửa sổ ĐIỀU KHIỂN -> cửa sổ XUẤT qua BroadcastChannel (cùng origin, cùng máy).
// Chạy được cả trong Electron lẫn trình duyệt thường (mở thêm tab ?output=1).
//
// Cửa sổ xuất tự dựng bản đồ pixel của nó (hiệu ứng là hàm tất định của thời gian cảnh nên hai bên
// ra cùng khung hình) và tự ngoại suy thời gian từ mốc gần nhất:
//   t = t_gửi + (đồng hồ_hiện_tại − đồng hồ_lúc_gửi)
// nên LED vẫn mượt đủ khung hình kể cả khi bảng điều khiển giật hay bị che.
import type { Project } from './model';

const CHANNEL = 'ledportal.sync.v1';

export interface SyncState {
  t: number;
  playing: boolean;
  /** đồng hồ tường (ms) lúc gửi — so được giữa các cửa sổ trên cùng một máy */
  sentAt: number;
}

type Message = { type: 'hello' } | { type: 'project'; data: Project } | { type: 'state'; state: SyncState };

export const wallClock = (): number => performance.timeOrigin + performance.now();

export function createControlSync(getProject: () => Project, getState: () => SyncState): { sendProject: () => void; sendState: () => void } {
  const channel = new BroadcastChannel(CHANNEL);
  const sendProject = (): void => channel.postMessage({ type: 'project', data: getProject() } satisfies Message);
  const sendState = (): void => channel.postMessage({ type: 'state', state: getState() } satisfies Message);
  // cửa sổ xuất vừa mở sẽ chào -> gửi ngay dự án + thời gian hiện tại
  channel.onmessage = (e: MessageEvent<Message>) => { if (e.data.type === 'hello') { sendProject(); sendState(); } };
  // nhịp tim: bù trôi đồng hồ và cho cửa sổ xuất mở muộn
  setInterval(sendState, 500);
  return { sendProject, sendState };
}

export function createOutputSync(onProject: (data: Project) => void, onState: (s: SyncState) => void): void {
  const channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = (e: MessageEvent<Message>) => {
    if (e.data.type === 'project') onProject(e.data.data);
    else if (e.data.type === 'state') onState(e.data.state);
  };
  channel.postMessage({ type: 'hello' } satisfies Message);
}
