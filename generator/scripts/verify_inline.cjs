const fs=require('node:fs'),path=require('node:path');
const {Linter}=require(path.resolve(__dirname,'../../../Portfolio-main/node_modules/eslint'));
const globals=require(path.resolve(__dirname,'../../../Portfolio-main/node_modules/globals'));
const html=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
let failures=0;
for(const [index,match] of [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].entries()){
  const results=new Linter().verify(match[2],[{languageOptions:{ecmaVersion:2022,sourceType:match[1].includes('module')?'module':'script',globals:{...globals.browser,THREE:'readonly'}},rules:{'no-undef':'error'}}]);
  for(const issue of results){console.error(`script ${index}, line ${issue.line}: ${issue.message}`);failures++;}
}
if(failures)process.exitCode=1;else console.log('PASS: every inline script resolves its identifiers.');
