import {build} from 'esbuild';
import {mkdir,copyFile} from 'node:fs/promises';
await mkdir('web-dist',{recursive:true});
await build({entryPoints:['src/browser/prototype.ts','src/browser/worker.ts'],bundle:true,platform:'browser',format:'esm',outdir:'web-dist',target:['chrome110','safari17','firefox115'],sourcemap:true});
for(const file of ['index.html','prototype.css'])await copyFile(`src/browser/${file}`,`web-dist/${file}`);
console.log('Static browser prototype built in web-dist/.');
