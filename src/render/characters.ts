// Nhân vật 3D cho mô phỏng: người (có xương, hoạt ảnh đứng/đi) và robot đón khách. Mô hình glTF nằm ở
// public/models (Soldier.glb + Xbot.glb: Mixamo qua kho three.js; RobotExpressive.glb: Tomás Laulhé, CC0).
// Nạp một lần rồi nhân bản bằng SkeletonUtils.clone; mỗi bản có AnimationMixer riêng.
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';

export type HumanKind = 'soldier' | 'xbot';

interface Loaded { gltf: GLTF; height: number }

const cache = new Map<string, Promise<Loaded | null>>();
const loader = new GLTFLoader();

function load(file: string): Promise<Loaded | null> {
  let p = cache.get(file);
  if (!p) {
    p = loader.loadAsync(new URL(`/models/${file}`, location.href).toString())
      .then((gltf) => {
        const box = new THREE.Box3().setFromObject(gltf.scene);
        return { gltf, height: Math.max(0.01, box.max.y - box.min.y) };
      })
      .catch((err: Error) => { console.warn(`Không nạp được mô hình ${file}:`, err.message); return null; });
    cache.set(file, p);
  }
  return p;
}

export interface Character {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  actions: Record<string, THREE.AnimationAction>;
  /** hoạt ảnh đang chạy */
  current: string;
  /** chuyển sang hoạt ảnh khác với mờ chồng ngắn */
  play(name: string, fade?: number, once?: boolean): void;
}

function instantiate(loaded: Loaded, targetHeight: number): Character {
  const root = new THREE.Group();
  const model = skeletonClone(loaded.gltf.scene);
  const s = targetHeight / loaded.height;
  model.scale.setScalar(s);
  // đặt chân chạm sàn
  const box = new THREE.Box3().setFromObject(model);
  model.position.y -= box.min.y;
  model.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.frustumCulled = false; } });
  root.add(model);
  const mixer = new THREE.AnimationMixer(model);
  const actions: Record<string, THREE.AnimationAction> = {};
  for (const clip of loaded.gltf.animations) actions[clip.name] = mixer.clipAction(clip);
  const ch: Character = {
    root, mixer, actions, current: '',
    play(name, fade = 0.25, once = false) {
      const next = actions[name];
      if (!next || ch.current === name) return;
      const prev = actions[ch.current];
      next.reset();
      next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      next.clampWhenFinished = once;
      next.enabled = true;
      next.setEffectiveWeight(1);
      if (prev) { prev.crossFadeTo(next, fade, false); next.play(); }
      else next.fadeIn(fade).play();
      ch.current = name;
    },
  };
  return ch;
}

/** Người: 'soldier' (đồ lính, hoạt ảnh Idle/Walk/Run) hoặc 'xbot' (mannequin, idle/walk/run). */
export async function makeHuman(kind: HumanKind, height = 1.72): Promise<Character | null> {
  const loaded = await load(kind === 'soldier' ? 'Soldier.glb' : 'Xbot.glb');
  if (!loaded) return null;
  const ch = instantiate(loaded, height);
  if (kind === 'xbot') {
    // mannequin gốc ngả đỏ dưới đường màu thô của app -> nhuộm xám sáng cho trung tính
    ch.root.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m && m.isMeshStandardMaterial) { m.color.set(0xb9c2cc); m.emissive.set(0x000000); }
    });
  }
  // đồng nhất tên hoạt ảnh giữa hai mô hình
  const alias: Record<string, string[]> = { idle: ['Idle', 'idle'], walk: ['Walk', 'walk'], run: ['Run', 'run'] };
  for (const [k, names] of Object.entries(alias)) for (const n of names) if (ch.actions[n] && !ch.actions[k]) ch.actions[k] = ch.actions[n];
  return ch;
}

/** Robot biểu cảm: Idle, Walking, Running, Dance, Wave, Yes, No, ThumbsUp, Jump, Punch, Sitting, Standing, Death. */
export async function makeRobot(height = 1.6): Promise<Character | null> {
  const loaded = await load('RobotExpressive.glb');
  return loaded ? instantiate(loaded, height) : null;
}
