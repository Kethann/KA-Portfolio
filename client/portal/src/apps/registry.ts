// The dock's apps, in order. Each loads on first open (code-split), so the desktop starts fast.
import { lazy } from 'react';
import type { ComponentType, LazyExoticComponent } from 'react';

export type AppProps = { route: string; go: (route: string) => void; active: boolean; open: (app: string, route?: string) => void };
export type AppDef = { id: string; title: string; icon: string; tile: [string, string]; size: [number, number]; keywords: string; Component: LazyExoticComponent<ComponentType<AppProps>> };

export const APPS: AppDef[] = [
  { id: 'overview', title: 'Overview', icon: 'overview', tile: ['#ffb168', '#e5661b'], size: [1040, 700], keywords: 'dashboard home sales today kpi', Component: lazy(() => import('./Overview')) },
  { id: 'products', title: 'Products', icon: 'products', tile: ['#9aa7ff', '#5561e8'], size: [1100, 720], keywords: 'artzz artifacts catalog items prices publish', Component: lazy(() => import('./Products')) },
  { id: 'orders', title: 'Orders', icon: 'orders', tile: ['#6fe0a8', '#1d9d62'], size: [1080, 700], keywords: 'sales payments refunds invoices buyers', Component: lazy(() => import('./Orders')) },
  { id: 'reports', title: 'Reports', icon: 'reports', tile: ['#7fd4ff', '#237fd1'], size: [1000, 700], keywords: 'revenue analytics csv export charts', Component: lazy(() => import('./Reports')) },
  { id: 'coupons', title: 'Coupons', icon: 'coupons', tile: ['#ff9ec4', '#d8467f'], size: [980, 660], keywords: 'discount codes promo', Component: lazy(() => import('./Coupons')) },
  { id: 'downloads', title: 'Downloads', icon: 'downloads', tile: ['#b7e36a', '#5f9e1d'], size: [980, 640], keywords: 'links delivery files revoke', Component: lazy(() => import('./Downloads')) },
  { id: 'visitors', title: 'Visitors', icon: 'visitors', tile: ['#8ee7e0', '#1c9b93'], size: [1060, 700], keywords: 'traffic analytics countries devices live', Component: lazy(() => import('./Visitors')) },
  { id: 'messages', title: 'Messages', icon: 'messages', tile: ['#79b8ff', '#3a6ff0'], size: [1060, 700], keywords: 'inbox contact reply spam blocklist', Component: lazy(() => import('./Messages')) },
  { id: 'assistant', title: 'KA Assistant', icon: 'assistant', tile: ['#3a1216', '#12070a'], size: [1040, 700], keywords: 'ai chat knowledge playground logs budget', Component: lazy(() => import('./Assistant')) },
  { id: 'tips', title: 'Tips', icon: 'tips', tile: ['#ffe08a', '#e0a91a'], size: [1000, 700], keywords: 'articles blog posts markdown', Component: lazy(() => import('./Tips')) },
  { id: 'studio', title: 'Studio', icon: 'studio', tile: ['#d7a6ff', '#8b46e0'], size: [1120, 740], keywords: 'design theme fonts colours accent notice social favicon appearance', Component: lazy(() => import('./Studio')) },
  { id: 'content', title: 'Content', icon: 'content', tile: ['#ffb4a1', '#e0573a'], size: [1100, 720], keywords: 'portfolio images folders text upscaler notify emails templates', Component: lazy(() => import('./Content')) },
  { id: 'legal', title: 'Licenses & Legal', icon: 'legal', tile: ['#cfc7bd', '#7d746a'], size: [1000, 700], keywords: 'license terms privacy refunds delivery policy', Component: lazy(() => import('./Legal')) },
  { id: 'settings', title: 'Settings', icon: 'settings', tile: ['#b9b3ad', '#5c5650'], size: [960, 680], keywords: 'account password 2fa sessions store tax email system backups audit theme', Component: lazy(() => import('./Settings')) }
];
export const APP = Object.fromEntries(APPS.map(a => [a.id, a])) as Record<string, AppDef>;
