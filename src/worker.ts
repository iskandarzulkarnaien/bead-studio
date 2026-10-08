import {parentPort,workerData} from 'node:worker_threads';
import {TypeScriptPatternGenerator} from './generator';
import type {ProgressEvent} from './contract';
const generator=new TypeScriptPatternGenerator();
const progress=(event:ProgressEvent)=>parentPort?.postMessage({type:'progress',event});
async function run(){const {kind,settings}=workerData;
  if(kind==='batch')return generator.generateBatch(settings,progress);
  if(kind==='finals'){const items=[];for(const labels of [false,true])items.push(await generator.generateSingle({...settings,labels,gridDisplay:labels?'white':settings.gridDisplay,label:`${settings.label}_${labels?'final_labeled':'final_unlabeled'}`},progress));return items;}
  return generator.generateSingle(settings,progress);
}
run().then(result=>parentPort?.postMessage({type:'result',result})).catch(e=>parentPort?.postMessage({type:'error',error:{code:e.code??'GENERATION_FAILED',message:e.message,detail:e.stack}}));
