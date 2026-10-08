import {contextBridge,ipcRenderer,webUtils} from 'electron';
import type {DesktopAPI,JobEvent} from './api';
async function call(name:string,...args:unknown[]){const r=await ipcRenderer.invoke(name,...args);if(!r.ok)throw Error(r.error);return r.value;}
const api:DesktopAPI={chooseImage:()=>call('choose-image'),dropImage:file=>call('drop-image',webUtils.getPathForFile(file)),start:request=>call('start',request),cancel:id=>call('cancel',id),preview:path=>call('preview',path),openPath:path=>call('open-path',path),onEvent:callback=>{const listener=(_event:unknown,event:JobEvent)=>callback(event);ipcRenderer.on('job-event',listener);return ()=>ipcRenderer.removeListener('job-event',listener);}};
contextBridge.exposeInMainWorld('beads',api);
