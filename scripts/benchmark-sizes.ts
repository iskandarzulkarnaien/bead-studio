import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {render} from '../src/generator';
import {defaults} from '../src/contract';
async function main(){
 const out=path.resolve('generated/web-benchmark');await fs.mkdir(out,{recursive:true});
 const fixture=JSON.parse(await fs.readFile('fixtures/quick-baseline/005.json','utf8'));
 const rows=[];
 for(const cellSize of [4,6,8,12,20,32,40]){
  const labels=cellSize>=32,file=path.join(out,`tarot-${labels?'final':'preview'}-${cellSize}px.png`),start=performance.now();
  await render(fixture.grid,{...defaults,cellSize,labels,gridDisplay:labels?'white':'none'},file);
  const ms=performance.now()-start,metadata=await sharp(file).metadata(),bytes=(await fs.stat(file)).size;
  rows.push({name:`Tarot ${labels?'labeled final':'unlabeled preview'} ${cellSize}px`,cellSize,width:metadata.width!,height:metadata.height!,bytes,rgbaMiB:metadata.width!*metadata.height!*4/1048576,renderMs:ms,file:path.basename(file)});
  if(labels)await sharp(file).extract({left:20,top:20,width:cellSize*10,height:cellSize*6}).png().toFile(path.join(out,`tarot-labels-${cellSize}px-crop.png`));
 }
 for(const [name,file,cellSize] of [['PixDotDot accepted reference','judgment_full_221_pattern.png',40],['Current Tarot labeled final',(await fs.readdir('generated/tarot-finals')).find(f=>f.includes('final_labeled'))!,100]] as const){const p=name.startsWith('Current')?path.join('generated/tarot-finals',file):file;const meta=await sharp(p).metadata();rows.push({name,cellSize,width:meta.width!,height:meta.height!,bytes:(await fs.stat(p)).size,rgbaMiB:meta.width!*meta.height!*4/1048576,renderMs:null,file:path.relative(out,p).replaceAll('\\','/')});}
 await fs.writeFile(path.join(out,'sizes.json'),JSON.stringify(rows,null,2));
 const html=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PixDotDot output sizing</title><style>body{font:15px system-ui;background:#f3f5f4;color:#263b31;margin:24px auto;max-width:1150px;padding:0 20px}table{border-collapse:collapse;width:100%;background:white}th,td{text-align:left;padding:12px;border-bottom:1px solid #ddd}.previews{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:18px}figure{background:white;padding:16px;margin:0}img{max-width:100%;height:auto}.thumb{width:180px;height:auto}.crop{max-width:none}a{color:#176c50}section{margin:30px 0}</style><h1>PixDotDot output sizing</h1><p>The accepted Judgment reference uses 40px cells, a 69 × 103 grid and no outer margin. Tarot uses 69 × 104 beads with the existing 20px margin. Images depict different artwork; file compression is not directly comparable. Raw RGBA memory below covers one pixel buffer, not total application memory.</p><table><tr><th>Output</th><th>Dimensions</th><th>PNG size</th><th>RGBA memory</th></tr>${rows.map(r=>`<tr><td><a href="${r.file}">${r.name}</a></td><td>${r.width} × ${r.height}</td><td>${(r.bytes/1024).toFixed(1)} KiB</td><td>${r.rgbaMiB.toFixed(2)} MiB</td></tr>`).join('')}</table><section><h2>Previews at the same 180px display width</h2><p>These are newly rendered from the identical bead grid. Reducing preview pixels does not remove any beads. Open a PNG to inspect it at native resolution.</p><div class="previews">${rows.filter(r=>r.cellSize<=20).map(r=>`<figure><figcaption>${r.cellSize}px per bead</figcaption><a href="${r.file}"><img class="thumb" src="${r.file}"></a></figure>`).join('')}</div></section><section><h2>Label crops at native size</h2><p>The reference has measured glyph heights around 9px. Candidate files use our existing larger label proportions and white grid. Their PixDotDot imports still need testing.</p><div class="previews"><figure><figcaption>Accepted reference, 40px cells</figcaption><img src="judgment-crop.png"></figure>${[32,40].map(s=>`<figure><figcaption>Tarot candidate, ${s}px cells</figcaption><a href="tarot-final-${s}px.png"><img src="tarot-labels-${s}px-crop.png"></a></figure>`).join('')}</div></section>`;
 await fs.writeFile(path.join(out,'index.html'),html);console.log(JSON.stringify(rows,null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
