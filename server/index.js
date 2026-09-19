import {config} from 'dotenv';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:http';
config({path:fileURLToPath(new URL('../.env',import.meta.url))});
const port=Number(process.env.PORT || 8787);
const host=process.env.HOST || "127.0.0.1";
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT must be between 1 and 65535.');
let app;
const server=createServer((req,res)=>{
  if(app)return app(req,res);
  res.writeHead(503,{'Content-Type':'application/json','Retry-After':'2'});
  res.end(JSON.stringify({error:'The portfolio is starting. Please retry shortly.'}));
});
// Acquire the common port before initializing storage or starting the optional worker.
server.once('error',error=>{
  console.error(error.code==='EADDRINUSE'?`Port ${port} is already in use. Use the running app at http://${host}:${port}; a second server was not started.`:error.message);
  app?.locals.stopServices?.();process.exitCode=1;
});
server.listen(port,host,async()=>{
  try{
    const {createApp}=await import('./app.js');
    app=await createApp();
    console.log(`Portfolio: http://${host}:${port}\nCreator:   http://${host}:${port}/creator`);
  }catch(error){console.error('Unable to start portfolio:',error.message);server.close();process.exitCode=1;}
});
function shutdown(){
  app?.locals.stopServices?.();
  server.close(()=>process.exit());
  setTimeout(()=>process.exit(),5000).unref();
}
process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
