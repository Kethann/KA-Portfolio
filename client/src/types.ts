export type Project={id:string;slug:string;title:string;cat:string;src?:string;widths:number[];full:number;description:string;technologies:string[];link:string};
export type Content={creatorName:string;tagline:string;portfolioTitle:string;portfolioIntro:string;contactTitle:string;contactIntro:string;openLabel:string;closeLabel:string;projectLabel:string;contactButton:string};
export type Portfolio={revision:number;details:Content;folders:string[];images:Project[]};
export const imageUrl=(p:Project,large=false)=>p.src || `/images/${p.slug}-${large?'full':p.widths.includes(1080)?1080:p.widths[p.widths.length-1]}.webp`;
