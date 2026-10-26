"""Compare actual screenshot portrait pixels against the decoded source artwork.
Requires Pillow; consumes paint-samples.json from KO_INTRO_PAINT_CHECK=1.
No image edits, network calls or account/database access.
"""
import json
import statistics
import sys
from PIL import Image, ImageChops, ImageStat

samples = json.load(open(sys.argv[1]))
assert samples, 'No paint samples were recorded'
results = []
for sample in samples:
    shot = Image.open(sample['screenshot']).convert('RGB')
    original = Image.open(sample['source']).convert('RGB')
    scale = shot.width / sample['width']
    box = sample['rect']
    w, h = box['width'] * scale, box['height'] * scale
    fit = min(w / original.width, h / original.height)
    aw, ah = original.width * fit, original.height * fit
    left = box['x'] * scale + (w - aw) / 2
    top = box['y'] * scale + (h - ah) / 2
    # Exclude the frame and corner decoration; compare the contained illustration.
    # Normalize below the smallest CSS display size to tolerate browser resampling phase.
    actual = shot.crop((round(left + aw * .15), round(top + ah * .15),
                        round(left + aw * .85), round(top + ah * .85))).resize((64, 80), Image.Resampling.LANCZOS)
    expected = original.crop((round(original.width * .15), round(original.height * .15),
                              round(original.width * .85), round(original.height * .85))).resize((64, 80), Image.Resampling.LANCZOS)
    error = sum(ImageStat.Stat(ImageChops.difference(actual, expected)).mean) / 3
    column_variation = statistics.mean(statistics.pstdev(actual.getpixel((x, y))[c] for y in range(actual.height))
                                       for x in range(0, actual.width, 4) for c in range(3))
    assert error < 12, f"{sample['width']} {sample['side']}: painted pixels differ from source ({error:.2f})"
    assert column_variation > 12, f"{sample['width']} {sample['side']}: portrait resembles vertical bands"
    results.append(dict(width=sample['width'], side=sample['side'], elapsed=sample['elapsed'],
                        meanPixelError=round(error, 3), verticalDetail=round(column_variation, 3)))
print(json.dumps(results))
