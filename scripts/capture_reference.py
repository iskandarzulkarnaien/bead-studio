"""Capture immutable output from the original generator without changing its source."""
import contextlib, hashlib, io, itertools, json, platform, runpy, sys, time
from pathlib import Path
import PIL, numpy

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'reference-output' / 'quick-baseline'
FIX = ROOT / 'fixtures' / 'quick-baseline'
if (FIX / 'manifest.json').exists():
    raise SystemExit('Reference already exists. Use a separate checkout to recapture; the preserved baseline will not be overwritten.')
OUT.mkdir(parents=True, exist_ok=True)
FIX.mkdir(parents=True, exist_ok=True)
source = ROOT / 'Art Deco Death Tarot Card.png'
generator = ROOT / 'generate_bead_pattern.py'
def digest(p): return hashlib.sha256(p.read_bytes()).hexdigest()
manifest = dict(source=source.name, sourceSha256=digest(source), generatorSha256=digest(generator),
                python=platform.python_version(), pillow=PIL.__version__, numpy=numpy.__version__,
                baselineCommit='b9b6f308116bb955548439a1bf64656590b2f242', styles=[])
keys = ['sampling','resize_filter','pre_blur','sharpen','gamma','contrast','saturation','distance','dither','dither_strength']
plans = []
for sample in ['average','center','median','resize']:
    for filt in (['nearest','box','bilinear','bicubic','lanczos'] if sample == 'resize' else ['box']):
        for distance, dither in itertools.product(['rgb','lab','weighted-lab'], ['none','floyd-steinberg','atkinson','ordered']):
            plans.append(dict(zip(keys,[sample,filt,0.0,0.0,1.0,1.0,1.0,distance,dither,100.0])))
for number, settings in enumerate(plans, 1):
    label = '__'.join(f'{k[:2]}-{str(v).replace(".","p")}' for k,v in settings.items())
    sys.argv = [str(generator),str(source),'--max-width','104','--max-height','104','--cell-size','20',
                '--output-dir',str(OUT),'--series','A,B,C,D,E,F,G,H,M','--label',label,'--png-only','--no-labels']
    for k,v in settings.items(): sys.argv += ['--'+k.replace('_','-'),str(v)]
    start=time.perf_counter()
    with contextlib.redirect_stdout(io.StringIO()): result=runpy.run_path(str(generator),run_name='__main__')
    png=Path(result['png_path'])
    data=dict(settings=settings,width=result['W'],height=result['H'],grid=result['codes'],counts=dict(result['counts']),png=png.name,pngSha256=digest(png),seconds=time.perf_counter()-start)
    file=f'{number:03d}.json'
    (FIX/file).write_text(json.dumps(data,separators=(',',':')),encoding='utf-8')
    manifest['styles'].append(dict(fixture=file,png=png.name,settings=settings))
    print(f'{number}/96 {sample if False else settings["sampling"]} {settings["resize_filter"]} {settings["distance"]} {settings["dither"]}',flush=True)
(FIX/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
# Original high-resolution pair, separate from the exact batch collection.
for labeled in [False,True]:
    sys.argv=[str(generator),str(source),'--max-width','104','--max-height','104','--cell-size','100','--output-dir',str(OUT.parent/'original-finals'),'--label','original_labeled' if labeled else 'original_unlabeled','--png-only']
    if not labeled: sys.argv.append('--no-labels')
    with contextlib.redirect_stdout(io.StringIO()): runpy.run_path(str(generator),run_name='__main__')
print('Reference complete.',flush=True)
