/// <reference lib="webworker" />
import {adjust,sample,gridSize,type Pixels} from '../image-core';
import {validateImageSize} from './limits';
import {palette,quantize} from '../color';
import {validateSettings,planBatch,preset,styleLabel} from '../contract';
import type {Request,Event,BrowserPattern} from './protocol';
const ctx=self as unknown as DedicatedWorkerGlobalScope;
const codeIndices=new Map(palette.map((p,i)=>[p.code,i]));
function send(event:Event,transfer:Transferable[]=[]){ctx.postMessage(event,transfer);}
async function makeExport(pattern:BrowserPattern,cell:number,labels:boolean){
 if(!Number.isInteger(cell)||cell<4||cell>40)throw Error('Prototype export supports 4–40 pixels per bead.');
 const width=pattern.width*cell+40,height=pattern.height*cell+40;
 if(width*height>20_000_000)throw Error('This prototype export is too large. Try a smaller cell size.');
 const canvas=new OffscreenCanvas(width,height),context=canvas.getContext('2d',{alpha:false});if(!context)throw Error('Worker canvas rendering is unavailable in this browser.');
 context.fillStyle='#f5f3ee';context.fillRect(0,0,width,height);
 context.font=`bold ${Math.floor(cell*.42)}px Arial, sans-serif`;context.textAlign='center';context.textBaseline='middle';
 for(let y=0;y<pattern.height;y++)for(let x=0;x<pattern.width;x++){
  const p=palette[pattern.indices[y*pattern.width+x]],left=20+x*cell,top=20+y*cell;
  context.fillStyle=p.hex;context.fillRect(left,top,cell,cell);
  if(labels){context.strokeStyle='#fff';context.lineWidth=2;context.strokeRect(left+1,top+1,cell-2,cell-2);context.fillStyle=p.rgb.reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0)/255>.58?'#111':'#fff';context.fillText(p.code,left+cell/2,top+cell/2);}
 }
 const blob=await canvas.convertToBlob({type:'image/png'});canvas.width=1;canvas.height=1;return blob;
}
ctx.onmessage=async({data}:{data:Request})=>{try{
 if(data.type==='export'){const blob=await makeExport(data.pattern,data.cellSize,data.labels);send({type:'export',jobId:data.jobId,blob,filename:`bead_pattern_${data.pattern.width}x${data.pattern.height}_${styleLabel(data.pattern.settings)}_${data.labels?'final_labeled':'final_unlabeled'}_highres.png`});return;}
 const base=validateSettings(data.settings),source:Pixels={data:data.pixels,width:data.width,height:data.height};
 validateImageSize(source.width,source.height); if(source.data.length!==source.width*source.height*3)throw Error('Invalid or oversized pixel buffer.');
 const plans=data.batch?planBatch({base,ranges:preset('Quick Baseline')}):[base];
 const [width,height]=gridSize(source.width,source.height,base.maxWidth,base.maxHeight);
 // Quick Baseline has identical adjustments for all styles: reuse the adjusted source.
 const adjusted=await adjust(source,base);let index=0;
 for(const settings of plans){const codes=quantize(sample(adjusted,width,height,settings),width,height,settings),indices=new Uint8Array(width*height),counts:Record<string,number>={};for(let y=0;y<height;y++)for(let x=0;x<width;x++){const code=codes[y][x];indices[y*width+x]=codeIndices.get(code)!;counts[code]=(counts[code]??0)+1;}const item:BrowserPattern={id:String(++index),width,height,indices,settings,counts};send({type:'style',jobId:data.jobId,item,completed:index,total:plans.length},[indices.buffer]);}
 send({type:'complete',jobId:data.jobId});
}catch(e){send({type:'error',jobId:data.jobId,message:e instanceof Error?e.message:String(e)});}};
