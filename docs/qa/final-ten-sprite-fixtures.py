"""Explicit diagnostic PNGs, not champion artwork or final expressions."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
folder = Path('qa-results/final-ten-sprites/fixtures')
folder.mkdir(parents=True, exist_ok=True)
keys = ['default','attack','hurt','heavy_hurt','low','summon','surprised','victory','defeat','relief','awake']
font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 27)
for index, key in enumerate(keys):
    image = Image.new('RGBA', (300, 420), (0,0,0,0))
    draw = ImageDraw.Draw(image)
    color = (72 + index*12, 50 + index*5, 88 + index*7, 255)
    draw.rectangle((15,15,285,405), fill=color, outline=(200,180,125), width=2)
    draw.text((30,65), 'QA TEMPORARY', font=font, fill='white')
    draw.text((30,170), key.upper().replace('_','\n'), font=font, fill='white')
    draw.text((30,325), 'NOT FINAL ART', font=font, fill='white')
    image.save(folder / (key+'.png'))
