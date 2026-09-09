import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
const local=path=>fileURLToPath(new URL(path,import.meta.url));
export default defineConfig({
  plugins:[{name:'local-crystal-runtime',generateBundle(){this.emitFile({type:'asset',fileName:'assets/three-r128.min.js',source:readFileSync(local('./public/three-r128.min.js'))});}}],
  root:'client',
  build:{
    outDir:'../dist',emptyOutDir:true,
    rollupOptions:{
      // The crystal homepage imports mount() at runtime, outside Vite's HTML graph.
      preserveEntrySignatures:'strict',
      input:{main:local('./client/index.html'),gallery:local('./client/src/gallery-entry.tsx'),poster:local('./client/src/poster-background.ts'),panda:local('./client/src/panda.ts')},
      output:{entryFileNames:chunk=>['gallery','poster','panda'].includes(chunk.name)?'assets/'+chunk.name+'.js':'assets/[name]-[hash].js'}
    }
  },
  server:{host:'127.0.0.1',fs:{strict:true,allow:[local('./client'),local('./node_modules')],deny:['.env','.env.*','*.{crt,pem}','**/.git/**','**/server/data/**']},proxy:{'/api':'http://127.0.0.1:8787','/images':'http://127.0.0.1:8787','/uploads':'http://127.0.0.1:8787','/creator':'http://127.0.0.1:8787','/assets':'http://127.0.0.1:8787'}}
});
