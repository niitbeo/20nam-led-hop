// Phép chiếu phối cảnh (homography) 2D→2D từ 4 cặp điểm: ảnh camera (u,v) → sàn (x,d).
// Giải hệ 8 ẩn bằng khử Gauss, h33 = 1. Đủ cho sàn phẳng và camera cố định.

export type H = number[]; // 9 phần tử, hàng-trước

export function solveHomography(src: [number, number][], dst: [number, number][]): H | null {
  if (src.length < 4 || dst.length < 4) return null;
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const [u, v] = src[i];
    const [x, y] = dst[i];
    A.push([u, v, 1, 0, 0, 0, -x * u, -x * v, x]);
    A.push([0, 0, 0, u, v, 1, -y * u, -y * v, y]);
  }
  const n = 8;
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    if (Math.abs(A[piv][c]) < 1e-12) return null;
    [A[c], A[piv]] = [A[piv], A[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k];
    }
  }
  const h = A.map((row, i) => row[n] / row[i]);
  return [...h, 1];
}

export function applyHomography(h: H, u: number, v: number): [number, number] {
  const w = h[6] * u + h[7] * v + h[8];
  return [(h[0] * u + h[1] * v + h[2]) / w, (h[3] * u + h[4] * v + h[5]) / w];
}
