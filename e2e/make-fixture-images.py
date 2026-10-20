"""Generates simple scenic placeholder photos for local screenshots (test fixtures only, never deployed)."""
import math, os, random, sys
from PIL import Image, ImageDraw, ImageFilter

OUT = sys.argv[1]
random.seed(7)

def lerp(a, b, t): return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

def scene(path, w, h, sky_top, sky_bottom, hills, sun=None, water=None, road=False):
    im = Image.new('RGB', (w, h))
    d = ImageDraw.Draw(im)
    for y in range(h):
        d.line([(0, y), (w, y)], fill=lerp(sky_top, sky_bottom, y / h))
    if sun:
        x, y, r, c = sun
        glow = Image.new('L', (w, h), 0); ImageDraw.Draw(glow).ellipse([x - r * 3, y - r * 3, x + r * 3, y + r * 3], fill=90)
        im.paste(Image.new('RGB', (w, h), c), (0, 0), glow.filter(ImageFilter.GaussianBlur(r)))
        d.ellipse([x - r, y - r, x + r, y + r], fill=c)
    for base, amp, color, freq in hills:
        pts = [(0, h)]
        phase = random.random() * 6
        for x in range(0, w + 8, 8):
            pts.append((x, base * h + amp * h * math.sin(x / w * freq + phase) + amp * 0.35 * h * math.sin(x / w * freq * 2.7 + phase)))
        pts.append((w, h)); d.polygon(pts, fill=color)
    if water:
        top, c1, c2 = water
        for y in range(int(top * h), h):
            d.line([(0, y), (w, y)], fill=lerp(c1, c2, (y - top * h) / (h - top * h)))
    if road:
        d.polygon([(w * 0.47, h * 0.62), (w * 0.53, h * 0.62), (w * 0.85, h), (w * 0.15, h)], fill=(58, 58, 62))
        for i in range(8):
            t0, t1 = 0.62 + i * 0.05, 0.62 + i * 0.05 + 0.025
            d.polygon([(w * (0.5 - 0.003 - (t0 - .62) * .02), h * t0), (w * (0.5 + 0.003 + (t0 - .62) * .02), h * t0),
                       (w * (0.5 + 0.004 + (t1 - .62) * .03), h * t1), (w * (0.5 - 0.004 - (t1 - .62) * .03), h * t1)], fill=(235, 235, 225))
    im = im.filter(ImageFilter.GaussianBlur(0.6))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, 'WEBP', quality=82)

def vehicle(path, body, w=1200, h=750):
    im = Image.new('RGB', (w, h)); d = ImageDraw.Draw(im)
    for y in range(h): d.line([(0, y), (w, y)], fill=lerp((236, 238, 242), (205, 209, 216), y / h))
    d.rectangle([0, int(h * .78), w, h], fill=(190, 193, 199))
    cx, cy = w // 2, int(h * .62)
    d.ellipse([cx - 420, cy + 95, cx + 420, cy + 150], fill=(150, 152, 158))
    d.rounded_rectangle([cx - 400, cy - 70, cx + 400, cy + 110], 60, fill=body)
    d.rounded_rectangle([cx - 270, cy - 190, cx + 230, cy - 40], 70, fill=body)
    d.rounded_rectangle([cx - 240, cy - 170, cx - 30, cy - 70], 30, fill=(40, 52, 66))
    d.rounded_rectangle([cx - 10, cy - 170, cx + 200, cy - 70], 30, fill=(40, 52, 66))
    for x in (cx - 250, cx + 250):
        d.ellipse([x - 95, cy + 40, x + 95, cy + 230], fill=(28, 28, 30)); d.ellipse([x - 45, cy + 90, x + 45, cy + 180], fill=(170, 172, 178))
    d.rectangle([cx + 360, cy - 20, cx + 400, cy + 10], fill=(255, 220, 140))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.filter(ImageFilter.GaussianBlur(0.8)).save(path, 'WEBP', quality=82)

G = f'{OUT}/gallery-images/gallery'; A = f'{OUT}/website-assets'; V = f'{OUT}/vehicle-images/vehicles'
scene(f'{G}/hero-ghat-road.webp', 1800, 1000, (110, 160, 210), (250, 205, 160), [(0.45, .06, (92, 120, 110), 4), (0.55, .05, (60, 92, 72), 6), (0.68, .04, (38, 70, 48), 9)], sun=(1350, 300, 60, (255, 236, 200)), road=True)
scene(f'{G}/coonoor.webp', 1200, 900, (150, 190, 225), (225, 235, 240), [(0.5, .08, (90, 130, 110), 3), (0.62, .06, (50, 100, 70), 7)])
scene(f'{G}/flowers.webp', 1200, 900, (170, 205, 235), (240, 240, 230), [(0.55, .05, (70, 120, 80), 5), (0.75, .03, (190, 60, 90), 14)])
scene(f'{A}/packages/vailankanni.webp', 1200, 900, (120, 175, 225), (240, 220, 190), [(0.62, .02, (230, 220, 200), 2)], sun=(900, 220, 50, (255, 245, 220)), water=(0.7, (60, 130, 170), (30, 80, 120)))
scene(f'{A}/packages/poondi.webp', 1200, 900, (230, 150, 110), (250, 215, 170), [(0.6, .04, (110, 80, 60), 3), (0.72, .03, (70, 60, 50), 6)], sun=(300, 380, 70, (255, 230, 190)))
scene(f'{A}/destinations/sabarimala.webp', 900, 1200, (90, 140, 190), (210, 220, 225), [(0.4, .08, (70, 110, 90), 3), (0.55, .07, (45, 85, 60), 5), (0.7, .05, (30, 60, 42), 8)])
scene(f'{A}/destinations/ooty.webp', 900, 1200, (160, 200, 230), (235, 240, 240), [(0.45, .07, (110, 150, 120), 3), (0.6, .06, (70, 120, 80), 6), (0.78, .04, (50, 95, 60), 10)])
scene(f'{A}/destinations/varkala.webp', 900, 1200, (250, 170, 120), (255, 220, 170), [(0.5, .03, (170, 90, 60), 4)], sun=(450, 520, 70, (255, 240, 210)), water=(0.58, (70, 110, 150), (25, 55, 90)))
scene(f'{A}/destinations/kodaikanal.webp', 900, 1200, (130, 170, 200), (220, 228, 232), [(0.5, .06, (80, 110, 100), 4), (0.62, .05, (55, 85, 70), 7)], water=(0.75, (90, 130, 140), (50, 80, 95)))
vehicle(f'{V}/crysta.webp', (235, 235, 238)); vehicle(f'{V}/dzire.webp', (180, 30, 40)); vehicle(f'{V}/tourister.webp', (245, 245, 245)); vehicle(f'{V}/tavera.webp', (90, 96, 104))
print('ok')
