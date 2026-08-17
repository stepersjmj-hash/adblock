"""MJ AdBlock 툴바 아이콘 생성 (의존성 없이 순수 표준 라이브러리로 PNG 작성).

디자인: 원형 배경 + 흰 링 + 대각선 슬래시 ("차단" 기호).
켜짐은 확장 테마색(#e91e63), 꺼짐은 회색(#9e9e9e).
"""
import math
import os
import struct
import zlib

# 저장소 루트의 icons/ 에 바로 생성 (이 스크립트는 _tools/ 안에 있음)
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "icons")

ON = (233, 30, 99)     # #e91e63
OFF = (140, 140, 145)  # 꺼짐: 채도 없는 회색
WHITE = (255, 255, 255)

SS = 4  # 슈퍼샘플링 배수 (안티에일리어싱)

# 단위 좌표(0..1) 기준 형상 파라미터
R_DISC = 0.47
R_RING_OUT = 0.325
R_RING_IN = 0.235
HALF_SLASH = 0.048


def coverage(x, y):
    """중심 기준 좌표에서 (배경원 포함여부, 흰색 포함여부) 반환."""
    dx = x - 0.5
    dy = y - 0.5
    d = math.hypot(dx, dy)
    in_disc = d <= R_DISC
    in_ring = R_RING_IN <= d <= R_RING_OUT
    # 좌상 → 우하 방향 선. 법선 (1,-1)/√2
    line_dist = abs(dx - dy) / math.sqrt(2)
    in_slash = line_dist <= HALF_SLASH and d <= R_RING_OUT
    return in_disc, (in_ring or in_slash)


def render(size, base):
    rows = []
    for py in range(size):
        row = bytearray()
        for px in range(size):
            disc_hits = 0
            white_hits = 0
            for sy in range(SS):
                for sx in range(SS):
                    x = (px + (sx + 0.5) / SS) / size
                    y = (py + (sy + 0.5) / SS) / size
                    d, w = coverage(x, y)
                    if d:
                        disc_hits += 1
                    if w:
                        white_hits += 1
            total = SS * SS
            a_disc = disc_hits / total
            a_white = white_hits / total
            if a_disc == 0:
                row += bytes((0, 0, 0, 0))
                continue
            # 배경(base) 위에 흰색을 알파 합성한 뒤, 전체를 원형 알파로 마스킹
            w_in = min(a_white, a_disc)
            frac = w_in / a_disc if a_disc else 0.0
            r = round(base[0] * (1 - frac) + WHITE[0] * frac)
            g = round(base[1] * (1 - frac) + WHITE[1] * frac)
            b = round(base[2] * (1 - frac) + WHITE[2] * frac)
            row += bytes((r, g, b, round(a_disc * 255)))
        rows.append(bytes(row))
    return rows


def write_png(path, size, rows):
    raw = b"".join(b"\x00" + r for r in rows)  # 각 스캔라인 앞에 필터 타입 0

    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # 8bit RGBA
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    with open(path, "wb") as f:
        f.write(png)


def main():
    os.makedirs(OUT, exist_ok=True)
    made = []
    for size in (16, 32, 48, 128):
        for suffix, base in (("", ON), ("-off", OFF)):
            name = "icon%d%s.png" % (size, suffix)
            path = os.path.join(OUT, name)
            write_png(path, size, render(size, base))
            made.append((name, os.path.getsize(path)))
    for name, n in made:
        print("%-18s %6d bytes" % (name, n))


if __name__ == "__main__":
    main()
