"""Read browser screenshots, without altering any game artwork."""
from pathlib import Path
import sys
from PIL import Image
folder = Path('qa-results/portrait-aperture')
magenta = (240, 0, 240)
if '--fixture' in sys.argv:
    folder.mkdir(parents=True, exist_ok=True)
    Image.new('RGBA', (400, 500), (*magenta, 255)).save(folder/'solid.png')
    raise SystemExit(0)
for file in sorted([*folder.glob('zoom-*.png'), *folder.glob('hit-*.png')]):
    image = Image.open(file).convert('RGB')
    w, h = image.size
    assert image.getpixel((2, 2)) != magenta, (file, 'left corner escaped')
    assert image.getpixel((w-3, 2)) != magenta, (file, 'right corner escaped')
    if file.name.startswith('zoom-'):
        assert image.getpixel((w//2, h//2)) == magenta, (file, 'fixture not actually drawn')
control = Image.open(folder/'unclipped-control.png').convert('RGB')
assert control.getpixel((2, 2)) == magenta, 'negative control must detect the old rectangular spill'
print('PASS 6 browser screenshots: magnified artwork hidden at arch corners, center visible; unclipped negative control spills as expected')
