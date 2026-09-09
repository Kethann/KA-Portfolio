const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
(async()=>{
  const response=await fetch('http://127.0.0.1:8787/');const live=await response.text();
  const disk=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
  console.log('Homepage HTTP:',response.status,'matches workspace:',live===disk,'bytes:',Buffer.byteLength(live));
  for(const asset of ['/dist/assets/three-r128.min.js','/assets/panda.js','/dist/assets/panda.js','/api/portfolio']){
    const result=await fetch('http://127.0.0.1:8787'+asset);console.log(asset,result.status);await result.arrayBuffer();
  }
  const url=live.match(/<script src="([^"]*three[^"]*)"/)?.[1];console.log('Hero dependency:',url);
  if(url){try{const library=await fetch(new URL(url,'http://127.0.0.1:8787/'),{signal:AbortSignal.timeout(15000)});console.log('Three.js HTTP:',library.status,'bytes:',(await library.arrayBuffer()).byteLength);}catch(error){console.log('Three.js load failed:',error.message);}}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
