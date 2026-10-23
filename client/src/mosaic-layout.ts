// Mosaic layout: every picture keeps its own shape (2:3, 4:5, 16:9 ...) and the rows are packed so they fill the
// block edge to edge with an even gap. Nothing is cropped or resized out of proportion; only where each picture
// sits changes. Shared by the site (WorkStacks) and the portal arranger so both draw exactly the same mosaic.

export type MosaicSettings={view?:'stacks'|'mosaic';rowHeight?:number;gap?:number;order?:string[]};
export type MosaicItem={key:string;ratio:number};
export type MosaicTile={key:string;index:number;x:number;y:number;w:number;h:number};
export type MosaicLayout={tiles:MosaicTile[];height:number;cost:number};

export const MOSAIC_DEFAULTS={view:'stacks' as const,rowHeight:280,gap:2};
export const MOSAIC_LIMITS={rowHeight:[140,520] as const,gap:[0,12] as const};
const MAX_PER_ROW=14;

/** The row height to aim for at this width: the owner's height on a desktop-wide block, smaller on phones. */
export function mosaicTarget(width:number,rowHeight=MOSAIC_DEFAULTS.rowHeight){
  return Math.max(90,rowHeight*Math.min(1.35,Math.max(.5,width/1200)));
}

/** Width / height of a picture; a missing or broken size reads as a poster (2:3). */
export function safeRatio(r:number|undefined){return r&&Number.isFinite(r)&&r>0?Math.min(6,Math.max(1/6,r)):2/3;}

/** Owner's order first (unknown slugs skipped), then anything not placed yet in its natural order. */
export function applyOrder<T extends {slug:string}>(items:T[],order:string[]|undefined){
  if(!order||!order.length)return items.slice();
  const by=new Map(items.map(i=>[i.slug,i])),out:T[]=[],seen=new Set<string>();
  for(const s of order){const it=by.get(s);if(it&&!seen.has(s)){out.push(it);seen.add(s);}}
  for(const it of items)if(!seen.has(it.slug))out.push(it);
  return out;
}

/** Justified rows chosen by dynamic programming: across all possible row breaks, pick the set whose row heights stay
 *  closest to the target. Rows always fill the width, so the whole mosaic reads as one solid block. */
export function layoutMosaic(items:MosaicItem[],width:number,target:number,gap:number):MosaicLayout{
  const n=items.length;
  if(!n||width<=0)return {tiles:[],height:0,cost:0};
  const ratios=items.map(i=>safeRatio(i.ratio));
  const best=new Array<number>(n+1).fill(Infinity),from=new Array<number>(n+1).fill(0);best[0]=0;
  const maxH=target*1.9;
  for(let end=1;end<=n;end++){
    let sum=0;
    for(let start=end-1;start>=0&&end-start<=MAX_PER_ROW;start--){
      sum+=ratios[start];
      const k=end-start,h=(width-gap*(k-1))/sum;
      if(h<target*.4&&k>1)break;                       // adding more only makes the row thinner
      // squared relative error; a lone picture that would come out far too tall is allowed but costly
      const e=(h-target)/target,c=best[start]+e*e*(h>maxH?4:1);
      if(c<best[end]){best[end]=c;from[end]=start;}
    }
  }
  const rows:[number,number][]=[];
  for(let end=n;end>0;end=from[end])rows.unshift([from[end],end]);
  const tiles:MosaicTile[]=[];let y=0;
  for(const [start,end] of rows){
    const k=end-start;let sum=0;for(let i=start;i<end;i++)sum+=ratios[i];
    let h=(width-gap*(k-1))/sum,rowW=width;
    // a row that would be absurdly tall (one wide picture, or very few pictures) is capped and centred instead
    if(h>maxH){h=maxH;rowW=sum*h+gap*(k-1);}
    const rh=Math.round(h),off=(width-rowW)/2;let x=off;
    for(let i=start;i<end;i++){
      const w=ratios[i]*h,x0=Math.round(x),x1=i===end-1&&rowW===width?width:Math.round(x+w);
      tiles.push({key:items[i].key,index:i,x:x0,y,w:Math.max(1,x1-x0),h:rh});
      x+=w+gap;
    }
    y+=rh+gap;
  }
  return {tiles,height:Math.max(0,y-gap),cost:best[n]};
}

/** Small seeded random generator so "Best fit" and "Shuffle" are repeatable for the same seed. */
export function rng(seed:number){
  let a=seed>>>0||1;
  return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
}
export function shuffle<T>(list:T[],seed:number){
  const r=rng(seed),out=list.slice();
  for(let i=out.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[out[i],out[j]]=[out[j],out[i]];}
  return out;
}

/** Puzzle solver: tries many arrangements and keeps the one whose rows sit closest to the target height at each of
 *  the given widths (desktop, tablet, phone), so the block looks even everywhere. Returns the keys in order. */
export function bestFit(items:MosaicItem[],opts:{rowHeight:number;gap:number;widths?:number[];tries?:number;seed?:number}){
  const widths=opts.widths||[1200,760,390],tries=Math.max(1,opts.tries??600);
  const score=(list:MosaicItem[])=>widths.reduce((s,w)=>s+layoutMosaic(list,w,mosaicTarget(w,opts.rowHeight),opts.gap).cost,0);
  let bestList=items,bestScore=score(items);
  const seed=opts.seed??Date.now();
  for(let t=0;t<tries;t++){
    const cand=shuffle(items,seed+t*7919),s=score(cand);
    if(s<bestScore){bestScore=s;bestList=cand;}
  }
  // polish: swap neighbours while it keeps improving (a few passes, cheap)
  let list=bestList.slice();
  for(let pass=0;pass<3;pass++){
    let improved=false;
    for(let i=0;i<list.length-1;i++){
      const cand=list.slice();[cand[i],cand[i+1]]=[cand[i+1],cand[i]];
      const s=score(cand);if(s<bestScore-1e-9){bestScore=s;list=cand;improved=true;}
    }
    if(!improved)break;
  }
  return list.map(i=>i.key);
}

/** Width / height of each picture, measured once from its smallest export when the document has no size for it. */
const ratioCache=new Map<string,number>();
const pending=new Map<string,Promise<number>>();
export function knownRatio(key:string){return ratioCache.get(key);}
export function measureRatio(key:string,url:string):Promise<number>{
  const have=ratioCache.get(key);if(have)return Promise.resolve(have);
  const wait=pending.get(key);if(wait)return wait;
  const p=new Promise<number>(resolve=>{
    if(typeof Image==='undefined'){resolve(2/3);return;}
    const img=new Image();img.decoding='async';
    img.onload=()=>{const r=img.naturalWidth&&img.naturalHeight?img.naturalWidth/img.naturalHeight:2/3;ratioCache.set(key,r);pending.delete(key);resolve(r);};
    img.onerror=()=>{pending.delete(key);resolve(2/3);};
    img.src=url;
  });
  pending.set(key,p);return p;
}
export function rememberRatio(key:string,r:number){if(r>0&&Number.isFinite(r))ratioCache.set(key,r);}
