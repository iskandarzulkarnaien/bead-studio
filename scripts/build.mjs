import {build} from 'esbuild';
import {mkdir, copyFile} from 'node:fs/promises';
await mkdir('dist', {recursive:true});
await build({entryPoints:['src/main.ts','src/preload.ts','src/worker.ts'],bundle:true,platform:'node',format:'cjs',outdir:'dist',external:['electron','sharp'],sourcemap:true});
await build({entryPoints:['src/renderer.ts'],bundle:true,platform:'browser',format:'iife',outfile:'dist/renderer.js',sourcemap:true});
for (const name of ['index.html','style.css']) await copyFile(`src/${name}`,`dist/${name}`);
