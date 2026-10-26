import {defineConfig,loadEnv} from 'vite';
import {fileURLToPath} from 'node:url';
import {readFileSync,writeFileSync} from 'node:fs';
import {cp,rm} from 'node:fs/promises';
const local=path=>fileURLToPath(new URL(path,import.meta.url));
const localEnv=loadEnv('development',process.cwd(),'');
const localApiPort=process.env.KA_API_PORT||localEnv.KA_API_PORT||process.env.PORT||localEnv.PORT||'9878';
const localApi=`http://127.0.0.1:${localApiPort}`;
export default defineConfig({
  plugins:[{name:'stage-crystal-homepage',apply:'build',async closeBundle(){
    // Vercel/Cloudflare serves dist/ only: publish the crystal homepage (root index.html) as dist/index.html, as server/app.js does locally.
    writeFileSync(local('./dist/index.html'),readFileSync(local('./index.html'),'utf8').replaceAll('./dist/assets/','./assets/'));
    await cp(local('./images'),local('./dist/images'),{recursive:true});
    // raw sound sources (Kenney originals, Sonniss downloads) are inputs for scripts/process-sounds.sh, never published
    await rm(local('./dist/sounds/raw'),{recursive:true,force:true});
  }},{name:'local-crystal-runtime',generateBundle(){this.emitFile({type:'asset',fileName:'assets/three-r128.min.js',source:readFileSync(local('./public/three-r128.min.js'))});}}],
  root:'client',
  preview:{host:'127.0.0.1',strictPort:true},
  build:{
    outDir:'../dist',emptyOutDir:true,   // each Vercel deployment is atomic; a clean output never ships stale chunks
    rollupOptions:{
      // The crystal homepage imports mount() at runtime, outside Vite's HTML graph.
      preserveEntrySignatures:'strict',
      input:{portal:local('./client/portal/index.html'),gallery:local('./client/src/gallery-entry.tsx'),poster:local('./client/src/poster-background.ts'),panda:local('./client/src/panda.ts'),studio:local('./client/src/studio/studio-entry.ts'),store:local('./client/src/store/store-entry.tsx'),'skill-logos':local('./client/src/skill-logos-entry.ts'),sound:local('./client/src/lib/sound/sound-entry.ts')},
      output:{entryFileNames:chunk=>['gallery','poster','panda','studio','store','skill-logos','sound'].includes(chunk.name)?'assets/'+chunk.name+'.js':'assets/[name]-[hash].js'}
    }
  },
  server:{host:'127.0.0.1',fs:{strict:true,allow:[local('./client'),local('./node_modules')],deny:['.env','.env.*','*.{crt,pem}','**/.git/**','**/server/data/**']},proxy:{'/api':localApi,'/images':localApi,'/uploads':localApi,'/creator':localApi,'/assets':localApi}}
});
