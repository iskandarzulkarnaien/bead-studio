const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const {spawn} = require('node:child_process');
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict'), sharp = require('sharp');
async function main() {
 const server = spawn(process.execPath, ['scripts/serve-web.cjs','site-dist','4188','/beads/'], {stdio:['ignore','pipe','pipe'],windowsHide:true});
 let browser;
 try {
  await new Promise((resolve,reject) => {server.stdout.once('data',resolve);server.once('error',reject);});
  browser = await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXE || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const page = await browser.newPage({viewport:{width:1360,height:960},acceptDownloads:true});
  const errors=[], requests=[]; page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
  await page.addInitScript(() => {window.testPatterns=[]; const Original=window.Worker; window.Worker=class extends Original {constructor(...args){super(...args);this.addEventListener('message',({data})=>{if(data.type==='style')window.testPatterns.push({...data.item,indices:Array.from(data.item.indices)});});}};});
  await page.goto('http://127.0.0.1:4188/beads/');
  await page.getByLabel('Source image',{exact:true}).setInputFiles(path.resolve('Art Deco Death Tarot Card.png'));
  await page.getByRole('status').filter({hasText:'Image ready'}).waitFor();
  await page.getByRole('button',{name:'Batch',exact:true}).click();
  await page.getByRole('button',{name:'Generate batch',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Finished: 96 styles.'}).waitFor({timeout:120000});
  const patterns=await page.evaluate(()=>window.testPatterns), palette=JSON.parse(await fs.readFile('src/palette.json','utf8'));
  const electron=JSON.parse(await fs.readFile('generated/web-benchmark/electron-grids.json','utf8'));
  assert.equal(patterns.length,96);
  for(let i=0;i<96;i++){const p=patterns[i];assert.deepEqual(p.indices.map(index=>palette[index].code),electron[i].grid.flat(),`Style ${i+1} differs`);}
  assert.equal(await page.locator('.gallery button').count(),12);
  // Exercise browser decoding as well as computation against the original fixtures.
  const manifest=JSON.parse(await fs.readFile('fixtures/regression/manifest.json','utf8'));
  for(const file of manifest) {
   const fixture=JSON.parse(await fs.readFile(`fixtures/regression/${file}`,'utf8'));
   const bytes=Array.from(await fs.readFile(`fixtures/regression/${fixture.image}`));
   const settings={...patterns[0].settings,...fixture.settings,maxWidth:fixture.settings.max_width,maxHeight:fixture.settings.max_height};
   const actual=await page.evaluate(({bytes,settings})=>new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('generation-worker.js',document.baseURI),{type:'module'});
    const timer=setTimeout(()=>{worker.terminate();reject(Error('Fixture worker timed out'));},30000);
    worker.onmessage=({data})=>{if(data.type==='style'){clearTimeout(timer);worker.terminate();resolve(Array.from(data.item.indices));}else if(data.type==='error'){clearTimeout(timer);worker.terminate();reject(Error(data.error.message));}};
    worker.postMessage({type:'generate',jobId:'fixture',file:new Blob([new Uint8Array(bytes)]),settings});
   }),{bytes,settings});
   const expected=fixture.grid.flat();let differences=0;actual.forEach((index,i)=>{if(palette[index].code!==expected[i])differences++;});
   assert.equal(actual.length,expected.length);assert.ok(differences/expected.length<=.1,`Decoder regression ${file}: ${differences} cells`);
  }
  await page.getByRole('button',{name:'Select style 5',exact:true}).click();
  await fs.mkdir('generated/static-validation',{recursive:true});
  for(const cell of [40,32]) for(const labeled of [true,false]) {
   await page.getByLabel('Final PNG size').selectOption(String(cell));
   await page.getByRole('button',{name:`Prepare ${labeled?'labeled':'unlabeled'} PNG`,exact:true}).click();
   const link=page.getByRole('button',{name:/Download PNG/});await link.waitFor({timeout:60000});
   const pending=page.waitForEvent('download');await link.click();const download=await pending;
   const file=`generated/static-validation/tarot-${labeled?'labeled':'unlabeled'}-${cell}px.png`;await download.saveAs(file);
   const previous=`generated/web-benchmark/browser/tarot-${labeled?'labeled':'unlabeled'}-${cell}px.png`;
   const actual=await sharp(file).raw().toBuffer(), reference=await sharp(previous).raw().toBuffer();
   assert.ok(actual.equals(reference),`PNG pixel mismatch: ${file}`);
  }
  await page.getByRole('button',{name:'Next',exact:true}).click();await page.getByRole('button',{name:'Select style 13',exact:true}).click();
  await page.getByRole('button',{name:/Download PNG/}).waitFor({state:'detached'});
  await page.getByRole('button',{name:'Enlarge selected pattern'}).click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');
  await page.getByLabel('Preset',{exact:true}).selectOption('Texture Sweep');
  await page.getByLabel('Gamma max',{exact:true}).fill('1.1');
  await page.getByRole('button',{name:'Generate batch',exact:true}).click();await page.getByRole('button',{name:'Continue large batch'}).waitFor();
  await page.getByRole('button',{name:'Back to settings'}).click();
  await page.getByLabel('Gamma max',{exact:true}).fill('1.7');
  await page.locator('.error').filter({hasText:'64 MiB budget'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Generate batch',exact:true}).isDisabled(),true);
  await page.getByLabel('Preset',{exact:true}).selectOption('Quick Baseline');
  await page.getByRole('button',{name:'Generate batch',exact:true}).click();await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Cancelled.'}).waitFor();
  await page.getByLabel('Source image',{exact:true}).setInputFiles({name:'bad.png',mimeType:'image/png',buffer:Buffer.from('bad image')});await page.getByRole('alert').waitFor();
  // PNG header rejection occurs before decompression/allocation, even for a truncated oversized PNG.
  const header=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(header);header.writeUInt32BE(5000,16);header.writeUInt32BE(5000,20);
  await page.getByLabel('Source image',{exact:true}).setInputFiles({name:'large.png',mimeType:'image/png',buffer:header});await page.getByRole('alert').filter({hasText:'16-megapixel limit'}).waitFor();
  await page.getByLabel('Source image',{exact:true}).setInputFiles(path.resolve('Art Deco Death Tarot Card.png'));await page.getByRole('status').filter({hasText:'Image ready'}).waitFor();
  await page.getByText('Import a saved style',{exact:true}).click();
  await page.getByLabel('Generated filename or style label').fill('sa-average__re-box__pr-0p0__sh-0p0__ga-1p0__co-1p0__sa-1p0__di-lab__di-none__di-100p0');
  await page.getByRole('button',{name:'Apply style',exact:true}).click();
  await page.getByRole('button',{name:'Generate pattern',exact:true}).click();await page.getByRole('status').filter({hasText:'Finished: 1 style.'}).waitFor({timeout:60000});
  for(const width of [390,768,1360]) {await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Overflow at ${width}`);await page.screenshot({path:`generated/static-validation/layout-${width}.png`,fullPage:true});}
  assert.deepEqual(errors,[]);assert.ok(requests.every(url=>url.startsWith('http://127.0.0.1:4188/')));
  const report={browser:await browser.version(),exactElectronGrids:96,exactPrototypePngPixels:4,browserRegressionFixtures:manifest.length,checks:['pagination','export invalidation','enlarged preview','large-batch warning','budget rejection','cancellation','invalid source','16 MP rejection','style import','single generation','390/768/1360 layout','subpath hosting','local requests only'],physicalPhoneTested:false};
  await fs.writeFile('validation/browser-app.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 } finally {await browser?.close();server.kill();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
