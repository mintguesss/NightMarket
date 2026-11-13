"""產生 PWA 圖示（純 Python，不需要額外套件）。執行：python tools/gen_icons.py"""
import math
import os
import struct
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "web", "icons")
PTS = [(0.17, 0.68), (0.31, 0.54), (0.43, 0.61), (0.57, 0.39), (0.69, 0.47), (0.83, 0.27)]
C1, C2 = (245, 165, 36), (240, 68, 79)   # 橘 -> 紅
BG1, BG2 = (30, 35, 50), (14, 16, 22)    # 背景漸層


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def seg_dist(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def line_y(x):
    for (ax, ay), (bx, by) in zip(PTS, PTS[1:]):
        if ax <= x <= bx:
            return ay + (by - ay) * (x - ax) / (bx - ax)
    return None


def render(size, ss=2):
    n = size * ss
    px = [[(0, 0, 0)] * n for _ in range(n)]
    lw = 0.052 / 2
    for j in range(n):
        y = (j + 0.5) / n
        bg = lerp(BG1, BG2, y)
        for i in range(n):
            x = (i + 0.5) / n
            col = bg
            ly = line_y(x)
            if ly is not None and ly < y < 0.80:  # 走勢下方的漸層填色
                a = 0.32 * (1 - (y - ly) / (0.80 - ly + 1e-9))
                col = lerp(col, lerp(C1, C2, (x - 0.17) / 0.66), a)
            if 0.79 < y < 0.805 and 0.15 < x < 0.85 and int(x * 40) % 2 == 0:  # 基準虛線
                col = lerp(col, (120, 128, 145), 0.6)
            d = min(seg_dist(x, y, *a_, *b_) for a_, b_ in zip(PTS, PTS[1:]))
            if d < lw:
                col = lerp(C1, C2, max(0.0, min(1.0, (x - 0.17) / 0.66)))
            ex, ey = PTS[-1]
            if math.hypot(x - ex, y - ey) < 0.055:  # 最新價的圓點
                col = (255, 255, 255) if math.hypot(x - ex, y - ey) < 0.032 else C2
            px[j][i] = col
    # 超取樣縮小（抗鋸齒）
    out = []
    for j in range(size):
        row = []
        for i in range(size):
            r = g = b = 0
            for dj in range(ss):
                for di in range(ss):
                    c = px[j * ss + dj][i * ss + di]
                    r += c[0]; g += c[1]; b += c[2]
            k = ss * ss
            row.append((r // k, g // k, b // k))
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
