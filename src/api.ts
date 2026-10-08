import type {GenerationSettings,BatchSettings,ProgressEvent,GenerationError} from './contract';
export type JobKind='single'|'batch'|'finals';
export interface JobRequest {kind:JobKind;settings:GenerationSettings|BatchSettings}
export interface JobEvent {type:'progress'|'result'|'error'|'cancelled';event?:ProgressEvent;result?:unknown;error?:GenerationError;jobId?:string}
export interface DesktopAPI {
  chooseImage():Promise<{path:string;name:string;preview:string}|null>;
  dropImage(file:File):Promise<{path:string;name:string;preview:string}>;
  start(request:JobRequest):Promise<{jobId:string;outputDir:string}>;
  cancel(jobId:string):Promise<void>;
  preview(path:string):Promise<string>;
  openPath(path:string):Promise<void>;
  onEvent(callback:(event:JobEvent)=>void):()=>void;
}
declare global {interface Window {beads:DesktopAPI}}
