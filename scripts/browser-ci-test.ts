import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import {loadPixels,adjust,sample,gridSize} from '../src/image';
import {palette,quantize} from '../src/color';
import {styleDefaults,preset,iterateBatch} from '../src/settings';

async function main() {
 const server=spawn(process.execPath,['scripts/serve-web.cjs','site-dist','4190','/bead-studio/'],{stdio:['ignore','pipe','pipe'],windowsHide:true});
 let browser;
 try {
  await new Promise<void>((resolve,reject)=>{server.stdout.once('data',()=>resolve());server.once('error',reject);server.once('exit',code=>reject(Error(`Server exited ${code}`)));});
  browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXE?{executablePath:process.env.BROWSER_EXE}:{})});
  const page=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true});
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{const captured: unknown[]=[];(window as any).testPatterns=captured; const NativeWorker=window.Worker; window.Worker=class extends NativeWorker {constructor(url: string | URL,options?: WorkerOptions){super(url,options);this.addEventListener('message',({data})=>{if(data.type==='style')captured.push({...data.item,indices:Array.from(data.item.indices)});});}};});
  await page.goto('http://127.0.0.1:4190/bead-studio/');
  await page.getByLabel('Source image',{exact:true}).setInputFiles('fixtures/regression/gradient.png');
  await page.getByRole('status').filter({hasText:'Image ready'}).waitFor();
  await page.getByLabel('Maximum width',{exact:true}).fill('16');await page.getByLabel('Maximum height',{exact:true}).fill('16');
  await page.getByRole('button',{name:'Batch',exact:true}).click();await page.getByRole('button',{name:'Generate batch',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Finished: 96 styles.'}).waitFor({timeout:60000});
  const actual=await page.evaluate(()=>(window as any).testPatterns);
  const source=await loadPixels('fixtures/regression/gradient.png'), base={...styleDefaults,maxWidth:16,maxHeight:16};
  const [width,height]=gridSize(source.width,source.height,16,16);let i=0;
  for(const style of iterateBatch(base,preset('Quick Baseline'))){const expected=quantize(sample(await adjust(source,style),width,height,style),width,height,style);assert.deepEqual(actual[i++].indices.map((index:number)=>palette[index].code),expected.flat());}
  assert.equal(actual.length,96);assert.equal(await page.locator('.gallery button').count(),12);
  for(const labeled of [true,false]) {
   await page.getByRole('button',{name:`Prepare ${labeled?'labeled':'unlabeled'} PNG`,exact:true}).click();
   const button=page.getByRole('button',{name:/Download PNG/});await button.waitFor();const pending=page.waitForEvent('download');await button.click();const download=await pending;
   const file=await download.path();assert.ok(file);const meta=await sharp(file!).metadata();assert.equal(meta.width,width*40+40);assert.equal(meta.height,height*40+40);
  }
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);
  await fs.mkdir('generated/ci',{recursive:true});await page.screenshot({path:'generated/ci/mobile.png',fullPage:true});
  console.log('PASS: 96 browser/native fixture grids, both PNG downloads, worker/font subpaths, mobile-width layout.');
 } finally {await browser?.close();server.kill();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
