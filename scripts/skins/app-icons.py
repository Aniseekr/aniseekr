"""Matching app icons for the premium theme skins.

Seekr's head comes from components/brand/brand.json in his fixed colours
(SEEKR_COLORS); only the backdrop and the headband tails take the theme.
Writes assets/app-icons/<slug>.png (iOS, 1024, opaque), <slug>-android.png
(adaptive foreground, transparent) and <slug>-thumb.png (180, picker grid).

  python3 scripts/skins/app-icons.py   # needs rsvg-convert + ImageMagick
"""
import base64, json, os, subprocess, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
brand = json.load(open(os.path.join(ROOT, 'components/brand/brand.json')))
SEEKR = dict(body='#0B0C10', band='#2A2D36', eye='#1B1E28', iris='#FFD966', outline='#F4F1EA', shine='#FFFFFF')
SKINS = os.path.join(ROOT, 'assets/skins')

# slug, backdrop gradient (top, bottom), texture, texture colour, opacity, tail colour
ICONS = [
    ('washi', ('#F5EFE1', '#E9DFC8'), 'washi', '#1C1813', 0.22, '#D9452F'),
    ('screentone', ('#FFFFFF', '#FFFFFF'), 'halftone', '#0B0B0B', 0.30, '#0091C2'),
    ('twilight', ('#FF8A3D', '#4B2A7B'), 'scanline', '#FFF2E8', 0.10, '#9A7BFF'),
    ('yozakura', ('#141B3C', '#0A0F26'), 'petals', '#F28DB7', 0.55, '#F28DB7'),
    ('cel', ('#3BB8A6', '#2E9A8B'), 'grain', '#FBF3E2', 0.30, '#FF6B57'),
    ('natsuzora', ('#2F8FF5', '#CFE6FF'), 'clouds', '#FFFFFF', 0.85, '#FFD24D'),
]

def head(scale, cx, cy, tail):
    s = brand['seekr']; b = brand['band']
    tx, ty = cx - 54 * scale, cy - 40 * scale
    return f'''<g transform="translate({tx:.1f} {ty:.1f}) scale({scale})">
  <defs><clipPath id="h"><path d="{s['head']}"/></clipPath><clipPath id="e"><path d="{s['eye']}"/></clipPath></defs>
  <path d="{s['head']}" fill="{SEEKR['body']}" stroke="{SEEKR['outline']}" stroke-width="3" stroke-linejoin="round"/>
  <path d="{s['head']}" fill="{SEEKR['body']}"/>
  <rect x="{b['x']}" y="{b['y']}" width="{b['w']}" height="{b['h']}" fill="{SEEKR['band']}" clip-path="url(#h)"/>
  <path d="{brand['tails']}" fill="{tail}" stroke="{SEEKR['outline']}" stroke-width="1.2" stroke-linejoin="round"/>
  <path d="{s['eye']}" fill="{SEEKR['eye']}"/>
  <g clip-path="url(#e)">
    <ellipse cx="50" cy="51" rx="8.6" ry="8.6" fill="{SEEKR['iris']}"/>
    <ellipse cx="50" cy="51" rx="5" ry="5" fill="{SEEKR['eye']}"/>
    <ellipse cx="47.4" cy="48.2" rx="2" ry="2" fill="{SEEKR['shine']}"/>
  </g>
</g>'''

def run(*args):
    subprocess.run(args, check=True)

with tempfile.TemporaryDirectory() as tmp:
    for slug, (top, bottom), tex, tex_color, tex_alpha, tail in ICONS:
        out = os.path.join(ROOT, 'assets/app-icons')
        # Backdrop: gradient + tiled texture (texture tiles are 2x; icon is drawn at 4x).
        bg = f'''<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1024" height="1024">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{top}"/><stop offset="1" stop-color="{bottom}"/></linearGradient>
<pattern id="t" patternUnits="userSpaceOnUse" width="{{w}}" height="{{h}}"><image xlink:href="{{href}}" width="{{w}}" height="{{h}}"/></pattern>
<mask id="m"><rect width="1024" height="1024" fill="url(#t)"/></mask></defs>
<rect width="1024" height="1024" fill="url(#g)"/>
<rect width="1024" height="1024" fill="{tex_color}" opacity="{tex_alpha}" mask="url(#m)"/>
{head(9.6, 512, 540, tail)}
</svg>'''
        tile = os.path.join(SKINS, f'{tex}@2x.png')
        w, h = subprocess.run(['magick', 'identify', '-format', '%w %h', tile], capture_output=True, text=True, check=True).stdout.split()
        bg = bg.replace('{w}', str(int(w) * 2)).replace('{h}', str(int(h) * 2)).replace('{href}', 'data:image/png;base64,' + base64.b64encode(open(tile, 'rb').read()).decode())
        svg_path = os.path.join(tmp, f'{slug}.svg'); open(svg_path, 'w').write(bg)
        raw = os.path.join(tmp, f'{slug}.png')
        run('rsvg-convert', '-w', '1024', '-h', '1024', svg_path, '-o', raw)
        run('magick', raw, '-background', top, '-alpha', 'remove', '-alpha', 'off', '-strip', os.path.join(out, f'{slug}.png'))
        run('magick', os.path.join(out, f'{slug}.png'), '-resize', '180x180', '-strip', os.path.join(out, f'{slug}-thumb.png'))
        # Android adaptive foreground: Seekr alone inside the 66% safe zone.
        fg = f'<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">{head(6.4, 512, 524, tail)}</svg>'
        fg_path = os.path.join(tmp, f'{slug}-fg.svg'); open(fg_path, 'w').write(fg)
        run('rsvg-convert', '-w', '1024', '-h', '1024', fg_path, '-o', os.path.join(out, f'{slug}-android.png'))
        print('wrote', slug)
