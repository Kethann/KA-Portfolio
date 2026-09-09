export function FolderCover(){
  return <span className="collection-cover" aria-hidden="true"><span className="collection-pages">{Array.from({length:7},(_,i)=><i key={i} style={{'--page':i} as React.CSSProperties}/>)}</span><span className="collection-front"><span className="collection-flap"/><span className="collection-clasp"/><span className="collection-slot"/></span></span>;
}
