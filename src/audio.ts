// Âm thanh: nhạc nền chương trình (theo thời gian chương trình, lặp) + tiếng riêng từng cảnh (theo thời gian
// cục bộ cảnh). Chỉ bảng điều khiển phát tiếng. Đồng bộ mềm: chỉ chỉnh currentTime khi lệch > 0,15 s
// (ép từng khung sẽ nghe tiếng tách). Khi chuyển cảnh, tiếng cảnh cũ nhỏ dần và cảnh mới lớn dần theo tiến độ.
import { getMedia } from './media';
import type { AudioRef, Cursor, Project } from './model';

const DRIFT = 0.15;

interface Track { el: HTMLAudioElement; ready: boolean }

export class AudioEngine {
  private readonly tracks = new Map<string, Track | 'loading' | 'missing'>();
  /** id -> âm lượng mong muốn khung này (để tắt những track không còn dùng) */
  private wanted = new Map<string, number>();
  master = 1;
  muted = false;

  private track(id: string): Track | null {
    const t = this.tracks.get(id);
    if (t === undefined) {
      this.tracks.set(id, 'loading');
      void getMedia(id).then((m) => {
        if (!m) { this.tracks.set(id, 'missing'); return; }
        const el = new Audio(URL.createObjectURL(m.blob));
        el.preload = 'auto';
        const tr: Track = { el, ready: false };
        el.onloadedmetadata = () => { tr.ready = true; };
        this.tracks.set(id, tr);
      });
      return null;
    }
    return typeof t === 'string' ? null : t;
  }

  /** Giữ một track ở đúng thời điểm/âm lượng. time: giây trong track (đã tính lặp bởi hàm gọi). */
  private drive(ref: AudioRef, time: number, gain: number, playing: boolean, loop: boolean): void {
    const tr = this.track(ref.id);
    if (!tr || !tr.ready) return;
    const el = tr.el;
    const dur = el.duration;
    if (!Number.isFinite(dur) || dur <= 0) return;
    let want = loop ? time % dur : time;
    const vol = this.muted ? 0 : Math.max(0, Math.min(1, ref.volume * gain * this.master));
    this.wanted.set(ref.id, vol);
    if (!loop && want >= dur) { if (!el.paused) el.pause(); return; }
    want = Math.max(0, want);
    el.loop = loop;
    if (el.volume !== vol) el.volume = vol;
    if (playing && vol > 0) {
      if (Math.abs(el.currentTime - want) > DRIFT && !(loop && dur - Math.abs(el.currentTime - want) < DRIFT)) el.currentTime = want;
      if (el.paused) void el.play().catch(() => {});
    } else {
      if (!el.paused) el.pause();
      if (Math.abs(el.currentTime - want) > DRIFT) el.currentTime = want;
    }
  }

  /** Gọi mỗi khung. blackout = tắt màn theo lịch -> im lặng. */
  update(project: Project, cursor: Cursor | null, t: number, playing: boolean, blackout: boolean): void {
    this.wanted = new Map();
    if (!blackout) {
      if (project.music) this.drive(project.music, t, 1, playing, true);
      if (cursor) {
        const a = project.scenes[cursor.index];
        const gainA = cursor.next !== null ? 1 - cursor.progress : 1;
        if (a.audio) this.drive(a.audio, cursor.local, gainA, playing, a.audio.loop);
        if (cursor.next !== null) {
          const b = project.scenes[cursor.next];
          if (b.audio && b.audio.id !== a.audio?.id) this.drive(b.audio, cursor.nextLocal, cursor.progress, playing, b.audio.loop);
        }
      }
    }
    // dừng mọi track không còn trong danh sách mong muốn
    for (const [id, tr] of this.tracks) {
      if (typeof tr === 'string' || this.wanted.has(id)) continue;
      if (!tr.el.paused) tr.el.pause();
    }
  }

  /** Thời lượng track (giây) nếu đã nạp, để hiện trong giao diện. */
  duration(id: string): number | null {
    const tr = this.tracks.get(id);
    return tr && typeof tr !== 'string' && tr.ready ? tr.el.duration : null;
  }
}
