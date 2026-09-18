// Xuất MP4 mô phỏng: DỰNG NGOẠI TUYẾN từng khung ở đúng t = k/fps (bản đồ pixel -> hộp 3D -> camera chọn sẵn)
// rồi đưa vào WebCodecs H.264, trộn âm thanh bằng OfflineAudioContext, ghép bằng mp4-muxer.
// Không quay màn hình nên không rớt khung, máy chậm cũng ra đúng video, xuất lần nào cũng như nhau.
import { ArrayBufferTarget, FileSystemWritableFileStreamTarget, Muxer } from 'mp4-muxer';
import * as THREE from 'three';
import { getMedia, MediaCache } from './media';
import { locate, sceneDuration, sceneStart, type AudioRef, type Person, type Project } from './model';
import { Compositor } from './render/compositor';
import { Preview, type CameraPreset } from './render/preview';
import { SimSource } from './tracking/sources';

export interface ExportOptions {
  width: number;
  height: number;
  fps: number;
  /** đoạn chương trình cần xuất, giây */
  from: number;
  to: number;
  camera: CameraPreset;
  audio: boolean;
  /** người ảo đi trong cổng (chỉ khi dự án đang bật tương tác) */
  persons: boolean;
  /** ghi thẳng ra đĩa trong lúc mã hoá; không có thì gom trong bộ nhớ rồi trả về Blob */
  file?: FileSystemFileHandle;
}

export interface ExportProgress {
  stage: 'prepare' | 'audio' | 'video' | 'finalize';
  frame: number;
  total: number;
  /** khung hình dựng được mỗi giây */
  speed: number;
}

export interface ExportResult {
  blob: Blob | null;
  frames: number;
  seconds: number;
  hasAudio: boolean;
  encoder: string;
}

const AUDIO_RATE = 48000;

async function pickVideoConfig(width: number, height: number, fps: number, bitrate: number): Promise<VideoEncoderConfig> {
  const codecs = ['avc1.64002a', 'avc1.4d002a', 'avc1.42002a', 'avc1.640034'];
  for (const codec of codecs)
    for (const hardwareAcceleration of ['prefer-hardware', 'no-preference'] as const) {
      const config: VideoEncoderConfig = { codec, width, height, framerate: fps, bitrate, hardwareAcceleration, avc: { format: 'avc' } };
      if ((await VideoEncoder.isConfigSupported(config)).supported) return config;
    }
  throw new Error(`Máy này không mã hoá được H.264 ở ${width}×${height} @ ${fps} fps. Thử độ phân giải thấp hơn.`);
}

/** Trộn nhạc nền + tiếng từng cảnh của đoạn [from, to]; gain theo đúng luật chồng mờ của AudioEngine. */
async function mixAudio(project: Project, from: number, to: number): Promise<AudioBuffer | null> {
  const refs: AudioRef[] = [];
  if (project.music) refs.push(project.music);
  for (const s of project.scenes) if (s.audio) refs.push(s.audio);
  if (refs.length === 0) return null;
  const ctx = new OfflineAudioContext(2, Math.ceil((to - from) * AUDIO_RATE), AUDIO_RATE);
  const buffers = new Map<string, AudioBuffer>();
  for (const r of refs) {
    if (buffers.has(r.id)) continue;
    const m = await getMedia(r.id);
    if (!m) continue;
    try { buffers.set(r.id, await ctx.decodeAudioData(await m.blob.arrayBuffer())); } catch { /* tệp hỏng: bỏ */ }
  }
  let any = false;
  /** phát `ref` từ thời điểm `start` (giây trên chương trình) với đường gain (giây chương trình -> hệ số). */
  const play = (ref: AudioRef, start: number, end: number, loop: boolean, ramps: [number, number][]): void => {
    const buf = buffers.get(ref.id);
    if (!buf || ref.volume <= 0) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = loop;
    const gain = ctx.createGain();
    src.connect(gain).connect(ctx.destination);
    gain.gain.setValueAtTime(0, 0);
    for (const [t, g] of ramps) {
      const at = Math.max(0, t - from);
      gain.gain.linearRampToValueAtTime(g * ref.volume, at);
    }
    const s0 = Math.max(start, from);
    if (s0 >= Math.min(end, to)) return;
    const offset = s0 - start;
    if (!loop && offset >= buf.duration) return;
    src.start(s0 - from, loop ? offset % buf.duration : offset, Math.min(end, to) - s0);
    any = true;
  };
  if (project.music) play(project.music, 0, to, true, [[from, 1], [to, 1]]);
  project.scenes.forEach((s, i) => {
    if (!s.audio) return;
    const st = sceneStart(project, i);
    const d = sceneDuration(s);
    const en = st + d;
    // vào: chồng mờ theo chuyển cảnh của cảnh trước; ra: theo chuyển cảnh của chính nó
    const prev = i > 0 ? project.scenes[i - 1] : project.loop ? project.scenes[project.scenes.length - 1] : null;
    const tin = prev && prev.transition !== 'cut' ? Math.min(prev.transitionDuration, sceneDuration(prev)) : 0;
    const tout = s.transition !== 'cut' && (i < project.scenes.length - 1 || project.loop) ? Math.min(s.transitionDuration, d) : 0;
    const ramps: [number, number][] = [];
    // cảnh này thực ra bắt đầu sớm `tin` giây (đang chồng vào cảnh trước)
    const start = st - tin;
    ramps.push([start, 0], [st, 1]);
    ramps.push([en - tout, 1], [en, 0]);
    play(s.audio, start, en, s.audio.loop, ramps);
  });
  return any ? ctx.startRendering() : null;
}

function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  if (!Number.isFinite(video.duration) || video.duration <= 0) return Promise.resolve();
  const want = time % video.duration;
  if (Math.abs(video.currentTime - want) < 0.02) return Promise.resolve();
  return new Promise((resolve) => {
    const done = (): void => { video.removeEventListener('seeked', done); clearTimeout(timer); resolve(); };
    const timer = setTimeout(done, 400);
    video.addEventListener('seeked', done);
    video.currentTime = want;
  });
}

export async function exportVideo(
  project: Project,
  opts: ExportOptions,
  onProgress: (p: ExportProgress) => void,
  cancel: { requested: boolean },
): Promise<ExportResult> {
  if (typeof VideoEncoder === 'undefined') throw new Error('Trình duyệt này không có WebCodecs — hãy dùng bản cài LED Portal Studio hoặc Chrome/Edge mới.');
  const width = opts.width & ~1, height = opts.height & ~1;
  const { fps } = opts;
  const total = Math.max(1, Math.round((opts.to - opts.from) * fps));
  const bitrate = Math.round(Math.min(60e6, Math.max(4e6, width * height * fps * 0.14)));

  onProgress({ stage: 'prepare', frame: 0, total, speed: 0 });
  // dựng riêng: canvas + renderer + compositor + preview, không đụng cửa sổ đang xem
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  const media = new MediaCache();
  const compositor = new Compositor(project, width >= 1920 ? 0.6 : 0.5);
  const preview = new Preview(canvas, compositor.output);
  preview.applyProject(project);
  preview.resize(width, height);
  preview.setPreset(opts.camera);
  preview.showPeople = !(project.interaction.enabled && opts.persons);
  const sim = project.interaction.enabled && opts.persons ? new SimSource(() => project.portal, () => project.interaction.sim.walkers) : null;
  if (sim) await sim.start();

  // nạp trước mọi media của các cảnh (ảnh, video, ảnh trong lớp phủ) và mô hình nhân vật
  const ids = new Set<string>();
  for (const s of project.scenes) {
    if (s.media) ids.add(s.media.id);
    for (const o of s.overlays ?? []) {
      if (o.kind === 'image' && o.mediaId) ids.add(o.mediaId);
      if (o.kind === 'gallery') for (const it of o.items) if (it.mediaId) ids.add(it.mediaId);
    }
  }
  for (const id of ids) media.lookup(id);
  const deadline = performance.now() + 15000;
  while (performance.now() < deadline && [...ids].some((id) => media.lookup(id) === null && !media.isMissing(id))) await new Promise((r) => setTimeout(r, 100));
  await preview.ready();
  const videos = [...ids].map((id) => media.lookup(id)?.video).filter((v): v is HTMLVideoElement => !!v);
  for (const v of videos) v.pause();

  onProgress({ stage: 'audio', frame: 0, total, speed: 0 });
  const mixed = opts.audio ? await mixAudio(project, opts.from, opts.to) : null;
  let audioConfig: AudioEncoderConfig | null = null;
  let audioCodec: 'aac' | 'opus' | null = null;
  if (mixed) {
    const aac: AudioEncoderConfig = { codec: 'mp4a.40.2', sampleRate: AUDIO_RATE, numberOfChannels: 2, bitrate: 192_000 };
    const opus: AudioEncoderConfig = { codec: 'opus', sampleRate: AUDIO_RATE, numberOfChannels: 2, bitrate: 160_000 };
    if ((await AudioEncoder.isConfigSupported(aac)).supported) { audioCodec = 'aac'; audioConfig = aac; }
    else if ((await AudioEncoder.isConfigSupported(opus)).supported) { audioCodec = 'opus'; audioConfig = opus; }
  }

  const videoConfig = await pickVideoConfig(width, height, fps, bitrate);
  const writable = opts.file ? await opts.file.createWritable() : null;
  const target = writable ? new FileSystemWritableFileStreamTarget(writable) : new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width, height, frameRate: fps },
    audio: audioCodec ? { codec: audioCodec, numberOfChannels: 2, sampleRate: AUDIO_RATE } : undefined,
    fastStart: writable ? false : 'in-memory',
    firstTimestampBehavior: 'offset',
  });
  const fail: { error: Error | null } = { error: null };
  const videoEncoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { fail.error = e; } });
  videoEncoder.configure(videoConfig);

  const t0 = performance.now();
  let persons: Person[] = [];
  try {
    // tua nhân vật/camera về đầu đoạn để khung đầu không "nhảy"
    const dt = 1 / fps;
    for (let k = 0; k < total; k++) {
      if (cancel.requested) throw new DOMException('Đã huỷ xuất video', 'AbortError');
      if (fail.error) throw fail.error;
      const t = opts.from + k / fps;
      const cursor = locate(project, t);
      if (cursor) {
        const a = project.scenes[cursor.index];
        const av = a.media ? media.lookup(a.media.id)?.video : undefined;
        if (av) await seekVideo(av, cursor.local);
        if (cursor.next !== null) {
          const b = project.scenes[cursor.next];
          const bv = b.media ? media.lookup(b.media.id)?.video : undefined;
          if (bv && bv !== av) await seekVideo(bv, cursor.nextLocal);
        }
      }
      if (sim) persons = sim.update(dt);
      compositor.persons = persons;
      preview.setTrackedPersons(sim ? persons : null);
      compositor.render(renderer, cursor, media.lookup, false);
      preview.update(dt);
      renderer.setRenderTarget(null);
      renderer.render(preview.scene, preview.camera);
      const frame = new VideoFrame(canvas, { timestamp: Math.round((k * 1e6) / fps), duration: Math.round(1e6 / fps) });
      videoEncoder.encode(frame, { keyFrame: k % (fps * 2) === 0 });
      frame.close();
      while (videoEncoder.encodeQueueSize > 6) await new Promise((r) => videoEncoder.addEventListener('dequeue', r, { once: true }));
      if (k % 10 === 0) {
        onProgress({ stage: 'video', frame: k, total, speed: (k + 1) / ((performance.now() - t0) / 1000) });
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    await videoEncoder.flush();
    if (fail.error) throw fail.error;

    if (mixed && audioConfig) {
      const audioEncoder = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: (e) => { fail.error = e; } });
      audioEncoder.configure(audioConfig);
      const L = mixed.getChannelData(0), R = mixed.numberOfChannels > 1 ? mixed.getChannelData(1) : L;
      const block = 4800;
      for (let i = 0; i < mixed.length; i += block) {
        const n = Math.min(block, mixed.length - i);
        const planar = new Float32Array(n * 2);
        planar.set(L.subarray(i, i + n), 0);
        planar.set(R.subarray(i, i + n), n);
        const chunk = new AudioData({ format: 'f32-planar', sampleRate: AUDIO_RATE, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((i / AUDIO_RATE) * 1e6), data: planar });
        audioEncoder.encode(chunk);
        chunk.close();
      }
      await audioEncoder.flush();
      audioEncoder.close();
      if (fail.error) throw fail.error;
    }

    onProgress({ stage: 'finalize', frame: total, total, speed: 0 });
    muxer.finalize();
    if (writable) await writable.close();
    return {
      blob: target instanceof ArrayBufferTarget ? new Blob([target.buffer], { type: 'video/mp4' }) : null,
      frames: total,
      seconds: (performance.now() - t0) / 1000,
      hasAudio: !!audioCodec,
      encoder: `${videoConfig.codec} ${videoConfig.hardwareAcceleration}`,
    };
  } catch (err) {
    if (writable) await writable.abort().catch(() => undefined);
    throw err;
  } finally {
    if (videoEncoder.state !== 'closed') videoEncoder.close();
    sim?.stop();
    renderer.dispose();
  }
}
