"""Diagnostic transparent fixture only; never edits game or user artwork."""
import sys
from pathlib import Path
from PIL import Image, ImageDraw
p = Path('qa-results/champion-motion')
p.mkdir(parents=True, exist_ok=True)
if '--fixture' in sys.argv:
    im = Image.new('RGBA', (200, 280), (0, 0, 0, 0))
    ImageDraw.Draw(im).ellipse((45, 20, 155, 260), fill=(130, 70, 100, 255))
    im.save(p / 'alpha.png')
else:
    before = Image.open(p / 'alpha-before.png').convert('RGB')
    for name in ['alpha-hit.png', 'alpha-heal.png']:
        after = Image.open(p / name).convert('RGB')
        for point in [(5, 30), (5, 140), (195, 140), (195, 250)]:
            assert before.getpixel(point) == after.getpixel(point) == (25, 25, 25)
    assert Image.open(p / 'alpha-hit.png').convert('RGB').getpixel((100, 140)) != before.getpixel((100, 140))
    print('PASS transparent margins unchanged during hit/heal; opaque silhouette actually brightened')
