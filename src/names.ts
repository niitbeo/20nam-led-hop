// Tên hiển thị của nguồn hình nền (hiệu ứng có sẵn hoặc media) — dùng chung cho bảng trái và thanh thời gian.
import { EFFECTS, MEDIA_EFFECT_ID } from './render/effects';

export const SOURCE_OPTIONS: [string, string][] = [
  ...EFFECTS.map((e) => [e.id, e.name] as [string, string]),
  [MEDIA_EFFECT_ID, 'Ảnh / video (nạp tệp)'],
];

export const effectName = (id: string): string => SOURCE_OPTIONS.find((o) => o[0] === id)?.[1] ?? id;
