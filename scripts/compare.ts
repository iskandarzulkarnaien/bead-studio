import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {defaults,type GenerationSettings} from '../src/contract';
import {loadPixels,adjust,sample,gridSize} from '../src/image';
import {palette,quantize,lab} from '../src/color';

async function main(){
const dir=path.resolve('reference-output/comparison');await fs.mkdir(dir,{recursive:true});
const manifest=JSON.parse(await fs.readFile('fixtures/quick-baseline/manifest.json','utf8'));
const source=await loadPixels(path.resolve(manifest.source));
const results=[];
const paletteMap=Object.fromEntries(palette.map(p=>[p.code,p.rgb]));
for(const entry of manifest.styles){
  const ref=JSON.parse(await fs.readFile(path.join('fixtures/quick-baseline',entry.fixture),'utf8'));
  const s:GenerationSettings={...defaults,...ref.settings,jobId:'compare',inputPath:manifest.source,outputDir:dir,cellSize:20};
  const start=performance.now(),[w,h]=gridSize(source.width,source.height,104,104);
  const grid=quantize(sample(await adjust(source,s),w,h,s),w,h,s);
  if(w!==ref.width||h!==ref.height)throw Error(`Grid dimensions differ for ${entry.fixture}`);
  let changed=0,delta=0;const substitutions:Record<string,number>={};const heat=Buffer.alloc(w*h*3),left=Buffer.alloc(w*h*3),right=Buffer.alloc(w*h*3);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const a=ref.grid[y][x],b=grid[y][x],i=(y*w+x)*3;left.set(paletteMap[a],i);right.set(paletteMap[b],i);if(a!==b){changed++;const key=`${a} → ${b}`;substitutions[key]=(substitutions[key]??0)+1;heat.set([255,80,100],i);}else heat.set([28,36,46],i);const l=lab(paletteMap[a]),r=lab(paletteMap[b]);delta+=Math.hypot(...l.map((v,c)=>v-r[c]));}
  const id=entry.fixture.replace('.json','');
  for(const [name,data] of [['python',left],['typescript',right],['difference',heat]] as const)await sharp(data,{raw:{width:w,height:h,channels:3}}).resize(w*5,h*5,{kernel:'nearest'}).png().toFile(path.join(dir,`${id}-${name}.png`));
  const counts:Record<string,number>={};for(const code of grid.flat())counts[code]=(counts[code]??0)+1;
  let edgeError=0,edges=0,smoothedError=0;
  const light=(b:Buffer,i:number)=>b[i]*.2126+b[i+1]*.7152+b[i+2]*.0722;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*3;for(const [dx,dy] of [[1,0],[0,1]]){if(x+dx>=w||y+dy>=h)continue;const j=((y+dy)*w+x+dx)*3;edgeError+=Math.abs((light(left,i)-light(left,j))-(light(right,i)-light(right,j)));edges++;}for(let c=0;c<3;c++){let diff=0,n=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(x+dx<0||x+dx>=w||y+dy<0||y+dy>=h)continue;const j=((y+dy)*w+x+dx)*3+c;diff+=left[j]-right[j];n++;}smoothedError+=Math.abs(diff/n);}}
  const record={id,settings:ref.settings,width:w,height:h,changed,percentage:changed/(w*h)*100,meanDeltaE:delta/(w*h),edgeLuminanceError:edgeError/edges,smoothedRgbError:smoothedError/(w*h*3),pythonCounts:ref.counts,typescriptCounts:counts,comparisonSeconds:(performance.now()-start)/1000,pythonGenerationSeconds:ref.seconds,substitutions:Object.entries(substitutions).sort((a,b)=>b[1]-a[1]).slice(0,10)};
  results.push(record);console.log(`${id} ${s.sampling}/${s.resize_filter}/${s.distance}/${s.dither}: ${record.percentage.toFixed(2)}%`);
}
await fs.writeFile(path.join(dir,'report.json'),JSON.stringify(results,null,2));
const over=results.filter(r=>r.percentage>10);
await fs.writeFile(path.join(dir,'index.html'),`<!doctype html><meta charset="utf-8"><title>Python / TypeScript comparison</title><style>body{background:#111820;color:#e5edf4;font:15px system-ui;padding:30px}article{padding:24px 0;border-bottom:1px solid #405064}.row{display:flex;gap:20px}figure{margin:0;flex:1}img{max-width:100%;image-rendering:pixelated}summary{cursor:pointer}code{color:#99d7ca}.bad{color:#ff8395}</style><h1>Quick Baseline comparison</h1><p>96 styles. ${over.length} exceed the 10% cell-change review threshold. Mean ΔE76 is a supplementary color-distance signal, not a visual acceptance test.</p>${results.map(r=>`<article><details><summary class="${r.percentage>10?'bad':''}">${r.id} · ${r.settings.sampling} / ${r.settings.resize_filter} / ${r.settings.distance} / ${r.settings.dither} · ${r.percentage.toFixed(2)}% cells changed · mean ΔE ${r.meanDeltaE.toFixed(3)}</summary><div class="row">${['python','typescript','difference'].map(k=>`<figure><figcaption>${k}</figcaption><img loading="lazy" src="${r.id}-${k}.png"></figure>`).join('')}</div><p>Most common substitutions: ${r.substitutions.map(([k,v])=>`${k}: ${v}`).join(', ')||'none'}</p></details></article>`).join('')}`);
console.log(JSON.stringify({styles:results.length,overThreshold:over.length,worst:Math.max(...results.map(r=>r.percentage)),exact:results.filter(r=>r.changed===0).length}));
if(over.length)process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
