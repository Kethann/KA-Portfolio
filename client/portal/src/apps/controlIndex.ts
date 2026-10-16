// Every setting in the portal, in one searchable list: what it does in plain words and exactly where it lives.
// Used by Settings > Control Center and the ⌘K search. Add a line here whenever a new setting is added anywhere.
export type ControlGroup = 'Website' | 'Store & money' | 'People & messages' | 'Account & system';
export type Control = { title: string; desc: string; group: ControlGroup; app: string; route?: string; keywords?: string };

export const CONTROL_GROUPS: { id: ControlGroup; blurb: string; icon: string }[] = [
  { id: 'Website', blurb: 'How the site looks, what it says, and what is on it', icon: 'studio' },
  { id: 'Store & money', blurb: 'Selling, payments, invoices and discounts', icon: 'products' },
  { id: 'People & messages', blurb: 'Visitors, messages, the assistant and emails', icon: 'messages' },
  { id: 'Account & system', blurb: 'Your login, your team, backups and health', icon: 'settings' }
];

export const CONTROLS: Control[] = [
  // ---- Website
  { group: 'Website', title: 'Colours, accent and logo', desc: 'The accent colour, glass blur, logo and favicon.', app: 'studio', route: 'identity', keywords: 'colour color accent theme favicon logo branding glass' },
  { group: 'Website', title: 'Fonts and text size', desc: 'Heading and body fonts, your own uploaded fonts, text size.', app: 'studio', route: 'type', keywords: 'font typography heading body size upload' },
  { group: 'Website', title: 'Announcements', desc: 'Several announcements with dates; the small megaphone tab on the side.', app: 'studio', route: 'notice', keywords: 'announcement notice banner news tab megaphone schedule' },
  { group: 'Website', title: 'Top bar, menu and panda', desc: 'Which pages are in the top bar, which items are in the ☰ menu, and whether the panda shows.', app: 'studio', route: 'nav', keywords: 'navigation nav menu hide show panda mascot store typography tips upscaler fullscreen sound' },
  { group: 'Website', title: 'Image protection and downloads', desc: 'Protect gallery images; PNG or JPEG downloads.', app: 'studio', route: 'nav', keywords: 'protect screenshot right click download format png jpeg' },
  { group: 'Website', title: 'Social links and footer', desc: 'Behance, Instagram, YouTube and other links.', app: 'studio', route: 'social', keywords: 'social links instagram behance youtube linkedin footer email' },
  { group: 'Website', title: 'Text styles and animations', desc: 'Font and colour of single headings, and how they animate in.', app: 'studio', route: 'elements', keywords: 'element style animation heading colour' },
  { group: 'Website', title: 'Layout on each device', desc: 'Move and size elements separately for phone, tablet and desktop.', app: 'studio', route: 'arrange', keywords: 'arrange layout position drag phone tablet desktop' },
  { group: 'Website', title: 'Intro skill bubbles', desc: 'Show or hide the icons around the logo, choose which, reorder and rename them.', app: 'studio', route: 'intro', keywords: 'intro bubbles icons skills logo orbit hide show skip rename order' },
  { group: 'Website', title: 'Homepage intro', desc: 'Which intro version plays when the site opens.', app: 'studio', route: 'intro', keywords: 'intro hero crystal logo version' },
  { group: 'Website', title: 'Portfolio pictures and stacks', desc: 'Upload, order, hide, describe and group your pictures.', app: 'content', route: 'portfolio', keywords: 'portfolio images pictures upload folder stack cover description hide archive' },
  { group: 'Website', title: 'Featured Work showcase', desc: 'Rows of cross-fading picture frames: size, shape, side, words.', app: 'content', route: 'featured', keywords: 'featured showcase slideshow template frame size shape side zigzag' },
  { group: 'Website', title: 'Site text and About', desc: 'Your name, tagline, headings, About story, numbers, skills and promo cuts.', app: 'content', route: 'text', keywords: 'text words about story tagline name headings skills stats numbers journey reel videos' },
  { group: 'Website', title: 'Sounds', desc: 'The soft UI sounds, whether they start on, and their volumes.', app: 'sounds', keywords: 'sound audio volume mute click' },
  { group: 'Website', title: 'Tips articles', desc: 'Write and publish Tips.', app: 'tips', keywords: 'tips articles blog posts' },
  { group: 'Website', title: 'Image Upscaler box and waiting list', desc: 'The “coming soon” box and who signed up.', app: 'content', route: 'upscaler', keywords: 'upscaler coming soon notify list launch' },
  { group: 'Website', title: 'Live wallpaper of the intro', desc: 'Record the intro as a video or image at any screen size.', app: 'wallpaper', keywords: 'wallpaper video download intro record' },
  // ---- Store & money
  { group: 'Store & money', title: 'Open or close the store', desc: 'Close the store, the closed board and countdown, and who may still buy.', app: 'settings', route: 'storestatus', keywords: 'store open close closed reopen countdown access pass guest' },
  { group: 'Store & money', title: 'Payments (Razorpay)', desc: 'Test or live, international payments, and the go-live checklist.', app: 'settings', route: 'store', keywords: 'payment razorpay live test bank international card upi' },
  { group: 'Store & money', title: 'Business details on invoices', desc: 'Your name, address, tax ID and support email.', app: 'settings', route: 'store', keywords: 'business seller name address invoice gst pan tax id support email' },
  { group: 'Store & money', title: 'GST and tax', desc: 'Whether GST is charged, its rate, and inclusive or on top.', app: 'settings', route: 'store', keywords: 'gst tax rate inclusive' },
  { group: 'Store & money', title: 'Download link rules', desc: 'How long download links last and how many downloads they allow.', app: 'settings', route: 'store', keywords: 'download link expiry days limit' },
  { group: 'Store & money', title: 'Products and prices', desc: 'Items, prices in ₹ and $, sales, files and delivery emails.', app: 'products', keywords: 'product price sale file delivery artzz artifacts' },
  { group: 'Store & money', title: 'Categories', desc: 'Groups for products and tips.', app: 'settings', route: 'categories', keywords: 'category group' },
  { group: 'Store & money', title: 'Discount codes', desc: 'Coupons, their rules, and how often each is used.', app: 'coupons', keywords: 'coupon discount code promo' },
  { group: 'Store & money', title: 'Orders, refunds and invoices', desc: 'Every order; refund, resend links, open an invoice.', app: 'orders', keywords: 'order refund invoice receipt resend' },
  { group: 'Store & money', title: 'Download links', desc: 'See and revoke buyers’ download links.', app: 'downloads', keywords: 'downloads links revoke' },
  { group: 'Store & money', title: 'License card design', desc: 'The pass / license card buyers receive.', app: 'license', keywords: 'license card pass design signature' },
  { group: 'Store & money', title: 'Checkout pass design', desc: 'The animated pass shown at checkout.', app: 'studio', route: 'pass', keywords: 'checkout pass card' },
  { group: 'Store & money', title: 'Licenses and legal pages', desc: 'License terms, privacy, refund and delivery policies.', app: 'legal', keywords: 'legal terms privacy refund policy license' },
  { group: 'Store & money', title: 'Sales reports', desc: 'Revenue charts and CSV export.', app: 'reports', keywords: 'report revenue csv analytics' },
  // ---- People & messages
  { group: 'People & messages', title: 'Contact form topics', desc: 'The “Regarding” ticks and replies shown on the visitor’s device.', app: 'settings', route: 'messages', keywords: 'contact form topics regarding reply device' },
  { group: 'People & messages', title: 'Auto-reply and business hours', desc: 'Automatic replies and away messages.', app: 'settings', route: 'messages', keywords: 'auto reply away business hours' },
  { group: 'People & messages', title: 'Message alerts and spam', desc: 'Where new-message alerts go; the blocklist.', app: 'settings', route: 'messages', keywords: 'alert notify email spam block blocklist' },
  { group: 'People & messages', title: 'Inbox', desc: 'Read and reply to messages; saved replies.', app: 'messages', keywords: 'inbox messages reply' },
  { group: 'People & messages', title: 'Email texts', desc: 'The words of every email the site sends.', app: 'content', route: 'emails', keywords: 'email template receipt delivery reply text' },
  { group: 'People & messages', title: 'Email sender name and sign-off', desc: 'Who emails come from and how they are signed.', app: 'content', route: 'emails', keywords: 'sender from name signature sign off' },
  { group: 'People & messages', title: 'Scheduled email reports', desc: 'Daily or weekly sales emails to you.', app: 'settings', route: 'reports', keywords: 'report email weekly daily' },
  { group: 'People & messages', title: 'Chat assistant (Panda)', desc: 'On or off, its rules, greeting and daily budget.', app: 'assistant', route: 'settings', keywords: 'assistant chat ai rules greeting budget panda' },
  { group: 'People & messages', title: 'Assistant knowledge', desc: 'What the assistant knows about you and the store.', app: 'assistant', route: 'knowledge', keywords: 'knowledge faq assistant' },
  { group: 'People & messages', title: 'Visitor logs and how long they are kept', desc: 'The visit log, saved logs, retention.', app: 'visitors', route: 'log', keywords: 'visitors log retention keep delete saved' },
  { group: 'People & messages', title: 'Social posts and webhook', desc: 'Plan posts; the webhook that sends them.', app: 'social', keywords: 'social instagram post webhook schedule hashtag' },
  // ---- Account & system
  { group: 'Account & system', title: 'Password and two-step login', desc: 'Change your password, 2FA and signed-in devices.', app: 'settings', route: 'security', keywords: 'password 2fa security sessions login' },
  { group: 'Account & system', title: 'Team', desc: 'Give others access to the portal.', app: 'settings', route: 'team', keywords: 'team access users admin' },
  { group: 'Account & system', title: 'Portal appearance', desc: 'Light or dark portal, accent.', app: 'settings', route: 'appearance', keywords: 'theme dark light portal appearance' },
  { group: 'Account & system', title: 'System status', desc: 'What is connected: email, payments, storage, AI.', app: 'settings', route: 'system', keywords: 'system status health email storage' },
  { group: 'Account & system', title: 'Backups', desc: 'Back up and download your data.', app: 'settings', route: 'backups', keywords: 'backup restore download data' },
  { group: 'Account & system', title: 'Activity log', desc: 'Everything done in the portal.', app: 'settings', route: 'audit', keywords: 'audit activity log history' },
  { group: 'Account & system', title: 'System map', desc: 'How every part connects, and the live database.', app: 'map', keywords: 'map diagram database tables' }
];

export function searchControls(q: string){
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return CONTROLS;
  return CONTROLS.map(c => {
    const hay = `${c.title} ${c.desc} ${c.keywords || ''} ${c.group}`.toLowerCase();
    const score = words.reduce((n, w) => n + (hay.includes(w) ? (c.title.toLowerCase().includes(w) ? 3 : 1) : -100), 0);
    return { c, score };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).map(x => x.c);
}
