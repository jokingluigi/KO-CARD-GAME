"""Compose actual browser PNGs; never draw or replace game UI or artwork."""
from pathlib import Path
import json
import shutil
import zipfile
from PIL import Image, ImageDraw, ImageFont

root = Path('qa-results/retro-font-preview')
published = Path('docs/qa/retro-font-preview')
images = published / 'images'
images.mkdir(parents=True, exist_ok=True)
font_path = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
font = ImageFont.truetype(font_path, 20)
large = ImageFont.truetype(font_path, 30)
modes = ['baseline', 'full', 'hybrid']
labels = ['BEFORE - Noto / Oswald', 'FULL RETRO', 'RETRO HYBRID']
scenes = [('menu', 'Main menu'), ('cards', 'Player and spell cards'), ('champions', 'Champions / abilities / quests'), ('battle', 'Battle'), ('readability', 'Long text / quests / tower dialogue')]
background = '#101114'
contact = Image.new('RGB', (1170, 110 + len(scenes) * 908), background)
draw = ImageDraw.Draw(contact)
draw.text((20, 18), 'KO CARD GAME - NeoDunggeunmo Pro 1.020', font=large, fill='#edce8c')
draw.text((20, 66), '390 x 844 viewport crops | full images in each comparison PNG | PREVIEW ONLY', font=font, fill='#ddd9cd')
all_scenes = scenes + [('feedback', 'Battle damage and turn notification')]
for row, (scene, title) in enumerate(all_scenes):
    source = [Image.open(root / 'individual' / f'{scene}-{mode}-390.png').convert('RGB') for mode in modes]
    height = max(image.height for image in source)
    comparison = Image.new('RGB', (1170, height + 96), background)
    ink = ImageDraw.Draw(comparison)
    ink.text((16, 10), title + ' - same state, artwork and resolution', font=large, fill='#edce8c')
    for col, (image, label) in enumerate(zip(source, labels)):
        ink.text((col * 390 + 12, 60), label, font=font, fill='#eee')
        comparison.paste(image, (col * 390, 96))
        if row < len(scenes):
            y = 110 + row * 908
            draw.text((col * 390 + 12, y + 6), title.split('/')[0].strip() + ' / BEFORE' if col == 0 else label, font=font, fill='#edce8c' if col == 0 else '#eee')
            contact.paste(image.crop((0, 0, 390, min(844, image.height))), (col * 390, y + 48))
    comparison.save(images / f'{scene}-comparison.png', optimize=True)
contact.save(images / 'contact-sheet.png', optimize=True)
shutil.copy2(root / 'results.json', published / 'browser-results.json')
for name in ['feedback-results.json', 'review-results.json', 'ellipsis-results.json']:
    shutil.copy2(root / name, published / name)
shutil.copy2(root / 'review-page.png', images / 'review-page.png')
# A static, portable review document in the ZIP complements the interactive Vite page.
static = '''<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KO 폰트 비교</title><style>body{background:#0b0b0d;color:#eee;font-family:system-ui;margin:16px}img{max-width:100%;height:auto}a{color:#edce8c}p{line-height:1.7}</style><h1>Neo둥근모 Pro 1.020 비교</h1><p>미리보기 전용 · 운영 반영 없음 · 왼쪽: 기존 / 가운데: FULL RETRO / 오른쪽: HYBRID<br>이미지는 실제 게임 컴포넌트의 브라우저 캡처야. 긴 효과는 넘칠 때 ••••로 생략하고 정보창에서는 원문을 보여줘. 작은 이름의 잘림은 별도 실패로 기록했어. 본문과 상세 PNG를 확대해서 비교해 봐.</p>'''
for scene, title in all_scenes:
    static += f'<h2>{title}</h2><a href="images/{scene}-comparison.png"><img src="images/{scene}-comparison.png" alt="{title} 비교"></a>'
static += '<p>기술 결과: browser-results.json · 상세 조사: README.md · 라이선스: licenses/</p></html>'
(root / 'index.html').write_text(static, encoding='utf-8')
before_after = [Image.open(root / 'individual' / f'ellipsis-{variant}-390.png').convert('RGB') for variant in ['before','after']]
ellipsis = Image.new('RGB',(780,max(i.height for i in before_after)+70),background)
ink = ImageDraw.Draw(ellipsis)
for col,(image,label) in enumerate(zip(before_after,['Before: clipped text','After: overflow marked with dots'])):
    ink.text((col*390+12,20),label,font=font,fill='#edce8c')
    ellipsis.paste(image,(col*390,70))
ellipsis.save(images / 'ellipsis-before-after.png',optimize=True)
archive = root / 'KO-CARD-GAME-NeoDunggeunmo-Pro-preview.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as output:
    output.write(root / 'index.html', 'index.html')
    output.write(published / 'README.md', 'README.md')
    output.write(root / 'results.json', 'browser-results.json')
    output.write(root / 'feedback-results.json', 'feedback-results.json')
    output.write(root / 'review-results.json', 'review-results.json')
    output.write(root / 'ellipsis-results.json', 'ellipsis-results.json')
    output.write(published / 'font-validation.json', 'font-validation.json')
    if (published / 'numeric-layout-preservation.json').exists():
        output.write(published / 'numeric-layout-preservation.json', 'numeric-layout-preservation.json')
    for file in images.glob('*.png'):
        output.write(file, 'images/' + file.name)
    for file in (root / 'individual').glob('*.png'):
        output.write(file, 'individual/' + file.name)
    for file in Path('artifacts/ko-game/qa/retro-font/assets').glob('OFL-*.txt'):
        output.write(file, 'licenses/' + file.name)
print(json.dumps({'archive': str(archive), 'bytes': archive.stat().st_size, 'comparisonImages': 7}))
