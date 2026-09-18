// Tự lưu dự án vào localStorage; xuất/nhập file JSON. Media không nằm trong JSON (ở IndexedDB).
import { defaultLayout, defaultText, makeScene, type PortalSpec, type Project } from './model';

const KEY = 'ledportal.project.v1';

/** Điền mặc định cho dữ liệu cũ/thiếu để không vỡ khi thêm trường mới. */
export function normalize(raw: unknown): Project | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<Project>;
  if (!r.portal || !Array.isArray(r.scenes)) return null;
  const portal: PortalSpec = { width: 4, height: 3, length: 6, facadeWidth: 6, facadeHeight: 4.2, pitchMm: 2.5, ...(r.portal as Partial<PortalSpec>) };
  const project: Project = {
    version: 1,
    name: r.name ?? 'Cổng LED',
    portal,
    layout: r.layout ?? defaultLayout(portal),
    loop: r.loop ?? true,
    scenes: r.scenes.map((s) => ({ ...makeScene(s.effect ?? 'nebula'), ...s, text: { ...defaultText(), ...(s.text ?? {}) } })),
  };
  return project;
}

export function loadProject(): Project | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalize(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function saveProject(p: Project): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* đầy bộ nhớ: bỏ qua */ }
}

export function clearProject(): void {
  localStorage.removeItem(KEY);
}

export function downloadJson(p: Project): void {
  const blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${p.name.replace(/[^\p{L}\p{N}_-]+/gu, '-') || 'cong-led'}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function pickJson(): Promise<Project | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      try { resolve(normalize(JSON.parse(await f.text()))); } catch { resolve(null); }
    };
    input.click();
  });
}
