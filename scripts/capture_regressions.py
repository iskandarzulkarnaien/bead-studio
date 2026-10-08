import contextlib,io,json,runpy,sys
from pathlib import Path
from PIL import Image
import numpy as np
root=Path(__file__).resolve().parent.parent
folder=root/'fixtures'/'regression';folder.mkdir(parents=True,exist_ok=True)
out=root/'reference-output'/'regression';out.mkdir(parents=True,exist_ok=True)
gradient=np.array([[[x*255//79,y*255//47,(x*13+y*17)%256] for x in range(80)] for y in range(48)],dtype=np.uint8)
Image.fromarray(gradient).save(folder/'gradient.png')
Image.new('RGB',(32,32),(255,255,255)).save(folder/'solid.png')
Image.fromarray(np.where(np.indices((64,96)).sum(axis=0)[:,:,None]%2,[0,0,0],[255,255,255]).astype(np.uint8)).save(folder/'contrast.png')
Image.fromarray(np.dstack([gradient,np.zeros((48,80),dtype=np.uint8)])).save(folder/'transparent.png')
Image.fromarray(gradient).convert('L').save(folder/'gray.png')
Image.new('RGB',(3,2),(180,20,50)).save(folder/'small.png')
cases=[]
for name in ['gradient','solid','contrast','transparent','gray']:
    for sampling in ['average','center','median','resize']: cases.append((name,dict(sampling=sampling)))
for key,values in dict(pre_blur=[.1,.5,1,3],sharpen=[.5,1,3],gamma=[.5,.95,1.5,2],contrast=[.5,.9,1.1,2],saturation=[0,.75,1.05,2]).items():
    for value in values: cases.append(('gradient',{key:value}))
cases += [('small',dict(sampling='resize',resize_filter='lanczos',max_width=200,max_height=200)),('gradient',dict(pre_blur=.5,sharpen=1,gamma=.95,contrast=.9,saturation=.75))]
manifest=[]
for i,(name,settings) in enumerate(cases):
    opts=dict(max_width=24,max_height=24,cell_size=10,sampling='average',resize_filter='box',pre_blur=0,sharpen=0,gamma=1,contrast=1,saturation=1,distance='lab',dither='none',dither_strength=100)
    opts.update(settings)
    sys.argv=[str(root/'generate_bead_pattern.py'),str(folder/(name+'.png')),'--output-dir',str(out),'--png-only','--no-labels','--label',str(i)]
    for key,value in opts.items():sys.argv+=['--'+key.replace('_','-'),str(value)]
    with contextlib.redirect_stdout(io.StringIO()):r=runpy.run_path(sys.argv[0],run_name='__main__')
    record=dict(image=name+'.png',settings=opts,width=r['W'],height=r['H'],grid=r['codes'],counts=dict(r['counts']))
    fn=f'{i:03d}.json';(folder/fn).write_text(json.dumps(record,separators=(',',':')));manifest.append(fn)
(folder/'manifest.json').write_text(json.dumps(manifest))
print(f'Captured {len(cases)} regression cases')
