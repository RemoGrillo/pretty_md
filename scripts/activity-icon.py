"""Draws media/activity-icon.svg: an open two-page book with a serif M and D
(EB Garamond, instanced at a heavy weight so the serifs survive at 24 px).

Needs: pip install fonttools brotli   (run: python scripts/activity-icon.py)
"""
from pathlib import Path

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parent.parent
WEIGHT = 800

font = instantiateVariableFont(TTFont(ROOT / 'media/fonts/eb-garamond-latin-wght-normal.woff2'), {'wght': WEIGHT})
glyphs = font.getGlyphSet()
cmap = font.getBestCmap()


def bounds(ch):
    pen = BoundsPen(glyphs)
    glyphs[cmap[ord(ch)]].draw(pen)
    return pen.bounds  # xMin, yMin, xMax, yMax in font units (y up)


def path(ch, scale, cx, baseline):
    """SVG path of `ch`, scaled, horizontally centred on cx, sitting on `baseline`."""
    x0, _, x1, _ = bounds(ch)
    dx = cx - (x0 + x1) / 2 * scale
    pen = SVGPathPen(glyphs, ntos=lambda v: f'{v:.2f}'.rstrip('0').rstrip('.'))
    glyphs[cmap[ord(ch)]].draw(TransformPen(pen, (scale, 0, 0, -scale, dx, baseline)))
    return pen.getCommands()


# Book: outer page corners lower than the spine at the bottom, higher at the top.
SPINE_TOP, SPINE_BOTTOM = 6.6, 20.4
OUTER_TOP, OUTER_BOTTOM = 4.8, 18.7
LEFT, RIGHT = 0.9, 23.1
book = (
    f'M12 {SPINE_TOP}C9.4 4.6 5.2 4.1 {LEFT} {OUTER_TOP}V{OUTER_BOTTOM}C5.2 18.6 9.4 19.1 12 {SPINE_BOTTOM}'
    f'C14.6 19.1 18.8 18.6 {RIGHT} {OUTER_BOTTOM}V{OUTER_TOP}C18.8 4.1 14.6 4.6 12 {SPINE_TOP}Z'
    f'M12 {SPINE_TOP}V{SPINE_BOTTOM}'
)

# Letters: same scale for both, sized so the (wide) M fits its page.
m = bounds('M')
scale = min(8.0 / (m[2] - m[0]), 7.6 / (m[3] - m[1]))
baseline = 15.9
letters = path('M', scale, 6.55, baseline) + path('D', scale, 17.35, baseline)

svg = (
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">'
    f'<path d="{book}" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>'
    f'<path d="{letters}" fill="currentColor"/>'
    '</svg>\n'
)
(ROOT / 'media/activity-icon.svg').write_text(svg)
print(f'scale={scale:.4f}  cap height={(m[3]-m[1])*scale:.2f}px  M width={(m[2]-m[0])*scale:.2f}px')
