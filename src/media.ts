// Kho ảnh/video của dự án: blob cất trong IndexedDB (vượt hạn mức localStorage), nạp thành texture khi cần.
import * as THREE from 'three';
import type { MediaAsset, MediaLookup } from './render/compositor';
import { uid } from './model';

const DB = 'ledportal';
const STORE = 'media';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export interface StoredMedia { name: string; type: string; blob: Blob }

export async function putMedia(file: File): Promise<{ id: string; name: string; kind: 'image' | 'video' | 'audio' }> {
  const id = uid();
  const kind: 'image' | 'video' | 'audio' = file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : 'image';
  await tx('readwrite', (s) => s.put({ name: file.name, type: file.type, blob: file } satisfies StoredMedia, id));
  return { id, name: file.name, kind };
}

export const getMedia = (id: string): Promise<StoredMedia | undefined> => tx('readonly', (s) => s.get(id) as IDBRequest<StoredMedia | undefined>);
export const deleteMedia = (id: string): Promise<undefined> => tx('readwrite', (s) => s.delete(id));

/** Bộ nhớ đệm texture: hỏi là trả ngay (null nếu chưa nạp xong) và tự nạp nền. */
export class MediaCache {
  private readonly map = new Map<string, MediaAsset | 'loading' | 'missing'>();

  readonly lookup: MediaLookup = (id) => {
    const v = this.map.get(id);
    if (v === undefined) {
      this.map.set(id, 'loading');
      void this.load(id);
      return null;
    }
    return typeof v === 'string' ? null : v;
  };

  private async load(id: string): Promise<void> {
    if (id.startsWith('builtin:')) {
      // tài nguyên đóng gói sẵn trong public/assets (logo trường...)
      const img = new Image();
      img.src = new URL(`/assets/${id.slice(8)}.png`, location.href).toString();
      await img.decode().catch(() => {});
      if (!img.naturalWidth) { this.map.set(id, 'missing'); return; }
      const texture = new THREE.Texture(img);
      texture.colorSpace = THREE.NoColorSpace;
      texture.needsUpdate = true;
      this.map.set(id, { texture, aspect: img.naturalWidth / img.naturalHeight, video: null });
      return;
    }
    const stored = await getMedia(id);
    if (!stored) { this.map.set(id, 'missing'); return; }
    const url = URL.createObjectURL(stored.blob);
    if (stored.type.startsWith('video/')) {
      const video = document.createElement('video');
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.src = url;
      await new Promise<void>((resolve) => { video.onloadedmetadata = () => resolve(); video.onerror = () => resolve(); });
      const texture = new THREE.VideoTexture(video);
      texture.colorSpace = THREE.NoColorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      this.map.set(id, { texture, aspect: (video.videoWidth || 16) / (video.videoHeight || 9), video });
    } else {
      const img = new Image();
      img.src = url;
      await img.decode().catch(() => {});
      const texture = new THREE.Texture(img);
      texture.colorSpace = THREE.NoColorSpace;
      texture.needsUpdate = true;
      this.map.set(id, { texture, aspect: (img.naturalWidth || 1) / (img.naturalHeight || 1), video: null });
    }
  }

  /** Tệp không có trong kho (id sai hoặc đã xoá). */
  isMissing(id: string): boolean { return this.map.get(id) === 'missing'; }

  /** Dừng mọi video không còn dùng để không tốn CPU giải mã. */
  pauseExcept(activeIds: Set<string>): void {
    for (const [id, v] of this.map) if (typeof v !== 'string' && v.video && !activeIds.has(id) && !v.video.paused) v.video.pause();
  }
}
