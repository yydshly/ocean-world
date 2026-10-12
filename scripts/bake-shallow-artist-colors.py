"""Bake the original diffuse into native-preview / loading-fallback colours.

Run after prepare-shallow-artist-fish.mjs. Does not modify source images.
"""
import json
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1] / 'public/assets/shallow-artist'
path = root / 'fish.json'
data = json.loads(path.read_text(encoding='utf-8'))
for asset in data.values():
    with Image.open(root / asset['diffuse']) as source:
        pixels = source.convert('RGB')
        width, height = pixels.size
        colour = []
        for u, v in zip(asset['uv'][::2], asset['uv'][1::2]):
            x = max(0, min(width - 1, int(u * width)))
            y = max(0, min(height - 1, int(v * height)))
            for channel in pixels.getpixel((x, y)):
                value = channel / 255
                colour.append(round(value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4, 6))
        asset['color'] = colour
path.write_text(json.dumps(data, separators=(',', ':')), encoding='utf-8')
print(f'Baked source diffuse for {len(data)} credited fish; images unchanged.')
