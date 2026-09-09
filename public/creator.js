'use strict';
const $=s=>document.querySelector(s);
let csrf='',site=null,messages=[],dirty=false;
const status=(message,error=false)=>{$('#status').textContent=message;$('#status').dataset.error=String(error);};
async function api(path,options={}){
  const response=await fetch('/api'+path,{...options,headers:{...(options.body instanceof File?{}:{'Content-Type':'application/json'}),'X-CSRF-Token':csrf,...options.headers}});
  const body=await response.json();if(!response.ok) {if(response.status===401)showLogin();throw new Error(body.error||'Unable to complete this request.');}return body;
}
function el(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
function button(label,action,cls){const b=el('button',label,cls);b.type='button';b.addEventListener('click',()=>Promise.resolve().then(action).catch(e=>status(e.message,true)));return b;}
function markDirty(){dirty=true;$('#save').textContent='Save changes';}
function showLogin(){csrf='';$('#studio').hidden=true;$('#login-view').hidden=false;}
function field(label,value,onChange){const wrap=el('label',label),input=el('input');input.value=value;input.maxLength=label==='Project URL'?2000:label.startsWith('Technologies')?1200:160;input.addEventListener('change',()=>{onChange(input.value.trim());markDirty();});wrap.append(input);return wrap;}
async function loadStudio(){
  [site,messages]=await Promise.all([api('/portfolio'),api('/creator/messages')]);dirty=false;
  $('#login-view').hidden=true;$('#studio').hidden=false;
  for(const input of $('#details').elements) if(input.name)input.value=site.details[input.name]||'';
  renderInbox();renderFolders();renderImages();
  const overview=$('#overview');overview.replaceChildren();for(const [label,count] of [['Projects',site.images.length],['Folders',site.folders.length],['New messages',messages.filter(m=>m.status==='new').length]]){const card=el('div',undefined,'panel');card.append(el('h2',String(count)),el('p',label));overview.append(card);}
}
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
    row.append(input,button('↑',()=>{reorder(site.folders,i,-1);renderFolders();}),button('↓',()=>{reorder(site.folders,i,1);renderFolders();}),button('Remove',()=>{if(site.images.some(image=>image.cat===name))return status('Move this folder’s images to another folder first.',true);site.folders.splice(i,1);markDirty();renderFolders();}));
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
    const actions=el('div',undefined,'actions');actions.append(button('Move up',()=>{reorder(site.images,i,-1);renderImages();}),button('Move down',()=>{reorder(site.images,i,1);renderImages();}),button('Remove',()=>{site.images.splice(i,1);markDirty();renderImages();}));row.append(img,fields,actions);root.append(row);
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
  try{site.details=Object.fromEntries(new FormData($('#details')));site=await api('/creator/portfolio',{method:'PUT',body:JSON.stringify(site)});dirty=false;b.textContent='Save portfolio';status('Portfolio saved. Your public page will use these changes.');}
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
$('#library-upload').addEventListener('change',async event=>{event.target.disabled=true;try{for(const file of event.target.files)await uploadFile(file);await renderAssets();status('Images saved to the library.');}catch(error){status(error.message,true);}finally{event.target.disabled=false;event.target.value='';}});
$('#add-project').addEventListener('click',async()=>{
  if(!site.folders.length)return status('Create a folder first.',true);
  try{const assets=await api('/creator/assets');const original=site.images[0];const src=assets[0]?.src||original?.src||(original?'/images/'+original.slug+'-'+(original.widths.includes(1080)?1080:480)+'.webp':null);if(!src)return status('Upload an image to the library first.',true);site.images.push({slug:'work-'+crypto.randomUUID(),title:'Untitled project',cat:site.folders[0],src,widths:[],full:0,description:'',technologies:[],link:''});markDirty();renderImages();status('Project added to draft. Edit its details and save.');}catch(error){status(error.message,true);}
});
