export type Project={id:string;slug:string;title:string;cat:string;src?:string;widths:number[];full:number;description:string;technologies:string[];link:string};
export type Content={creatorName:string;tagline:string;portfolioTitle:string;portfolioIntro:string;contactTitle:string;contactIntro:string;openLabel:string;closeLabel:string;projectLabel:string;contactButton:string};
export type Portfolio={revision:number;details:Content;folders:string[];images:Project[]};
// [texture sharpness fix] the 3D folder cards (FolderScene) render these at a real, often
// oblique on-screen size -- 1080 read as visibly soft there. Prefer 2400/1600 when the poster
// was exported at that width, still well short of the heaviest 'full' variants (some are
// 3200-5413px) so the folder-open payload stays reasonable while textures read sharp.
export const imageUrl=(p:Project,large=false)=>p.src || `/images/${p.slug}-${large?'full':p.widths.includes(2400)?2400:p.widths.includes(1600)?1600:p.widths.includes(1080)?1080:p.widths[p.widths.length-1]}.webp`;
