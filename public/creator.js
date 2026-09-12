'use strict';
const $=s=>document.querySelector(s);
let csrf='',site=null,messages=[],dirty=false;
// Mirrors server/creator.js's FONT_CHOICES exactly -- kept in sync by hand since this file is a
// plain script (no bundler/shared-module step) rather than pulled in dynamically, matching how
// every other constant in this small admin UI is already duplicated rather than imported.
const FONT_CHOICES=['Manrope','Poppins','Playfair Display','Space Grotesk','system-ui'];
const status=(message,error=false)=>{$('#status').textContent=message;$('#status').dataset.error=String(error);};
async function api(path,options={}){
  const response=await fetch('/api'+path,{...options,headers:{...(options.body instanceof File?{}:{'Content-Type':'application/json'}),'X-CSRF-Token':csrf,...options.headers}});
  const body=await response.json();if(!response.ok) {if(response.status===401)showLogin();throw new Error(body.error||'Unable to complete this request.');}return body;
}
function el(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
function button(label,action,cls){const b=el('button',label,cls);b.type='button';b.addEventListener('click',()=>Promise.resolve().then(action).catch(e=>status(e.message,true)));return b;}
function markDirty(){dirty=true;$('#save').textContent='Publish changes';syncPreview();}
function showLogin(){csrf='';$('#studio').hidden=true;$('#login-view').hidden=false;}
function field(label,value,onChange){const wrap=el('label',label),input=el('input');input.value=value;input.maxLength=label==='Project URL'?2000:label.startsWith('Technologies')?1200:160;input.addEventListener('change',()=>{onChange(input.value.trim());markDirty();});wrap.append(input);return wrap;}
async function loadStudio(){
  [site,messages]=await Promise.all([api('/portfolio'),api('/creator/messages')]);dirty=false;
  $('#login-view').hidden=true;$('#studio').hidden=false;
  for(const input of $('#details').elements) if(input.name)input.value=site.details[input.name]||'';
  site.notice=site.notice||{enabled:false,text:'',tone:'info'};
  site.visibility=site.visibility||{navGallery:true,navAbout:true};
  site.layoutOverrides=site.layoutOverrides||{mobile:{},tablet:{},desktop:{}};
  renderTypography();renderNoticeForm();renderVisibilityForm();
  renderInbox();renderFolders();renderImages();
  const overview=$('#overview');overview.replaceChildren();for(const [label,count] of [['Projects',site.images.length],['Folders',site.folders.length],['New messages',messages.filter(m=>m.status==='new').length]]){const card=el('div',undefined,'panel');card.append(el('h2',String(count)),el('p',label));overview.append(card);}
  setupPreview();
}

// ==================================================================== PART A/B: LIVE PREVIEW ==
// The preview pane is a real <iframe> loading the actual public page (not a re-implementation of
// it), synced live via postMessage -- see index.html's own "LIVE PREVIEW" block for the receiving
// end. This is what makes the preview genuinely pixel-accurate (the real hero, the real CSS
// breakpoints) rather than an approximation that could quietly drift from the live site.
let previewReady=false;
function setupPreview(){
  const frame=$('#preview-frame');
  if(frame.dataset.wired)return; // loadStudio can run more than once per page (login again after logout) -- only wire this up once
  frame.dataset.wired='1';
  // [fix] this used to also reset previewReady=false on the iframe's own 'load' event, meant to
  // cover "the iframe navigated away and needs a fresh handshake" -- but src is only ever set
  // ONCE here (device-size changes below only touch width/height/transform, never src), and
  // Chromium can fire a spurious/duplicate 'load' for the SAME already-ready document (a known
  // quirk with programmatically-assigned iframe src). That stray second event was silently
  // flipping previewReady back to false right after the real handshake succeeded, with nothing
  // left to ever set it true again -- every edit after that point looked like it "did nothing" in
  // the preview. Simplest correct fix: don't reset it here at all.
  frame.src='/?preview=1';
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==frame.contentWindow)return;
    const msg=event.data;if(!msg||typeof msg!=='object')return;
    if(msg.type==='ka-preview-ready'){previewReady=true;syncPreview();}
    else if(msg.type==='ka-preview-selected'){$('#preview-selection').textContent='Editing: '+msg.id;}
    else if(msg.type==='ka-preview-moved'){
      site.layoutOverrides[msg.breakpoint]=site.layoutOverrides[msg.breakpoint]||{};
      site.layoutOverrides[msg.breakpoint][msg.id]={x:Math.round(msg.x),y:Math.round(msg.y)};
      $('#preview-selection').textContent=msg.id+' moved ('+msg.breakpoint+')';
      markDirty();
    }
  });
  $('#device-preset').addEventListener('change',applyDevicePreset);
  $('#apply-custom').addEventListener('click',()=>{
    const w=Number($('#custom-w').value),h=Number($('#custom-h').value);
    if(w>=240&&h>=240)setPreviewSize(w,h);
  });
  $('#edit-layout-toggle').addEventListener('change',e=>{
    $('#preview-selection').textContent=e.target.checked?'Click an element in the preview to select it.':'';
    postToPreview({type:'ka-preview-edit-mode',enabled:e.target.checked});
  });
  applyDevicePreset();
}
function postToPreview(message){
  const frame=$('#preview-frame');
  if(!previewReady||!frame.contentWindow)return;
  frame.contentWindow.postMessage(message,location.origin);
}
function syncPreview(){postToPreview({type:'ka-preview-data',data:site});}
function applyDevicePreset(){
  const select=$('#device-preset'),opt=select.selectedOptions[0];
  $('#custom-size').hidden=select.value!=='custom';
  if(select.value==='custom')return; // wait for the admin to actually enter/apply a size
  const w=Number(opt.dataset.w),h=Number(opt.dataset.h);
  setPreviewSize(w,h);
}
function setPreviewSize(w,h){
  const frame=$('#preview-frame'),viewport=$('#preview-viewport');
  if(!w||!h){ // "Responsive (fit panel)" -- no device emulation, just fill the available space
    frame.style.width='100%';frame.style.height='100%';frame.style.transform='none';
    return;
  }
  frame.style.width=w+'px';frame.style.height=h+'px';
  const pad=40,availW=viewport.clientWidth-pad,availH=viewport.clientHeight-pad;
  const scale=Math.min(1,availW/w,availH/h);
  frame.style.transform=scale<1?'scale('+scale+')':'none';
}
window.addEventListener('resize',()=>{if($('#device-preset').value!=='responsive')applyDevicePreset();});
function renderTypography(){
  const form=$('#typography');
  for(const name of ['headingFont','bodyFont']){
    const select=form.elements[name];select.replaceChildren();
    for(const font of FONT_CHOICES){const opt=el('option',font);opt.value=font;select.append(opt);}
    select.value=site.details[name]||'Manrope';
    select.onchange=()=>{site.details[name]=select.value;markDirty();};
  }
  form.elements.textScale.value=site.details.textScale||1;
  form.elements.textScale.onchange=()=>{site.details.textScale=Number(form.elements.textScale.value);markDirty();};
}
function renderNoticeForm(){
  const form=$('#notice-form');
  form.elements.enabled.checked=!!site.notice.enabled;
  form.elements.text.value=site.notice.text||'';
  form.elements.tone.value=site.notice.tone||'info';
  form.elements.enabled.onchange=()=>{site.notice.enabled=form.elements.enabled.checked;markDirty();};
  form.elements.text.oninput=()=>{site.notice.text=form.elements.text.value;markDirty();};
  form.elements.tone.onchange=()=>{site.notice.tone=form.elements.tone.value;markDirty();};
}
function renderVisibilityForm(){
  const form=$('#visibility-form');
  form.elements.navGallery.checked=site.visibility.navGallery!==false;
  form.elements.navAbout.checked=site.visibility.navAbout!==false;
  form.elements.navGallery.onchange=()=>{site.visibility.navGallery=form.elements.navGallery.checked;markDirty();};
  form.elements.navAbout.onchange=()=>{site.visibility.navAbout=form.elements.navAbout.checked;markDirty();};
}
// SVG bar chart -- no charting library pulled in for three small bar charts in an internal admin
// tool; a handful of <rect>s is simpler, smaller, and has nothing to go wrong dependency-wise.
function barChart(title,entries,opts={}){
  const wrap=el('div',undefined,'panel');wrap.append(el('h2',title));
  if(!entries.length){wrap.append(el('p','No data yet.'));return wrap;}
  const max=Math.max(...entries.map(([,v])=>v),1);
  const rowH=22,w=260,h=entries.length*rowH;
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 '+w+' '+h);svg.setAttribute('width','100%');svg.setAttribute('height',h);
  entries.forEach(([label,value],i)=>{
    const barW=Math.max(2,(value/max)*(w-90));
    const y=i*rowH;
    const text=document.createElementNS('http://www.w3.org/2000/svg','text');
    text.setAttribute('x','0');text.setAttribute('y',y+rowH/2+4);text.setAttribute('fill','#b1a7b3');text.setAttribute('font-size','10.5');
    text.textContent=opts.formatLabel?opts.formatLabel(label):label;svg.append(text);
    const rect=document.createElementNS('http://www.w3.org/2000/svg','rect');
    rect.setAttribute('x','82');rect.setAttribute('y',y+4);rect.setAttribute('width',barW);rect.setAttribute('height',rowH-9);
    rect.setAttribute('rx','3');rect.setAttribute('fill','#edc5a4');svg.append(rect);
    const count=document.createElementNS('http://www.w3.org/2000/svg','text');
    count.setAttribute('x',86+barW);count.setAttribute('y',y+rowH/2+4);count.setAttribute('fill','#eee9e4');count.setAttribute('font-size','10.5');
    count.textContent=String(value);svg.append(count);
  });
  wrap.append(svg);return wrap;
}
let visitorLog=[],visitorSort={key:'at',dir:-1};
async function renderVisitors(){
  const params=new URLSearchParams();
  const form=$('#visitor-filters');
  if(form.elements.device.value!=='all')params.set('device',form.elements.device.value);
  if(form.elements.from.value)params.set('from',form.elements.from.value);
  if(form.elements.to.value)params.set('to',form.elements.to.value);
  const data=await api('/creator/visitors'+(params.toString()?'?'+params:''));
  visitorLog=data.log;
  const overview=$('#visitor-overview');overview.replaceChildren();
  for(const [label,value] of [['Total visits',String(data.count)],['Matching filters',String(data.log.length)]]){const card=el('div',undefined,'panel');card.append(el('h2',value),el('p',label));overview.append(card);}
  const charts=$('#visitor-charts');charts.replaceChildren();
  const byDayEntries=Object.entries(data.byDay).sort(([a],[b])=>a<b?1:-1).slice(0,7).reverse();
  charts.append(
    barChart('Visits by day (last 7)',byDayEntries,{formatLabel:d=>d.slice(5)}),
    barChart('Visits by device',Object.entries(data.byDevice).sort(([,a],[,b])=>b-a)),
    barChart('Visits by location',Object.entries(data.byLocation).sort(([,a],[,b])=>b-a).slice(0,8)),
  );
  renderVisitorTable();
}
function renderVisitorTable(){
  const root=$('#visitor-log');root.replaceChildren();
  if(!visitorLog.length){root.append(el('p','No visits logged for this filter yet.','empty'));return;}
  const cols=[['at','Time'],['device','Device'],['os','OS'],['browser','Browser'],['location','Location'],['ip','IP'],['newVisitor','New?']];
  const rows=visitorLog.slice().sort((a,b)=>{
    const av=a[visitorSort.key],bv=b[visitorSort.key];
    return av<bv?-visitorSort.dir:av>bv?visitorSort.dir:0;
  });
  const table=el('table');table.className='visit-log';
  const thead=el('thead'),headRow=el('tr');
  for(const [key,label] of cols){
    const th=el('th',label);
    if(key===visitorSort.key)th.dataset.sorted=visitorSort.dir>0?'asc':'desc';
    th.addEventListener('click',()=>{
      visitorSort=key===visitorSort.key?{key,dir:-visitorSort.dir}:{key,dir:1};
      renderVisitorTable();
    });
    headRow.append(th);
  }
  thead.append(headRow);table.append(thead);
  const tbody=el('tbody');
  for(const entry of rows){
    const row=el('tr');
    row.append(el('td',new Date(entry.at).toLocaleString()),el('td',entry.device),el('td',entry.os),el('td',entry.browser),el('td',entry.location),el('td',entry.ip),el('td',entry.newVisitor?'Yes':'Return'));
    tbody.append(row);
  }
  table.append(tbody);root.append(table);
}
$('#visitor-filter-apply').addEventListener('click',()=>renderVisitors().catch(error=>status(error.message,true)));
$('#visitor-filter-clear').addEventListener('click',()=>{$('#visitor-filters').reset();renderVisitors().catch(error=>status(error.message,true));});
function renderInbox(){
  const root=$('#messages');root.replaceChildren();$('#unread').textContent=messages.filter(m=>m.status==='new').length||'';
  const shown=messages.filter(m=>$('#message-filter').value==='all'||m.status===$('#message-filter').value);
  if(!shown.length)root.append(el('p','No messages here yet. New contact submissions will appear here.','empty'));
  for(const message of shown){
    const card=el('article',undefined,'message');card.dataset.status=message.status;
    const detail=el('details'),summary=el('summary',message.subject);detail.append(summary,el('p',message.message,'body'));
    card.append(detail,el('p',`${message.name} · ${message.email} · ${new Date(message.createdAt).toLocaleString()} · ${message.status}`,'byline'));
    const actions=el('div',undefined,'actions'),reply=el('a','Reply by email ↗');reply.href='mailto:'+encodeURIComponent(message.email)+'?subject='+encodeURIComponent('Re: '+message.subject);actions.append(reply);
    for(const [label,value] of [['Mark read','read'],['Archive','archived'],['Mark new','new']]){
      if(message.status!==value)actions.append(button(label,async()=>{await api('/creator/messages/'+message.id,{method:'PATCH',body:JSON.stringify({status:value})});message.status=value;renderInbox();}));
    }
    actions.append(button('Delete',async()=>{if(!confirm('Permanently delete this message?'))return;await api('/creator/messages/'+message.id,{method:'DELETE'});messages=messages.filter(m=>m!==message);renderInbox();},'danger'));
    card.append(actions);root.append(card);
  }
}
function reorder(array,index,delta){const target=index+delta;if(target<0||target>=array.length)return;[array[index],array[target]]=[array[target],array[index]];markDirty();}
function renderFolders(){
  const root=$('#folders');root.replaceChildren();
  site.folders.forEach((name,i)=>{
    const row=el('div',undefined,'folder-row'),input=el('input');input.value=name;input.maxLength=70;input.setAttribute('aria-label','Folder name');
    input.addEventListener('change',()=>{const next=input.value.trim();if(!next||site.folders.some((f,j)=>j!==i&&f===next)){input.value=name;return status('Use a unique, nonempty folder name.',true);}site.folders[i]=next;site.images.forEach(image=>{if(image.cat===name)image.cat=next;});markDirty();renderFolders();renderImages();});
    row.append(input,button('↑',()=>{reorder(site.folders,i,-1);renderFolders();}),button('↓',()=>{reorder(site.folders,i,1);renderFolders();}),button('Remove',()=>{if(site.images.some(image=>image.cat===name))return status('Move this folder’s images to another folder first.',true);if(!confirm('Delete the folder “'+name+'”? This can’t be undone.'))return;site.folders.splice(i,1);markDirty();renderFolders();},'danger'));
    row.querySelectorAll('button')[0].setAttribute('aria-label','Move '+name+' up');row.querySelectorAll('button')[1].setAttribute('aria-label','Move '+name+' down');root.append(row);
  });
}
function renderImages(){
  const root=$('#images');root.replaceChildren();
  if(!site.images.length)root.append(el('p','Add your first image to start the stack.','empty'));
  site.images.forEach((image,i)=>{
    const row=el('article',undefined,'image-row'),img=el('img');img.src=image.src||'/images/'+image.slug+'-480.webp';img.alt=image.title;img.loading='lazy';
    const fields=el('div',undefined,'fields');fields.append(field('Title',image.title,value=>image.title=value));
    const description=el('label','Description'),area=el('textarea');area.value=image.description||'';area.maxLength=4000;area.addEventListener('change',()=>{image.description=area.value;markDirty();});description.append(area);fields.append(description);
    fields.append(field('Technologies (comma separated)',(image.technologies||[]).join(', '),value=>image.technologies=value.split(',').map(v=>v.trim()).filter(Boolean)),field('Project URL',image.link||'',value=>image.link=value));
    const label=el('label','Folder'),select=el('select');site.folders.forEach(name=>{const option=el('option',name);option.value=name;select.append(option);});select.value=image.cat;select.addEventListener('change',()=>{image.cat=select.value;markDirty();});label.append(select);fields.append(label);
    const replace=el('label','Replace image'),file=el('input');file.type='file';file.accept='image/png,image/jpeg,image/webp';file.addEventListener('change',async()=>{if(!file.files[0])return;file.disabled=true;try{const result=await uploadFile(file.files[0]);image.src=result.src;markDirty();renderImages();status('Image replaced in draft. Save portfolio to publish.');}catch(error){status(error.message,true);}finally{file.disabled=false;}});replace.append(file);fields.append(replace);
    const downloadRow=el('label','','row'),downloadBox=el('input');downloadBox.type='checkbox';downloadBox.checked=image.downloadable!==false;downloadBox.addEventListener('change',()=>{image.downloadable=downloadBox.checked;markDirty();});downloadRow.append(downloadBox,document.createTextNode('Visitors can download this image'));fields.append(downloadRow);
    const actions=el('div',undefined,'actions');actions.append(button('Move up',()=>{reorder(site.images,i,-1);renderImages();}),button('Move down',()=>{reorder(site.images,i,1);renderImages();}),button('Remove',()=>{if(!confirm('Remove “'+(image.title||'this image')+'” from the portfolio? This can’t be undone.'))return;site.images.splice(i,1);markDirty();renderImages();},'danger'));row.append(img,fields,actions);root.append(row);
  });
}
$('#login').addEventListener('submit',async event=>{event.preventDefault();const b=event.submitter;b.disabled=true;try{const result=await api('/creator/login',{method:'POST',body:JSON.stringify({password:new FormData(event.target).get('password')})});csrf=result.csrf;event.target.reset();await loadStudio();status('Signed in.');}catch(error){status(error.message,true);}finally{b.disabled=false;}});
$('#logout').addEventListener('click',async()=>{try{await api('/creator/logout',{method:'POST'});dirty=false;showLogin();status('Signed out.');}catch(error){status(error.message,true);}});
document.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('.view').forEach(view=>view.hidden=view.id!==button.dataset.tab);document.querySelectorAll('[data-tab]').forEach(b=>{if(b===button)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});}));
$('#message-filter').addEventListener('change',renderInbox);
$('#refresh').addEventListener('click',async()=>{try{messages=await api('/creator/messages');renderInbox();status('Inbox updated.');}catch(error){status(error.message,true);}});
$('#details').addEventListener('input',markDirty);$('#details').addEventListener('submit',e=>e.preventDefault());
$('#add-folder').addEventListener('submit',event=>{event.preventDefault();const name=event.target.elements.name.value.trim();if(!name||site.folders.includes(name))return status('Choose a unique folder name.',true);site.folders.push(name);event.target.reset();markDirty();renderFolders();});
$('#upload').addEventListener('change',async event=>{
  if(!site.folders.length){event.target.value='';return status('Add a folder first.',true);}
  event.target.disabled=true;$('#save').disabled=true;
  try{for(const file of event.target.files){
    if(file.size>12*1024*1024)throw new Error('Choose images smaller than 12 MB.');
    if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('Choose PNG, JPEG, or WebP images.');
    status('Uploading '+file.name+'…');const image=await api('/creator/upload',{method:'POST',body:file,headers:{'Content-Type':file.type}});
    site.images.push({slug:'work-'+crypto.randomUUID(),title:file.name.replace(/\.[^.]+$/,'').slice(0,160),cat:site.folders[0],src:image.src,widths:[],full:0,description:'',technologies:[],link:''});markDirty();renderImages();
  }status('Images added to draft. Save portfolio to publish.');}catch(error){status(error.message,true);}finally{event.target.disabled=false;$('#save').disabled=false;event.target.value='';}
});
$('#save').addEventListener('click',async()=>{
  if(!$('#details').checkValidity()){document.querySelector('[data-tab="content"]').click();$('#details').reportValidity();return;}const b=$('#save');b.disabled=true;
  try{site.details=Object.assign({},site.details,Object.fromEntries(new FormData($('#details'))));site=await api('/creator/portfolio',{method:'PUT',body:JSON.stringify(site)});dirty=false;b.textContent='Publish changes';status('Published. Your public page now uses these changes.');}
  catch(error){status(error.message,true);}finally{b.disabled=false;}
});
$('#password').addEventListener('submit',async event=>{event.preventDefault();try{await api('/creator/password',{method:'PUT',body:JSON.stringify({password:new FormData(event.target).get('password')})});event.target.reset();showLogin();status('Password changed. Sign in with your new password.');}catch(error){status(error.message,true);}});
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
(async()=>{try{const session=await api('/creator/session');csrf=session.csrf;await loadStudio();}catch(error){if(error.message!=='Please sign in.')status(error.message,true);}})();
async function uploadFile(file){if(file.size>12*1024*1024)throw new Error('Choose images smaller than 12 MB.');if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('Choose PNG, JPEG, or WebP images.');return api('/creator/upload',{method:'POST',body:file,headers:{'Content-Type':file.type}});}
async function renderAssets(){
  const assets=await api('/creator/assets'),root=$('#assets');root.replaceChildren();
  if(!assets.length)root.append(el('p','No uploaded images yet. Original project images remain in the collection.','empty'));
  assets.forEach(asset=>{const row=el('div',undefined,'image-row'),image=el('img');image.src=asset.src;image.alt='Uploaded artwork';image.loading='lazy';const link=el('a','Preview full image ↗');link.href=asset.src;link.target='_blank';link.rel='noopener';const info=el('div');info.append(el('p',Math.round(asset.bytes/1024)+' KB · '+(asset.used?'Used in portfolio':'Unused')),link);const remove=button('Delete unused',async()=>{await api('/creator/assets/'+asset.src.split('/').pop(),{method:'DELETE'});await renderAssets();status('Unused image deleted.');});remove.disabled=asset.used;row.append(image,info,remove);root.append(row);});
}
$('#refresh-assets').addEventListener('click',()=>renderAssets().catch(error=>status(error.message,true)));
document.querySelector('[data-tab="asset-view"]').addEventListener('click',()=>renderAssets().catch(error=>status(error.message,true)));
$('#refresh-visitors').addEventListener('click',()=>renderVisitors().catch(error=>status(error.message,true)));
document.querySelector('[data-tab="visitors"]').addEventListener('click',()=>renderVisitors().catch(error=>status(error.message,true)));
$('#library-upload').addEventListener('change',async event=>{event.target.disabled=true;try{for(const file of event.target.files)await uploadFile(file);await renderAssets();status('Images saved to the library.');}catch(error){status(error.message,true);}finally{event.target.disabled=false;event.target.value='';}});
$('#add-project').addEventListener('click',async()=>{
  if(!site.folders.length)return status('Create a folder first.',true);
  try{const assets=await api('/creator/assets');const original=site.images[0];const src=assets[0]?.src||original?.src||(original?'/images/'+original.slug+'-'+(original.widths.includes(1080)?1080:480)+'.webp':null);if(!src)return status('Upload an image to the library first.',true);site.images.push({slug:'work-'+crypto.randomUUID(),title:'Untitled project',cat:site.folders[0],src,widths:[],full:0,description:'',technologies:[],link:''});markDirty();renderImages();status('Project added to draft. Edit its details and save.');}catch(error){status(error.message,true);}
});
