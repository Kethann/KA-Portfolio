// The default About story (bio, journey, promo-cut clips). One definition, imported by the server (validation, defaults) and the
// portal (editor fallback). The homepage embeds an identical copy in index.html for its first paint.
export const ABOUT_LIMITS = { steps: 8, videos: 12 };
export const ABOUT_DEFAULT = {
  bio: "I'm Kethan, a designer who engineers and an engineer who designs, based in India. Since 2021 I've worked where creativity meets code. On the creative side: movie campaign and publicity design for major theatrical releases across Indian and Hollywood cinema, plus UI/UX design and campaign design. On the tech side: full-stack web and application development with React, Node.js and cloud platforms, APIs, databases and AI integrations. With an engineering background, I also build in robotics: ROS, Arduino Nano, sensor integrations and vision-based navigation models, alongside model training and Power BI dashboards. Every poster is a puzzle of star power, mood, typography and story; every product is a puzzle of flow, performance and detail. I blend both, so what I make looks striking and runs smoothly. Available for freelance and full-time collaborations, always looking for the next story worth telling, visually and technically.",
  journey: { enabled: true, since: 2021, steps: [
    { title: 'Graphic design', text: 'Movie campaigns & publicity design' },
    { title: 'UI / UX design', text: 'Interfaces, flows & design systems' },
    { title: 'Full-stack & apps', text: 'React, Node, cloud & APIs' },
    { title: 'Robotics & AI', text: 'ROS, Arduino, sensors, vision models' },
    { title: 'Now', text: 'Creativity and engineering, built together' } ] },
  reel: { enabled: true, title: 'Promo Cuts', intro: 'Random clips from my YouTube channel: a few seconds of each, never the full video',
    panelLabel: 'Now playing', panelText: 'Short promo and teaser cuts, trimmed to the beat. Every visit plays different seconds from a different video.',
    buttonLabel: 'Watch the full video', channelLabel: 'Visit the channel', channelUrl: 'https://www.youtube.com/@KethanArtzz', clipMin: 5, clipMax: 8,
    videos: [
      { id: 'rgxPPGUK5Fc', len: 28, title: 'Shyam Singha Roy | Sirivennela' },
      { id: 'F_O7xqGm-Ug', len: 69, title: 'Rudhira Haara x Man of Masses NTR | Bagheera' },
      { id: 'N1g7TeYWdM0', len: 109, title: 'Shyam Singha Roy | Nani | Sai Pallavi | Sirivennela' } ] }
};
