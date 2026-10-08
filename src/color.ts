import palette from './palette.json';
import type {StyleSettings as GenerationSettings} from './settings';
export {palette};
const f=Math.fround;
export function lab(rgb:ArrayLike<number>):number[]{
  const v=Array.from(rgb,x=>{x=f(x/255);return x>.04045?f(f(f(x+.055)/1.055)**2.4):f(x/12.92);});const [r,g,b]=v;
  const X=f(f(f(f(r*.4124564)+f(g*.3575761))+f(b*.1804375))/.95047),Y=f(f(f(r*.2126729)+f(g*.7151522))+f(b*.0721750)),Z=f(f(f(f(r*.0193339)+f(g*.1191920))+f(b*.9503041))/1.08883);
  const ff=(t:number)=>t>216/24389?f(Math.cbrt(t)):f(f(f((24389/27)*t)+16)/116);const [fx,fy,fz]=[ff(X),ff(Y),ff(Z)];return [f(f(116*fy)-16),f(500*f(fx-fy)),f(200*f(fy-fz))];
}
export function quantize(samples:Float32Array,w:number,h:number,s:GenerationSettings):string[][]{
  const colors=palette.filter(p=>s.series.includes(p.code[0]));
  const convert=(v:ArrayLike<number>)=>{const a=s.distance==='rgb'?Array.from(v):lab(v);if(s.distance==='weighted-lab')a[0]=f(a[0]*1.35);return a;};
  const pv=colors.map(p=>convert(p.rgb)),work=new Float32Array(samples.length);
  for(let i=0;i<samples.length;i+=3)work.set(convert(samples.subarray(i,i+3)),i);
  function nearest(v:number[]){let best=0,score=Infinity;for(let i=0;i<pv.length;i++){let d=0;for(let c=0;c<3;c++){const delta=f(pv[i][c]-v[c]);d=f(d+f(delta*delta));}if(d<score){score=d;best=i;}}return best;}
  const bayer=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5],strength=s.dither_strength/100;
  const diffusion=s.dither==='floyd-steinberg'?[[0,1,7/16],[1,-1,3/16],[1,0,5/16],[1,1,1/16]]:[[0,1,1/8],[0,2,1/8],[1,-1,1/8],[1,0,1/8],[1,1,1/8],[2,0,1/8]];
  const codes:string[][]=[];
  for(let y=0;y<h;y++){const row:string[]=[];for(let x=0;x<w;x++){
    const i=(y*w+x)*3,v=Array.from(work.subarray(i,i+3));
    if(s.dither==='ordered'){const offset=f(f(f(bayer[(y%4)*4+x%4]/15)-.5)*((s.distance==='rgb'?32:10)*strength));for(let c=0;c<3;c++)v[c]=f(v[c]+offset);}
    const chosen=nearest(v);row.push(colors[chosen].code);
    if(s.dither==='floyd-steinberg'||s.dither==='atkinson')for(const [dy,dx,weight] of diffusion){const ny=y+dy,nx=x+dx;if(ny>=h||nx<0||nx>=w)continue;for(let c=0;c<3;c++){const err=f(f(work[i+c]-pv[chosen][c])*strength);const j=(ny*w+nx)*3+c;work[j]=f(work[j]+f(err*weight));}}
  }codes.push(row);}return codes;
}
