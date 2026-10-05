import {defineConfig,loadEnv} from 'vite';
import {fileURLToPath} from 'node:url';
import {readFileSync,writeFileSync,cpSync} from 'node:fs';
const local=path=>fileURLToPath(new URL(path,import.meta.url));
const localEnv=loadEnv('development',process.cwd(),'');
const localApiPort=process.env.KA_API_PORT||localEnv.KA_API_PORT||process.env.PORT||localEnv.PORT||'9878';
const localApi=`http://127.0.0.1:${localApiPort}`;
export default defineConfig({
  plugins:[{name:'stage-crystal-homepage',apply:'build',closeBundle(){
    // Vercel serves dist/ only: publish the crystal homepage (root index.html) as dist/index.html, as server/app.js does locally.
    writeFileSync(local('./dist/index.html'),readFileSync(local('./index.html'),'utf8').replaceAll('./dist/assets/','./assets/'));
    cpSync(local('./images'),local('./dist/images'),{recursive:true});
  }},{name:'local-crystal-runtime',generateBundle(){this.emitFile({type:'asset',fileName:'assets/three-r128.min.js',source:readFileSync(local('./public/three-r128.min.js'))});}}],
  root:'client',
  preview:{host:'127.0.0.1',strictPort:true},
  build:{
    outDir:'../dist',emptyOutDir:true,   // each Vercel deployment is atomic; a clean output never ships stale chunks
    rollupOptions:{
      // The crystal homepage imports mount() at runtime, outside Vite's HTML graph.
      preserveEntrySignatures:'strict',
      input:{portal:local('./client/portal/index.html'),gallery:local('./client/src/gallery-entry.tsx'),poster:local('./client/src/poster-background.ts'),panda:local('./client/src/panda.ts'),studio:local('./client/src/studio/studio-entry.ts'),store:local('./client/src/store/store-entry.tsx'),'skill-logos':local('./client/src/skill-logos-entry.ts')},
      output:{entryFileNames:chunk=>['gallery','poster','panda','studio','store','skill-logos'].includes(chunk.name)?'assets/'+chunk.name+'.js':'assets/[name]-[hash].js'}
    }
  },
  server:{host:'127.0.0.1',fs:{strict:true,allow:[local('./client'),local('./node_modules')],deny:['.env','.env.*','*.{crt,pem}','**/.git/**','**/server/data/**']},proxy:{'/api':localApi,'/images':localApi,'/uploads':localApi,'/creator':localApi,'/assets':localApi}}
});
