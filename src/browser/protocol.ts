import type {GenerationSettings} from '../contract';
export interface BrowserPattern {id:string;width:number;height:number;indices:Uint8Array;settings:GenerationSettings;counts:Record<string,number>}
export type Request = {type:'generate';jobId:string;pixels:Uint8Array;width:number;height:number;batch:boolean;settings:GenerationSettings} | {type:'export';jobId:string;pattern:BrowserPattern;cellSize:number;labels:boolean};
export type Event = {type:'style';jobId:string;item:BrowserPattern;completed:number;total:number} | {type:'complete';jobId:string} | {type:'export';jobId:string;blob:Blob;filename:string} | {type:'error';jobId:string;message:string};
