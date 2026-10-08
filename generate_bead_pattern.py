#!/usr/bin/env python3
"""
Image-to-Perler/MARD bead pattern generator.

This script intentionally presents the conversion as seven explicit stages:
  1. Load and identify the source image
  2. Choose a proportionate bead-grid size
  3. Divide the image into bead regions and average each region
  4. Load and validate the standard 221-color MARD palette
  5. Match each averaged region to its nearest palette color in Lab space
  6. Export the labeled grid, legend, HTML, and JSON data
  7. Render a high-resolution PNG with a code printed in every bead cell

Dependencies: Pillow and NumPy.
"""

from PIL import Image
from PIL import ImageEnhance
from PIL import ImageFilter
from PIL import ImageDraw
from PIL import ImageFont
import numpy as np, csv, json, html, argparse, os
from collections import Counter

# ============================== STEP 1 ==============================
# Load and identify the source image. All major settings are configurable from
# the command line, so this script accepts images of any dimensions.
parser = argparse.ArgumentParser(description='Convert an image into a labeled MARD/Perler bead pattern.')
parser.add_argument('image', nargs='?', default='/home/ubuntu/upload/ArtDecoDeathTarotCard.png',
                    help='Input image path (default: the original supplied image).')
parser.add_argument('--max-width', '--max-w', dest='max_width', type=int, default=104,
                    help='Maximum bead-grid width (default: 104).')
parser.add_argument('--max-height', '--max-h', dest='max_height', type=int, default=104,
                    help='Maximum bead-grid height (default: 104).')
parser.add_argument('--output-dir', default='/home/ubuntu/bead_output',
                    help='Directory for generated files (default: /home/ubuntu/bead_output).')
parser.add_argument('--cell-size', type=int, default=100,
                    help='PNG pixels per bead cell (default: 100).')
parser.add_argument('--label', default='', help='Optional style label appended to output filenames.')
parser.add_argument('--png-only', action='store_true', help='Write only the final PNG; skip CSV, HTML, JSON, and legend files.')
parser.add_argument('--no-labels', action='store_true', help='Render bead colors and grid lines without MARD text labels.')
parser.add_argument('--grid-display', choices=['none', 'subtle', 'white', 'adaptive'], default='none', help='Grid line appearance in the PNG.')
parser.add_argument('--sampling', choices=['average', 'center', 'median', 'resize'], default='average')
parser.add_argument('--resize-filter', choices=['nearest', 'box', 'bilinear', 'bicubic', 'lanczos'], default='box')
parser.add_argument('--pre-blur', type=float, default=0.0)
parser.add_argument('--sharpen', type=float, default=0.0)
parser.add_argument('--gamma', type=float, default=1.0)
parser.add_argument('--contrast', type=float, default=1.0)
parser.add_argument('--saturation', type=float, default=1.0)
parser.add_argument('--distance', choices=['rgb', 'lab', 'weighted-lab'], default='lab')
parser.add_argument('--series', default='A,B,C,D,E,F,G,H,M')
parser.add_argument('--dither', choices=['none', 'floyd-steinberg', 'atkinson', 'ordered'], default='none')
parser.add_argument('--dither-strength', type=float, default=100.0)

args = parser.parse_args()
if min(args.max_width, args.max_height, args.cell_size) < 1:
    parser.error('max dimensions and cell size must be positive')
if args.pre_blur < 0 or not 0.5 <= args.gamma <= 2.0 or not 0.5 <= args.contrast <= 2.0 or not 0 <= args.saturation <= 2.0 or not 0 <= args.sharpen <= 3.0 or not 0 <= args.dither_strength <= 100:
    parser.error('image adjustments are outside their supported ranges')
SRC = args.image
OUTDIR = args.output_dir
SOURCE_NAME = os.path.basename(SRC)
SAFE_LABEL = ''.join(c if c.isalnum() or c in '-_' else '-' for c in args.label.strip())
SUFFIX = f'_{SAFE_LABEL}' if SAFE_LABEL else ''
SERIES = {x.strip().upper() for x in args.series.split(',') if x.strip()}
VALID_SERIES = set('ABCDEFGHM')
if not SERIES or not SERIES <= VALID_SERIES:
    parser.error('series must be one or more of A,B,C,D,E,F,G,H,M')

# ============================== STEP 2 ==============================
# Compute the largest integer grid that fits within max_width x max_height
# while preserving the source image aspect ratio.
def compute_grid_size(image_width, image_height, max_width, max_height):
    scale = min(max_width / image_width, max_height / image_height)
    width = max(1, int(round(image_width * scale)))
    height = max(1, int(round(image_height * scale)))
    # Rounding can exceed a bound by one pixel, so correct that safely.
    if width > max_width:
        width = max_width
        height = max(1, int(round(width * image_height / image_width)))
    if height > max_height:
        height = max_height
        width = max(1, int(round(height * image_width / image_height)))
    return width, height

# Convert RGB to Lab for more perceptually useful nearest-color matching.
def rgb_to_lab(rgb):
    x = np.asarray(rgb, dtype=np.float32) / 255.0
    x = np.where(x > 0.04045, ((x+0.055)/1.055)**2.4, x/12.92)
    r,g,b = x[...,0], x[...,1], x[...,2]
    X = (r*0.4124564 + g*0.3575761 + b*0.1804375) / 0.95047
    Y = (r*0.2126729 + g*0.7151522 + b*0.0721750)
    Z = (r*0.0193339 + g*0.1191920 + b*0.9503041) / 1.08883
    e = 216/24389; k = 24389/27
    f = lambda t: np.where(t > e, np.cbrt(t), (k*t+16)/116)
    fx,fy,fz = f(X),f(Y),f(Z)
    return np.stack([116*fy-16, 500*(fx-fy), 200*(fy-fz)], axis=-1)

# ============================== STEP 3 ==============================
# Apply artistic image adjustments, then reduce the image to one RGB sample
# per bead region.
RESAMPLE = {'nearest': Image.Resampling.NEAREST, 'box': Image.Resampling.BOX, 'bilinear': Image.Resampling.BILINEAR, 'bicubic': Image.Resampling.BICUBIC, 'lanczos': Image.Resampling.LANCZOS}
def apply_image_adjustments(im):
    if args.pre_blur: im = im.filter(ImageFilter.GaussianBlur(args.pre_blur))
    if args.sharpen: im = ImageEnhance.Sharpness(im).enhance(1.0 + args.sharpen)
    if args.contrast != 1.0: im = ImageEnhance.Contrast(im).enhance(args.contrast)
    if args.saturation != 1.0: im = ImageEnhance.Color(im).enhance(args.saturation)
    if args.gamma != 1.0:
        lut = [min(255, max(0, int(round(255 * ((i/255.0) ** (1.0/args.gamma)))))) for i in range(256)]
        im = im.point(lut * 3)
    return im
def sample_regions(im, width, height):
    im = apply_image_adjustments(im)
    if args.sampling == 'resize':
        return np.asarray(im.resize((width, height), RESAMPLE[args.resize_filter]), dtype=np.float32)
    arr = np.asarray(im, dtype=np.float32)
    ye = np.linspace(0, arr.shape[0], height+1).round().astype(int)
    xe = np.linspace(0, arr.shape[1], width+1).round().astype(int)
    samples = np.empty((height, width, 3), dtype=np.float32)
    for y in range(height):
        for x in range(width):
            region = arr[ye[y]:ye[y+1], xe[x]:xe[x+1]]
            if args.sampling == 'center':
                samples[y,x] = arr[min(arr.shape[0]-1,(ye[y]+ye[y+1]-1)//2), min(arr.shape[1]-1,(xe[x]+xe[x+1]-1)//2)]
            elif args.sampling == 'median':
                samples[y,x] = np.median(region.reshape(-1,3), axis=0)
            else:
                samples[y,x] = region.mean(axis=(0,1))
    return samples
im = Image.open(SRC).convert('RGB')
W, H = compute_grid_size(im.width, im.height, args.max_width, args.max_height)
means = sample_regions(im, W, H)

# ============================== STEP 4 ==============================
# Load the standard 221-color MARD palette (series A-H and M) from the
# referenced chart. The palette is embedded so the script is reproducible.
palette_text = '''
A1 F9F0CD
A2 FBFBD4
A3 FAFC9F
A4 FFE953
A5 F4D738
A6 FDAD49
A7 FF7C2F
A8 EACA49
A9 FF995A
A10 FF9D55
A11 FFDD99
A12 FCB58F
A13 FFBB59
A14 FF6D40
A15 FDFF44
A16 FEF9AE
A17 FFE36E
A18 FECF98
A19 FD7B72
A20 EFCD67
A21 FFE395
A22 FFF3A4
A23 F3D5BF
A24 FBF8C9
A25 FFD67D
A26 FFBB27
B1 E6EE32
B2 5BE419
B3 7CEE9D
B4 1EF942
B5 00BD35
B6 5AE8BA
B7 03AC88
B8 029D26
B9 26523A
B10 95D3C2
B11 5D722A
B12 156F40
B13 D9F794
B14 ADE945
B15 2E5132
B16 C6ED9C
B17 9BB13A
B18 E6EE49
B19 25B88C
B20 C2F0CC
B21 146A6B
B22 0B3C43
B23 303921
B24 EEFCA5
B25 4E846D
B26 8C7A36
B27 D1DCC1
B28 9EE5B9
B29 C5E254
B30 ECFBD0
B31 C4E6B5
B32 9BAB5A
C1 E8FFE7
C2 BCF9F6
C3 A0E2FB
C4 42CCFF
C5 01ACEB
C6 50A9F0
C7 0188D3
C8 1054C0
C9 314BCA
C10 3EBCE2
C11 03B9B9
C12 1C334D
C13 CDE8FF
C14 D5FDFF
C15 23C4C6
C16 1757A8
C17 50D3EC
C18 1C3344
C19 1787A2
C20 0082BE
C21 BEDDFF
C22 67B4BE
C23 C2DCEB
C24 7DC4FF
C25 A9E5E5
C26 2F99B3
C27 EBF5FC
C28 BBCFED
C29 4B5BA3
D1 AEB4F2
D2 858EDD
D3 3054AF
D4 182A84
D5 B843C5
D6 AC7BDE
D7 6E399A
D8 E2D3FF
D9 D5B9F8
D10 361B50
D11 B9BAE1
D12 DE9AD4
D13 B90295
D14 8B279B
D15 2F1F90
D16 E2E1EE
D17 C4D4F6
D18 A45EC7
D19 D8C3D7
D20 9C32B2
D21 9A009B
D22 333995
D23 EADAFC
D24 7786E5
D25 484FC7
D26 E9C3F6
E1 FDD3CC
E2 FECDDF
E3 FF97C3
E4 E8649E
E5 F551A2
E6 FF346B
E7 C63578
E8 FFDBE9
E9 E970CC
E10 D33893
E11 FCDDD2
E12 FFA1C5
E13 B6006D
E14 FFD1BA
E15 F2CFD0
E16 FFECDE
E17 FFE2EA
E18 FFC9D6
E19 FFD2E7
E20 D8C7D1
E21 BD9DA1
E22 CC78A7
E23 937A8D
E24 F6E4F9
F1 FD957B
F2 FC3D45
F3 F74941
F4 FC283C
F5 D80127
F6 B0443D
F7 971937
F8 BC0127
F9 E2677A
F10 A74D22
F11 6F201F
F12 FD4D6A
F13 DD422F
F14 FFA9AD
F15 C80020
F16 FFD9C8
F17 F79B71
F18 D37C46
F19 C1444A
F20 CD9391
F21 F4B1B4
F22 FFD0CB
F23 F57E66
F24 FCC1C4
F25 E54B4F
G1 FFE2CE
G2 FFCAAA
G3 F4C3A5
G4 E1B383
G5 ED9435
G6 F59734
G7 9D5B3E
G8 592A21
G9 E6B483
G10 C88135
G11 E0C593
G12 EBBB83
G13 B7714A
G14 8D614C
G15 FCF9E0
G16 F2D9BA
G17 56403C
G18 FFE4CC
G19 E1943A
G20 A94023
G21 CB8E77
H1 E2E2E2
H2 FFFFFF
H3 B3B3B3
H4 868686
H5 474747
H6 2C2C2C
H7 000000
H8 E7D6DB
H9 E4E7E3
H10 EEE9EA
H11 CECDD5
H12 FFF5ED
H13 F3E1C9
H14 CFD7D3
H15 98A6A8
H16 3B2F23
H17 F1EDED
H18 FFFDF0
H19 F6EFE2
H20 949FA3
H21 F7F3E4
H22 CACAD5
H23 9A9D94
M1 BCC6B8
M2 8AA385
M3 697D80
M4 DACEBE
M5 D0CCAA
M6 B0A782
M7 B4A497
M8 B38281
M9 A58767
M10 C5B1BC
M11 9F7494
M12 644749
M13 D19066
M14 C77361
M15 757D7B
'''

palette=[]
for line in palette_text.strip().splitlines():
    code, hx = line.split()
    
    if code[0] in SERIES:
        palette.append((code, hx.upper(), tuple(int(hx[i:i+2],16) for i in (0,2,4))))
assert palette, 'No palette colors selected'


# ============================== STEP 5 ==============================
# Map each sample to the selected palette using RGB, Lab, or weighted Lab
# distance. Optional ordered/error-diffusion dithering preserves more texture.
def rgb_to_lab(rgb):
    x=np.asarray(rgb,dtype=np.float32)/255.0
    x=np.where(x>0.04045,((x+0.055)/1.055)**2.4,x/12.92)
    r,g,b=x[...,0],x[...,1],x[...,2]
    X=(r*.4124564+g*.3575761+b*.1804375)/.95047; Y=r*.2126729+g*.7151522+b*.0721750; Z=(r*.0193339+g*.1191920+b*.9503041)/1.08883
    e,k=216/24389,24389/27; f=lambda t: np.where(t>e,np.cbrt(t),(k*t+16)/116)
    fx,fy,fz=f(X),f(Y),f(Z)
    return np.stack([116*fy-16,500*(fx-fy),200*(fy-fz)],axis=-1)
p_rgb=np.array([p[2] for p in palette],dtype=np.float32)
if args.distance == 'rgb':
    sample_vectors, palette_vectors = means, p_rgb
elif args.distance == 'weighted-lab':
    sample_vectors, palette_vectors = rgb_to_lab(means), rgb_to_lab(p_rgb)
    sample_vectors *= np.array([1.35,1,1]); palette_vectors *= np.array([1.35,1,1])
else:
    sample_vectors, palette_vectors = rgb_to_lab(means), rgb_to_lab(p_rgb)
def nearest(v): return int(((palette_vectors-v)**2).sum(axis=1).argmin())
def quantize(vectors):
    if args.dither == 'none': return np.array([[nearest(vectors[y,x]) for x in range(W)] for y in range(H)],dtype=int)
    work=vectors.copy(); result=np.empty((H,W),dtype=int); strength=args.dither_strength/100.0
    if args.dither == 'ordered':
        bayer=np.array([[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]],dtype=np.float32)/15-.5
        amplitude=(32.0 if args.distance=='rgb' else 10.0)*strength
        return np.array([[nearest(work[y,x]+bayer[y%4,x%4]*amplitude) for x in range(W)] for y in range(H)],dtype=int)
    diffusion=[(0,1,7/16),(1,-1,3/16),(1,0,5/16),(1,1,1/16)] if args.dither=='floyd-steinberg' else [(0,1,1/8),(0,2,1/8),(1,-1,1/8),(1,0,1/8),(1,1,1/8),(2,0,1/8)]
    for y in range(H):
        for x in range(W):
            chosen=nearest(work[y,x]); result[y,x]=chosen; error=(work[y,x]-palette_vectors[chosen])*strength
            for dy,dx,weight in diffusion:
                ny,nx=y+dy,x+dx
                if 0<=ny<H and 0<=nx<W: work[ny,nx]+=error*weight
    return result
idx=quantize(sample_vectors)
codes=[[palette[int(i)][0] for i in row] for row in idx]

# ============================== STEP 6 ==============================
# Optional data exports. Batch visual previews use --png-only to skip these
# artifacts and go directly to the PNG renderer.
import os
os.makedirs(OUTDIR, exist_ok=True)
counts=Counter(code for row in codes for code in row)
if not args.png_only:
    with open(f'{OUTDIR}/bead_grid_{W}x{H}{SUFFIX}.csv','w',newline='') as f:
        w=csv.writer(f); w.writerow(['row\\col']+[str(i) for i in range(1,W+1)])
        for r,row in enumerate(codes,1): w.writerow([str(r)]+row)
    with open(f'{OUTDIR}/color_legend{SUFFIX}.csv','w',newline='') as f:
        w=csv.writer(f); w.writerow(['code','hex','bead_count'])
        for code,hx,_ in sorted(palette, key=lambda p: (p[0][0], int(p[0][1:]))): w.writerow([code, '#'+hx, counts.get(code,0)])
    def contrast(hexv):
        rgb=[int(hexv[i:i+2],16) for i in (0,2,4)]
        lum=sum(c/255*(0.2126,0.7152,0.0722)[j] for j,c in enumerate(rgb))
        return '#111' if lum>0.58 else '#fff'
    legend_rows=[]
    for code,hx,_ in sorted(palette, key=lambda p: (p[0][0], int(p[0][1:]))):
        n=counts.get(code,0)
        if n: legend_rows.append(f'<div class=\"swatch\"><i style=\"background:#{hx}\"></i><b>{code}</b><span>#{hx}</span><em>{n}</em></div>')
    rows=[]
    for r,row in enumerate(idx,1):
        cells=[]
        for c,i in enumerate(row,1):
            code,hx,_=palette[int(i)]
            cells.append(f'<div class=\"cell\" title=\"Row {r}, column {c}: {code} (#{hx})\" style=\"background:#{hx};color:{contrast(hx)}\">{code}</div>')
        rows.append('<div class=\"gridrow\">'+''.join(cells)+'</div>')
    html_doc=f'''<!doctype html><html><head><meta charset=\"utf-8\"><title>MARD Bead Pattern — {html.escape(SOURCE_NAME)}</title><style>:root{{--cell:18px}}*{{box-sizing:border-box}}body{{font-family:system-ui,sans-serif;margin:24px;color:#222;background:#f5f3ee}}.wrap{{overflow:auto;background:#fff;border:1px solid #bbb;padding:12px}}.grid{{width:max-content}}.gridrow{{display:flex;height:var(--cell)}}.cell{{width:var(--cell);height:var(--cell);display:flex;align-items:center;justify-content:center;font-size:7px;font-weight:700;border:1px solid #ffffff55}}</style></head><body><h1>MARD Bead Pattern — {html.escape(SOURCE_NAME)}</h1><p>Grid: {W} × {H}; total beads: {W*H:,}</p><div class=\"wrap\"><div class=\"grid\">{''.join(rows)}</div></div><h2>Colors used</h2><div>{''.join(legend_rows)}</div></body></html>'''
    with open(f'{OUTDIR}/bead_pattern_{W}x{H}{SUFFIX}.html','w') as f: f.write(html_doc)
    with open(f'{OUTDIR}/bead_pattern_{W}x{H}{SUFFIX}.json','w') as f:
        json.dump({'width':W,'height':H,'source':SOURCE_NAME,'settings':vars(args),'grid':codes,'palette':{p[0]:'#'+p[1] for p in palette}},f)
print(json.dumps({'width':W,'height':H,'total':W*H,'colors_used':len(counts),'output':OUTDIR}, indent=2))
print('top colors:', counts.most_common(15))

# ============================== STEP 7 ==============================
# Render a high-resolution PNG. Each bead is CELL_SIZE pixels square and has
# its MARD code printed in the cell for direct construction reference.
# High-resolution labeled PNG pattern.
# One bead = CELL_SIZE pixels. Change this for a larger or smaller printable sheet.
CELL_SIZE = args.cell_size
MARGIN = 20
GRID_LINES = {
    'none': (None, 0),
    'subtle': ((0, 0, 0, 70), 1),
    'white': ((255, 255, 255, 150), 2),
}
if args.grid_display == 'adaptive':
    grid_line = ((0, 0, 0, 70), 1) if CELL_SIZE < 60 else ((255, 255, 255, 150), 2)
else:
    grid_line = GRID_LINES[args.grid_display]

from PIL import ImageDraw, ImageFont
png = Image.new('RGBA', (W * CELL_SIZE + 2*MARGIN, H * CELL_SIZE + 2*MARGIN), (245, 243, 238, 255))
draw = ImageDraw.Draw(png, 'RGBA')
font = None
if not args.no_labels:
    try:
        font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', max(12, CELL_SIZE // 5))
    except OSError:
        font = ImageFont.load_default()
for r, row in enumerate(idx):
    for c, palette_index in enumerate(row):
        code, hx, _ = palette[int(palette_index)]
        rgb = tuple(int(hx[i:i+2], 16) for i in (0, 2, 4))
        x0 = MARGIN + c * CELL_SIZE
        y0 = MARGIN + r * CELL_SIZE
        x1 = x0 + CELL_SIZE
        y1 = y0 + CELL_SIZE
        draw.rectangle((x0, y0, x1, y1), fill=rgb + (255,), outline=grid_line[0], width=grid_line[1])
        if not args.no_labels:
            bbox = draw.textbbox((0, 0), code, font=font)
            tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
            fill = (17, 17, 17, 255) if sum(rgb[i] * (0.2126, 0.7152, 0.0722)[i] for i in range(3)) / 255 > 0.58 else (255, 255, 255, 255)
            draw.text((x0 + (CELL_SIZE-tw)/2, y0 + (CELL_SIZE-th)/2 - bbox[1]), code, font=font, fill=fill)

png_path = f'{OUTDIR}/bead_pattern_{W}x{H}{SUFFIX}_highres.png'
png.convert('RGB').save(png_path, format='PNG', dpi=(300, 300), optimize=not args.png_only)
print(f'high-resolution PNG: {png_path} ({png.width}x{png.height}px, 300 DPI metadata)')
