import express from 'express';
import geoip from 'geoip-lite';
import {proposeCreatorPatch} from './assistant.js';
import {randomBytes, randomUUID, scrypt as derive, timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync,readdirSync,statSync} from 'node:fs';
import {resolve} from 'node:path';
const scrypt=promisify(derive);
const text=(value,max)=>typeof value==='string' ? value.trim().slice(0,max) : '';
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const save=(path,data)=>{writeFileSync(path+'.tmp',JSON.stringify(data,null,2),{mode:0o600});renameSync(path+'.tmp',path);};
// A small allowlisted set rather than free-text: the creator panel picks a font, it never types
// raw CSS -- this is what makes it safe to drop the value straight into a stylesheet on the
// public page (see index.html's applySiteAppearance) with no injection risk.
export const FONT_CHOICES=['Manrope','Poppins','Playfair Display','Space Grotesk','system-ui'];
// Lightweight drag-and-drop (Part C, scoped down deliberately): only elements that were ALREADY
// free-floating (position:fixed, nothing else laid out relative to them) are draggable -- the
// site's actual structural layout (nav, grid, cards) stays exactly as hand-tuned, untouched by
// this system. Extending drag-and-drop to a new element later is just adding its id here AND
// giving it a data-ka-draggable attribute in index.html -- nothing else in this file changes.
// [fix] 'replay' was removed after discovering there's no actual <button id="replay"> in the
// page anymore -- only dormant CSS (#replay{...}) and a JS variable (replayBtn) that always
// resolves to null via optional chaining, same dead-feature pattern as #visitor-counter's own
// leftover CSS found earlier. Nothing to drag there; left out rather than keeping a silently
// no-op entry.
export const DRAGGABLE_IDS=['assistant-launcher','site-notice','portfolio-title','portfolio-intro','contact-title','contact-intro'];
// These four are in-flow text (a heading/paragraph inside the normal page layout), not
// free-floating badges like the first two -- dragging them uses the same `translate` trick, which
// visually moves the box WITHOUT reflowing anything around it, so the space it used to occupy
// stays reserved and empty. A small nudge reads as deliberate placement; a huge one reads as
// broken, disconnected text sitting over a blank gap. Bounded tighter than the free-floating ids
// for exactly that reason.
const TEXT_DRAGGABLE_IDS=['portfolio-title','portfolio-intro','contact-title','contact-intro'];
export const LAYOUT_BREAKPOINTS=['mobile','tablet','desktop'];
// Same magic-byte-sniffing idiom as the image upload route below (never trust a client-declared
// Content-Type) -- covers the four font formats every current browser actually needs.
function sniffFontExt(b){
  if(b.length<4) return null;
  if(b[0]===0x77&&b[1]===0x4f&&b[2]===0x46&&b[3]===0x32) return 'woff2';
  if(b[0]===0x77&&b[1]===0x4f&&b[2]===0x46&&b[3]===0x46) return 'woff';
  if(b.toString('ascii',0,4)==='OTTO') return 'otf';
  if((b[0]===0&&b[1]===1&&b[2]===0&&b[3]===0)||b.toString('ascii',0,4)==='true') return 'ttf';
  return null;
}
// Lightweight, dependency-free User-Agent classification for the visitor log (Part B). Not meant
// to rival a real UA-parsing library's accuracy -- just enough to bucket "device type" and a
// coarse browser/OS label for the creator dashboard, which is all the spec actually asks for.
export function classifyUserAgent(ua){
  ua=typeof ua==='string'?ua:'';
  const device=/iPad|Tablet(?!.*Mobile)|Android(?!.*Mobile)/i.test(ua)?'tablet':/Mobi|iPhone|Android/i.test(ua)?'mobile':'desktop';
  let os='Other';
  if(/Windows/i.test(ua))os='Windows';else if(/Mac OS X/i.test(ua)&&!/iPhone|iPad/i.test(ua))os='macOS';
  else if(/iPhone|iPad|iPod/i.test(ua))os='iOS';else if(/Android/i.test(ua))os='Android';else if(/Linux/i.test(ua))os='Linux';
  let browser='Other';
  if(/Edg\//i.test(ua))browser='Edge';else if(/OPR\/|Opera/i.test(ua))browser='Opera';
  else if(/Chrome\//i.test(ua)&&!/Chromium/i.test(ua))browser='Chrome';else if(/CriOS/i.test(ua))browser='Chrome';
  else if(/Firefox\//i.test(ua)&&!/Seamonkey/i.test(ua))browser='Firefox';
  else if(/Safari\//i.test(ua)&&!/Chrome|CriOS|Chromium|Android/i.test(ua))browser='Safari';
  return {device,os,browser};
}
// [fix] this only ever worked behind specific CDNs (Cloudflare/Vercel/App Engine) that forward a
// pre-resolved geo header -- deployed anywhere else (a plain VPS, or straight to this server
// locally), none of those headers exist and every visit logged as "Unknown" no matter how many
// real visits came in. geoip-lite ships its own bundled, offline IP-to-country database (updated
// with the npm package itself, no network call per lookup) -- still never sends a visitor's IP to
// any third party, just checked here as a fallback when no CDN header is already free and
// zero-maintenance to use. Loopback/private IPs (127.0.0.1, local dev) genuinely can't be
// geolocated by anything and correctly resolve to null here -- that's expected on localhost, not
// a bug; real visitor IPs in production resolve correctly.
function approxLocation(req){
  const header=req.get('cf-ipcountry')||req.get('x-vercel-ip-country')||req.get('x-appengine-country')||req.get('x-geo-country');
  if(header)return header;
  const looked=req.ip&&geoip.lookup(req.ip);
  return looked?.country||'Unknown';
}
async function passwordHash(password,salt=randomBytes(16).toString('hex')){
  return {salt,hash:(await scrypt(password,salt,64)).toString('hex')};
}

export async function createCreatorRouter({root,dataDir=process.env.CREATOR_DATA_DIR||resolve(root,'server/data'),password=process.env.CREATOR_PASSWORD}={}){
  mkdirSync(dataDir,{recursive:true});
  const uploads=resolve(dataDir,'uploads');mkdirSync(uploads,{recursive:true});
  const authPath=resolve(dataDir,'auth.json'),sitePath=resolve(dataDir,'portfolio.json'),inboxPath=resolve(dataDir,'inbox.json'),visitPath=resolve(dataDir,'visitors.json'),visitLogPath=resolve(dataDir,'visitors-log.json');
  if(!existsSync(authPath)){
    const initial=password || randomBytes(18).toString('base64url');
    if(initial.length<12) throw new Error('CREATOR_PASSWORD must contain at least 12 characters.');
    save(authPath,await passwordHash(initial));
    if(!password) writeFileSync(resolve(dataDir,'creator-access.txt'),`Creator login: /creator\nPassword: ${initial}\n\nChange this starter password in the creator panel. This file is removed when you change it.\n`,{mode:0o600});
  }
  if(!existsSync(sitePath)) save(sitePath,JSON.parse(readFileSync(resolve(root,'server/portfolio-seed.json'),'utf8')));
  if(!existsSync(inboxPath)) save(inboxPath,[]);
  if(!existsSync(visitPath)) save(visitPath,{count:0});
  const VISIT_LOG_CAP=5000; // FIFO cap -- a personal-portfolio-scale visitor log, not a data warehouse
  if(!existsSync(visitLogPath)) save(visitLogPath,[]);
  let site=JSON.parse(readFileSync(sitePath,'utf8'));
  // Upgrade older saved collections without replacing artwork or edited copy.
  const defaults=JSON.parse(readFileSync(resolve(root,'server/portfolio-seed.json'),'utf8'));
  const DEFAULT_APPEARANCE={headingFont:'Manrope',bodyFont:'Manrope',textScale:1,customFonts:[],glassBlur:18};
  const DEFAULT_NOTICE={enabled:false,text:'',tone:'info'};
  const DEFAULT_VISIBILITY={navGallery:true,navAbout:true};
  const DEFAULT_LAYOUT={mobile:{},tablet:{},desktop:{}};
  const DEFAULT_BRANDING={enabled:false,logoUrl:''};
  const upgraded={...site,
    details:{...defaults.details,...DEFAULT_APPEARANCE,...site.details},
    notice:{...DEFAULT_NOTICE,...site.notice},
    visibility:{...DEFAULT_VISIBILITY,...site.visibility},
    layoutOverrides:{...DEFAULT_LAYOUT,...site.layoutOverrides},
    branding:{...DEFAULT_BRANDING,...site.branding},
    elementStyles:{...site.elementStyles},
    paperArtwork:undefined,
    images:site.images.map(project=>({id:project.slug,description:'',technologies:[],link:'',downloadable:true,...project}))};
  delete upgraded.paperArtwork;
  if(JSON.stringify(upgraded)!==JSON.stringify(site)){
    upgraded.revision=(site.revision||0)+1;save(sitePath,upgraded);site=upgraded;
  }
  let inbox=JSON.parse(readFileSync(inboxPath,'utf8'));
  let visitors=JSON.parse(readFileSync(visitPath,'utf8'));
  let visitLog=JSON.parse(readFileSync(visitLogPath,'utf8'));
  const sessions=new Map(),limits=new Map();
  const router=express.Router();
  router.use((req,res,next)=>{res.set('Cache-Control','no-store');res.set('X-Content-Type-Options','nosniff');next();});
  const fail=(res,status,error)=>res.status(status).json({error});
  function rate(req,res,key,max){
    const now=Date.now();
    for(const [id,v] of limits) if(v.until<now) limits.delete(id);
    const id=key+':'+req.ip,v=limits.get(id)||{count:0,until:now+15*60*1000};
    v.count++;limits.set(id,v);
    if(v.count>max){res.set('Retry-After','900');fail(res,429,'Please wait a few minutes before trying again.');return false;}
    return true;
  }
  // Behind a TLS-terminating proxy (Render) req.protocol reads "http" while the browser's Origin is
  // "https", so compare hosts only: a cross-site Origin still has a different host and is rejected.
  function originHost(origin){try{return new URL(origin).host;}catch{return null;}}
  function sameHost(req,origin){
    const host=req.get('host');
    return originHost(origin)===host || (req.get('x-forwarded-host') && originHost(origin)===req.get('x-forwarded-host'));
  }
  function sameOrigin(req,res,next){
    const origin=req.get('origin');
    if(req.get('sec-fetch-site')==='cross-site' || (origin && !sameHost(req,origin))) return fail(res,403,'This request must come from this website.');
    next();
  }
  // Same as sameOrigin above, but also accepts the configured ALLOWED_ORIGIN(s) (see
  // server/app.js) -- for the two PUBLIC routes (/visit, /contact) that index.html needs to
  // reach even when it's served as a static file from somewhere else (GitHub Pages). Deliberately
  // NOT used for anything under /creator/* -- the admin surface stays same-origin-only via the
  // plain sameOrigin above, regardless of what ALLOWED_ORIGIN is set to.
  const allowedOrigins=(process.env.ALLOWED_ORIGIN||'').split(',').map(s=>s.trim()).filter(Boolean);
  function sameOriginOrAllowed(req,res,next){
    const origin=req.get('origin');
    const selfOrigin=`${req.protocol}://${req.get('host')}`;
    if(origin && allowedOrigins.includes(origin)) return next();
    if(req.get('sec-fetch-site')==='cross-site' || (origin && !sameHost(req,origin))) return fail(res,403,'This request must come from this website.');
    next();
  }
  function auth(req,res,next){
    const now=Date.now();
    for(const [id,s] of sessions) if(s.expires<now) sessions.delete(id);
    const id=(req.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('ka_creator='))?.slice(11);
    const session=sessions.get(id);
    if(!session) return fail(res,401,'Please sign in.');
    if(!['GET','HEAD'].includes(req.method) && !equal(req.get('x-csrf-token'),session.csrf)) return fail(res,403,'Session verification failed. Refresh and sign in again.');
    req.creatorSession={id,...session};next();
  }
  router.get('/portfolio',(req,res)=>res.json(site));
  // one increment per visitor (tracked via a long-lived, non-httpOnly cookie so a page reload or
  // a second tab doesn't inflate the count) -- always responds with the current total either way,
  // so the homepage counter reads correctly even for a repeat visitor whose cookie is still valid.
  router.post('/visit',sameOriginOrAllowed,(req,res)=>{
    if(!rate(req,res,'visit',30)) return;
    const seen=(req.get('cookie')||'').split(';').map(x=>x.trim()).some(c=>c.startsWith('ka_visited='));
    if(!seen){
      visitors={count:visitors.count+1};save(visitPath,visitors);
      // [fix] SameSite=Strict cookies are never sent on a cross-SITE request at all -- once
      // index.html can be served from a different origin than this API (see ALLOWED_ORIGIN),
      // a Strict cookie set here would never round-trip back, and every visit would look "new"
      // forever. 'none' requires Secure (HTTPS-only, enforced by browsers), so it only applies
      // once the server is actually served over HTTPS; local plain-HTTP dev falls back to 'lax',
      // which is exactly as effective as 'strict' was for a same-origin deployment anyway.
      res.cookie('ka_visited','1',{sameSite:req.secure?'none':'lax',secure:req.secure,maxAge:365*24*60*60*1000,path:'/'});
    }
    // Part B: one LOG ENTRY per visit call (not deduped like the unique-visitor count above --
    // "recent visits" in the dashboard is meant to show real traffic, repeat and all). IP/location
    // never leave this file: no public route ever reads visitLog, only the auth-gated
    // /creator/visitors below does.
    const {device,os,browser}=classifyUserAgent(req.get('user-agent'));
    visitLog.push({at:new Date().toISOString(),ip:req.ip||'unknown',location:approxLocation(req),device,os,browser,newVisitor:!seen});
    if(visitLog.length>VISIT_LOG_CAP) visitLog=visitLog.slice(visitLog.length-VISIT_LOG_CAP);
    save(visitLogPath,visitLog);
    res.json({count:visitors.count});
  });
  router.post('/contact',sameOriginOrAllowed,(req,res)=>{
    if(!rate(req,res,'contact',5)) return;
    const body=req.body||{};
    if(body.website) return res.status(202).json({ok:true});
    const name=text(body.name,100),email=text(body.email,254),subject=text(body.subject,180),message=text(body.message,8000);
    if(!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !subject || !message) return fail(res,400,'Enter your name, a valid email, subject, and message.');
    if(typeof body.message!=='string'||body.message.length>8000) return fail(res,400,'Keep your message under 8,000 characters.');
    if(inbox.length>=10000) return fail(res,503,'The inbox is currently full. Please reach out through Behance.');
    const entry={id:randomUUID(),name,email,subject,message,status:'new',createdAt:new Date().toISOString()};
    const next=[entry,...inbox];save(inboxPath,next);inbox=next;
    res.status(201).json({ok:true});
  });
  router.post('/creator/login',sameOrigin,async(req,res,next)=>{
    try{
      if(!rate(req,res,'login',8)) return;
      const supplied=req.body?.password;
      if(typeof supplied!=='string'||supplied.length>256) return fail(res,401,'Incorrect password.');
      const stored=JSON.parse(readFileSync(authPath,'utf8'));
      const hash=await passwordHash(supplied,stored.salt);
      if(!equal(hash.hash,stored.hash)) return fail(res,401,'Incorrect password.');
      const id=randomBytes(32).toString('hex'),csrf=randomBytes(24).toString('hex');
      for(const [key,s] of sessions) if(s.expires<Date.now()) sessions.delete(key);
      if(sessions.size>=20) sessions.delete(sessions.keys().next().value);
      sessions.set(id,{csrf,expires:Date.now()+8*60*60*1000});
      res.cookie('ka_creator',id,{httpOnly:true,sameSite:'strict',secure:req.secure,maxAge:8*60*60*1000,path:'/'});
      res.json({csrf});
    }catch(error){next(error);}
  });
  router.use('/creator',sameOrigin,auth);
  router.get('/creator/session',(req,res)=>res.json({csrf:req.creatorSession.csrf}));
  router.post('/creator/logout',(req,res)=>{sessions.delete(req.creatorSession.id);res.clearCookie('ka_creator',{path:'/'});res.json({ok:true});});
  router.put('/creator/password',async(req,res,next)=>{
    try{
      const password=req.body?.password;
      if(typeof password!=='string'||password.length<12||password.length>256) return fail(res,400,'Use a password between 12 and 256 characters.');
      save(authPath,await passwordHash(password));
      const starter=resolve(dataDir,'creator-access.txt');if(existsSync(starter)) unlinkSync(starter);
      sessions.clear();res.clearCookie('ka_creator',{path:'/'});res.json({ok:true});
    }catch(error){next(error);}
  });
  router.get('/creator/messages',(req,res)=>res.json(inbox));
  // Part B dashboard data. IP is included here (creator-authed only) but this route is the ONLY
  // place it's ever exposed -- /api/portfolio, the public homepage, and every other public route
  // never see it. Aggregates are computed on read rather than maintained incrementally: at this
  // log scale (VISIT_LOG_CAP=5000) that's a trivial amount of work per request, not worth the
  // bug surface of a second running total that could drift from the log.
  router.get('/creator/visitors',(req,res)=>{
    // Aggregates (byDevice/byDay/byLocation) are always computed over the FULL log regardless of
    // the filters below -- they're "the shape of all traffic", not "the shape of this filtered
    // view" -- while the returned log rows themselves honor device/from/to so the admin can drill
    // into a specific slice (Part D.11) without the trend numbers jumping around underneath them.
    const byDevice={},byDay={},byLocation={};
    for(const entry of visitLog){
      byDevice[entry.device]=(byDevice[entry.device]||0)+1;
      const day=(entry.at||'').slice(0,10);
      if(day) byDay[day]=(byDay[day]||0)+1;
      byLocation[entry.location||'Unknown']=(byLocation[entry.location||'Unknown']||0)+1;
    }
    const {device,from,to}=req.query;
    let filtered=visitLog;
    if(typeof device==='string'&&device&&device!=='all') filtered=filtered.filter(e=>e.device===device);
    if(typeof from==='string'&&from) filtered=filtered.filter(e=>e.at>=from);
    // ISO timestamps sort lexically, so a plain "YYYY-MM-DD" date needs pushing to the END of
    // that day before comparing -- otherwise every visit after midnight on the "to" date itself
    // (anything with a time component) would incorrectly compare as "after" a bare date string.
    if(typeof to==='string'&&to) filtered=filtered.filter(e=>e.at<=(to.length===10?to+'T23:59:59.999Z':to));
    res.json({count:visitors.count,log:filtered.slice(-200).reverse(),byDevice,byDay,byLocation});
  });
  router.get('/creator/assets',(req,res)=>res.json(readdirSync(uploads).filter(name=>/^[a-f0-9-]{36}\.(png|jpg|webp)$/.test(name)).map(name=>({src:'/uploads/'+name,bytes:statSync(resolve(uploads,name)).size,used:site.images.some(image=>image.src==='/uploads/'+name)}))));
  router.delete('/creator/assets/:name',(req,res)=>{
    if(!/^[a-f0-9-]{36}\.(png|jpg|webp)$/.test(req.params.name)) return fail(res,400,'Invalid image.');
    if(site.images.some(image=>image.src==='/uploads/'+req.params.name)) return fail(res,409,'Remove this image from published projects before deleting it.');
    const file=resolve(uploads,req.params.name);if(!existsSync(file))return fail(res,404,'Image not found.');
    unlinkSync(file);res.json({ok:true});
  });
  router.patch('/creator/messages/:id',(req,res)=>{
    if(!['new','read','archived'].includes(req.body?.status)) return fail(res,400,'Invalid message status.');
    if(!inbox.some(m=>m.id===req.params.id)) return fail(res,404,'Message not found.');
    const next=inbox.map(m=>m.id===req.params.id?{...m,status:req.body.status}:m);save(inboxPath,next);inbox=next;res.json({ok:true});
  });
  router.delete('/creator/messages/:id',(req,res)=>{
    if(!inbox.some(m=>m.id===req.params.id)) return fail(res,404,'Message not found.');
    const next=inbox.filter(m=>m.id!==req.params.id);save(inboxPath,next);inbox=next;res.json({ok:true});
  });
  router.post('/creator/upload',express.raw({type:['image/png','image/jpeg','image/webp'],limit:'12mb'}),(req,res)=>{
    const b=req.body;
    if(!Buffer.isBuffer(b)||b.length<16) return fail(res,400,'Choose a PNG, JPEG, or WebP image.');
    let ext;
    if(b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) ext='png';
    else if(b[0]===255&&b[1]===216&&b[2]===255) ext='jpg';
    else if(b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP') ext='webp';
    if(!ext) return fail(res,400,'The file is not a supported raster image.');
    const filename=randomUUID()+'.'+ext;writeFileSync(resolve(uploads,filename),b);
    res.status(201).json({src:'/uploads/'+filename});
  });
  // Custom fonts (device-uploaded): same reasoning/idiom as the image route above -- magic bytes
  // decide the real format, stored in the same uploads dir, publicly served the same way. The
  // admin-supplied font-family NAME is validated separately in PUT /creator/portfolio (plain text,
  // safe to drop into a stylesheet's font-family since it's never used to build a URL or a
  // selector) -- this route only ever returns the file's own URL.
  router.post('/creator/font-upload',express.raw({type:['font/woff2','font/woff','font/ttf','font/otf','application/font-woff','application/font-woff2','application/x-font-ttf','application/x-font-otf','application/octet-stream'],limit:'6mb'}),(req,res)=>{
    const b=req.body;
    if(!Buffer.isBuffer(b)||b.length<16) return fail(res,400,'Choose a WOFF2, WOFF, TTF, or OTF font file.');
    const ext=sniffFontExt(b);
    if(!ext) return fail(res,400,'The file is not a supported font format.');
    const filename=randomUUID()+'.'+ext;writeFileSync(resolve(uploads,filename),b);
    res.status(201).json({src:'/uploads/'+filename});
  });
  // Embedded "describe an edit" assistant (Creator Portal). Operates ONLY on the admin's own
  // in-memory draft, sent in the request body -- never the server's persisted `site` -- and never
  // writes anything itself. The admin applies the returned patch to their draft client-side (same
  // markDirty()/mutate path every other control uses) and still has to click Publish, which still
  // runs through the exact same validation as every other edit above.
  const CREATOR_SCHEMA_NOTES=`Editable top-level fields and their shapes:
- details: {creatorName, tagline, portfolioTitle, portfolioIntro, contactTitle, contactIntro, openLabel, closeLabel, projectLabel, contactButton} (all short strings), plus headingFont/bodyFont (one of ${JSON.stringify(FONT_CHOICES)}, or a family already listed in details.customFonts), textScale (number 0.85-1.2), and glassBlur (number 0-40, the site's glass-panel blur intensity in pixels). Never invent a new customFonts entry -- only pick among ones already in the current draft.
- elementStyles: object keyed by one of ${JSON.stringify(DRAGGABLE_IDS)}, value {font?, color?} (font must be an allowed font as above; color must be a 6-digit hex string like "#ff9438"). Only include keys/fields actually being changed.
- notice: {enabled: boolean, text: string up to 220 chars, tone: "info"|"warning"}.
- visibility: {navGallery: boolean, navAbout: boolean}.
- branding: {enabled: boolean, logoUrl: string}. Never invent a new logoUrl -- only toggle enabled using the logoUrl already in the current draft.
- folders: array of unique short strings.
- images: array of {id, slug, title, cat (must be one of folders), description, technologies (array of strings), link, downloadable}. Never invent a new image's src/slug -- only edit fields of images already present in the current draft.`;
  router.post('/creator/assistant',async(req,res)=>{
    if(!rate(req,res,'creator-assistant',20)) return;
    const instruction=text(req.body?.instruction,2000);
    if(!instruction) return fail(res,400,'Describe the change you want.');
    const draft=req.body?.draft;
    if(!draft||typeof draft!=='object') return fail(res,400,'Missing the current draft to edit.');
    if(!process.env.GEMINI_API_KEY) return fail(res,500,'Server is missing GEMINI_API_KEY -- see .env.example.');
    try{
      const patch=await proposeCreatorPatch({apiKey:process.env.GEMINI_API_KEY,instruction,draft,schemaNotes:CREATOR_SCHEMA_NOTES});
      res.json({patch});
    }catch(error){
      fail(res,502,'The assistant could not process that request.');
    }
  });
  router.put('/creator/portfolio',(req,res)=>{
    const input=req.body;
    if(!input || input.revision!==site.revision) return fail(res,409,'This portfolio changed in another session. Reload before saving.');
    if(!Array.isArray(input.folders)||input.folders.length>30||!Array.isArray(input.images)||input.images.length>300) return fail(res,400,'Use up to 30 folders and 300 images.');
    const folders=input.folders.map(f=>text(f,70));
    if(folders.some(f=>!f)||new Set(folders).size!==folders.length) return fail(res,400,'Folder names must be unique and nonempty.');
    const details={};
    for(const [key,max] of Object.entries({creatorName:80,tagline:160,portfolioTitle:100,portfolioIntro:500,contactTitle:100,contactIntro:1000,openLabel:60,closeLabel:60,projectLabel:60,contactButton:60})){
      details[key]=text(input.details?.[key],max);
      if(!details[key]) return fail(res,400,'Complete every portfolio text field.');
    }
    // Device-uploaded fonts (Part A extension): each entry names an already-uploaded font file --
    // same "reject outright, don't silently drop" idiom as images[] below, same reused upload path.
    const rawCustomFonts=Array.isArray(input.details?.customFonts)?input.details.customFonts:[];
    if(rawCustomFonts.length>20) return fail(res,400,'Use up to 20 custom fonts.');
    const customFonts=[];
    for(const font of rawCustomFonts){
      if(!font||typeof font!=='object') return fail(res,400,'Invalid custom font.');
      const family=text(font.family,60);
      if(!family||!/^[A-Za-z0-9 _-]+$/.test(family)) return fail(res,400,'Font names may only use letters, numbers, spaces, - and _.');
      if(customFonts.some(f=>f.family===family)) return fail(res,400,'Each custom font needs a unique name.');
      const url=text(font.url,300);
      if(!/^\/uploads\/[a-f0-9-]{36}\.(woff2|woff|ttf|otf)$/.test(url)||!existsSync(resolve(uploads,url.split('/').pop()))) return fail(res,400,'Upload this font before saving.');
      customFonts.push({family,url});
    }
    details.customFonts=customFonts;
    // Typography (Part A): an allowlisted choice, not free text -- see FONT_CHOICES above, now
    // extended with whatever this same save also includes as a valid custom font family.
    const allowedFonts=[...FONT_CHOICES,...customFonts.map(f=>f.family)];
    details.headingFont=allowedFonts.includes(input.details?.headingFont)?input.details.headingFont:'Manrope';
    details.bodyFont=allowedFonts.includes(input.details?.bodyFont)?input.details.bodyFont:'Manrope';
    const scale=Number(input.details?.textScale);
    details.textScale=Number.isFinite(scale)?Math.min(1.2,Math.max(0.85,scale)):1;
    // Glass-effect intensity: overrides the same --glass-blur custom property every glass surface
    // on the public site already reads from (nav, tooltips, assistant panel, expand menu) -- one
    // real, working knob, not a per-surface reimplementation.
    const glassBlur=Number(input.details?.glassBlur);
    details.glassBlur=Number.isFinite(glassBlur)?Math.min(40,Math.max(0,glassBlur)):18;
    // Per-element font/color overrides (Creator Portal's floating property panel) -- keyed by the
    // same DRAGGABLE_IDS allowlist as layoutOverrides above, same "reject unknown ids outright"
    // idiom. A null/empty value means "use the site default", not "invalid".
    const elementStyles={};
    if(input.elementStyles&&typeof input.elementStyles==='object'){
      for(const [id,style] of Object.entries(input.elementStyles)){
        if(!DRAGGABLE_IDS.includes(id)) return fail(res,400,'Unknown styled element: '+id);
        if(!style||typeof style!=='object') continue;
        const clean={};
        if(style.font){
          if(!allowedFonts.includes(style.font)) return fail(res,400,'Unknown font for '+id+'.');
          clean.font=style.font;
        }
        if(style.color){
          const color=text(style.color,20);
          if(!/^#[0-9a-fA-F]{6}$/.test(color)) return fail(res,400,'Colors must be a 6-digit hex value.');
          clean.color=color;
        }
        if(Object.keys(clean).length) elementStyles[id]=clean;
      }
    }
    // Studio branding logo (Creator Portal's own header only -- never the public site/hero).
    const brandingLogoUrl=text(input.branding?.logoUrl,300);
    const branding={enabled:!!input.branding?.enabled,logoUrl:''};
    if(brandingLogoUrl){
      const uploaded=/^\/uploads\/[a-f0-9-]{36}\.(png|jpg|webp)$/.test(brandingLogoUrl)&&existsSync(resolve(uploads,brandingLogoUrl.split('/').pop()));
      if(!uploaded) return fail(res,400,'Upload the studio logo image before saving.');
      branding.logoUrl=brandingLogoUrl;
    }
    if(branding.enabled&&!branding.logoUrl) return fail(res,400,'Upload a logo image before enabling it.');
    // Notice banner (Part A): a single site-wide announcement, plain text only (rendered as
    // textContent on the public page, never innerHTML -- see index.html's applySiteAppearance).
    const notice={enabled:!!input.notice?.enabled,text:text(input.notice?.text,220),tone:input.notice?.tone==='warning'?'warning':'info'};
    if(notice.enabled&&!notice.text) return fail(res,400,'Add notice text before enabling the banner, or turn it off.');
    // Section visibility (Part A): only the two genuinely optional nav destinations are
    // toggleable -- Portfolio/Contact are the page's own core content, not "features".
    const visibility={navGallery:input.visibility?.navGallery!==false,navAbout:input.visibility?.navAbout!==false};
    // Lightweight drag-and-drop persistence (Part C): a bounded offset, per breakpoint, per
    // allowlisted element id -- rejects anything else outright rather than silently dropping it,
    // so a bad client payload fails loudly in the studio instead of quietly losing an edit.
    const layoutOverrides={};
    for(const bp of LAYOUT_BREAKPOINTS){
      const src=input.layoutOverrides?.[bp];
      const clean={};
      if(src&&typeof src==='object'){
        for(const [id,pos] of Object.entries(src)){
          if(!DRAGGABLE_IDS.includes(id)) return fail(res,400,'Unknown layout element: '+id);
          const bound=TEXT_DRAGGABLE_IDS.includes(id)?300:2000;
          const x=Number(pos?.x),y=Number(pos?.y),scale=pos?.scale===undefined?1:Number(pos.scale);
          if(!Number.isFinite(x)||!Number.isFinite(y)||Math.abs(x)>bound||Math.abs(y)>bound) return fail(res,400,'Layout position out of range.');
          if(!Number.isFinite(scale)||scale<0.5||scale>2.5) return fail(res,400,'Layout scale out of range.');
          clean[id]={x,y,scale};
        }
      }
      layoutOverrides[bp]=clean;
    }
    const images=[];
    for(const image of input.images){
      if(!image||typeof image!=='object')return fail(res,400,'Invalid project.');
      const slug=text(image.slug,100),title=text(image.title,160),cat=text(image.cat,70);
      if(!/^[a-zA-Z0-9_-]+$/.test(slug)||!title||!folders.includes(cat)||images.some(i=>i.slug===slug)) return fail(res,400,'Each image needs a unique ID, a title, and an existing folder.');
      const description=text(image.description,4000),link=text(image.link,2000);
      if(link){try{if(!['https:','http:'].includes(new URL(link).protocol))throw new Error();}catch{return fail(res,400,'Project links must start with https:// or http://.');}}
      if(!Array.isArray(image.technologies)||image.technologies.length>20) return fail(res,400,'Use up to 20 technology labels.');
      const technologies=image.technologies.map(v=>text(v,60)).filter(Boolean);
      const downloadable=image.downloadable!==false; // per-image gallery download permission (Part A) -- opt OUT, not opt in, so existing images stay downloadable unless explicitly turned off
      const common={id:slug,slug,title,cat,description,technologies,link,downloadable};
      if(image.src){
        const uploaded=/^\/uploads\/[a-f0-9-]{36}\.(png|jpg|webp)$/.test(image.src)&&existsSync(resolve(uploads,image.src.split('/').pop()));
        const original=/^\/images\/[a-zA-Z0-9_-]+-(480|768|1080|1600|2400|3840|full)\.webp$/.test(image.src)&&existsSync(resolve(root,'images',image.src.split('/').pop()));
        if(!uploaded&&!original) return fail(res,400,'Upload this image before saving.');
        images.push({...common,src:image.src,widths:[],full:0});
      }else{
        const original=site.images.find(i=>i.slug===slug&&!i.src);
        if(!original) return fail(res,400,'Unknown original image.');
        images.push({...original,...common});
      }
    }
    const next={revision:site.revision+1,details,folders,images,notice,visibility,layoutOverrides,branding,elementStyles};save(sitePath,next);site=next;res.json(site);
  });
  return {router,uploads};
}
