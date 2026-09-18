# Sinh tài nguyên đóng gói sẵn (public/assets): ảnh phác thảo công trình kiểu bản vẽ phát sáng (skyline-1..3)
# và chữ số "20 NĂM" lớn (20-nam). Người dùng thay bằng ảnh thật của trường qua "Chọn ảnh…".
# Chạy: python build/make-assets.py   (cần Pillow)
import math
import os
import random

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'public', 'assets')
os.makedirs(OUT, exist_ok=True)


def glow_layer(size, draw_fn, blur, alpha=1.0):
    img = Image.new('RGBA', size, (0, 0, 0, 0))
    draw_fn(ImageDraw.Draw(img))
    img = img.filter(ImageFilter.GaussianBlur(blur))
    if alpha < 1:
        a = img.split()[3].point(lambda v: int(v * alpha))
        img.putalpha(a)
    return img


def skyline(seed, path):
    random.seed(seed)
    W, H = 1400, 900
    base = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    # nền trong suốt hơi xanh để ảnh hoà với tinh vân
    bg = ImageDraw.Draw(base)
    for y in range(H):
        t = y / H
        bg.line((0, y, W, y), fill=(6, 14, 40, int(40 + 120 * t)))
    cyan = (90, 220, 255)
    white = (235, 250, 255)
    buildings = []
    x = 40
    while x < W - 60:
        w = random.randint(90, 220)
        h = random.randint(180, 640)
        buildings.append((x, H - 90 - h, x + w, H - 90))
        x += w + random.randint(18, 60)

    def lines(d):
        for (x0, y0, x1, y1) in buildings:
            d.rectangle((x0, y0, x1, y1), outline=cyan, width=4)
            # cửa sổ / tầng
            step = random.choice([34, 40, 48])
            for yy in range(y0 + 24, y1 - 12, step):
                d.line((x0 + 12, yy, x1 - 12, yy), fill=(120, 200, 255, 140), width=2)
            if random.random() < 0.5:
                d.polygon(((x0, y0), (x1, y0), ((x0 + x1) / 2, y0 - random.randint(30, 90))), outline=cyan, width=4)
        d.line((30, H - 90, W - 30, H - 90), fill=white, width=6)

    base.alpha_composite(glow_layer((W, H), lines, 14, 0.9))
    base.alpha_composite(glow_layer((W, H), lines, 0))
    # vài ngôi sao nhỏ
    st = ImageDraw.Draw(base)
    for _ in range(80):
        sx, sy = random.randint(0, W), random.randint(0, int(H * 0.55))
        r = random.choice([1, 1, 2])
        st.ellipse((sx - r, sy - r, sx + r, sy + r), fill=(255, 255, 255, random.randint(120, 255)))
    base.save(path)


def font(size, bold=True):
    for name in (['arialbd.ttf', 'segoeuib.ttf', 'Arial Bold.ttf'] if bold else ['arial.ttf', 'segoeui.ttf']):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def twenty(path):
    W, H = 1100, 1000
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    f_big = font(720)
    f_small = font(150)
    # chữ "20" tô chuyển sắc xanh → trắng → đỏ theo chiều ngang (đúng tinh thần banner 20 năm)
    mask = Image.new('L', (W, H), 0)
    ImageDraw.Draw(mask).text((W / 2, 400), '20', font=f_big, fill=255, anchor='mm')
    grad = Image.new('RGBA', (W, H))
    gd = ImageDraw.Draw(grad)
    for x in range(W):
        t = x / W
        if t < 0.5:
            c = tuple(int(a + (b - a) * (t / 0.5)) for a, b in zip((70, 170, 255), (245, 250, 255)))
        else:
            c = tuple(int(a + (b - a) * ((t - 0.5) / 0.5)) for a, b in zip((245, 250, 255), (230, 40, 60)))
        gd.line((x, 0, x, H), fill=c + (255,))
    # quầng sáng
    glow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    glow.paste((140, 200, 255, 255), mask=mask)
    glow = glow.filter(ImageFilter.GaussianBlur(28))
    img.alpha_composite(glow)
    body = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    body.paste(grad, mask=mask)
    img.alpha_composite(body)
    d = ImageDraw.Draw(img)
    d.text((W / 2, 860), 'NĂM', font=f_small, fill=(255, 255, 255, 255), anchor='mm')
    img.save(path)


for i in range(1, 4):
    skyline(100 + i, os.path.join(OUT, f'skyline-{i}.png'))
twenty(os.path.join(OUT, '20-nam.png'))
print('assets ok')
