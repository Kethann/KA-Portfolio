// The dock's apps, in order and grouped by section (Home · Store · People · Site · System); the dock draws a divider
// between sections and the phone home screen shows them under headings. Each loads on first open (code-split).
import { lazy } from 'react';
import type { ComponentType, LazyExoticComponent } from 'react';

export type AppProps = { route: string; go: (route: string) => void; active: boolean; open: (app: string, route?: string) => void };
export type AppSection = 'Home' | 'Store' | 'People' | 'Site' | 'System';
export type AppDef = { id: string; section: AppSection; title: string; icon: string; tile: [string, string]; size: [number, number]; keywords: string; Component: LazyExoticComponent<ComponentType<AppProps>> };

export const APPS: AppDef[] = [
  { id: 'overview', section: 'Home', title: 'Overview', icon: 'overview', tile: ['#ffb168', '#e5661b'], size: [1040, 700], keywords: 'dashboard home sales today kpi', Component: lazy(() => import('./Overview')) },
  { id: 'store', section: 'Store', title: 'Store', icon: 'lock', tile: ['#ffc58a', '#d9781f'], size: [1240, 780], keywords: 'store shop open close closed board panda countdown reopen access pass guest payments razorpay gst tax invoice business categories preview', Component: lazy(() => import('./Store')) },
  { id: 'products', section: 'Store', title: 'Products', icon: 'products', tile: ['#9aa7ff', '#5561e8'], size: [1100, 720], keywords: 'artzz artifacts catalog items prices publish', Component: lazy(() => import('./Products')) },
  { id: 'orders', section: 'Store', title: 'Orders', icon: 'orders', tile: ['#6fe0a8', '#1d9d62'], size: [1080, 700], keywords: 'sales payments refunds invoices buyers', Component: lazy(() => import('./Orders')) },
  { id: 'reports', section: 'Store', title: 'Reports', icon: 'reports', tile: ['#7fd4ff', '#237fd1'], size: [1000, 700], keywords: 'revenue analytics csv export charts', Component: lazy(() => import('./Reports')) },
  { id: 'coupons', section: 'Store', title: 'Coupons', icon: 'coupons', tile: ['#ff9ec4', '#d8467f'], size: [980, 660], keywords: 'discount codes promo', Component: lazy(() => import('./Coupons')) },
  { id: 'downloads', section: 'Store', title: 'Downloads', icon: 'downloads', tile: ['#b7e36a', '#5f9e1d'], size: [980, 640], keywords: 'links delivery files revoke', Component: lazy(() => import('./Downloads')) },
  { id: 'visitors', section: 'People', title: 'Visitors', icon: 'visitors', tile: ['#8ee7e0', '#1c9b93'], size: [1060, 700], keywords: 'traffic analytics countries devices live', Component: lazy(() => import('./Visitors')) },
  { id: 'messages', section: 'People', title: 'Messages', icon: 'messages', tile: ['#79b8ff', '#3a6ff0'], size: [1060, 700], keywords: 'inbox contact reply spam blocklist', Component: lazy(() => import('./Messages')) },
  { id: 'agreements', section: 'People', title: 'Agreements', icon: 'legal', tile: ['#f6d58c', '#b8862b'], size: [1240, 800], keywords: 'agreement contract terms sign signature e-sign client project advance deposit cancellation fee kill fee scope deliverables', Component: lazy(() => import('./Agreements')) },
  { id: 'assistant', section: 'People', title: 'KA Assistant', icon: 'assistant', tile: ['#3a1216', '#12070a'], size: [1040, 700], keywords: 'ai chat knowledge playground logs budget', Component: lazy(() => import('./Assistant')) },
  { id: 'social', section: 'People', title: 'Social', icon: 'social', tile: ['#ff9e7a', '#d6336c'], size: [1160, 760], keywords: 'instagram x twitter facebook linkedin threads pinterest post caption hashtags schedule share media', Component: lazy(() => import('./Social')) },
  { id: 'tips', section: 'Site', title: 'Tips', icon: 'tips', tile: ['#ffe08a', '#e0a91a'], size: [1000, 700], keywords: 'articles blog posts markdown', Component: lazy(() => import('./Tips')) },
  { id: 'sounds', section: 'Site', title: 'Sounds', icon: 'sounds', tile: ['#9ff0d0', '#1f9f86'], size: [1040, 720], keywords: 'sound audio ui clicks volume mute speaker effects music particles', Component: lazy(() => import('./Sounds')) },
  { id: 'studio', section: 'Site', title: 'Studio', icon: 'studio', tile: ['#d7a6ff', '#8b46e0'], size: [1120, 740], keywords: 'design theme fonts colours accent notice announcement banner tab social favicon appearance', Component: lazy(() => import('./Studio')) },
  { id: 'content', section: 'Site', title: 'Content', icon: 'content', tile: ['#ffb4a1', '#e0573a'], size: [1100, 720], keywords: 'portfolio featured work showcase slideshow template images folders text upscaler notify emails templates', Component: lazy(() => import('./Content')) },
  { id: 'wallpaper', section: 'Site', title: 'Wallpaper', icon: 'image', tile: ['#9ad8ff', '#3b6fd8'], size: [1180, 760], keywords: 'wallpaper intro video live download record mp4 webm png 4k phone screen resolution', Component: lazy(() => import('./Wallpaper')) },
  { id: 'license', section: 'Site', title: 'License card', icon: 'license', tile: ['#f2c27b', '#c27a1f'], size: [1120, 740], keywords: 'license card pass signature font seal qr scan text checkout ticket holder', Component: lazy(() => import('./License')) },
  { id: 'legal', section: 'Site', title: 'Licenses & Legal', icon: 'legal', tile: ['#cfc7bd', '#7d746a'], size: [1000, 700], keywords: 'license terms privacy refunds delivery policy', Component: lazy(() => import('./Legal')) },
  { id: 'map', section: 'System', title: 'System map', icon: 'grid', tile: ['#b9f3d0', '#2f9e6f'], size: [1240, 780], keywords: 'map diagram database tables schema connections how it works architecture relations', Component: lazy(() => import('./SystemMap')) },
  { id: 'settings', section: 'System', title: 'Settings', icon: 'settings', tile: ['#b9b3ad', '#5c5650'], size: [960, 680], keywords: 'account password 2fa sessions email system backups audit theme contact topics', Component: lazy(() => import('./Settings')) }
];
// the dock order: section by section, in the order each section first appears above
export const SECTIONS: AppSection[] = ['Home', 'Store', 'People', 'Site', 'System'];
APPS.sort((a, b) => SECTIONS.indexOf(a.section) - SECTIONS.indexOf(b.section));   // stable: keeps the order within a section
export const APP = Object.fromEntries(APPS.map(a => [a.id, a])) as Record<string, AppDef>;
