"""產生 NightMarket 圖示：夜空中的燈籠，燈籠上是一組上漲的 K 棒（純 Python，不需要額外套件）。
執行：python tools/gen_icons.py
"""
import math
import os
import struct
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "web", "icons")

SKY1, SKY2 = (28, 32, 60), (9, 11, 22)        # 夜空漸層
GLOW = (255, 120, 40)                         # 燈籠外的暖光
LIT, RED = (255, 184, 72), (205, 34, 44)      # 燈籠中心亮橘 -> 邊緣紅
GOLD = (236, 178, 64)
CREAM = (255, 244, 222)
CX, CY, RX, RY = 0.5, 0.53, 0.31, 0.28        # 燈籠本體（橢圓）
# K 棒：(x 中心, 實體上緣, 實體下緣, 影線上緣, 影線下緣)
CANDLES = [(0.385, 0.565, 0.655, 0.525, 0.690),
           (0.500, 0.480, 0.590, 0.440, 0.625),
           (0.615, 0.390, 0.505, 0.350, 0.545)]


def lerp(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def pixel(x, y):
    col = lerp(SKY1, SKY2, y)
    # 星星
    for sx, sy, r in ((0.14, 0.16, 0.012), (0.84, 0.12, 0.010), (0.88, 0.40, 0.008), (0.10, 0.52, 0.008)):
        if math.hypot(x - sx, y - sy) < r:
            col = lerp(col, (230, 230, 255), 0.85)
    e = ((x - CX) / RX) ** 2 + ((y - CY) / RY) ** 2
    if e >= 1:  # 燈籠外的光暈
        col = lerp(col, GLOW, 0.42 * math.exp(-(math.sqrt(e) - 1) * 4.5))
    # 吊繩與流蘇
    if abs(x - CX) < 0.009 and (0.06 < y < 0.21 or 0.87 < y < 0.95):
        col = GOLD
    if 0.87 < y < 0.95 and abs(x - CX) < 0.045 * (y - 0.87) / 0.08 + 0.008 and int((x - CX) * 160) % 2 == 0:
        col = lerp(GOLD, RED, 0.25)
    # 上下的金色蓋子
    for y0, y1 in ((0.205, 0.265), (0.795, 0.86)):
        if y0 < y < y1 and abs(x - CX) < 0.13:
            col = lerp(GOLD, (150, 96, 26), (y - y0) / (y1 - y0) * 0.6)
    if e < 1:
        col = lerp(LIT, RED, math.sqrt(e) ** 1.4)
        # 燈籠骨架（縱向的弧線）
        half = RX * math.sqrt(max(1e-9, 1 - ((y - CY) / RY) ** 2))
        u = (x - CX) / half
        if any(abs(u - k) < 0.035 for k in (-0.62, 0.62)):
            col = lerp(col, (120, 14, 24), 0.45)
        # K 棒
        for cx, b0, b1, w0, w1 in CANDLES:
            if (abs(x - cx) < 0.036 and b0 < y < b1) or (abs(x - cx) < 0.008 and w0 < y < w1):
                col = CREAM
    return col


def render(size, ss=3):
    out = []
    for j in range(size):
        row = []
        for i in range(size):
            r = g = b = 0.0
            for dj in range(ss):
                for di in range(ss):
                    c = pixel((i + (di + 0.5) / ss) / size, (j + (dj + 0.5) / ss) / size)
                    r += c[0]; g += c[1]; b += c[2]
            k = ss * ss
            row.append((int(r / k), int(g / k), int(b / k)))
        out.append(row)
    return out


def png_bytes(img):
    h, w = len(img), len(img[0])
    raw = b"".join(b"\x00" + bytes(v for p in row for v in p) for row in img)

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + \
        chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


def write_png(path, img):
    with open(path, "wb") as f:
        f.write(png_bytes(img))


def write_ico(path, sizes):
    """Windows 圖示：內嵌 PNG（Vista 以後支援）。"""
    pngs = [(s, png_bytes(render(s, 2 if s >= 64 else 4))) for s in sizes]
    head = struct.pack("<HHH", 0, 1, len(pngs))
    offset = 6 + 16 * len(pngs)
    entries, blobs = b"", b""
    for s, data in pngs:
        entries += struct.pack("<BBBBHHII", s % 256, s % 256, 0, 0, 1, 32, len(data), offset)
        offset += len(data)
        blobs += data
    with open(path, "wb") as f:
        f.write(head + entries + blobs)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for name, size in (("icon-512.png", 512), ("icon-192.png", 192), ("apple-touch-icon.png", 180), ("favicon-32.png", 32)):
        write_png(os.path.join(OUT, name), render(size, 2 if size >= 180 else 4))
        print("寫入", name)
    write_ico(os.path.join(OUT, "app.ico"), [256, 48, 32, 16])
    print("寫入 app.ico")
