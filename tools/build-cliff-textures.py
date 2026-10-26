"""Encode the cliff textures the game ships from their PNG sources.

The painted PNGs in art/flight-cliffs/ stay the source (Blender packs them
into the portable GLBs); the game loads WebP copies, a sixth of the size.
Quality 90 keeps the mean colour error under 2.3/255, and the alpha is kept
exactly, so the foliage and ivy cutouts (alphaTest 0.35) match the PNGs to
the pixel. This checks both before writing.

    python3 tools/build-cliff-textures.py
"""
from pathlib import Path
import io

from PIL import Image, ImageChops, ImageStat

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'art/flight-cliffs'
OUT = ROOT / 'public/assets/flight/cliffs'
NAMES = ['painted-stone', 'painted-grass', 'painted-foliage', 'painted-ivy']
QUALITY = 90
MAX_MEAN_ERROR = 3  # of 255, per channel
CUTOUT = round(0.35 * 255)  # cliffAssets.js alphaTest


def cutout(image):
    return image.getchannel('A').point(lambda v: 255 if v >= CUTOUT else 0)


for name in NAMES:
    source = Image.open(SOURCE / f'{name}.png')
    buffer = io.BytesIO()
    source.save(buffer, 'WEBP', quality=QUALITY, method=6, alpha_quality=100, exact=True)
    encoded = Image.open(io.BytesIO(buffer.getvalue())).convert(source.mode)
    error = sum(ImageStat.Stat(ImageChops.difference(source.convert('RGB'), encoded.convert('RGB'))).mean) / 3
    assert error <= MAX_MEAN_ERROR, f'{name}: mean error {error:.2f}/255'
    if 'A' in source.mode:
        changed = ImageChops.difference(cutout(source), cutout(encoded)).getbbox()
        assert changed is None, f'{name}: cutout changed within {changed}'
    (OUT / f'{name}.webp').write_bytes(buffer.getvalue())
    print(f'{name}.webp: {len(buffer.getvalue()) / 1024:.0f} KB (PNG {(SOURCE / f"{name}.png").stat().st_size / 1024:.0f} KB), mean error {error:.2f}/255')
