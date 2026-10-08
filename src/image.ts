import sharp from 'sharp';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import bmp from 'bmp-js';
import type {Pixels} from './image-core';
export * from './image-core';
export async function loadPixels(file:string):Promise<Pixels>{
  if(path.extname(file).toLowerCase()==='.bmp'){const buffer=await readFile(file);if(buffer.length<54||buffer.toString('ascii',0,2)!=='BM')throw Error('Invalid BMP image');const width=buffer.readInt32LE(18),height=Math.abs(buffer.readInt32LE(22));if(width<1||height<1||width*height>100_000_000)throw Error('Invalid or oversized BMP image');const decoded=bmp.decode(buffer),data=new Uint8Array(decoded.width*decoded.height*3);for(let i=0,j=0;i<decoded.data.length;i+=4,j+=3){data[j]=decoded.data[i+3];data[j+1]=decoded.data[i+2];data[j+2]=decoded.data[i+1];}return {data,width:decoded.width,height:decoded.height};}
  const {data,info}=await sharp(path.toNamespacedPath(path.resolve(file)),{limitInputPixels:100_000_000}).toColourspace('srgb').removeAlpha().raw().toBuffer({resolveWithObject:true});return {data,width:info.width,height:info.height};}
