# Tạo icon ứng dụng: nền tối bo góc, cổng LED phối cảnh (mặt dựng + hầm hút vào trong) phát sáng xanh lam-tím.
# Chạy: python build/make-icon.py  -> build/icon.png (512) + build/icon.ico (16..256)
from PIL import Image, ImageDraw, ImageFilter
import os

HERE = os.path.dirname(os.path.abspath(__file__))
S = 1024  # vẽ ở 1024 rồi thu nhỏ cho mịn


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))


def rounded_bg(size, radius):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=(9, 12, 22, 255))
    return img


def make(size):
    img = rounded_bg(size, int(size * 0.2))
    glow = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    m = size * 0.16
    # cổng: khung ngoài (mặt dựng) và khung trong (cuối hầm), nối 4 cạnh -> cảm giác hút vào
    ox0, oy0, ox1, oy1 = m, m * 0.95, size - m, size - m * 0.85
    cx, cy = size / 2, size * 0.53
    iw, ih = (ox1 - ox0) * 0.42, (oy1 - oy0) * 0.42
    ix0, iy0, ix1, iy1 = cx - iw / 2, cy - ih / 2, cx + iw / 2, cy + ih / 2
    cyan = (56, 214, 255)
    violet = (140, 80, 255)
    steps = 7
    for i in range(steps + 1):
        t = i / steps
        x0, y0 = lerp((ox0, oy0), (ix0, iy0), t)
        x1, y1 = lerp((ox1, oy1), (ix1, iy1), t)
        col = lerp(cyan, violet, t)
        w = max(2, int(size * (0.022 - 0.012 * t)))
        gd.rectangle((x0, y0, x1, y1), outline=col + (255,), width=w)
    # 4 cạnh chéo nối hai khung
    for (ax, ay, bx, by) in ((ox0, oy0, ix0, iy0), (ox1, oy0, ix1, iy0), (ox0, oy1, ix0, iy1), (ox1, oy1, ix1, iy1)):
        gd.line((ax, ay, bx, by), fill=(120, 170, 255, 200), width=max(2, int(size * 0.008)))
    # sàn sáng dưới cùng của hầm
    gd.polygon(((ox0, oy1), (ox1, oy1), (ix1, iy1), (ix0, iy1)), fill=(40, 90, 200, 70))
    # lõi sáng ở cuối hầm
    core = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    cd = ImageDraw.Draw(core)
    cd.rectangle((ix0, iy0, ix1, iy1), fill=(255, 255, 255, 230))
    core = core.filter(ImageFilter.GaussianBlur(size * 0.03))
    halo = glow.filter(ImageFilter.GaussianBlur(size * 0.035))
    img.alpha_composite(halo)
    img.alpha_composite(core)
    img.alpha_composite(glow)
    return img


big = make(S)
png = big.resize((512, 512), Image.LANCZOS)
png.save(os.path.join(HERE, 'icon.png'))
sizes = [16, 24, 32, 48, 64, 128, 256]
frames = [big.resize((s, s), Image.LANCZOS) for s in sizes]
frames[-1].save(os.path.join(HERE, 'icon.ico'), format='ICO', sizes=[(s, s) for s in sizes], append_images=frames[:-1])
print('icon.png + icon.ico ok')
