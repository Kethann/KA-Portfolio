import {createRoot} from 'react-dom/client';
import type {GalleryOptions} from './Gallery';
import css from './style.css?inline';
import galleryCss from './gallery.css?inline';
import coverCss from './folder-covers.css?inline';
import stacksCss from './workstacks.css?inline';
import {WorkStacks,type WorkStacksProps} from './WorkStacks';

// Scope gallery styles to its section; module imports keep its Three.js separate from the KA scene.
export function mount(container:HTMLElement,options:GalleryOptions){
  const host=document.createElement('div');container.replaceChildren(host);
  const shadow=host.attachShadow({mode:'open'}),style=document.createElement('style'),target=document.createElement('div');
  // Keep CSS intact: font URLs can contain semicolons, so stripping imports with
  // a semicolon-based regex corrupts the entire stylesheet.
  style.textContent=css.replace(':root{',':host{')+'\n'+galleryCss+'\n'+coverCss;
  shadow.append(style,target);
  const root=createRoot(target);let gone=false;
  // Loaded on demand so the Work panel (mountStacks) never pulls in the 3D folder scene.
  import('./Gallery').then(({Gallery})=>{if(!gone)root.render(<Gallery {...options}/>);});
  return()=>{gone=true;root.unmount();host.remove();};
}

// Work panel: multi-stack showcase + magnetic coverflow. The old folder scene (Gallery/FolderScene) is left in
// the codebase but is no longer mounted by the site.
export function mountStacks(container:HTMLElement,initial:WorkStacksProps){
  const host=document.createElement('div');container.replaceChildren(host);
  const shadow=host.attachShadow({mode:'open'}),style=document.createElement('style'),target=document.createElement('div');
  style.textContent=stacksCss;shadow.append(style,target);
  const root=createRoot(target);root.render(<WorkStacks {...initial}/>);
  return{update:(next:WorkStacksProps)=>root.render(<WorkStacks {...next}/>),dispose:()=>{root.unmount();host.remove();}};
}
