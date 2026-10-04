"""Breadboard geometry, homography rectification and grid overlay (photo-spike).

Canonical board frame, in hole-pitch units (0.1"):
  x = column - 1                      (column 1 at the left)
  y: rows nearest the top of the rectified image first.
     a_top=True : a..e -> 0..4, f..j -> 7..11
     a_top=False: j..f -> 0..4, e..a -> 7..11
Rails sit above y=0 and below y=11; per-photo rail y positions live in photos.json.
"""
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROWS = 'abcdefghij'


def row_y(row, a_top=True):
    i = ROWS.index(row)
    y = i if i < 5 else i + 2          # a..e 0..4, f..j 7..11
    return y if a_top else 11 - y


def hole_xy(hole, a_top=True):
    """'c12' -> canonical (x, y)."""
    r, c = hole[0].lower(), int(hole[1:])
    return (c - 1, row_y(r, a_top))


def homography(src, dst):
    """3x3 H with dst ~ H @ src, from 4+ point pairs (least squares)."""
    A, b = [], []
    for (x, y), (u, v) in zip(src, dst):
        A.append([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.append(u)
        A.append([0, 0, 0, x, y, 1, -v * x, -v * y]); b.append(v)
    h = np.linalg.lstsq(np.array(A, float), np.array(b, float), rcond=None)[0]
    return np.append(h, 1).reshape(3, 3)


def apply_h(H, x, y):
    p = H @ np.array([x, y, 1.0])
    return p[0] / p[2], p[1] / p[2]


def load_photo(path):
    return ImageOps.exif_transpose(Image.open(path)).convert('RGB')


def orientation(taps):
    """True if canonical a-on-top keeps the photo un-mirrored."""
    canon = [hole_xy(h, True) for h in taps]
    H = homography(canon, [tuple(v) for v in taps.values()])
    cx, cy = np.mean([c[0] for c in canon]), np.mean([c[1] for c in canon])
    e = 1e-3
    p0 = np.array(apply_h(H, cx, cy)); px = np.array(apply_h(H, cx + e, cy)); py = np.array(apply_h(H, cx, cy + e))
    J = np.column_stack([(px - p0) / e, (py - p0) / e])
    return bool(np.linalg.det(J) > 0)


class Rectifier:
    """Maps between photo pixels and the canonical board frame."""

    def __init__(self, taps, a_top, ncols, pitch, margin=(2.0, 6.5)):
        # taps: {hole: [px, py]} in full-res photo pixels (4 or more)
        # a_top=None: pick the orientation that is NOT a mirror image of the photo.
        if a_top is None:
            a_top = orientation(taps)
        self.a_top, self.ncols, self.pitch = a_top, ncols, pitch
        self.mx, self.my = margin            # canonical margin, pitch units
        canon = [hole_xy(h, a_top) for h in taps]
        photo = [tuple(v) for v in taps.values()]
        self.H_c2p = homography(canon, photo)       # canonical -> photo
        self.H_p2c = np.linalg.inv(self.H_c2p)
        # rectified image size
        self.W = int(round((ncols - 1 + 2 * self.mx) * pitch))
        self.Hh = int(round((11 + 2 * self.my) * pitch))

    # canonical <-> rectified-image pixels
    def c2r(self, x, y):
        return ((x + self.mx) * self.pitch, (y + self.my) * self.pitch)

    def r2c(self, u, v):
        return (u / self.pitch - self.mx, v / self.pitch - self.my)

    def photo_to_c(self, px, py):
        return apply_h(self.H_p2c, px, py)

    def c_to_photo(self, x, y):
        return apply_h(self.H_c2p, x, y)

    def warp(self, photo):
        # PIL PERSPECTIVE wants coeffs mapping OUTPUT pixel -> INPUT pixel.
        S = np.array([[1 / self.pitch, 0, -self.mx], [0, 1 / self.pitch, -self.my], [0, 0, 1]])
        M = self.H_c2p @ S
        M = M / M[2, 2]
        coeffs = tuple(M.flatten()[:8])
        return photo.transform((self.W, self.Hh), Image.PERSPECTIVE, coeffs, Image.BICUBIC,
                               fillcolor=(40, 40, 40))


def font(size):
    for f in ['/System/Library/Fonts/Supplemental/Arial Bold.ttf', '/System/Library/Fonts/Helvetica.ttc',
              '/Library/Fonts/Arial.ttf']:
        try:
            return ImageFont.truetype(f, size)
        except Exception:
            pass
    return ImageFont.load_default()


def overlay_grid(img, R, rails=None, label_every=1, strong=True):
    """Mark-Grid style overlay: thin lines through every hole column/row,
    labels in added margins (never over the parts)."""
    pad_top, pad_side = int(R.pitch * 1.6), int(R.pitch * 1.4)
    W, H = img.width + 2 * pad_side, img.height + 2 * pad_top
    out = Image.new('RGB', (W, H), (255, 255, 255))
    out.paste(img, (pad_side, pad_top))
    ov = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    fs = max(9, int(R.pitch * 0.62))
    f = font(fs)
    fr = font(max(10, int(R.pitch * 0.8)))
    y0 = pad_top + R.c2r(0, -0.6)[1]
    y1 = pad_top + R.c2r(0, 11.6)[1]
    for c in range(1, R.ncols + 1):
        u = pad_side + R.c2r(c - 1, 0)[0]
        major = (c % 5 == 0) or c == 1
        col = (255, 0, 200, 150 if major else 85) if strong else (255, 0, 200, 60)
        d.line([(u, y0), (u, y1)], fill=col, width=1)
        if c % label_every == 0 or c == 1:
            t = str(c)
            tw = d.textlength(t, font=f)
            # alternate heights so adjacent numbers don't collide
            off = 0 if c % 2 else fs * 0.95
            d.text((u - tw / 2, 1 + off), t, font=f, fill=(0, 0, 0, 255))
            d.text((u - tw / 2, H - 2 * fs - 2 + off), t, font=f, fill=(0, 0, 0, 255))
            d.line([(u, pad_top - 3), (u, pad_top)], fill=(0, 0, 0, 255))
            d.line([(u, H - pad_top), (u, H - pad_top + 3)], fill=(0, 0, 0, 255))
    for r in ROWS:
        v = pad_top + R.c2r(0, row_y(r, R.a_top))[1]
        d.line([(pad_side + R.c2r(-0.6, 0)[0], v), (pad_side + R.c2r(R.ncols - 0.4, 0)[0], v)],
               fill=(0, 160, 255, 110), width=1)
        d.text((3, v - fs * 0.7), r, font=fr, fill=(0, 0, 160, 255))
        d.text((W - pad_side + 4, v - fs * 0.7), r, font=fr, fill=(0, 0, 160, 255))
    for name, yv in (rails or {}).items():
        v = pad_top + R.c2r(0, yv)[1]
        d.text((3, v - fs * 0.7), name[-1], font=fr, fill=(200, 0, 0, 255) if name.endswith('+') else (0, 0, 200, 255))
        d.text((W - pad_side + 4, v - fs * 0.7), name[-1], font=fr, fill=(200, 0, 0, 255) if name.endswith('+') else (0, 0, 200, 255))
    out = Image.alpha_composite(out.convert('RGBA'), ov).convert('RGB')
    return out, (pad_side, pad_top)


def snap(R, x, y, rails):
    """Canonical (x,y) -> hole name in the photo-neutral truth vocabulary.
    Terminal holes: 'c12'. Rails: 'rail:<side>:<pol>:<col>' (side = a|j)."""
    col = int(round(x)) + 1
    col = min(max(col, 1), R.ncols)
    # terminal block?
    if -0.6 <= y <= 4.6 or 6.4 <= y <= 11.6:
        yi = int(round(y))
        if 4 < yi < 7:
            yi = 4 if y < 5.5 else 7
        yi = min(max(yi, 0), 11)
        for r in ROWS:
            if row_y(r, R.a_top) == yi:
                return f'{r}{col}'
    # rail: nearest rail line
    best = min(rails.items(), key=lambda kv: abs(kv[1] - y))
    side, pol = best[0].split(':')
    return f'rail:{side}:{pol}:{col}'


def overlay_grid2(img, R, rails=None, channel_labels=True, line_alpha=90):
    """Overlay v2: one row of column numbers in each margin AND in the centre
    channel (empty board space), row letters at both ends, darker every 5th line."""
    pad_top, pad_side = int(R.pitch * 1.2), int(R.pitch * 1.4)
    W, H = img.width + 2 * pad_side, img.height + 2 * pad_top
    out = Image.new('RGB', (W, H), (255, 255, 255))
    out.paste(img, (pad_side, pad_top))
    ov = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    ncol = R.ncols
    fs = max(8, int(R.pitch * (0.55 if ncol > 40 else 0.6)))
    f = font(fs)
    fr = font(max(10, int(R.pitch * 0.8)))
    y0 = pad_top + R.c2r(0, -0.6)[1]
    y1 = pad_top + R.c2r(0, 11.6)[1]
    ych = pad_top + R.c2r(0, 5.5)[1]          # centre of the channel (between rows e/f)
    for c in range(1, ncol + 1):
        u = pad_side + R.c2r(c - 1, 0)[0]
        major = c % 5 == 0
        d.line([(u, y0), (u, y1)], fill=(255, 0, 200, 170 if major else line_alpha), width=1)
        t = str(c)
        tw = d.textlength(t, font=f)
        d.text((u - tw / 2, (pad_top - fs) / 2 - 1), t, font=f, fill=(0, 0, 0, 255))
        d.text((u - tw / 2, H - pad_top + (pad_top - fs) / 2 - 1), t, font=f, fill=(0, 0, 0, 255))
        if channel_labels:
            d.rectangle([u - tw / 2 - 1, ych - fs / 2 - 1, u + tw / 2 + 1, ych + fs / 2 + 1], fill=(255, 255, 255, 200))
            d.text((u - tw / 2, ych - fs / 2 - 1), t, font=f, fill=(0, 0, 0, 255))
    for r in ROWS:
        v = pad_top + R.c2r(0, row_y(r, R.a_top))[1]
        d.line([(pad_side + R.c2r(-0.6, 0)[0], v), (pad_side + R.c2r(ncol - 0.4, 0)[0], v)],
               fill=(0, 160, 255, 120), width=1)
        d.text((3, v - fs * 0.7), r, font=fr, fill=(0, 0, 160, 255))
        d.text((W - pad_side + 4, v - fs * 0.7), r, font=fr, fill=(0, 0, 160, 255))
    for name, yv in (rails or {}).items():
        v = pad_top + R.c2r(0, yv)[1]
        sym = name[-1]
        colr = (200, 0, 0, 255) if sym == '+' else (0, 0, 200, 255)
        d.text((3, v - fs * 0.7), sym, font=fr, fill=colr)
        d.text((W - pad_side + 4, v - fs * 0.7), sym, font=fr, fill=colr)
    out = Image.alpha_composite(out.convert('RGBA'), ov).convert('RGB')
    return out, (pad_side, pad_top)
