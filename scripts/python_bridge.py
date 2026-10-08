"""Development-only JSON-lines adapter. The production package excludes this file."""
import contextlib, io, json, runpy, sys, time, traceback
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
def emit(data): print(json.dumps(data,separators=(',',':')),flush=True)
try:
    s=json.loads(sys.stdin.readline())
    args=[str(ROOT/'generate_bead_pattern.py'),s['inputPath'],'--output-dir',s['outputDir'],'--max-width',str(s['maxWidth']),'--max-height',str(s['maxHeight']),'--cell-size',str(s['cellSize']),'--series',','.join(s['series']),'--grid-display',s['gridDisplay'],'--png-only']
    if not s['labels']: args+=['--no-labels']
    if s.get('label'): args+=['--label',s['label']]
    for k in ['sampling','resize_filter','pre_blur','sharpen','gamma','contrast','saturation','distance','dither','dither_strength']: args+=['--'+k.replace('_','-'),str(s[k])]
    sys.argv=args;start=time.perf_counter()
    emit(dict(type='progress',jobId=s['jobId'],completed=0,total=1,message='Python reference running'))
    with contextlib.redirect_stdout(io.StringIO()): result=runpy.run_path(args[0],run_name='__main__')
    emit(dict(type='result',result=dict(jobId=s['jobId'],width=result['W'],height=result['H'],grid=result['codes'],counts=dict(result['counts']),pngPath=result['png_path'],settings=s,seconds=time.perf_counter()-start)))
except Exception as exc:
    emit(dict(type='error',error=dict(code=type(exc).__name__,message=str(exc),detail=traceback.format_exc())))
    sys.exit(1)
