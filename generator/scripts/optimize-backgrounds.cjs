// Preserve original artwork; generate bounded web delivery textures only.
const path=require('node:path'),fs=require('node:fs');
const sharp=require(path.resolve(__dirname,'../../../Portfolio-main/node_modules/sharp'));
const root=path.resolve(__dirname,'../../client/src/assets/images/poster');
(async()=>{
  for(const name of ['blue-plaster.jpg','red-plaster.jpg','brush.png','ink.png','paint.png']){
    const source=path.join(root,name),target=path.join(root,name.replace(/\.(jpg|png)$/,'.webp'));
    await sharp(source).resize({width:1920,height:1920,fit:'inside',withoutEnlargement:true}).webp({quality:88,alphaQuality:100,effort:6}).toFile(target);
    console.log(`${name}: ${fs.statSync(source).size} → ${fs.statSync(target).size} bytes`);
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
