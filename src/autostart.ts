// Tự chạy ở hiện trường: bộ cửa sổ xuất đã lưu + tự mở khi app khởi động (+ app chạy khi đăng nhập Windows,
// phần đó do Electron lo qua window.ledPortal.setLoginItem).
const KEY = 'ledportal.autostart.v1';

export interface SavedOutput extends OutputOpts {
  /** thứ tự màn hình lúc lưu, dùng khi id màn hình đổi sau khi khởi động lại */
  displayIndex: number;
}

export interface AutostartConfig {
  outputs: SavedOutput[];
  openOnStart: boolean;
}

export function loadAutostart(): AutostartConfig {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<AutostartConfig>;
    return { outputs: Array.isArray(raw.outputs) ? raw.outputs : [], openOnStart: !!raw.openOnStart };
  } catch {
    return { outputs: [], openOnStart: false };
  }
}

export function saveAutostart(c: AutostartConfig): void {
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* bỏ qua */ }
}

/** Mở lại bộ cửa sổ đã lưu; màn hình tìm theo id, không có thì theo thứ tự, cuối cùng là màn chính. */
export async function openSavedOutputs(bridge: LedPortalBridge, saved: SavedOutput[]): Promise<number> {
  const displays = await bridge.listDisplays();
  let opened = 0;
  for (const o of saved) {
    const byId = displays.find((d) => d.id === o.displayId);
    const byIndex = displays[o.displayIndex];
    const display = byId ?? byIndex ?? displays.find((d) => d.primary) ?? displays[0];
    if (!display) continue;
    await bridge.openOutput({ displayId: display.id, rect: o.rect, src: o.src, fit: o.fit, label: o.label });
    opened++;
  }
  return opened;
}
