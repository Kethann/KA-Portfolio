'use strict';
const $=s=>document.querySelector(s);
let csrf='',site=null,messages=[],dirty=false;
// Mirrors server/creator.js's FONT_CHOICES exactly -- kept in sync by hand since this file is a
// plain script (no bundler/shared-module step) rather than pulled in dynamically, matching how
// every other constant in this small admin UI is already duplicated rather than imported.
const FONT_CHOICES=['Manrope','Poppins','Playfair Display','Space Grotesk','system-ui'];
// [fix] this never actually auto-dismissed -- it only ever set text/error state, nothing anywhere
// cleared either back out, so the last message (e.g. "Signed in.") just sat there permanently.
// Error messages stay put (the admin needs to actually read and act on those); success/info
// messages clear themselves after a few seconds like a normal toast.
let statusTimer=null;
const status=(message,error=false)=>{
  clearTimeout(statusTimer);
  const el=$('#status');el.textContent=message;el.dataset.error=String(error);
  if(!error&&message)statusTimer=setTimeout(()=>{el.textContent='';el.dataset.error='false';},3500);
};
async function api(path,options={}){
  let response;
  try{
    response=await fetch('/api'+path,{...options,headers:{...(options.body instanceof File?{}:{'Content-Type':'application/json'}),'X-CSRF-Token':csrf,...options.headers}});
  }catch(networkError){
    // fetch() itself rejects (as "Failed to fetch") for a genuine network-level failure --
    // server unreachable/restarted/crashed, not any particular field the admin edited. Surfacing
    // that distinction here (rather than the raw browser message) makes it obvious this isn't a
    // validation error to fix in the form.
    throw new Error('Could not reach the server. Check that it is running, then try again.');
  }
  let body;try{body=await response.json();}catch{throw new Error('The server returned an unexpected response. Open the studio from the main application server and retry.');}if(!response.ok) {if(response.status===401)showLogin();throw new Error(body.error||'Unable to complete this request.');}return body;
}
function el(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
function button(label,action,cls){const b=el('button',label,cls);b.type='button';b.addEventListener('click',()=>Promise.resolve().then(action).catch(e=>status(e.message,true)));return b;}
let draftVersion=0;
function markDirty(){dirty=true;draftVersion++;$('#save').textContent='Publish changes';syncPreview();}
function showLogin(){csrf='';$('#studio').hidden=true;$('#login-view').hidden=false;}
function field(label,value,onChange){const wrap=el('label',label),input=el('input');input.value=value;input.maxLength=label==='Project URL'?2000:label.startsWith('Technologies')?1200:160;input.addEventListener('change',()=>{onChange(input.value.trim());markDirty();});wrap.append(input);return wrap;}
async function loadStudio(){
  [site,messages]=await Promise.all([api('/portfolio'),api('/creator/messages')]);dirty=false;
  $('#login-view').hidden=true;$('#studio').hidden=false;
  for(const input of $('#details').elements) if(input.name)input.value=site.details[input.name]||'';
  site.notice=site.notice||{enabled:false,text:'',tone:'info'};
  site.visibility=site.visibility||{navGallery:true,navAbout:true};
  site.stacks=site.stacks||{loop:true,covers:{}};site.stacks.covers=site.stacks.covers||{};
  site.layoutOverrides=site.layoutOverrides||{mobile:{},tablet:{},desktop:{}};
  site.details.customFonts=site.details.customFonts||[];
  if(site.details.glassBlur===undefined)site.details.glassBlur=18;
  site.branding=site.branding||{enabled:false,logoUrl:''};
  site.elementStyles=site.elementStyles||{};
  renderTypography();renderNoticeForm();renderVisibilityForm();renderLayoutPanel();renderBranding();
  renderInbox();renderFolders();renderImages(); // renderInbox() already calls renderOverview() itself
  setupPreview();syncPreview();
}
// Centered above the live-preview panel (Part C) rather than the old cramped sidebar cluster --
// see #overview's new position in creator.html, right before .preview-toolbar. The "New messages"
// card doubles as a Messages entry point (Part E), same modal the dock icon opens.
function renderOverview(){
  const overview=$('#overview');overview.replaceChildren();
  for(const [label,count,onClick] of [
    ['Projects',site.images.length,null],
    ['Folders',site.folders.length,null],
    ['New messages',messages.filter(m=>m.status==='new').length,openMessagesModal],
  ]){
    const card=el(onClick?'button':'div',undefined,'panel');
    if(onClick){card.type='button';card.addEventListener('click',onClick);}
    card.append(el('h2',String(count)),el('p',label));
    overview.append(card);
  }
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
    if(msg.type==='ka-preview-ready'){previewReady=true;syncPreview();postToPreview({type:'ka-preview-edit-mode',enabled:$('#edit-layout-toggle').checked});}
    else if(msg.type==='ka-preview-selected'){$('#preview-selection').textContent='Editing: '+msg.id;openPropertyPanel(msg);}
    else if(msg.type==='ka-preview-moved'){
      site.layoutOverrides[msg.breakpoint]=site.layoutOverrides[msg.breakpoint]||{};
      site.layoutOverrides[msg.breakpoint][msg.id]={x:Math.round(msg.x),y:Math.round(msg.y),scale:Math.round((msg.scale||1)*100)/100};
      $('#preview-selection').textContent=msg.id+' — '+Math.round((msg.scale||1)*100)+'% ('+msg.breakpoint+')';
      markDirty();
    }
  });
  $('#device-preset').addEventListener('change',applyDevicePreset);
  $('#apply-custom').addEventListener('click',()=>{
    const w=Number($('#custom-w').value),h=Number($('#custom-h').value);
    if(Number.isFinite(w)&&Number.isFinite(h)&&w>=240&&h>=240&&w<=3840&&h<=3840)setPreviewSize(w,h);
    else status('Choose a width and height between 240 and 3840 pixels.',true);
  });
  $('#edit-layout-toggle').addEventListener('change',e=>{
    $('#preview-selection').textContent=e.target.checked?'Click an element to select it, drag to move, drag its corner dot to resize.':'';
    postToPreview({type:'ka-preview-edit-mode',enabled:e.target.checked});
  });
  applyDevicePreset();
  setupSplitDivider();
}
// Draggable split-screen divider (Part A.1's "resizable/toggleable" controls panel) -- persisted
// to localStorage so the admin's chosen split survives a reload, purely a per-browser UI
// preference (not portfolio content), so it never goes through the publish/save mechanism.
function setupSplitDivider(){
  const divider=$('#split-divider'),split=$('#split');
  if(divider.dataset.wired)return;
  divider.dataset.wired='1';
  const MIN=280,MAX_FRACTION=0.7; // never let the preview pane get crushed to nothing
  const saved=Number(localStorage.getItem('ka-controls-width'));
  if(saved>=MIN)split.style.setProperty('--controls-w',saved+'px');
  function setWidth(px){
    const max=Math.round(split.getBoundingClientRect().width*MAX_FRACTION);
    const clamped=Math.max(MIN,Math.min(max,Math.round(px)));
    split.style.setProperty('--controls-w',clamped+'px');
    localStorage.setItem('ka-controls-width',String(clamped));
  }
  function startDrag(startX,startWidth){
    split.classList.add('dragging');divider.classList.add('dragging');
    function onMove(x){setWidth(startWidth+(x-startX));}
    function onPointerMove(e){onMove(e.clientX);}
    function onPointerUp(){
      window.removeEventListener('pointermove',onPointerMove);
      window.removeEventListener('pointerup',onPointerUp);
      split.classList.remove('dragging');divider.classList.remove('dragging');
    }
    window.addEventListener('pointermove',onPointerMove);
    window.addEventListener('pointerup',onPointerUp);
  }
  divider.addEventListener('pointerdown',e=>{
    e.preventDefault();
    startDrag(e.clientX,$('#controls-pane').getBoundingClientRect().width);
  });
  // Keyboard equivalent (the divider is a focusable role="separator") -- left/right nudge by 24px.
  divider.addEventListener('keydown',e=>{
    const width=$('#controls-pane').getBoundingClientRect().width;
    if(e.key==='ArrowLeft'){setWidth(width-24);e.preventDefault();}
    else if(e.key==='ArrowRight'){setWidth(width+24);e.preventDefault();}
  });
}
// Floating property panel -- appears BESIDE the preview (not by switching tabs) whenever an
// element is selected there (see index.html's kaPreviewPointerDown, which now sends
// editableField/text alongside every selection, draggable or not). Text edits here write straight
// into site.details and reuse the exact same markDirty()->syncPreview() path every other field
// already goes through, so the preview, the #details form, and this panel never drift out of sync.
const ELEMENT_NAMES={'assistant-launcher':'Chat launcher','site-notice':'Notice banner','portfolio-title':'Portfolio heading','portfolio-intro':'Portfolio intro text','contact-title':'Contact heading','contact-intro':'Contact intro text'};
function openPropertyPanel(sel){
  const body=$('#property-panel-body');body.replaceChildren();
  body.append(el('h2',ELEMENT_NAMES[sel.id]||sel.id));
  if(sel.editableField){
    const label=el('label','Text');
    const input=(sel.text||'').length>70?el('textarea'):el('input');
    input.value=sel.text||'';
    input.addEventListener('input',()=>{
      site.details[sel.editableField]=input.value;
      const formInput=$('#details').elements[sel.editableField];
      if(formInput)formInput.value=input.value;
      markDirty();
    });
    label.append(input);body.append(label);
    body.append(el('p','Drag this text (once selected) to reposition it, or drag its corner dot to resize.','empty'));
  }else{
    body.append(el('p','Drag to reposition. Drag the corner dot to resize.','empty'));
  }
  const style=site.elementStyles[sel.id]||{};
  const fontLabel=el('label','Font'),fontSelect=el('select');
  fontSelect.append(el('option','Site default'));fontSelect.firstChild.value='';
  for(const font of FONT_CHOICES){const opt=el('option',font);opt.value=font;fontSelect.append(opt);}
  site.details.customFonts.forEach(font=>{const opt=el('option',font.family);opt.value=font.family;fontSelect.append(opt);});
  fontSelect.value=style.font||'';
  fontSelect.addEventListener('change',()=>{
    site.elementStyles[sel.id]=site.elementStyles[sel.id]||{};
    if(fontSelect.value)site.elementStyles[sel.id].font=fontSelect.value;else delete site.elementStyles[sel.id].font;
    if(!Object.keys(site.elementStyles[sel.id]).length)delete site.elementStyles[sel.id];
    markDirty();
  });
  fontLabel.append(fontSelect);body.append(fontLabel);
  const colorLabel=el('label','Color'),colorRow=el('div',undefined,'row');
  const colorInput=el('input');colorInput.type='color';colorInput.value=style.color||'#eeeeee';
  const colorClear=button('Default',()=>{
    if(site.elementStyles[sel.id])delete site.elementStyles[sel.id].color;
    if(site.elementStyles[sel.id]&&!Object.keys(site.elementStyles[sel.id]).length)delete site.elementStyles[sel.id];
    colorInput.value='#eeeeee';markDirty();
  });
  colorInput.addEventListener('input',()=>{
    site.elementStyles[sel.id]=site.elementStyles[sel.id]||{};
    site.elementStyles[sel.id].color=colorInput.value;
    markDirty();
  });
  colorRow.append(colorInput,colorClear);colorLabel.append(colorRow);body.append(colorLabel);
  body.append(button('Reset position',()=>{
    LAYOUT_BREAKPOINTS.forEach(bp=>{if(site.layoutOverrides[bp])delete site.layoutOverrides[bp][sel.id];});
    markDirty();
    postToPreview({type:'ka-preview-reset-position',id:sel.id});
  }));
  $('#property-panel').classList.add('open');
}
$('#property-panel-close').addEventListener('click',()=>$('#property-panel').classList.remove('open'));
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
  const scale=Math.max(0.05,Math.min(1,availW/w,availH/h));
  frame.style.transform=scale<1?'scale('+scale+')':'none';
}
window.addEventListener('resize',()=>{if($('#device-preset').value!=='responsive')applyDevicePreset();});
function renderTypography(){
  const form=$('#typography');
  for(const name of ['headingFont','bodyFont']){
    const select=form.elements[name];const previous=select.value||site.details[name];select.replaceChildren();
    for(const font of FONT_CHOICES){const opt=el('option',font);opt.value=font;select.append(opt);}
    if(site.details.customFonts.length){
      const group=document.createElement('optgroup');group.label='Uploaded fonts';
      site.details.customFonts.forEach(font=>{const opt=el('option',font.family);opt.value=font.family;group.append(opt);});
      select.append(group);
    }
    select.value=site.details[name]||'Manrope';
    select.onchange=()=>{site.details[name]=select.value;markDirty();};
  }
  form.elements.textScale.value=site.details.textScale||1;
  form.elements.textScale.onchange=()=>{site.details.textScale=Number(form.elements.textScale.value);markDirty();};
  form.elements.glassBlur.value=site.details.glassBlur??18;
  form.elements.glassBlur.oninput=()=>{site.details.glassBlur=Number(form.elements.glassBlur.value);markDirty();};
  renderCustomFonts();
}
function renderCustomFonts(){
  const root=$('#custom-fonts');if(!root)return;root.replaceChildren();
  if(!site.details.customFonts.length)root.append(el('p','No uploaded fonts yet.','empty'));
  site.details.customFonts.forEach((font,i)=>{
    const row=el('div',undefined,'folder-row');
    row.append(el('span',font.family));
    row.append(button('Remove',()=>{
      const wasSelected=name=>site.details[name]===font.family;
      site.details.customFonts.splice(i,1);
      if(wasSelected('headingFont'))site.details.headingFont='Manrope';
      if(wasSelected('bodyFont'))site.details.bodyFont='Manrope';
      for(const style of Object.values(site.elementStyles))if(style.font===font.family)delete style.font;
      markDirty();renderTypography();
    },'danger'));
    root.append(row);
  });
}
$('#custom-font-upload').addEventListener('change',async event=>{
  const file=event.target.files[0];const nameInput=$('#custom-font-name');
  if(!file)return;
  const family=nameInput.value.trim();
  if(!family||!/^[A-Za-z0-9 _-]+$/.test(family)){event.target.value='';return status('Name the font first (letters, numbers, spaces, - and _ only).',true);}
  if(site.details.customFonts.some(f=>f.family===family)){event.target.value='';return status('A font with that name already exists.',true);}
  event.target.disabled=true;
  try{
    const result=await api('/creator/font-upload',{method:'POST',body:file,headers:{'Content-Type':file.type||'application/octet-stream'}});
    site.details.customFonts.push({family,url:result.src});
    nameInput.value='';markDirty();renderTypography();
    status('Font added to draft. Save to publish.');
  }catch(error){status(error.message,true);}
  finally{event.target.disabled=false;event.target.value='';}
});
function renderBranding(){
  const form=$('#branding-form');
  form.elements.enabled.checked=!!site.branding.enabled;
  form.elements.enabled.onchange=()=>{site.branding.enabled=form.elements.enabled.checked;markDirty();applyStudioLogo();};
  applyStudioLogo();
}
function applyStudioLogo(){
  const img=$('#studio-logo');
  if(site.branding.enabled&&site.branding.logoUrl){img.src=site.branding.logoUrl;img.hidden=false;}
  else img.hidden=true;
}
$('#branding-logo-upload').addEventListener('change',async event=>{
  const file=event.target.files[0];if(!file)return;
  event.target.disabled=true;
  try{
    const result=await uploadFile(file);
    site.branding.logoUrl=result.src;markDirty();renderBranding();
    status('Logo added to draft. Save to publish.');
  }catch(error){status(error.message,true);}
  finally{event.target.disabled=false;event.target.value='';}
});
function renderNoticeForm(){
  const form=$('#notice-form');
  form.elements.enabled.checked=!!site.notice.enabled;
  form.elements.text.value=site.notice.text||'';
  form.elements.tone.value=site.notice.tone||'info';
  form.elements.enabled.onchange=()=>{site.notice.enabled=form.elements.enabled.checked;markDirty();};
  form.elements.text.oninput=()=>{site.notice.text=form.elements.text.value;markDirty();};
  form.elements.tone.onchange=()=>{site.notice.tone=form.elements.tone.value;markDirty();};
}
// Mirrors server/creator.js's DRAGGABLE_IDS exactly (same duplicated-constant convention as
// FONT_CHOICES above -- this file has no shared-module step with the server).
const LAYOUT_DRAGGABLE_IDS=[{id:'assistant-launcher',label:'Chat launcher'},{id:'site-notice',label:'Notice banner'}];
const LAYOUT_BREAKPOINTS=['mobile','tablet','desktop'];
function renderLayoutPanel(){
  const root=$('#layout-items');root.replaceChildren();
  LAYOUT_DRAGGABLE_IDS.forEach(({id,label})=>{
    const item=el('div',undefined,'layout-item');
    item.append(el('h3',label));
    const header=el('div',undefined,'layout-item-row');
    header.append(el('span',''),el('span','X'),el('span','Y'),el('span','Scale'));
    item.append(header);
    LAYOUT_BREAKPOINTS.forEach(bp=>{
      site.layoutOverrides[bp]=site.layoutOverrides[bp]||{};
      const pos=site.layoutOverrides[bp][id]||{x:0,y:0,scale:1};
      const row=el('div',undefined,'layout-item-row');
      const bpLabel=el('span',bp[0].toUpperCase()+bp.slice(1));
      const xInput=el('input');xInput.type='number';xInput.value=pos.x;
      const yInput=el('input');yInput.type='number';yInput.value=pos.y;
      const scaleInput=el('input');scaleInput.type='number';scaleInput.step='0.1';scaleInput.min='0.5';scaleInput.max='2.5';scaleInput.value=pos.scale;
      function commit(){
        const x=Number(xInput.value)||0,y=Number(yInput.value)||0,scale=Math.min(2.5,Math.max(0.5,Number(scaleInput.value)||1));
        site.layoutOverrides[bp][id]={x,y,scale};markDirty();
      }
      xInput.addEventListener('change',commit);yInput.addEventListener('change',commit);scaleInput.addEventListener('change',commit);
      row.append(bpLabel,xInput,yInput,scaleInput);item.append(row);
    });
    root.append(item);
  });
}
function renderVisibilityForm(){
  const form=$('#visibility-form');
  site.stacks=site.stacks||{loop:true,covers:{}};
  form.elements.coverflowLoop.checked=site.stacks.loop!==false;
  form.elements.navAbout.checked=site.visibility.navAbout!==false;
  form.elements.coverflowLoop.onchange=()=>{site.stacks.loop=form.elements.coverflowLoop.checked;markDirty();};
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
// Messages now live as a compact scannable row list, with the full message opening in a slide-in
// side drawer instead (openMessageDrawer) -- easier to scan a long inbox at a glance than the
// previous full-width expanding-card list.
let openMessageId=null;
function renderInbox(){
  const root=$('#messages');root.replaceChildren();$('#unread').textContent=messages.filter(m=>m.status==='new').length||'';
  if(site)renderOverview();
  const shown=messages.filter(m=>$('#message-filter').value==='all'||m.status===$('#message-filter').value);
  if(!shown.length)root.append(el('p','No messages here yet. New contact submissions will appear here.','empty'));
  for(const message of shown){
    const row=el('button',undefined,'message-row');row.type='button';row.dataset.status=message.status;
    if(message.id===openMessageId)row.classList.add('is-open');
    row.append(el('span',message.subject,'message-row-subject'),el('span',message.name+' · '+new Date(message.createdAt).toLocaleDateString(),'message-row-byline'));
    row.addEventListener('click',()=>openMessageDrawer(message));
    root.append(row);
  }
  if(openMessageId&&!messages.some(m=>m.id===openMessageId))closeMessageDrawer();
}
function openMessageDrawer(message){
  openMessageId=message.id;
  const drawer=$('#message-drawer');
  drawer.replaceChildren();
  drawer.append(el('h2',message.subject));
  drawer.append(el('p',`${message.name} · ${message.email} · ${new Date(message.createdAt).toLocaleString()} · ${message.status}`,'byline'));
  drawer.append(el('p',message.message,'body'));
  const actions=el('div',undefined,'actions'),reply=el('a','Reply by email ↗');reply.href='mailto:'+encodeURIComponent(message.email)+'?subject='+encodeURIComponent('Re: '+message.subject);actions.append(reply);
  for(const [label,value] of [['Mark read','read'],['Archive','archived'],['Mark new','new']]){
    if(message.status!==value)actions.append(button(label,async()=>{await api('/creator/messages/'+message.id,{method:'PATCH',body:JSON.stringify({status:value})});message.status=value;renderInbox();openMessageDrawer(message);}));
  }
  actions.append(button('Delete',async()=>{if(!confirm('Permanently delete this message?'))return;await api('/creator/messages/'+message.id,{method:'DELETE'});messages=messages.filter(m=>m!==message);closeMessageDrawer();renderInbox();},'danger'));
  drawer.append(actions);
  $('#message-drawer-wrap').classList.add('open');
  $('#message-drawer-close').focus();
  renderInbox();
}
function closeMessageDrawer(){
  openMessageId=null;
  $('#message-drawer-wrap').classList.remove('open');
  if($('#messages-modal-wrap').classList.contains('open'))$('#messages-modal-close').focus();
}
$('#message-drawer-close').addEventListener('click',closeMessageDrawer);
$('#message-drawer-backdrop').addEventListener('click',closeMessageDrawer);
// Messages as a popup (Part E): opened from the dock's Messages icon or the "New messages" stat
// card, never navigated to inline -- doesn't touch #split/.view state at all, so whatever tab was
// showing underneath is exactly what's still showing once this closes. The per-message detail
// still uses the existing slide-in drawer (openMessageDrawer above), which layers on top fine
// (higher z-index -- see creator.css) since both are independent fixed overlays.
let messagesReturnFocus=null;
function openMessagesModal(){
  messagesReturnFocus=document.activeElement;
  renderInbox();
  $('#messages-modal-wrap').classList.add('open');
  $('#messages-modal-close').focus();
  document.addEventListener('keydown',onMessagesModalKeydown);
}
function closeMessagesModal(){
  $('#messages-modal-wrap').classList.remove('open');
  closeMessageDrawer();
  document.removeEventListener('keydown',onMessagesModalKeydown);
  messagesReturnFocus?.focus();
}
function onMessagesModalKeydown(e){
  if(e.key==='Escape'){e.preventDefault();if($('#message-drawer-wrap').classList.contains('open'))closeMessageDrawer();else closeMessagesModal();}
  if(e.key==='Tab'){
    const panel=$('#message-drawer-wrap').classList.contains('open')?$('#message-drawer-panel'):$('#messages-modal');
    const focusable=[...panel.querySelectorAll('button:not(:disabled),a[href],input,select,textarea,[tabindex="0"]')];
    const first=focusable[0],last=focusable.at(-1);
    if(e.shiftKey&&(document.activeElement===first||!panel.contains(document.activeElement))){e.preventDefault();last?.focus();}
    else if(!e.shiftKey&&(document.activeElement===last||!panel.contains(document.activeElement))){e.preventDefault();first?.focus();}
  }
}
$('#messages-modal-close').addEventListener('click',closeMessagesModal);
$('#messages-modal-backdrop').addEventListener('click',closeMessagesModal);
document.querySelector('[data-action="messages"]').addEventListener('click',openMessagesModal);
function reorder(array,index,delta){const target=index+delta;if(target<0||target>=array.length)return;[array[index],array[target]]=[array[target],array[index]];markDirty();}
function renderFolders(){
  const root=$('#folders');root.replaceChildren();
  site.folders.forEach((name,i)=>{
    const row=el('div',undefined,'folder-row'),input=el('input');input.value=name;input.maxLength=70;input.setAttribute('aria-label','Folder name');
    input.addEventListener('change',()=>{const next=input.value.trim();if(!next||site.folders.some((f,j)=>j!==i&&f===next)){input.value=name;return status('Use a unique, nonempty folder name.',true);}site.folders[i]=next;site.images.forEach(image=>{if(image.cat===name)image.cat=next;});site.stacks.covers=site.stacks.covers||{};if(site.stacks.covers[name]){site.stacks.covers[next]=site.stacks.covers[name];delete site.stacks.covers[name];}markDirty();renderFolders();renderImages();});
    row.append(input,button('↑',()=>{reorder(site.folders,i,-1);renderFolders();}),button('↓',()=>{reorder(site.folders,i,1);renderFolders();}),button('Remove',()=>{const inside=site.images.filter(image=>image.cat===name).length;if(!confirm(inside?'Delete the stack “'+name+'” and its '+inside+' image'+(inside===1?'':'s')+'? This can’t be undone.':'Delete the stack “'+name+'”? This can’t be undone.'))return;if(inside)site.images=site.images.filter(image=>image.cat!==name);delete (site.stacks.covers||{})[name];site.folders.splice(i,1);markDirty();renderFolders();renderImages();},'danger'));
    row.querySelectorAll('button')[0].setAttribute('aria-label','Move '+name+' up');row.querySelectorAll('button')[1].setAttribute('aria-label','Move '+name+' down');
    const coverLabel=el('label','Stack cover'),cover=el('select');cover.setAttribute('aria-label','Cover image for '+name);
    const first=el('option','First image (default)');first.value='';cover.append(first);
    site.images.filter(image=>image.cat===name).forEach(image=>{const o=el('option',image.title||image.slug);o.value=image.slug;cover.append(o);});
    cover.value=(site.stacks.covers||{})[name]&&site.images.some(image=>image.slug===site.stacks.covers[name]&&image.cat===name)?site.stacks.covers[name]:'';
    cover.addEventListener('change',()=>{site.stacks.covers=site.stacks.covers||{};if(cover.value)site.stacks.covers[name]=cover.value;else delete site.stacks.covers[name];markDirty();});
    coverLabel.append(cover);row.append(coverLabel);root.append(row);
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
    const label=el('label','Folder'),select=el('select');site.folders.forEach(name=>{const option=el('option',name);option.value=name;select.append(option);});select.value=image.cat;select.addEventListener('change',()=>{image.cat=select.value;markDirty();renderFolders();});label.append(select);fields.append(label);
    const replace=el('label','Replace image'),file=el('input');file.type='file';file.accept='image/png,image/jpeg,image/webp';file.addEventListener('change',async()=>{if(!file.files[0])return;file.disabled=true;try{const result=await uploadFile(file.files[0]);image.src=result.src;markDirty();renderImages();status('Image replaced in draft. Save portfolio to publish.');}catch(error){status(error.message,true);}finally{file.disabled=false;}});replace.append(file);fields.append(replace);
    const downloadRow=el('label','','row'),downloadBox=el('input');downloadBox.type='checkbox';downloadBox.checked=image.downloadable!==false;downloadBox.addEventListener('change',()=>{image.downloadable=downloadBox.checked;markDirty();});downloadRow.append(downloadBox,document.createTextNode('Visitors can download this image'));fields.append(downloadRow);
    const actions=el('div',undefined,'actions');actions.append(button('Move up',()=>{reorder(site.images,i,-1);renderImages();}),button('Move down',()=>{reorder(site.images,i,1);renderImages();}),button('Remove',()=>{if(!confirm('Remove “'+(image.title||'this image')+'” from the portfolio? This can’t be undone.'))return;site.images.splice(i,1);markDirty();renderImages();},'danger'));row.append(img,fields,actions);root.append(row);
  });
}
// ==================================================================== STUDIO ASSISTANT ==
// One-level-deep merge: replaces arrays/scalars wholesale, shallow-merges plain-object fields
// (details/notice/visibility) so a patch that only touches e.g. notice.enabled doesn't have to
// also repeat the notice text. Never writes to the server itself -- only this in-memory draft,
// same as every other control on this page.
function applyPatch(patch){
  for(const [key,value] of Object.entries(patch)){
    const current=site[key];
    if(value&&typeof value==='object'&&!Array.isArray(value)&&current&&typeof current==='object'&&!Array.isArray(current)) site[key]=Object.assign({},current,value);
    else site[key]=value;
  }
  markDirty();
  for(const input of $('#details').elements) if(input.name)input.value=site.details[input.name]||'';
  renderTypography();renderNoticeForm();renderVisibilityForm();renderLayoutPanel();
  renderFolders();renderImages();
}
$('#assistant-form').addEventListener('submit',async event=>{
  event.preventDefault();
  const instruction=$('#assistant-instruction').value.trim();
  if(!instruction)return;
  const resultEl=$('#assistant-result');resultEl.replaceChildren(el('p','Thinking…'));
  const submitBtn=event.submitter;submitBtn.disabled=true;
  try{
    const {patch}=await api('/creator/assistant',{method:'POST',body:JSON.stringify({instruction,draft:site})});
    resultEl.replaceChildren();
    if(!patch||!Object.keys(patch).length){resultEl.append(el('p','No changes proposed -- try rephrasing.','empty'));return;}
    const panel=el('div',undefined,'panel');
    panel.append(el('h2','Proposed changes'));
    const pre=el('pre',JSON.stringify(patch,null,2));panel.append(pre);
    const apply=el('button','Apply to draft','primary');apply.type='button';
    apply.addEventListener('click',()=>{applyPatch(patch);resultEl.replaceChildren(el('p','Applied to your draft. Review it in the preview, then Publish changes when ready.'));});
    panel.append(apply);
    resultEl.append(panel);
  }catch(error){resultEl.replaceChildren(el('p',error.message,'empty'));}
  finally{submitBtn.disabled=false;}
});

$('#login').addEventListener('submit',async event=>{event.preventDefault();const b=event.submitter;b.disabled=true;try{const result=await api('/creator/login',{method:'POST',body:JSON.stringify({password:new FormData(event.target).get('password')})});csrf=result.csrf;event.target.reset();await loadStudio();status('Signed in.');}catch(error){status(error.message,true);}finally{b.disabled=false;}});
$('#logout').addEventListener('click',async()=>{try{await api('/creator/logout',{method:'POST'});dirty=false;showLogin();status('Signed out.');}catch(error){status(error.message,true);}});
document.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('.view').forEach(view=>view.hidden=view.id!==button.dataset.tab);document.querySelectorAll('[data-tab]').forEach(b=>{if(b===button)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});$('#split').classList.toggle('dashboard-mode',button.dataset.tab==='dashboard');}));
$('#split').classList.toggle('dashboard-mode',document.querySelector('[data-tab][aria-current]')?.dataset.tab==='dashboard');
$('#message-filter').addEventListener('change',renderInbox);
$('#refresh').addEventListener('click',async()=>{try{messages=await api('/creator/messages');renderInbox();status('Inbox updated.');}catch(error){status(error.message,true);}});
$('#details').addEventListener('input',()=>{Object.assign(site.details,Object.fromEntries(new FormData($('#details'))));markDirty();});$('#details').addEventListener('submit',e=>e.preventDefault());
for(const form of document.querySelectorAll('#typography,#notice-form,#visibility-form,#branding-form'))form.addEventListener('submit',event=>event.preventDefault());
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
  try{site.details=Object.assign({},site.details,Object.fromEntries(new FormData($('#details'))));const version=draftVersion;const saved=await api('/creator/portfolio',{method:'PUT',body:JSON.stringify(site)});if(version===draftVersion){site=saved;dirty=false;syncPreview();status('Published. Your public page now uses these changes.');}else{site.revision=saved.revision;status('Published. Newer edits remain in your draft; publish again when ready.');}b.textContent='Publish changes';}
  catch(error){status(error.message,true);}finally{b.disabled=false;}
});
$('#password').addEventListener('submit',async event=>{event.preventDefault();try{await api('/creator/password',{method:'PUT',body:JSON.stringify({password:new FormData(event.target).get('password')})});event.target.reset();showLogin();status('Password changed. Sign in with your new password.');}catch(error){status(error.message,true);}});
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
(async()=>{try{const session=await api('/creator/session');csrf=session.csrf;await loadStudio();}catch(error){if(error.message!=='Please sign in.')status(error.message,true);}})();
async function uploadFile(file){if(file.size>12*1024*1024)throw new Error('Choose images smaller than 12 MB.');if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('Choose PNG, JPEG, or WebP images.');return api('/creator/upload',{method:'POST',body:file,headers:{'Content-Type':file.type}});}
async function renderAssets(){
  const assets=await api('/creator/assets'),root=$('#assets');root.replaceChildren();
  if(!assets.length)root.append(el('p','No uploaded images yet. Original project images remain in the collection.','empty'));
  assets.forEach(asset=>{const row=el('div',undefined,'image-row'),image=el('img');image.src=asset.src;image.alt='Uploaded artwork';image.loading='lazy';const link=el('a','Preview full image ↗');link.href=asset.src;link.target='_blank';link.rel='noopener';const info=el('div');info.append(el('p',Math.round(asset.bytes/1024)+' KB · '+(asset.used?'Used in portfolio':'Unused')),link);const draftUsed=site.images.some(image=>image.src===asset.src)||site.branding?.logoUrl===asset.src;const remove=button('Archive unused',async()=>{await api('/creator/assets/'+asset.src.split('/').pop(),{method:'DELETE'});await renderAssets();status('Unused image archived.');});remove.disabled=asset.used||draftUsed;row.append(image,info,remove);root.append(row);});
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

// ==================================================================== DOCK MAGNIFICATION ==
// macOS-Dock-style zoom: each button's scale is a falloff of its distance from the cursor's X
// position, recomputed on every mousemove (rAF-throttled) while the cursor is over the dock's
// icon row. Show/hide of the dock itself is handled entirely by CSS (:hover / .expanded, see
// creator.css) -- this only ever touches the per-button --mag custom property and which single
// button (if any) counts as "magnified enough" to show its floating label.
const dockNav=document.querySelector('#dock nav');
const isFinePointer=window.matchMedia('(hover: hover) and (pointer: fine)').matches;
if(dockNav&&isFinePointer){
  const MAX_SCALE=1.55,FALLOFF_PX=95,MAG_THRESHOLD=1.15;
  let dockRaf=null,pendingX=null;
  function applyMagnification(clientX){
    let best=null,bestScale=1;
    dockNav.querySelectorAll('button').forEach(btn=>{
      const rect=btn.getBoundingClientRect();
      const center=rect.left+rect.width/2;
      const dist=Math.abs(clientX-center);
      const scale=1+(MAX_SCALE-1)*Math.max(0,1-dist/FALLOFF_PX);
      btn.style.setProperty('--mag',scale.toFixed(3));
      if(scale>bestScale){bestScale=scale;best=btn;}
    });
    dockNav.querySelectorAll('button.is-magnified').forEach(btn=>{if(btn!==best)btn.classList.remove('is-magnified');});
    if(best&&bestScale>=MAG_THRESHOLD)best.classList.add('is-magnified');
  }
  function resetMagnification(){
    dockNav.querySelectorAll('button').forEach(btn=>{btn.style.removeProperty('--mag');btn.classList.remove('is-magnified');});
  }
  dockNav.addEventListener('mousemove',e=>{
    pendingX=e.clientX;
    if(dockRaf)return;
    dockRaf=requestAnimationFrame(()=>{dockRaf=null;if(pendingX!==null)applyMagnification(pendingX);});
  });
  dockNav.addEventListener('mouseleave',()=>{if(dockRaf){cancelAnimationFrame(dockRaf);dockRaf=null;}pendingX=null;resetMagnification();});
}
// Touch/imprecise-pointer fallback (Part C.9): tap the handle (or the dock itself while
// collapsed) to toggle the equal-size, non-magnified expanded state; tapping a tab/action button
// still navigates normally since those clicks aren't intercepted here.
if(!isFinePointer){
  const anchor=$('#dock-anchor'),handle=$('#dock-handle');
  function toggleDock(){
    const expanded=anchor.classList.toggle('expanded');
    handle.setAttribute('aria-expanded',String(expanded));
  }
  handle.addEventListener('click',toggleDock);
}

// Show/hide toggle on every passcode field.
document.querySelectorAll('input[type="password"]').forEach(input=>{
  const wrap=document.createElement('span');wrap.className='pw-wrap';
  input.parentNode.insertBefore(wrap,input);wrap.appendChild(input);
  const btn=document.createElement('button');btn.type='button';btn.className='pw-toggle';
  const eye='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const eyeOff='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.9 17.9A10.4 10.4 0 0 1 12 19C5.6 19 2 12 2 12a18 18 0 0 1 4.1-5M9.9 5.2A9.8 9.8 0 0 1 12 5c6.4 0 10 7 10 7a18 18 0 0 1-2.2 3.2M1 1l22 22"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
  const set=show=>{input.type=show?'text':'password';btn.innerHTML=show?eyeOff:eye;btn.setAttribute('aria-label',show?'Hide passcode':'Show passcode');btn.setAttribute('aria-pressed',String(show));};
  btn.addEventListener('click',()=>{set(input.type==='password');input.focus();});
  wrap.appendChild(btn);set(false);
});
