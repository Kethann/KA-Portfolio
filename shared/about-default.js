// The default About story (bio, journey, promo-cut clips). One definition, imported by the server (validation, defaults) and the
// portal (editor fallback). The homepage embeds an identical copy in index.html for its first paint.
export const ABOUT_LIMITS = { steps: 8, videos: 12 };
export const ABOUT_DEFAULT = {
  bio: "I'm Kethan, based in India, working where art meets engineering. Since 2021 I have shaped the look of film campaigns and publicity for major theatrical releases across Indian and Hollywood cinema, and crafted interfaces and brand systems that feel effortless to use. On the engineering side I build full-stack web and application products with React, Node.js and cloud platforms, backed by APIs, databases and AI integrations. That technical grounding extends into robotics: ROS, Arduino Nano, sensor integration, vision-based navigation and model training, with Power BI turning raw data into clear stories. Every project is held to one standard: striking on screen and dependable underneath. Open to freelance work and full-time roles.",
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
