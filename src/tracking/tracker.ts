// Ghép phát hiện giữa các khung hình thành "người" có id ổn định, làm mượt vị trí, giữ vài trăm ms
// khi mất dấu để id không nhảy khi nhận diện chớp tắt.
import type { Person } from '../model';

interface Track { id: number; x: number; d: number; born: number; lastSeen: number }

export class Tracker {
  private tracks: Track[] = [];
  private nextId = 1;
  constructor(private readonly matchDist = 1.2, private readonly smoothing = 0.45, private readonly keepMs = 600) {}

  /** detections: vị trí sàn thô; now: ms. Trả danh sách người hiện có. */
  update(detections: { x: number; d: number }[], now: number): Person[] {
    const free = new Set(detections.map((_, i) => i));
    // ghép theo cặp gần nhất trước
    const pairs: { t: Track; i: number; dist: number }[] = [];
    for (const t of this.tracks) for (const i of free) pairs.push({ t, i, dist: Math.hypot(t.x - detections[i].x, t.d - detections[i].d) });
    pairs.sort((a, b) => a.dist - b.dist);
    const used = new Set<Track>();
    for (const p of pairs) {
      if (p.dist > this.matchDist || used.has(p.t) || !free.has(p.i)) continue;
      const det = detections[p.i];
      p.t.x += (det.x - p.t.x) * this.smoothing;
      p.t.d += (det.d - p.t.d) * this.smoothing;
      p.t.lastSeen = now;
      used.add(p.t);
      free.delete(p.i);
    }
    for (const i of free) this.tracks.push({ id: this.nextId++, x: detections[i].x, d: detections[i].d, born: now, lastSeen: now });
    this.tracks = this.tracks.filter((t) => now - t.lastSeen <= this.keepMs);
    return this.tracks.map((t) => ({ id: t.id, x: t.x, d: t.d, age: (now - t.born) / 1000 }));
  }

  clear(): void { this.tracks = []; }
}
