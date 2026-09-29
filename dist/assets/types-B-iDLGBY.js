const e=(s,i=!1)=>s.src||`/images/${s.slug}-${i?"full":s.widths.includes(2400)?2400:s.widths.includes(1600)?1600:s.widths.includes(1080)?1080:s.widths[s.widths.length-1]}.webp`;export{e as i};
