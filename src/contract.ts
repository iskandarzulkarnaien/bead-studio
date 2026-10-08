export const samplings = ['average','center','median','resize'] as const;
export const filters = ['nearest','box','bilinear','bicubic','lanczos'] as const;
export const distances = ['rgb','lab','weighted-lab'] as const;
export const dithers = ['none','floyd-steinberg','atkinson','ordered'] as const;
export const numericKeys = ['pre_blur','sharpen','gamma','contrast','saturation','dither_strength'] as const;
export interface GenerationSettings {
  jobId:string; inputPath:string; outputDir:string; maxWidth:number; maxHeight:number; cellSize:number;
  sampling:typeof samplings[number]; resize_filter:typeof filters[number]; distance:typeof distances[number];
  dither:typeof dithers[number]; pre_blur:number; sharpen:number; gamma:number; contrast:number; saturation:number; dither_strength:number;
  series:string; gridDisplay:'none'|'subtle'|'white'|'adaptive'; labels:boolean; label?:string;
}
export type NumericKey = typeof numericKeys[number];
export type Ranges = Record<NumericKey,{min:number;max:number;step:number}>;
export interface BatchSettings {base:GenerationSettings;ranges:Ranges}
export interface GenerationResult {jobId:string;width:number;height:number;grid:string[][];counts:Record<string,number>;pngPath:string;settings:GenerationSettings;seconds:number}
export interface GalleryItem {pngPath:string;settings:GenerationSettings;width:number;height:number}
export interface BatchResult {jobId:string;items:GalleryItem[];cancelled:boolean}
export interface ProgressEvent {jobId:string;completed:number;total:number;message:string;item?:GalleryItem}
export interface GenerationError {code:string;message:string;detail?:string}
export type ProgressHandler = (event:ProgressEvent)=>void;
export interface PatternGenerator {
  generateSingle(settings:GenerationSettings,onProgress?:ProgressHandler):Promise<GenerationResult>;
  generateBatch(settings:BatchSettings,onProgress?:ProgressHandler):Promise<BatchResult>;
  cancel(jobId:string):Promise<void>;
}
export const defaults:GenerationSettings={jobId:'',inputPath:'',outputDir:'',maxWidth:104,maxHeight:104,cellSize:100,sampling:'average',resize_filter:'box',distance:'lab',dither:'none',pre_blur:0,sharpen:0,gamma:1,contrast:1,saturation:1,dither_strength:100,series:'ABCDEFGHM',gridDisplay:'none',labels:false};
export const bounds:Record<NumericKey,[number,number]>={pre_blur:[0,10],sharpen:[0,3],gamma:[.5,2],contrast:[.5,2],saturation:[0,2],dither_strength:[0,100]};
export function validateSettings(raw:unknown):GenerationSettings {
  if(!raw || typeof raw!=='object') throw Error('Settings must be an object.');
  const s=raw as GenerationSettings;
  for(const key of ['jobId','inputPath','outputDir','series'] as const) if(typeof s[key]!=='string') throw Error(`Invalid ${key}`);
  if(!/^[A-Za-z0-9_-]{1,80}$/.test(s.jobId)) throw Error('Invalid job identifier');
  for(const key of ['maxWidth','maxHeight','cellSize'] as const) if(!Number.isInteger(s[key])||s[key]<1||s[key]>(key==='cellSize'?160:200)) throw Error(`Invalid ${key}`);
  for(const key of numericKeys) if(!Number.isFinite(s[key])||s[key]<bounds[key][0]||s[key]>bounds[key][1]) throw Error(`Invalid ${key}`);
  if(!samplings.includes(s.sampling)||!filters.includes(s.resize_filter)||!distances.includes(s.distance)||!dithers.includes(s.dither)) throw Error('Unknown generation mode');
  if(!/^[ABCDEFGHM]+$/.test(s.series)||!['none','subtle','white','adaptive'].includes(s.gridDisplay)||typeof s.labels!=='boolean') throw Error('Invalid palette or rendering settings');
  if(s.label!==undefined && (typeof s.label!=='string'||s.label.length>240||!/^[\w-]*$/.test(s.label))) throw Error('Invalid style label');
  if(s.maxWidth*s.maxHeight*s.cellSize*s.cellSize>140_000_000) throw Error('Output is too large. Reduce cell size or grid dimensions.');
  return {...s};
}
const styleKeys=['sampling','resize_filter','pre_blur','sharpen','gamma','contrast','saturation','distance','dither','dither_strength'] as const;
export function styleLabel(s:GenerationSettings):string {return styleKeys.map(k=>`${k.slice(0,2)}-${typeof s[k]==='number'?(Number.isInteger(s[k])?s[k].toFixed(1):String(s[k])).replaceAll('.','p'):s[k]}`).join('__');}
export function parseStyle(name:string):Partial<GenerationSettings> {
  const clean=name.trim().split(/[\\/]/).pop()!.replace(/\.png$/i,'').replace(/_highres$/,'');
  const match=clean.match(/^(?:bead_pattern_)?\d+x\d+_(.*)$/);
  if(!match) throw Error('Expected a batch-generated style filename.');
  const tokens=match[1].split('__');
  if(tokens.length!==styleKeys.length) throw Error('Expected all ten style settings.');
  const s:Record<string,unknown>={};
  styleKeys.forEach((k,i)=>{const prefix=k.slice(0,2)+'-';if(!tokens[i].startsWith(prefix))throw Error('Style setting order is invalid');const v=tokens[i].slice(prefix.length);s[k]=(numericKeys as readonly string[]).includes(k)?Number(v.replaceAll('p','.')):v;});
  validateSettings({...defaults,...s,jobId:'import'});
  return s;
}
export function planBatch({base,ranges}:BatchSettings):GenerationSettings[] {
  validateSettings(base);
  const values={} as Record<NumericKey,number[]>;
  for(const k of numericKeys){const r=ranges?.[k];if(!r||![r.min,r.max,r.step].every(Number.isFinite)||r.step<=0||r.max<r.min||r.min<bounds[k][0]||r.max>bounds[k][1])throw Error(`Invalid range: ${k}`);const n=Math.floor((r.max-r.min)/r.step+1e-8)+1;if(n>10000)throw Error('Range is too large');values[k]=Array.from({length:n},(_,i)=>Number((r.min+i*r.step).toFixed(8)));}
  const plan:GenerationSettings[]=[];
  function add(s:GenerationSettings,i:number){if(i===numericKeys.length){plan.push({...s,label:styleLabel(s)});if(plan.length>100000)throw Error('Batch exceeds 100,000 styles. Narrow the ranges.');return;}const k=numericKeys[i];for(const v of k==='dither_strength'&&s.dither==='none'?[100]:values[k])add({...s,[k]:v},i+1);}
  for(const sampling of samplings)for(const resize_filter of sampling==='resize'?filters:['box'] as const)for(const distance of distances)for(const dither of dithers)add({...base,sampling,resize_filter,distance,dither,labels:false,gridDisplay:'none'},0);
  return plan;
}
export const presetValues:Record<string,number[][]>={
  'Quick Baseline':[[0],[0],[1],[1],[1],[100]],'Soft / Atmospheric':[[.5],[0],[1],[.9],[.85],[75]],
  'Crisp / Graphic':[[0],[1],[1],[1.1],[1.05],[100]],'Muted Vintage':[[.5],[0],[.95],[.9],[.75],[50]],
  'Gamma Sweep':[[0],[0],[.9,1.1,.1],[1],[1],[100]],'Texture Sweep':[[0,1,.5],[0,1,.5],[1],[1],[1],[100]]};
export function preset(name:string):Ranges {const v=presetValues[name];if(!v)throw Error('Unknown preset');return Object.fromEntries(numericKeys.map((k,i)=>[k,{min:v[i][0],max:v[i][1]??v[i][0],step:v[i][2]??(k==='dither_strength'?25:.1)}])) as Ranges;}
