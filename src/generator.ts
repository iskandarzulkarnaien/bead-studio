import sharp from 'sharp';
import path from 'node:path';
import {mkdir} from 'node:fs/promises';
import {defaults,planBatch,validateSettings,type PatternGenerator,type GenerationSettings,type GenerationResult,type BatchSettings,type BatchResult,type ProgressHandler} from './contract';
import {loadPixels,adjust,sample,gridSize} from './image';
import {palette,quantize} from './color';
export async function render(grid:string[][],s:GenerationSettings,pngPath:string){
  const cell=s.cellSize,w=grid[0].length*cell+40,h=grid.length*cell+40,raw=Buffer.alloc(w*h*3);
  for(let i=0;i<raw.length;i+=3){raw[i]=245;raw[i+1]=243;raw[i+2]=238;}
  const gridMode=s.gridDisplay==='adaptive'?(cell<60?'subtle':'white'):s.gridDisplay;
  const tiles=new Map<string,Buffer>();
  for(const code of new Set(grid.flat())){const color=palette.find(p=>p.code===code)!;
    if(!s.labels){const tile=Buffer.alloc(cell*cell*3),edge=gridMode==='white'?2:gridMode==='subtle'?1:0;for(let y=0;y<cell;y++)for(let x=0;x<cell;x++){const border=x<edge||y<edge||x>=cell-edge||y>=cell-edge;for(let c=0;c<3;c++)tile[(y*cell+x)*3+c]=border?(gridMode==='white'?255:0):color.rgb[c];}tiles.set(code,tile);continue;}
    const fg=color.rgb.reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0)/255>.58?'#111':'#fff';const border=gridMode==='none'?'':`<rect x="0" y="0" width="${cell}" height="${cell}" fill="none" stroke="${gridMode==='white'?'white':'black'}" stroke-width="${gridMode==='white'?4:2}"/>`;const text=`<text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-family="Arial, sans-serif" font-weight="bold" font-size="${Math.floor(cell*.42)}" fill="${fg}">${code}</text>`;const tile=await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${cell}" height="${cell}"><rect width="100%" height="100%" fill="${color.hex}"/>${border}${text}</svg>`)).removeAlpha().raw().toBuffer();tiles.set(code,tile);}
  for(let y=0;y<grid.length;y++)for(let x=0;x<grid[0].length;x++){const tile=tiles.get(grid[y][x])!;for(let row=0;row<cell;row++)tile.copy(raw,((20+y*cell+row)*w+20+x*cell)*3,row*cell*3,(row+1)*cell*3);}
  await sharp(raw,{raw:{width:w,height:h,channels:3}}).withMetadata({density:300}).png().toFile(path.toNamespacedPath(pngPath));
}
export class TypeScriptPatternGenerator implements PatternGenerator {
  private cancelled=new Set<string>();
  async cancel(jobId:string){this.cancelled.add(jobId);}
  async generateSingle(raw:GenerationSettings,onProgress?:ProgressHandler):Promise<GenerationResult>{const s=validateSettings(raw),start=performance.now();onProgress?.({jobId:s.jobId,completed:0,total:1,message:'Sampling image'});const source=await adjust(await loadPixels(s.inputPath),s);const [width,height]=gridSize(source.width,source.height,s.maxWidth,s.maxHeight);if(this.cancelled.has(s.jobId))throw Error('Cancelled');const grid=quantize(sample(source,width,height,s),width,height,s),counts:Record<string,number>={};for(const code of grid.flat())counts[code]=(counts[code]??0)+1;await mkdir(s.outputDir,{recursive:true});const pngPath=path.join(s.outputDir,`bead_pattern_${width}x${height}${s.label?'_'+s.label:''}_highres.png`);await render(grid,s,pngPath);const result={jobId:s.jobId,width,height,grid,counts,pngPath,settings:s,seconds:(performance.now()-start)/1000};onProgress?.({jobId:s.jobId,completed:1,total:1,message:'Finished',item:result});return result;}
  async generateBatch(s:BatchSettings,onProgress?:ProgressHandler):Promise<BatchResult>{const plan=planBatch(s),items:BatchResult['items']=[];this.cancelled.delete(s.base.jobId);for(const settings of plan){if(this.cancelled.has(s.base.jobId))break;const r=await this.generateSingle(settings);items.push({pngPath:r.pngPath,settings:r.settings,width:r.width,height:r.height});onProgress?.({jobId:s.base.jobId,completed:items.length,total:plan.length,message:`Generated ${items.length}/${plan.length}`,item:items.at(-1)});await new Promise(resolve=>setImmediate(resolve));}return {jobId:s.base.jobId,items,cancelled:this.cancelled.has(s.base.jobId)};}
}
