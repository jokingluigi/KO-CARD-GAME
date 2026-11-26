"""관중 실루엣 띠 이미지 만들기.

원본: docs/art/crowd-src/ (OpenClipart, freesvg.org, CC0 퍼블릭 도메인)
  - happy-people-silhouette.svg  (환호하는 사람들, freesvg #81907)
  - 30-people-silhouettes.svg    (서 있는 사람들, freesvg #81908)
사람을 한 명씩 잘라서 여러 줄로 겹쳐 세운 가로 띠(좌우로 이어붙여도 티 안 나게)를 만든다.

  python3 docs/art/crowd-build.py artifacts/ko-game/public/vendor/crowd
"""
import io, random, subprocess, sys
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage

HERE = Path(__file__).parent / 'crowd-src'
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else 'out')
OUT.mkdir(parents=True, exist_ok=True)


def figures(svg: Path, width=3000, keep=None):
    png = subprocess.run(['rsvg-convert', '-w', str(width), str(svg)], check=True, capture_output=True).stdout
    img = Image.open(io.BytesIO(png)).convert('RGBA')
    a = np.array(img)[:, :, 3]
    mask = a > 20
    lab, n = ndimage.label(ndimage.binary_dilation(mask, iterations=4))
    out = []
    for i, sl in enumerate(ndimage.find_objects(lab)):
        h = sl[0].stop - sl[0].start
        if h < width * .08:
            continue
        crop = a[sl] * (lab[sl] == i + 1)
        out.append(((sl[0].start, sl[1].start), crop))
    # 위→아래, 왼→오른 순서
    out.sort(key=lambda t: (round(t[0][0] / (width * .2)), t[0][1]))
    crops = [c for _, c in out]
    if keep is not None:
        crops = [crops[i] for i in keep if i < len(crops)]
    return crops


def strip(people, seed, W=2400, H=420, rows=((0.30, 0.62, 30), (0.55, 0.85, 22), (0.85, 1.08, 16))):
    """rows: (머리 위치 기준선 비율, 사람 키 비율, 사람 수)  — 뒤에서 앞으로"""
    rnd = random.Random(seed)
    canvas = np.zeros((H, W), dtype=np.float32)
    for r, (top, scale, count) in enumerate(rows):
        layer = np.zeros((H, W), dtype=np.float32)
        step = W / count
        for k in range(count):
            p = rnd.choice(people)
            ph = int(H * scale * rnd.uniform(.92, 1.06))
            pw = max(1, int(p.shape[1] * ph / p.shape[0]))
            im = np.array(Image.fromarray(p).resize((pw, ph), Image.LANCZOS), dtype=np.float32) / 255
            if rnd.random() < .5:
                im = im[:, ::-1]
            cx = int(k * step + rnd.uniform(-.3, .3) * step)
            y0 = int(H * top * rnd.uniform(.9, 1.1) - ph * .05)
            for dx in (-W, 0, W):  # 좌우 이어붙임
                x0 = cx - pw // 2 + dx
                xa, xb = max(0, x0), min(W, x0 + pw)
                ya, yb = max(0, y0), min(H, y0 + ph)
                if xa >= xb or ya >= yb:
                    continue
                piece = im[ya - y0:yb - y0, xa - x0:xb - x0]
                layer[ya:yb, xa:xb] = np.maximum(layer[ya:yb, xa:xb], piece)
        canvas = np.maximum(canvas, layer)
    alpha = (np.clip(canvas, 0, 1) * 255).astype(np.uint8)
    rgba = np.zeros((H, W, 4), dtype=np.uint8)
    rgba[:, :, 3] = alpha  # 검은 실루엣
    return Image.fromarray(rgba, 'RGBA')


cheer = figures(HERE / 'happy-people-silhouette.svg')
calm_all = figures(HERE / '30-people-silhouettes.svg')
print('환호', len(cheer), '서있음', len(calm_all))
# 서 있는 사람: 팔 든 사람은 빼고 차분한 자세만
def arms_up(c):
    top = c[: max(1, int(c.shape[0] * .14))] > 40
    return ndimage.label(top)[1] > 1


calm = [c for c in calm_all if c.shape[1] / c.shape[0] < .42 and not arms_up(c)]
print('차분한 자세', len(calm))

for name, people, seed in (('crowd-cheer', cheer, 7), ('crowd-calm', calm, 11)):
    back = strip(people, seed, rows=((0.10, 0.70, 30), (0.30, 0.80, 24)))
    front = strip(people, seed + 100, rows=((0.38, 0.95, 18),))
    back.save(OUT / f'{name}-back.webp', 'WEBP', quality=82, method=6)
    front.save(OUT / f'{name}-front.webp', 'WEBP', quality=82, method=6)
    preview = Image.new('RGBA', back.size, (60, 40, 20, 255))
    preview.alpha_composite(back.point(lambda v: v))
    preview.alpha_composite(front)
    preview.convert('RGB').save(f'/tmp/{name}-preview.png')
print('ok', sorted(p.name for p in OUT.iterdir()))
