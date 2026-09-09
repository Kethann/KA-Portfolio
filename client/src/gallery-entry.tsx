import {createRoot} from 'react-dom/client';
import {Gallery,type GalleryOptions} from './Gallery';
import css from './style.css?inline';
import galleryCss from './gallery.css?inline';
import coverCss from './folder-covers.css?inline';

// Scope gallery styles to its section; module imports keep its Three.js separate from the KA scene.
export function mount(container:HTMLElement,options:GalleryOptions){
  const host=document.createElement('div');container.replaceChildren(host);
  const shadow=host.attachShadow({mode:'open'}),style=document.createElement('style'),target=document.createElement('div');
  // Keep CSS intact: font URLs can contain semicolons, so stripping imports with
  // a semicolon-based regex corrupts the entire stylesheet.
  style.textContent=css.replace(':root{',':host{')+'\n'+galleryCss+'\n'+coverCss;
  shadow.append(style,target);
  const root=createRoot(target);root.render(<Gallery {...options}/>);
  return()=>{root.unmount();host.remove();};
}
