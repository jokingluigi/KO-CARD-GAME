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
    return np.clip(canvas, 0, 1)


def bake(mask, rim=0.55, glow=0.35):
    """검은 실루엣 + 위쪽 금빛 테두리 + 은은한 빛을 그림에 미리 구워 넣는다.
    (예전엔 CSS 필터로 매 프레임 계산 → 휴대폰에서 무거웠음)"""
    H, W = mask.shape
    up = np.zeros_like(mask); up[:-2] = mask[2:]          # 2px 위로 민 모양 = 위쪽 테두리
    edge = np.clip(up - mask, 0, 1) * rim
    halo = ndimage.gaussian_filter(np.roll(mask, -4, axis=0), 6) * glow
    halo = np.clip(halo - mask, 0, 1)
    rgb = np.zeros((H, W, 3), dtype=np.float32)
    a = np.zeros((H, W), dtype=np.float32)
    # 빛(아래층) → 테두리 → 검은 사람(맨 위)
    for color, alpha in (((240, 170, 80), halo), ((255, 216, 150), edge)):
        rgb = rgb * (1 - alpha[..., None]) + np.array(color, dtype=np.float32) * alpha[..., None]
        a = a + alpha * (1 - a)
    rgb = rgb * (1 - mask[..., None])
    a = mask + a * (1 - mask)
    # 투명도로 미리 나눠 저장 (straight alpha)
    out = np.zeros((H, W, 4), dtype=np.uint8)
    safe = np.maximum(a, 1e-6)[..., None]
    out[..., :3] = np.clip(rgb / safe, 0, 255).astype(np.uint8)
    out[..., 3] = (np.clip(a, 0, 1) * 255).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')


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
    # 크게(상반신만 보이게) + 촘촘히 겹쳐서 꽉 채운다
    back = bake(strip(people, seed, rows=((0.03, 1.7, 11),)), rim=0.35, glow=0)
    front = bake(strip(people, seed + 100, rows=((0.30, 2.1, 9),)))
    back.save(OUT / f'{name}-back.webp', 'WEBP', quality=82, method=6)
    front.save(OUT / f'{name}-front.webp', 'WEBP', quality=82, method=6)
    preview = Image.new('RGBA', back.size, (60, 40, 20, 255))
    preview.alpha_composite(back.point(lambda v: v))
    preview.alpha_composite(front)
    preview.convert('RGB').save(f'/tmp/{name}-preview.png')
print('ok', sorted(p.name for p in OUT.iterdir()))
