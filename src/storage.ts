// Tự lưu dự án vào localStorage; xuất/nhập file JSON. Media không nằm trong JSON (ở IndexedDB).
import { defaultInteract, defaultInteraction, defaultLayout, defaultSchedule, defaultText, makeOverlay, makeScene, storeActiveProgram, uid, type PortalSpec, type Program, type Project, type Scene } from './model';

const KEY = 'ledportal.project.v1';

/** Điền mặc định cho dữ liệu cũ/thiếu để không vỡ khi thêm trường mới. */
export function normalize(raw: unknown): Project | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<Project>;
  if (!r.portal || !Array.isArray(r.scenes)) return null;
  const portal: PortalSpec = { width: 3, height: 3, length: 6, frameThickness: 0.5, facadeWidth: 6, facadeHeight: 4.2, pitchMm: 2.5, ...(r.portal as Partial<PortalSpec>) };
  const fixScene = (s: Partial<Scene>): Scene => ({
    ...makeScene(s.effect ?? 'nebula'), ...s,
    text: { ...defaultText(), ...(s.text ?? {}) },
    overlays: Array.isArray(s.overlays) ? s.overlays.map((o) => ({ ...makeOverlay(o.kind ?? 'text'), ...o, items: Array.isArray(o.items) ? o.items : [] })) : [],
    interact: { ...defaultInteract(), ...(s.interact ?? {}) },
  });
  const scenes = r.scenes.map(fixScene);
  // dự án cũ (trước khi có chương trình): gói danh sách cảnh thành một chương trình
  let programs: Program[] = Array.isArray(r.programs)
    ? r.programs.map((p) => ({ id: p.id ?? uid(), name: p.name ?? 'Chương trình', scenes: (p.scenes ?? []).map(fixScene), loop: p.loop ?? true, music: p.music ?? null }))
    : [];
  let activeProgram = r.activeProgram ?? '';
  if (!programs.some((p) => p.id === activeProgram)) {
    const prog: Program = { id: activeProgram || uid(), name: programs.length ? 'Chương trình' : 'Chương trình chính', scenes, loop: r.loop ?? true, music: r.music ?? null };
    programs = [prog, ...programs];
    activeProgram = prog.id;
  }
  const active = programs.find((p) => p.id === activeProgram)!;
  active.scenes = scenes;
  active.loop = r.loop ?? true;
  const project: Project = {
    version: 1,
    name: r.name ?? 'Cổng LED',
    portal,
    layout: r.layout ?? defaultLayout(portal),
    loop: active.loop,
    interaction: {
      ...defaultInteraction(), ...(r.interaction ?? {}),
      camera: { ...defaultInteraction().camera, ...(r.interaction?.camera ?? {}) },
      touch: { ...defaultInteraction().touch, ...(r.interaction?.touch ?? {}) },
    },
    scenes: active.scenes,
    music: active.music,
    programs,
    activeProgram,
    schedule: { ...defaultSchedule(), ...(r.schedule ?? {}), rules: (r.schedule?.rules ?? []).map((x) => ({ ...x, days: Array.isArray(x.days) && x.days.length === 7 ? x.days : [true, true, true, true, true, true, true] })) },
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
  storeActiveProgram(p);
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* đầy bộ nhớ: bỏ qua */ }
}

export function clearProject(): void {
  localStorage.removeItem(KEY);
}

export function downloadJson(p: Project): void {
  storeActiveProgram(p);
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
