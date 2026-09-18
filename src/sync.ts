// Đồng bộ cửa sổ ĐIỀU KHIỂN -> cửa sổ XUẤT qua BroadcastChannel (cùng origin, cùng máy).
// Chạy được cả trong Electron lẫn trình duyệt thường (mở thêm tab ?output=1).
//
// Cửa sổ xuất tự dựng bản đồ pixel của nó (hiệu ứng là hàm tất định của thời gian cảnh nên hai bên
// ra cùng khung hình) và tự ngoại suy thời gian từ mốc gần nhất:
//   t = t_gửi + (đồng hồ_hiện_tại − đồng hồ_lúc_gửi)
// nên LED vẫn mượt đủ khung hình kể cả khi bảng điều khiển giật hay bị che.
import type { Person, Project } from './model';

const CHANNEL = 'ledportal.sync.v1';

export interface SyncState {
  t: number;
  playing: boolean;
  /** đồng hồ tường (ms) lúc gửi — so được giữa các cửa sổ trên cùng một máy */
  sentAt: number;
}

type Message = { type: 'hello' } | { type: 'project'; data: Project } | { type: 'state'; state: SyncState } | { type: 'persons'; persons: Person[] };

export const wallClock = (): number => performance.timeOrigin + performance.now();

export function createControlSync(getProject: () => Project, getState: () => SyncState): { sendProject: () => void; sendState: () => void; sendPersons: (persons: Person[]) => void } {
  const channel = new BroadcastChannel(CHANNEL);
  const sendProject = (): void => channel.postMessage({ type: 'project', data: getProject() } satisfies Message);
  const sendState = (): void => channel.postMessage({ type: 'state', state: getState() } satisfies Message);
  // vị trí người: gửi mỗi khung (nhỏ), cửa sổ xuất dùng gói mới nhất
  const sendPersons = (persons: Person[]): void => channel.postMessage({ type: 'persons', persons } satisfies Message);
  // cửa sổ xuất vừa mở sẽ chào -> gửi ngay dự án + thời gian hiện tại
  channel.onmessage = (e: MessageEvent<Message>) => { if (e.data.type === 'hello') { sendProject(); sendState(); } };
  // nhịp tim: bù trôi đồng hồ và cho cửa sổ xuất mở muộn
  setInterval(sendState, 500);
  return { sendProject, sendState, sendPersons };
}

export function createOutputSync(onProject: (data: Project) => void, onState: (s: SyncState) => void, onPersons: (p: Person[]) => void): void {
  const channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = (e: MessageEvent<Message>) => {
    if (e.data.type === 'project') onProject(e.data.data);
    else if (e.data.type === 'state') onState(e.data.state);
    else if (e.data.type === 'persons') onPersons(e.data.persons);
  };
  channel.postMessage({ type: 'hello' } satisfies Message);
}
