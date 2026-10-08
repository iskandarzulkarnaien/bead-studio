import fs from 'node:fs/promises';
import {defaults,planBatch,preset} from '../src/contract';
import {loadPixels,sample,gridSize,adjust} from '../src/image';
import {quantize} from '../src/color';
async function main(){const source=await loadPixels('Art Deco Death Tarot Card.png'),base={...defaults,jobId:'browser-reference'},[width,height]=gridSize(source.width,source.height,104,104),rows=[];for(const settings of planBatch({base,ranges:preset('Quick Baseline')})){const grid=quantize(sample(await adjust(source,settings),width,height,settings),width,height,settings);rows.push({settings,width,height,grid});}await fs.mkdir('generated/web-benchmark',{recursive:true});await fs.writeFile('generated/web-benchmark/electron-grids.json',JSON.stringify(rows));console.log('Captured 96 current Electron code grids for exact browser comparison.');}
main().catch(e=>{console.error(e);process.exitCode=1;});
