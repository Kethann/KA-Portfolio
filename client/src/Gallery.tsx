import {useEffect,useMemo,useRef,useState} from 'react';
import {FolderScene,type FolderHandle} from './FolderScene';
import {FolderCover} from './FolderCover';
import {Preview} from './Preview';
import type {Portfolio,Project} from './types';
export type GalleryOptions={category?:string;slugs?:string[];initialProjects:Project[];onBack?:()=>void};
const normalize=(p:Project):Project=>({...p,id:p.id||p.slug,description:p.description||'',technologies:p.technologies||[],link:p.link||''});
export function Gallery({category,slugs,initialProjects,onBack}:GalleryOptions){
  const [data,setData]=useState<Portfolio|null>(null),[pending,setPending]=useState<Portfolio|null>(null);
  const [folder,setFolder]=useState(category||''),[page,setPage]=useState(0),[state,setState]=useState('closed');
  const [preview,setPreview]=useState<Project|null>(null),[fallback,setFallback]=useState(false);
  const scene=useRef<FolderHandle>(null),shelf=useRef<HTMLDivElement>(null),leaving=useRef(false),lastFolder=useRef('');
  const pendingPage=useRef<number|null>(null),returnTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  useEffect(()=>()=>{if(returnTimer.current!==null)clearTimeout(returnTimer.current);},[]);
  useEffect(()=>{if(pending&&state==='closed'){setData(pending);setPending(null);}},[pending,state]);
  useEffect(()=>{
    const controller=new AbortController();
    fetch('/api/portfolio',{signal:controller.signal}).then(r=>{if(!r.ok)throw new Error('Offline');return r.json();}).then((site:Portfolio)=>{
      if(Array.isArray(site.images)&&Array.isArray(site.folders))setPending({...site,images:site.images.map(normalize)});
    }).catch(()=>{});return()=>controller.abort();
  },[]);
  const all=useMemo(()=>data?.images||initialProjects.map(normalize),[data,initialProjects]);
  const folders=data?.folders||Array.from(new Set(all.map(p=>p.cat)));
  const collection=useMemo(()=>all.filter(p=>p.cat===folder&&(!slugs||slugs.includes(p.slug))),[all,folder,slugs]);
  const projects=useMemo(()=>collection.slice(page*5,page*5+5),[collection,page]);
  const busy=['opening','closing','restoring','preview','returning'].includes(state);
  useEffect(()=>{
    if(folder||!lastFolder.current)return;
    Array.from(shelf.current?.querySelectorAll<HTMLButtonElement>('button[data-folder]')||[]).find(b=>b.dataset.folder===lastFolder.current)?.focus({preventScroll:true});
  },[folder]);
  function finishClose(){
    leaving.current=false;returnTimer.current=null;setState('closed');setPreview(null);
    if(category&&onBack){onBack();return;}
    setFolder('');setPage(0);setFallback(false);
  }
  function handleState(next:string){
    setState(next);
    if(next!=='closed')return;
    if(pendingPage.current!==null){const nextPage=pendingPage.current;pendingPage.current=null;setPage(nextPage);return;}
    if(leaving.current){setState('returning');returnTimer.current=setTimeout(finishClose,window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:180);}
  }
  function changePage(nextPage:number){
    if(busy)return;
    if(state==='closed'||fallback){setPage(nextPage);return;}
    pendingPage.current=nextPage;scene.current?.toggle();
  }
  function returnToShelf(){
    if(busy)return;
    if(state==='closed'||fallback){finishClose();return;}
    leaving.current=true;scene.current?.toggle();
  }
  function closePreview(){setPreview(null);if(!fallback){leaving.current=true;scene.current?.restore();}}
  function choose(name:string){lastFolder.current=name;leaving.current=false;setState('closed');setPage(0);setFallback(false);setFolder(name);}
  return <section className="embedded-gallery" aria-label="Project collections">
    <header className="gallery-toolbar" hidden={!!preview}><h2 className="gallery-title">{folder||'Selected work'}</h2>{folder&&<button className="return-link" disabled={busy} onClick={returnToShelf}>← All work</button>}</header>
    {!folder?<div ref={shelf} className="collection-shelf" aria-label="Choose a folder">
      {folders.map(name=>{const count=all.filter(p=>p.cat===name&&(!slugs||slugs.includes(p.slug))).length;
        return <button key={name} className="collection-tile" data-folder={name} onClick={()=>choose(name)} aria-label={'Open '+name+', '+count+' projects'}><FolderCover/><span className="collection-title">{name}</span><span className="collection-count">{count} {count===1?'project':'projects'}</span></button>;
      })}
      {!folders.length&&<p className="scene-empty">No collections yet.</p>}
    </div>:<div key={folder} className="folder-detail" hidden={!!preview} data-leaving={state==='returning'}>
      <div className="scene-wrap">{projects.length>0&&!fallback?<FolderScene key={folder+'-'+page} ref={scene} autoOpen projects={projects} onState={handleState} onPreview={setPreview} onError={()=>setFallback(true)}/>:<div className="scene-empty"><p>{fallback?'Choose a project below.':'This folder is empty.'}</p></div>}
        <div className="scene-caption"><p className="sr-only" role="status">{state==='opening'?'Opening folder.':state==='closing'?'Returning projects to the folder.':state==='open'?'Choose a project.':''}</p>
        {!!projects.length&&!fallback&&<button className="folder-toggle" disabled={busy} onClick={()=>state==='closed'?scene.current?.toggle():returnToShelf()}>{state==='opening'?'Opening…':state==='closing'?'Closing…':state==='closed'?data?.details.openLabel||'Open folder':data?.details.closeLabel||'Close folder'}</button>}</div>
      </div>
      {(state==='open'||fallback)&&<ol className={fallback?'project-index':'project-picker'} aria-label="Projects">{projects.map((p,i)=><li key={p.id}><button aria-label={'View '+p.title} title={p.title} onClick={()=>fallback?setPreview(p):scene.current?.select(i)}><span>{String(i+1+page*5).padStart(2,'0')}</span>{fallback&&p.title}</button></li>)}</ol>}
      {collection.length>5&&<div className="page-controls"><button disabled={busy||page===0} onClick={()=>changePage(page-1)}>Previous</button><span>{page+1} / {Math.ceil(collection.length/5)}</span><button disabled={busy||(page+1)*5>=collection.length} onClick={()=>changePage(page+1)}>Next</button></div>}
    </div>}
    {preview&&<Preview project={preview} onClose={closePreview} label={data?.details.projectLabel||'View project'}/>}
  </section>;
}
