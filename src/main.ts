import {app,BrowserWindow,dialog,ipcMain,shell} from 'electron';
import {Worker} from 'node:worker_threads';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {mkdir,realpath,stat} from 'node:fs/promises';
import sharp from 'sharp';
import {loadPixels} from './image';
import {planBatch,validateSettings,type GenerationSettings,type BatchSettings} from './contract';
import type {JobRequest,JobEvent} from './api';
let window:BrowserWindow;
const inputPaths=new Set<string>(),outputPaths=new Set<string>(),folders=new Set<string>();
const jobs=new Map<string,Worker>();
const page=pathToFileURL(path.join(__dirname,'index.html')).href;
function emit(event:JobEvent){if(!window.isDestroyed())window.webContents.send('job-event',event);}
async function imagePreview(file:string){let image;if(path.extname(file).toLowerCase()==='.bmp'){const p=await loadPixels(file);image=sharp(p.data,{raw:{width:p.width,height:p.height,channels:3}});}else image=sharp(path.toNamespacedPath(file),{limitInputPixels:140_000_000});return 'data:image/png;base64,'+(await image.resize({width:1100,height:1100,fit:'inside',withoutEnlargement:true}).png().toBuffer()).toString('base64');}
async function acceptImage(file:unknown){if(typeof file!=='string'||!path.isAbsolute(file))throw Error('Choose an image file');const resolved=await realpath(file);if(!/\.(png|jpe?g|webp|bmp|tiff?|gif|avif)$/i.test(resolved))throw Error('Supported files: PNG, JPEG, WebP, BMP, TIFF, GIF, AVIF');const info=await stat(resolved);if(!info.isFile()||info.size>150_000_000)throw Error('Image file exceeds 150 MB');const preview=await imagePreview(resolved);inputPaths.add(resolved);return {path:resolved,name:path.basename(resolved),preview};}
function register(name:string,handler:(...args:any[])=>unknown){ipcMain.handle(name,async(event,...args)=>{try{if(event.sender!==window.webContents||event.senderFrame?.url!==page)throw Error('Unauthorized caller');return {ok:true,value:await handler(...args)};}catch(e){return {ok:false,error:e instanceof Error?e.message:String(e)};}});}
app.whenReady().then(()=>{
  const offscreen=!app.isPackaged&&process.env.BEAD_TEST_OFFSCREEN==='1';
  window=new BrowserWindow({width:1240,height:900,minWidth:850,minHeight:650,show:!offscreen,backgroundColor:'#f4f5f7',title:'MARD · Bead Pattern Studio',webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true,offscreen}});
  window.removeMenu();window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',e=>e.preventDefault());window.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  register('choose-image',async()=>{const result=await dialog.showOpenDialog(window,{properties:['openFile'],filters:[{name:'Images',extensions:['png','jpg','jpeg','webp','bmp','tif','tiff','gif','avif']}]});return result.canceled?null:acceptImage(result.filePaths[0]);});
  register('drop-image',acceptImage);
  register('preview',async(file:unknown)=>{if(typeof file!=='string'||(!outputPaths.has(file)&&!inputPaths.has(file)))throw Error('Image is not part of this session');return imagePreview(file);});
  register('open-path',async(file:unknown)=>{if(typeof file!=='string'||(!outputPaths.has(file)&&!folders.has(file)))throw Error('Path is not part of this session');const error=await shell.openPath(file);if(error)throw Error(error);});
  register('start',async(raw:JobRequest)=>{
    if(jobs.size)throw Error('A job is already running');if(!raw||!['single','batch','finals'].includes(raw.kind))throw Error('Invalid job type');
    let s=validateSettings(raw.kind==='batch'?(raw.settings as BatchSettings).base:raw.settings);
    if(!inputPaths.has(s.inputPath))throw Error('Open or drop the source image first');
    const outputRoot=!app.isPackaged&&process.env.BEAD_TEST_OUTPUT?path.resolve(process.env.BEAD_TEST_OUTPUT):path.join(app.getPath('documents'),'BeadPatternGenerator');
    const outputDir=path.join(outputRoot,`${raw.kind}_${new Date().toISOString().replace(/[:.]/g,'-')}_${s.jobId.slice(-6)}`);await mkdir(outputDir,{recursive:true});folders.add(outputDir);s={...s,outputDir};
    const settings=raw.kind==='batch'?{base:s,ranges:(raw.settings as BatchSettings).ranges}:s;if(raw.kind==='batch')planBatch(settings as BatchSettings);
    const worker=new Worker(path.join(__dirname,'worker.js'),{workerData:{kind:raw.kind,settings}});jobs.set(s.jobId,worker);
    worker.on('message',message=>{if(message.type==='progress'){const item=message.event.item;if(item){outputPaths.add(item.pngPath);}emit(message);}else{jobs.delete(s.jobId);emit({...message,jobId:s.jobId});void worker.terminate();}});
    worker.on('error',e=>{jobs.delete(s.jobId);emit({type:'error',jobId:s.jobId,error:{code:'WORKER_FAILED',message:e.message}});});
    worker.on('exit',code=>{if(jobs.has(s.jobId)){jobs.delete(s.jobId);emit({type:'error',jobId:s.jobId,error:{code:'WORKER_EXIT',message:`Generation worker exited unexpectedly (${code})`}});}});
    return {jobId:s.jobId,outputDir};
  });
  register('cancel',async(id:unknown)=>{if(typeof id!=='string')throw Error('Invalid job ID');const worker=jobs.get(id);if(worker){jobs.delete(id);await worker.terminate();emit({type:'cancelled',jobId:id});}});
  void window.loadFile(path.join(__dirname,'index.html'));
});
app.on('window-all-closed',()=>{for(const worker of jobs.values())void worker.terminate();app.quit();});
