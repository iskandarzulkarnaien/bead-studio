import path from 'node:path';
import fs from 'node:fs/promises';
import {TypeScriptPatternGenerator} from '../src/generator';
import {defaults,preset,styleLabel} from '../src/contract';
async function main(){const g=new TypeScriptPatternGenerator();const base={...defaults,jobId:'delivery',inputPath:path.resolve('Art Deco Death Tarot Card.png'),outputDir:path.resolve('generated/typescript-quick-baseline'),cellSize:20};
const batch=await g.generateBatch({base,ranges:preset('Quick Baseline')},p=>{if(p.completed%12===0)console.log(p.message);});
const results=[];for(const labels of [false,true])results.push(await g.generateSingle({...base,outputDir:path.resolve('generated/tarot-finals'),cellSize:100,labels,gridDisplay:labels?'white':'none',label:`${styleLabel(base)}_${labels?'final_labeled':'final_unlabeled'}`}));
await fs.writeFile('generated/delivery.json',JSON.stringify({batchCount:batch.items.length,finals:results.map(r=>({file:r.pngPath,width:r.width,height:r.height,settings:r.settings}))},null,2));console.log('96-style TypeScript batch and corrected Tarot finals generated.');}
main().catch(e=>{console.error(e);process.exitCode=1;});
