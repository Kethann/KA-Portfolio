// Compile every inline classic script, including legacy effects outside the main hero.
// Scripts share browser globals, so checking each block for isolated no-undef is misleading.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const html=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
let count=0;
for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){
  if(/type=["'](?:application\/ld\+json|importmap)["']/.test(match[1])){JSON.parse(match[2]);continue;}
  const file='inline-'+(++count)+'.js';
  if(/type=["']module["']/.test(match[1])){
    const source=ts.createSourceFile(file,match[2],ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
    if(source.parseDiagnostics.length)throw new Error(ts.flattenDiagnosticMessageText(source.parseDiagnostics[0].messageText,'\n'));
  }else new vm.Script(match[2],{filename:file});
}
new vm.Script(fs.readFileSync(path.resolve(__dirname,'../../public/creator.js'),'utf8'),{filename:'creator.js'});
console.log(`PASS: all ${count} inline scripts and creator.js parse successfully.`);
