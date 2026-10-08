// Set PLAYWRIGHT_MODULE to a Playwright installation when it is not installed locally.
const {_electron}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {listPackage}=require('@electron/asar');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs/promises');
(async()=>{let electron;try{
 const executable=path.resolve(process.argv[2]||'release/win-unpacked/BeadPatternGenerator.exe');
 const files=listPackage(path.join(path.dirname(executable),'resources/app.asar'));
 assert.ok(!files.some(f=>/\.py$|python_bridge|python-adapter|python3\d+\.dll|bead_pattern_app/i.test(f)),'Production archive must not contain Python');
 electron=await _electron.launch({executablePath:executable,args:['--disable-gpu','--user-data-dir='+path.resolve('generated/package-user-data')],timeout:30000});
 const page=await electron.firstWindow();await page.waitForFunction(()=>!!window.beads);
 assert.equal(await page.evaluate(()=>typeof require),'undefined');
 await electron.evaluate(({dialog},source)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[source]});},path.resolve('Art Deco Death Tarot Card.png'));
 await page.getByRole('button',{name:'Open image',exact:true}).click();
 await page.waitForFunction(()=>document.getElementById('source-name').textContent==='Art Deco Death Tarot Card.png');
 await page.locator('#cellSize').fill('20');await page.getByRole('button',{name:'Generate pattern',exact:true}).click();
 await page.waitForFunction(()=>document.getElementById('status').textContent==='Pattern generated.',null,{timeout:60000});
 await page.waitForFunction(()=>document.getElementById('single-preview').naturalWidth>0);
 await fs.mkdir('generated/smoke',{recursive:true});await page.screenshot({path:'generated/smoke/packaged.png'});
 console.log('Packaged application passed: launches, secure preload works, native decoder and worker generate Tarot preview, no Python files in application archive.');
}finally{if(electron)await electron.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
