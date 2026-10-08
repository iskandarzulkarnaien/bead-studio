import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {defaults,planBatch,preset,styleLabel,parseStyle,validateSettings} from '../src/contract';
import {gridSize,loadPixels,adjust,sample} from '../src/image';
import {palette,quantize} from '../src/color';
import {TypeScriptPatternGenerator} from '../src/generator';
import {PythonPatternGenerator} from '../src/python-adapter';
test('palette, grid bounds, naming and batch cardinality',()=>{
 assert.equal(palette.length,221);assert.equal(new Set(palette.map(p=>p.code)).size,221);
 assert.deepEqual(gridSize(1000,1500,104,104),[69,104]);assert.deepEqual(gridSize(2,3,200,200),[133,200]);
 const base={...defaults,jobId:'test'};assert.equal(planBatch({base,ranges:preset('Quick Baseline')}).length,96);
 assert.equal(planBatch({base,ranges:preset('Gamma Sweep')}).length,288);
 for(const ext of ['','.png'])assert.equal(parseStyle(`bead_pattern_69x104_${styleLabel(base)}_highres${ext}`).distance,'lab');
 assert.throws(()=>parseStyle('invalid.png'));assert.throws(()=>validateSettings({...base,gamma:NaN}));assert.throws(()=>validateSettings({...base,label:'../escape'}));assert.throws(()=>planBatch({base,ranges:{...preset('Quick Baseline'),gamma:{min:1,max:2,step:0}}}));
});
test('Python fixture coverage: adjustments, transparency, grayscale, landscape, small image and maximum grid',async()=>{
 const png=await loadPixels('fixtures/regression/gradient.png'),bmp=await loadPixels('fixtures/regression/gradient.bmp');assert.deepEqual(Array.from(bmp.data),Array.from(png.data));
 const dir='fixtures/regression';const manifest:string[]=JSON.parse(await fs.readFile(path.join(dir,'manifest.json'),'utf8'));
 for(const file of manifest){const r=JSON.parse(await fs.readFile(path.join(dir,file),'utf8'));const s={...defaults,...r.settings,jobId:'regression',maxWidth:r.settings.max_width,maxHeight:r.settings.max_height};const pixels=await adjust(await loadPixels(path.join(dir,r.image)),s);const [w,h]=gridSize(pixels.width,pixels.height,s.maxWidth,s.maxHeight);assert.deepEqual([w,h],[r.width,r.height]);const grid=quantize(sample(pixels,w,h,s),w,h,s);let different=0;for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(grid[y][x]!==r.grid[y][x])different++;assert.ok(different/(w*h)<=.1,`${file}: ${different}/${w*h} cells differ; ${JSON.stringify(r.settings)}`);}
});
test('PNG pair has expected geometry, visible labels, white grid and shared bead codes',async()=>{
 const g=new TypeScriptPatternGenerator(),base={...defaults,jobId:'png-test',inputPath:path.resolve('fixtures/regression/solid.png'),outputDir:path.resolve('generated/tests'),maxWidth:4,maxHeight:4,cellSize:100,label:'unlabeled'};
 const a=await g.generateSingle(base),b=await g.generateSingle({...base,labels:true,gridDisplay:'white',label:'labeled'});assert.deepEqual(a.grid,b.grid);
 const image=await sharp(b.pngPath).raw().toBuffer({resolveWithObject:true});assert.equal(image.info.width,440);assert.equal(image.info.height,440);
 let dark=0;for(let y=40;y<100;y++)for(let x=30;x<110;x++){const i=(y*440+x)*image.info.channels;if(image.data[i]<80)dark++;}assert.ok(dark>200,'Labels should occupy a meaningful fraction of a 100px cell');
 const i=(70*440+120)*image.info.channels;assert.equal(image.data[i],255);
});
test('Python adapter returns the same code grid and structured errors',async()=>{
 const g=new PythonPatternGenerator(path.resolve('.'));const s={...defaults,jobId:'python-test',inputPath:path.resolve('fixtures/regression/solid.png'),outputDir:path.resolve('generated/tests-python'),maxWidth:4,maxHeight:4,cellSize:10};const r=await g.generateSingle(s);assert.equal(r.grid[0][0],'H2');await assert.rejects(g.generateSingle({...s,inputPath:'does-not-exist.png'}),/No such file|cannot find/i);
});
