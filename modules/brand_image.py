"""
modules/brand_image.py — Generate redesigned KADO branded images for channel posts.

Replaces ugly og-image.png with minimalist branded compositions.

Static generation: brand_static_image() → /opt/botgrid/static/kado-brand.png
Dynamic per-post: brand_signal_image(coin, action, score) → /opt/botgrid/static/posts/{slug}.png

Brand rules (locked):
  background  #050505 (rich black)
  foreground  #e8e8e8 (warm white)
  accent      #00b894 (KADO green)
  font        DejaVu Sans (fallback for Inter)
  layout      50%+ negative space, single accent line, ample margins
"""
from __future__ import annotations

import hashlib
import os
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# Brand constants
BG = (5, 5, 5)
FG = (232, 232, 232)
ACCENT = (0, 184, 148)
MUTED = (102, 102, 102)
WARN = (248, 113, 113)

STATIC_DIR = Path('/opt/botgrid/static')
POSTS_DIR = STATIC_DIR / 'posts'
POSTS_DIR.mkdir(exist_ok=True)

# Font candidates — try Inter first, fall back
_FONT_PATHS = [
    '/usr/share/fonts/truetype/inter/Inter-Bold.ttf',
    '/usr/share/fonts/truetype/inter/Inter-Black.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
]

_REGULAR_FONT_PATHS = [
    '/usr/share/fonts/truetype/inter/Inter-Regular.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
]


def _font(size: int, bold: bool = True):
    paths = _FONT_PATHS if bold else _REGULAR_FONT_PATHS
    for p in paths:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    return ImageFont.load_default()


def _slug(s: str) -> str:
    return re.sub(r'[^a-z0-9_]', '', s.lower().replace(' ', '_'))[:40]


def _draw_brand_frame(W: int, H: int) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    img = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(img)
    return img, d


def _center_text(d, text: str, font, y: int, W: int, color=FG):
    bbox = d.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    d.text(((W - tw) / 2, y), text, font=font, fill=color)


def brand_static_image() -> str:
    """Generates the master KADO brand image. Run once, served by web_server."""
    W, H = 1080, 1080
    img, d = _draw_brand_frame(W, H)

    # KADO wordmark center
    wm = _font(220, bold=True)
    bbox = d.textbbox((0, 0), 'KADO', font=wm)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (W - tw) / 2
    y = (H - th) / 2 - 40
    d.text((x, y), 'KADO', font=wm, fill=FG)

    # Single accent line under "KADO"
    line_y = y + th + 30
    line_w = 280
    line_x = (W - line_w) / 2
    d.rectangle([line_x, line_y, line_x + line_w, line_y + 5], fill=ACCENT)

    # Subtitle
    sub = _font(28, bold=False)
    _center_text(d, 'AI TRADING PLATFORM', sub, line_y + 30, W, color=MUTED)

    # Bottom corners
    foot = _font(22, bold=False)
    d.text((40, H - 50), 'kadoclub.net', font=foot, fill=MUTED)
    d.text((W - 130, H - 50), 'pre-seed', font=foot, fill=MUTED)

    out = STATIC_DIR / 'kado-brand.png'
    img.save(out, 'PNG', optimize=True)
    return str(out)


def brand_signal_image(coin: str, action: str = '', score: float | None = None,
                        subtitle: str = '') -> str:
    """Dynamic per-signal image. Returns local file path."""
    W, H = 1080, 1080
    img, d = _draw_brand_frame(W, H)

    # Header: KADO top-left
    hd = _font(56, bold=True)
    d.text((40, 30), 'KADO', font=hd, fill=FG)
    tag = _font(18, bold=False)
    d.text((40, 95), 'AI TRADING', font=tag, fill=MUTED)

    # Center: coin symbol HUGE
    coin_clean = (coin or '?').upper()[:6]
    cf_size = 320 if len(coin_clean) <= 4 else 240
    cf = _font(cf_size, bold=True)
    bbox = d.textbbox((0, 0), coin_clean, font=cf)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    y_coin = (H - th) / 2 - 100
    d.text(((W - tw) / 2, y_coin), coin_clean, font=cf, fill=FG)

    # Accent line below coin
    line_y = y_coin + th + 30
    line_w = 200
    line_x = (W - line_w) / 2
    d.rectangle([line_x, line_y, line_x + line_w, line_y + 6], fill=ACCENT)

    # Action/score below line
    if action or score is not None:
        meta_parts = []
        if action:
            meta_parts.append(action.upper())
        if score is not None:
            meta_parts.append(f"SCORE {score:.1f}")
        meta = '  ·  '.join(meta_parts)
        mf = _font(40, bold=True)
        _center_text(d, meta, mf, line_y + 30, W, color=FG)

    if subtitle:
        sf = _font(24, bold=False)
        _center_text(d, subtitle[:60], sf, line_y + 90, W, color=MUTED)

    # Bottom: hash + url
    foot = _font(22, bold=False)
    d.text((40, H - 50), 'kadoclub.net', font=foot, fill=MUTED)
    d.text((W - 200, H - 50), 'kadoclub.net/track-record', font=foot, fill=MUTED)

    slug = _slug(f"{coin}_{action}_{int(score or 0)}")
    out = POSTS_DIR / f"{slug}_{hashlib.md5(slug.encode()).hexdigest()[:8]}.png"
    img.save(out, 'PNG', optimize=True)
    return str(out)


if __name__ == '__main__':
    p1 = brand_static_image()
    print(f'static: {p1}')
    p2 = brand_signal_image('TAO', 'LONG', 13.0, 'Bittensor trending top-10')
    print(f'signal: {p2}')
