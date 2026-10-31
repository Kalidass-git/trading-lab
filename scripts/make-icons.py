# Draws the Trading Lab logo (a lab flask holding rising candles) and renders every icon size. Needs python3 + playwright.
import os, sys, base64
from playwright.sync_api import sync_playwright
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
BG1, BG2 = '#4338CA', '#2B2A8C'   # indigo
FLASK = '''<path d="M210 92h92a10 10 0 0 1 0 20h-12v92l88 160c14 26-4 56-34 56H168c-30 0-48-30-34-56l88-160V112h-12a10 10 0 0 1 0-20z" fill="{fill}" {extra}/>'''
def art(white=True, ink='#FFFFFF'):
    # flask outline + amber liquid with three candles; defs clip the liquid to the flask
    return f'''<defs><clipPath id="c"><path d="M210 92h92a10 10 0 0 1 0 20h-12v92l88 160c14 26-4 56-34 56H168c-30 0-48-30-34-56l88-160V112h-12a10 10 0 0 1 0-20z"/></clipPath>
<linearGradient id="l" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFD166"/><stop offset="1" stop-color="#F59E0B"/></linearGradient></defs>
<path d="M210 92h92a10 10 0 0 1 0 20h-12v92l88 160c14 26-4 56-34 56H168c-30 0-48-30-34-56l88-160V112h-12a10 10 0 0 1 0-20z" fill="{ink}" fill-opacity=".14" stroke="{ink}" stroke-width="22" stroke-linejoin="round"/>
<g clip-path="url(#c)"><rect x="100" y="318" width="312" height="140" fill="url(#l)"/>
<g fill="#2B2A8C"><rect x="176" y="392" width="30" height="44" rx="5"/><rect x="241" y="368" width="30" height="68" rx="5"/><rect x="306" y="338" width="30" height="98" rx="5"/>
<rect x="188" y="378" width="6" height="68" rx="3"/><rect x="253" y="352" width="6" height="96" rx="3"/><rect x="318" y="322" width="6" height="128" rx="3"/></g></g>
<circle cx="256" cy="52" r="14" fill="#FFD166"/><circle cx="296" cy="30" r="9" fill="#FFD166" fill-opacity=".7"/>'''
def svg(kind):
    if kind == 'mark': return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="90 10 332 470">{art()}</svg>'
    if kind == 'icon': return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{BG1}"/><stop offset="1" stop-color="{BG2}"/></linearGradient></defs><rect width="512" height="512" rx="116" fill="url(#b)"/><g transform="translate(76 76) scale(.7)">{art()}</g></svg>'
def full(scale, bg=True):  # square canvas, optional solid bg, art centred
    t = 256 - 256 * scale
    b = f'<rect width="512" height="512" fill="{BG2}"/>' if bg else ''
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">{b}<g transform="translate({t} {t - 8 * scale}) scale({scale})">{art()}</g></svg>'
def stat():  # single-colour silhouette for the status bar
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M210 92h92a10 10 0 0 1 0 20h-12v92l88 160c14 26-4 56-34 56H168c-30 0-48-30-34-56l88-160V112h-12a10 10 0 0 1 0-20z" fill="#fff"/></svg>'
def w(p, s): open(os.path.join(root, p), 'w').write(s)
w('icons/mark.svg', svg('mark')); w('icons/icon.svg', svg('icon'))
with sync_playwright() as pw:
    br = pw.chromium.launch(); pg = br.new_page()
    def png(markup, size, out, transparent=False):
        pg.set_viewport_size({'width': size, 'height': size})
        pg.set_content(f'<body style="margin:0;background:transparent"><img src="data:image/svg+xml;base64,{base64.b64encode(markup.encode()).decode()}" width="{size}" height="{size}" style="display:block">')
        pg.wait_for_timeout(50)
        pg.screenshot(path=os.path.join(root, out), omit_background=True)
    I = svg('icon')
    for n, s in [('icons/icon-192.png', 192), ('icons/icon-512.png', 512), ('icons/apple-touch-180.png', 180), ('icons/favicon-32.png', 32)]: png(I, s, n)
    png(full(0.66), 512, 'icons/icon-maskable-512.png')
    res = os.path.join(root, 'android/app/src/main/res')
    for d, s in [('mdpi', 48), ('hdpi', 72), ('xhdpi', 96), ('xxhdpi', 144), ('xxxhdpi', 192)]:
        png(I, s, f'android/app/src/main/res/mipmap-{d}/ic_launcher.png')
        png(I, s, f'android/app/src/main/res/mipmap-{d}/ic_launcher_round.png')
    for d, s in [('mdpi', 108), ('hdpi', 162), ('xhdpi', 216), ('xxhdpi', 324), ('xxxhdpi', 432)]:
        png(full(0.62, bg=False), s, f'android/app/src/main/res/mipmap-{d}/ic_launcher_foreground.png')
    for d, s in [('mdpi', 24), ('hdpi', 36), ('xhdpi', 48), ('xxhdpi', 72), ('xxxhdpi', 96)]:
        png(stat(), s, f'android/app/src/main/res/drawable-{d}/ic_stat_icon.png')
    import glob
    from PIL import Image
    for f in glob.glob(res + '/**/splash.png', recursive=True):
        W, H = Image.open(f).size
        pg.set_viewport_size({'width': W, 'height': H})
        k = min(W, H) * 0.34
        pg.set_content(f'<body style="margin:0;background:{BG2};display:grid;place-items:center;height:100vh"><img src="data:image/svg+xml;base64,{base64.b64encode(full(1, bg=False).encode()).decode()}" width="{k}" height="{k}">')
        pg.wait_for_timeout(50); pg.screenshot(path=f)
    br.close()
print('icons done')
