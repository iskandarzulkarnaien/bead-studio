"""Read-only layout measurements; writes a crop/metrics only under generated/."""
from pathlib import Path
from collections import Counter
import hashlib,json
from PIL import Image
import numpy as np
source=Path('judgment_full_221_pattern.png')
image=Image.open(source).convert('RGB')
pixels=np.array(image)
cell=40
width,height=image.size
assert (width,height)==(2760,4120), 'Reinspect layout if the reference image changes'
glyphs=[];fills=[]
for y in range(height//cell):
    for x in range(width//cell):
        tile=pixels[y*cell:(y+1)*cell,x*cell:(x+1)*cell]
        bg=Counter(map(tuple,tile[3:37,3:37].reshape(-1,3))).most_common(1)[0][0]
        fills.append(tuple(int(c) for c in bg))
        mask=np.max(np.abs(tile[6:34,4:36].astype(int)-np.array(bg)),axis=2)>40
        yy,xx=np.where(mask)
        if len(xx):glyphs.append((int(xx.max()-xx.min()+1),int(yy.max()-yy.min()+1)))
palette={tuple(p['rgb']) for p in json.loads(Path('src/palette.json').read_text())}
metrics=dict(source=str(source),sha256=hashlib.sha256(source.read_bytes()).hexdigest(),width=width,height=height,bytes=source.stat().st_size,cellPixels=cell,gridWidth=width//cell,gridHeight=height//cell,outerMarginPixels=0,rgbaMiB=width*height*4/1048576,observedGlyphBounds=Counter(glyphs).most_common(10),distinctFillColors=len(set(fills)),exactPaletteMatchCells=sum(c in palette for c in fills),totalCells=len(fills),notes=['40px pitch verified from repeated grid boundaries','Glyph bounds are measured raster ink extents, not a source font-size declaration','Reference is used for sizing and reported PixDotDot acceptance, not as a replacement MARD palette'])
out=Path('generated/web-benchmark');out.mkdir(parents=True,exist_ok=True)
image.crop((0,0,400,240)).save(out/'judgment-crop.png')
(out/'reference-metrics.json').write_text(json.dumps(metrics,indent=2))
print(json.dumps(metrics,indent=2))
