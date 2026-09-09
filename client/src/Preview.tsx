import {useEffect,useRef} from 'react';
import {imageUrl,type Project} from './types';

// Details use the document scrollbar instead of a nested scrolling dialog.
export function Preview({project,onClose,label}:{project:Project;onClose:()=>void;label:string}){
  const detail=useRef<HTMLElement>(null),close=useRef(onClose);close.current=onClose;
  useEffect(()=>{
    const node=detail.current!,scope=node.getRootNode() as Document|ShadowRoot;
    const previous=scope.activeElement as HTMLElement|null,scroll=window.scrollY;
    node.scrollIntoView({block:'start',behavior:'instant'});node.focus({preventScroll:true});
    function key(event:KeyboardEvent){if(event.key==='Escape'){event.preventDefault();close.current();}}
    node.addEventListener('keydown',key);
    return()=>{node.removeEventListener('keydown',key);requestAnimationFrame(()=>{window.scrollTo({top:scroll,behavior:'instant'});previous?.focus?.({preventScroll:true});});};
  },[]);
  return <section ref={detail} className="project-detail" tabIndex={-1} aria-labelledby="project-title">
    <header className="detail-toolbar"><button className="return-link" onClick={onClose}>← Back to collection</button><button className="detail-close" onClick={onClose} aria-label="Close project">×</button></header>
    <div className="detail-layout"><div className="detail-image"><img src={imageUrl(project,true)} alt={project.title} decoding="async"/></div>
      <div className="detail-copy"><span className="eyebrow">{project.cat}</span><h2 id="project-title">{project.title}</h2>
        {project.description&&<p>{project.description}</p>}
        {project.technologies.length>0&&<ul className="tags">{project.technologies.map((technology,i)=><li key={i}>{technology}</li>)}</ul>}
        {project.link&&<a className="project-link" href={project.link} target="_blank" rel="noopener noreferrer">{label||'View project'} ↗</a>}
      </div>
    </div>
  </section>;
}
