const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {spawn}=require('node:child_process');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const sharp=require('sharp');
async function main(){const server=spawn(process.execPath,['scripts/serve-web.cjs','web-dist','4187','/beads/'],{stdio:['ignore','pipe','pipe'],windowsHide:true});let browser;try{
 await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',c=>reject(Error('server exited '+c)));});
 browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXE||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const page=await browser.newPage({viewport:{width:1200,height:900},acceptDownloads:true});const requests=[];const errors=[];
 page.on('request',r=>requests.push({url:r.url(),method:r.method()}));page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4187/beads/');await page.locator('#file').setInputFiles(path.resolve('Art Deco Death Tarot Card.png'));
 const started=performance.now();await page.locator('#batch').click();await page.waitForFunction(()=>document.getElementById('status').textContent==='Finished: 96 styles',null,{timeout:120000});
 const seconds=(performance.now()-started)/1000;const snapshot=await page.evaluate(()=>window.prototypeResults);assert.equal(snapshot.error,'');assert.equal(snapshot.items.length,96);
 let exactPython=0,exactElectron=0,worstPython=0;const rows=[];const comparison=JSON.parse(await fs.readFile('validation/quick-baseline-report.json','utf8'));
 // Reuse the desktop generator in this test to establish exact browser/Electron grids from the same image.
 const electronResults=JSON.parse(await fs.readFile('generated/web-benchmark/electron-grids.json','utf8'));
 for(let i=0;i<96;i++){const ref=JSON.parse(await fs.readFile(`fixtures/quick-baseline/${String(i+1).padStart(3,'0')}.json`,'utf8')),got=snapshot.items[i];assert.equal(got.width,ref.width);assert.equal(got.height,ref.height);let pyDiff=0,desktopDiff=0;for(let y=0;y<ref.height;y++)for(let x=0;x<ref.width;x++){if(got.grid[y][x]!==ref.grid[y][x])pyDiff++;if(got.grid[y][x]!==electronResults[i].grid[y][x])desktopDiff++;}if(!pyDiff)exactPython++;if(!desktopDiff)exactElectron++;worstPython=Math.max(worstPython,pyDiff/(ref.width*ref.height)*100);rows.push({style:i+1,pythonDifferentCells:pyDiff,electronDifferentCells:desktopDiff});assert.equal(desktopDiff,0,`Browser/Electron mismatch at style ${i+1}`);assert.ok(pyDiff/(ref.width*ref.height)<=.1);}
 await page.waitForFunction(()=>document.querySelectorAll('#gallery button').length===12);await page.locator('#gallery button').nth(4).click();
 const sizes=[];await fs.mkdir('generated/web-benchmark/browser',{recursive:true});
 for(const cell of [40,32])for(const labeled of [true,false]){await page.locator('#final-size').selectOption(String(cell));await page.locator(labeled?'#export-labeled':'#export-unlabeled').click();await page.waitForFunction(()=>document.getElementById('status').textContent.startsWith('PNG ready'),null,{timeout:60000});const downloadEvent=page.waitForEvent('download');await page.locator('#download').click();const download=await downloadEvent,file=`generated/web-benchmark/browser/tarot-${labeled?'labeled':'unlabeled'}-${cell}px.png`;await download.saveAs(file);const meta=await sharp(file).metadata();assert.equal(meta.width,69*cell+40);assert.equal(meta.height,104*cell+40);sizes.push({file,width:meta.width,height:meta.height,bytes:(await fs.stat(file)).size});}
 await page.locator('#next').click();assert.match(await page.locator('#page').innerText(),/^Page 2/);await page.locator('#gallery button').first().click();assert.equal(await page.locator('#download').isVisible(),false,'A new selection must release the previous export');
 await page.locator('#batch').click();await page.locator('#cancel').click();await page.waitForFunction(()=>document.getElementById('status').textContent.startsWith('Cancelled.'));
 await page.locator('#file').setInputFiles({name:'bad.png',mimeType:'image/png',buffer:Buffer.from('not an image')});await page.locator('#single').click();await page.waitForFunction(()=>document.getElementById('error').textContent.length>0);
 // Drop a real File to exercise the portable browser drag/drop path.
 const bytes=Array.from(await fs.readFile('Art Deco Death Tarot Card.png'));await page.evaluate(bytes=>{const dt=new DataTransfer();dt.items.add(new File([new Uint8Array(bytes)],'Tarot-drop.png',{type:'image/png'}));document.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}));},bytes);assert.equal(await page.locator('#filename').textContent(),'Tarot-drop.png');
 await page.locator('#single').click();await page.waitForFunction(()=>document.getElementById('status').textContent==='Finished: 1 styles',null,{timeout:60000});
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'generated/web-benchmark/browser/mobile-layout.png',fullPage:true});
 await page.setViewportSize({width:1200,height:900});await page.screenshot({path:'generated/web-benchmark/browser/desktop.png',fullPage:true});
 assert.equal(errors.length,0,errors.join('\n'));assert.ok(requests.every(r=>r.method==='GET'&&r.url.startsWith('http://127.0.0.1:4187/')),'Unexpected network request');
 const result={browser:await browser.version(),styles:96,exactElectron,exactPython,worstPython,seconds,sizes,networkRequests:requests,rows,note:'Desktop Chromium test. 390px viewport checks layout only, not actual iPhone/Safari memory limits. Pixel export buffers are generated one at a time.'};await fs.writeFile('generated/web-benchmark/browser/results.json',JSON.stringify(result,null,2));console.log(JSON.stringify({...result,rows:undefined,networkRequests:requests.length},null,2));
}finally{await browser?.close();server.kill();}}
main().catch(e=>{console.error(e);process.exitCode=1;});
