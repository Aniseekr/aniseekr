# Generates the skin texture tiles (white on transparent; tinted at runtime).
import math, random, sys
out = sys.argv[1]
def svg(w, h, body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">{body}</svg>'
def wrap(w, h, fn):
    # draw a shape at 9 offsets so the tile repeats seamlessly
    return ''.join(fn(dx, dy) for dx in (-w, 0, w) for dy in (-h, 0, h))

# washi: paper fibres
r = random.Random(11); W = H = 128; body = ''
for _ in range(16):
    x, y = r.uniform(0, W), r.uniform(0, H); ang = r.uniform(0, math.pi); L = r.uniform(18, 46)
    bend = r.uniform(-8, 8); sw = r.uniform(0.35, 0.9); a = r.uniform(0.45, 1)
    x2, y2 = x + L * math.cos(ang), y + L * math.sin(ang)
    cx, cy = (x + x2) / 2 - bend * math.sin(ang), (y + y2) / 2 + bend * math.cos(ang)
    body += wrap(W, H, lambda dx, dy: f'<path d="M{x+dx:.1f} {y+dy:.1f} Q{cx+dx:.1f} {cy+dy:.1f} {x2+dx:.1f} {y2+dy:.1f}" stroke="#fff" stroke-opacity="{a:.2f}" stroke-width="{sw:.2f}" fill="none" stroke-linecap="round"/>')
for _ in range(40):
    x, y = r.uniform(0, W), r.uniform(0, H)
    body += f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r.uniform(0.3,0.7):.2f}" fill="#fff" fill-opacity="{r.uniform(0.3,0.8):.2f}"/>'
open(f'{out}/washi.svg', 'w').write(svg(W, H, body))

# halftone: 45-degree dot screen
open(f'{out}/halftone.svg', 'w').write(svg(8, 8, '<circle cx="2" cy="2" r="1.15" fill="#fff"/><circle cx="6" cy="6" r="1.15" fill="#fff"/>'))

# grain: cel-paint specks
r = random.Random(7); W = H = 64; body = ''
for _ in range(240):
    x, y = r.uniform(0, W), r.uniform(0, H); rr = r.uniform(0.3, 0.75); a = r.uniform(0.25, 1)
    body += wrap(W, H, lambda dx, dy: f'<circle cx="{x+dx:.1f}" cy="{y+dy:.1f}" r="{rr:.2f}" fill="#fff" fill-opacity="{a:.2f}"/>')
open(f'{out}/grain.svg', 'w').write(svg(W, H, body))

# scanline: 1px line every 4px
open(f'{out}/scanline.svg', 'w').write(svg(4, 4, '<rect x="0" y="0" width="4" height="1" fill="#fff"/>'))

# petals: three sakura petals
W = H = 112
petal = 'M0 -3.6 L1.6 -5.4 C4.4 -4.6 5.4 -1 4.2 2 C3.2 4.6 1 6 0 7 C-1 6 -3.2 4.6 -4.2 2 C-5.4 -1 -4.4 -4.6 -1.6 -5.4 Z'
body = ''
for (x, y, rot, s) in [(22, 26, 20, 1.25), (78, 58, -35, 1.0), (40, 92, 70, 0.85)]:
    body += wrap(W, H, lambda dx, dy: f'<path d="{petal}" fill="#fff" fill-rule="evenodd" transform="translate({x+dx} {y+dy}) rotate({rot}) scale({s})"/>')
open(f'{out}/petals.svg', 'w').write(svg(W, H, body))

# clouds: two soft cumulus puffs
W, H = 180, 120
def cloud(x, y, s):
    cs = [(-18, 2, 11), (-6, -6, 14), (9, -3, 12), (20, 3, 9)]
    c = ''.join(f'<circle cx="{x+cx*s:.1f}" cy="{y+cy*s:.1f}" r="{cr*s:.1f}"/>' for cx, cy, cr in cs)
    return c + f'<rect x="{x-27*s:.1f}" y="{y+1*s:.1f}" width="{56*s:.1f}" height="{11*s:.1f}" rx="{5.5*s:.1f}"/>'
body = '<g fill="#fff">' + wrap(W, H, lambda dx, dy: cloud(50 + dx, 40 + dy, 1.2) + cloud(132 + dx, 92 + dy, 0.8)) + '</g>'
open(f'{out}/clouds.svg', 'w').write(svg(W, H, body))
