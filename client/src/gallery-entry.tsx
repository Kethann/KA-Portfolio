import {createRoot} from 'react-dom/client';
import stacksCss from './workstacks.css?inline';
import {WorkStacks,type WorkStacksProps} from './WorkStacks';

// Work panel: multi-stack showcase + magnetic coverflow.
export function mountStacks(container:HTMLElement,initial:WorkStacksProps){
  const host=document.createElement('div');container.replaceChildren(host);
  const shadow=host.attachShadow({mode:'open'}),style=document.createElement('style'),target=document.createElement('div');
  style.textContent=stacksCss;shadow.append(style,target);
  const root=createRoot(target);root.render(<WorkStacks {...initial}/>);
  return{update:(next:WorkStacksProps)=>root.render(<WorkStacks {...next}/>),dispose:()=>{root.unmount();host.remove();}};
}
