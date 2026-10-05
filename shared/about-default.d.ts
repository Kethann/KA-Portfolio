export const ABOUT_LIMITS: { steps: number; videos: number };
export const ABOUT_DEFAULT: {
  bio: string;
  journey: { enabled: boolean; since: number; steps: { title: string; text: string }[] };
  reel: { enabled: boolean; title: string; intro: string; panelLabel: string; panelText: string; buttonLabel: string; channelLabel: string; channelUrl: string;
    clipMin: number; clipMax: number; videos: { id: string; len: number; title: string }[] };
};
