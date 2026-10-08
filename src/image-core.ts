import type {StyleSettings as GenerationSettings} from './settings';
export interface Pixels {width:number;height:number;data:Uint8Array}
export const roundEven=(x:number)=>{const n=Math.floor(x),d=x-n;return d===.5?(n%2===0?n:n+1):Math.round(x);};
const clip=(v:number)=>Math.max(0,Math.min(255,v));
export function gridSize(w:number,h:number,mw:number,mh:number):[number,number]{const scale=Math.min(mw/w,mh/h);return [Math.max(1,Math.min(mw,roundEven(w*scale))),Math.max(1,Math.min(mh,roundEven(h*scale)))];}
const luma=(r:number,g:number,b:number)=>(r*19595+g*38470+b*7471+32768)>>16;
// Three separable extended-box passes, matching Pillow's Gaussian approximation.
function gaussian(src:Uint8Array,w:number,h:number,r:number){const f=Math.fround;r=f(r);const sigma=f(f(r*r)/3),length=f(Math.sqrt(12*sigma+1)),integer=Math.floor((length-1)/2);let a=f(f(2*integer+1)*f(f(integer*f(integer+1))-f(3*sigma)));a=f(a/f(6*f(sigma-f((integer+1)*(integer+1)))));const radius=f(integer+a),whole=Math.trunc(radius),weight=Math.trunc(f(16777216/f(f(radius*2)+1))),fringe=Math.floor((16777216-(whole*2+1)*weight)/2);let data=src;
  for(const vertical of [false,true])for(let pass=0;pass<3;pass++){const out=new Uint8Array(data.length),length=vertical?h:w,lines=vertical?w:h;const index=(line:number,pos:number,c:number)=>((vertical?Math.max(0,Math.min(length-1,pos))*w+line:line*w+Math.max(0,Math.min(length-1,pos)))*3+c);for(let line=0;line<lines;line++)for(let c=0;c<3;c++){let sum=0;for(let k=-whole;k<=whole;k++)sum+=data[index(line,k,c)];for(let pos=0;pos<length;pos++){const extra=data[index(line,pos-whole-1,c)]+data[index(line,pos+whole+1,c)];out[index(line,pos,c)]=Math.floor((sum*weight+extra*fringe+8388608)/16777216);sum+=data[index(line,pos+whole+1,c)]-data[index(line,pos-whole,c)];}}data=out;}return data;
}
export async function adjust(src:Pixels,s:GenerationSettings):Promise<Pixels>{
  let data=Uint8Array.from(src.data);const {width:w,height:h}=src;
  if(s.pre_blur){data=Uint8Array.from(gaussian(data,w,h,s.pre_blur));}
  if(s.sharpen){const old=data;data=Uint8Array.from(old);for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++)for(let c=0;c<3;c++){let v=old[(y*w+x)*3+c]*5;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(dx||dy)v+=old[((y+dy)*w+x+dx)*3+c];const sm=Math.floor((v+6)/13);data[(y*w+x)*3+c]=clip(Math.trunc(sm+(old[(y*w+x)*3+c]-sm)*(1+s.sharpen)));}}
  if(s.contrast!==1){let sum=0;for(let i=0;i<data.length;i+=3)sum+=luma(data[i],data[i+1],data[i+2]);const mean=Math.floor(sum/(w*h)+.5);data=data.map(v=>clip(Math.trunc(mean+(v-mean)*s.contrast)));}
  if(s.saturation!==1){for(let i=0;i<data.length;i+=3){const gray=luma(data[i],data[i+1],data[i+2]);for(let c=0;c<3;c++)data[i+c]=clip(Math.trunc(gray+(data[i+c]-gray)*s.saturation));}}
  if(s.gamma!==1){const lut=Array.from({length:256},(_,i)=>clip(roundEven(255*(i/255)**(1/s.gamma))));data=data.map(v=>lut[v]);}
  return {...src,data};
}
// Pillow-compatible separable resize: normalized 22-bit coefficients, uint8 rounding after each pass.
function kernel(name:string,x:number):number{x=Math.abs(x);switch(name){case 'box':return x<=.5?1:0;case 'bilinear':return x<1?1-x:0;case 'bicubic':return x<1?((1.5*x-2.5)*x)*x+1:x<2?((-.5*x+2.5)*x-4)*x+2:0;case 'lanczos':return x===0?1:x<3?(Math.sin(Math.PI*x)/(Math.PI*x))*(Math.sin(Math.PI*x/3)/(Math.PI*x/3)):0;default:return 0;}}
function weights(input:number,output:number,name:string){const scale=input/output,fs=Math.max(1,scale),support=({box:.5,bilinear:1,bicubic:2,lanczos:3} as Record<string,number>)[name]*fs;return Array.from({length:output},(_,i)=>{const center=(i+.5)*scale;const start=Math.max(0,Math.trunc(center-support+.5)),end=Math.min(input,Math.trunc(center+support+.5));const ws=Array.from({length:end-start},(_,j)=>kernel(name,(j+start-center+.5)/fs));const sum=ws.reduce((a,b)=>a+b,0);return {start,ws:ws.map(v=>Math.trunc(v/sum*4194304+(v<0?-.5:.5)))};});}
export function resize(src:Pixels,w:number,h:number,name:string):Float32Array{
  if(name==='nearest'){const out=new Float32Array(w*h*3),xs:number[]=[],ys:number[]=[];let pos=src.width/w*.5;for(let x=0;x<w;x++,pos+=src.width/w)xs.push(Math.min(src.width-1,Math.floor(pos)));pos=src.height/h*.5;for(let y=0;y<h;y++,pos+=src.height/h)ys.push(Math.min(src.height-1,Math.floor(pos)));for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let c=0;c<3;c++)out[(y*w+x)*3+c]=src.data[(ys[y]*src.width+xs[x])*3+c];return out;}
  let buf=src.data;
  if(w!==src.width){const wx=weights(src.width,w,name),tmp=new Uint8Array(w*src.height*3);for(let y=0;y<src.height;y++)for(let x=0;x<w;x++)for(let c=0;c<3;c++){let n=2097152;wx[x].ws.forEach((v,j)=>n+=src.data[(y*src.width+wx[x].start+j)*3+c]*v);tmp[(y*w+x)*3+c]=clip(Math.floor(n/4194304));}buf=tmp;}
  if(h===src.height)return Float32Array.from(buf);
  const wy=weights(src.height,h,name),out=new Float32Array(w*h*3);for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let c=0;c<3;c++){let n=2097152;wy[y].ws.forEach((v,j)=>n+=buf[((wy[y].start+j)*w+x)*3+c]*v);out[(y*w+x)*3+c]=clip(Math.floor(n/4194304));}return out;
}
export function sample(src:Pixels,w:number,h:number,s:GenerationSettings):Float32Array{
  if(s.sampling==='resize')return resize(src,w,h,s.resize_filter);
  const out=new Float32Array(w*h*3),xs=Array.from({length:w+1},(_,x)=>roundEven(x*src.width/w)),ys=Array.from({length:h+1},(_,y)=>roundEven(y*src.height/h));
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const x0=xs[x],x1=xs[x+1],y0=ys[y],y1=ys[y+1],n=(x1-x0)*(y1-y0);
    if(s.sampling==='center'){const px=(Math.floor((x0+x1-1)/2)+src.width)%src.width,py=(Math.floor((y0+y1-1)/2)+src.height)%src.height;for(let c=0;c<3;c++)out[(y*w+x)*3+c]=src.data[(py*src.width+px)*3+c];continue;}
    if(!n){for(let c=0;c<3;c++)out[(y*w+x)*3+c]=NaN;continue;}
    for(let c=0;c<3;c++){let sum=0;const vals:number[]=[];for(let yy=y0;yy<y1;yy++)for(let xx=x0;xx<x1;xx++){const v=src.data[(yy*src.width+xx)*3+c];if(s.sampling==='median')vals.push(v);else sum=Math.fround(sum+v);}if(s.sampling==='median'){vals.sort((a,b)=>a-b);out[(y*w+x)*3+c]=(vals[Math.floor((n-1)/2)]+vals[Math.floor(n/2)])/2;}else out[(y*w+x)*3+c]=sum/n;}
  }return out;
}
