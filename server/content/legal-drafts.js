// Starting drafts for the four legal pages, written for how this store actually works (digital
// downloads, Razorpay, emailed links, per-item refund rule, visitor logs, the AI assistant).
// They are DRAFTS, not legal advice: the portal shows them as unpublished with [BRACKETS] to fill
// in, and nothing is public until the owner reviews the text and presses Publish.
export const LEGAL_TITLES = { terms: 'Terms of Sale', privacy: 'Privacy Policy', refunds: 'Refund Policy', delivery: 'Delivery Policy' };

export const LEGAL_DRAFTS = {
  terms: `These terms apply when you buy or download anything from this website, which is run by [YOUR FULL NAME OR BUSINESS NAME], [CITY], India ("we", "us").

## What we sell
Digital files only: design resources ("Artifacts") and artwork downloads ("Artzz"). Nothing is shipped physically.

## Prices and payment
- Buyers in India pay in Indian rupees (₹); everyone else pays in US dollars ($). The price shown at checkout is the price you pay.
- Payments are processed by Razorpay. We never see or store your card details.
- An order is complete once Razorpay confirms the payment. If a payment fails, no files are delivered and you are not charged.

## Your license
Every download comes with a license (shown on the item's page and included in the file as LICENSE.txt). It explains what you may and may not do with the file. You keep the version of the license you bought, even if we change it later. Unless the license says otherwise, you may not resell, share or redistribute the files.

## Downloads
Download links are sent to the email address you enter at checkout. Links expire after the time shown on the item, and each purchase allows a limited number of downloads. Please save your files after downloading. See the Delivery Policy for details.

## Refunds
See the Refund Policy.

## Ownership
All artwork, designs and files remain the property of [YOUR FULL NAME OR BUSINESS NAME]. Buying a file gives you the rights in its license, not ownership of the work.

## Liability
Files are provided as described on their page. To the extent the law allows, our total liability for any purchase is limited to the amount you paid for it.

## Law
These terms are governed by the laws of India. Courts in [CITY, STATE] have jurisdiction.

## Contact
[YOUR CONTACT EMAIL] or the Contact page on this website.

Last updated: [DATE]`,

  refunds: `Our products are digital files that are delivered instantly, so refunds work a little differently from physical goods.

## You can get a full refund when
- You haven't downloaded the file yet and you ask within [7] days of purchase, or
- The file is broken, missing, or clearly not what the item page described, and we can't fix it within [3] working days, or
- You were charged twice for the same order.

## After downloading
Once a file has been downloaded, refunds depend on the item: its page says whether refunds are allowed after download. When they aren't, we'll still help if something is wrong with the file.

## How to ask
Write to [YOUR CONTACT EMAIL] or use the Contact page, with your order number (it starts with KA-) and the email you used at checkout.

## How refunds are paid
Refunds go back to your original payment method through Razorpay. Banks usually take 5–7 working days to show the money. When a refund is made, the download links for that order stop working.

## Free items
Free downloads have nothing to refund.

Last updated: [DATE]`,

  delivery: `Everything we sell is a digital download. Nothing is shipped physically and there are no shipping charges.

## When you get your files
- Right after your payment is confirmed, the download appears on screen and a link is emailed to the address you entered. This usually takes seconds.
- Free items are sent to your email address straight away.

## Download links
- Each link works for the time shown on the item (for example 48 hours) and allows a set number of downloads.
- Please download and save your files promptly.
- Lost the email or the link expired? Use "Resend my downloads" in the store with your order number and email, or contact us.

## If nothing arrives
Check your spam or promotions folder first. If there's still nothing after 30 minutes, contact [YOUR CONTACT EMAIL] with your order number.

Last updated: [DATE]`,

  privacy: `This policy explains what personal data this website collects, why, and what you can ask us to do with it. The website is run by [YOUR FULL NAME OR BUSINESS NAME], [CITY], India. Contact: [YOUR CONTACT EMAIL].

## What we collect
- **When you buy or download:** your email address, the items, the amount, the currency and the payment status. Payments are handled by Razorpay; we never receive your card details.
- **When you contact us or join a notify-me list:** your name (if you give it), email address and message.
- **When you visit:** your IP address, approximate location (country and city, worked out from the IP address), device and browser type, the pages you view and where you came from. We use this to understand how the site is used and to stop abuse. After about a minute on the site your browser may ask whether to share your device location. That is optional: only if you choose Allow do we keep a rounded position (about 100 m) for 7 days, to make the visit map more accurate. If you say no, nothing is collected and you are not asked again.
- **When you chat with the assistant:** your messages and its answers. They are processed by Google's Gemini service to produce the answers and kept for up to 90 days so we can improve it.

## Stored on your device
We keep a random visitor ID, your chat history and a few preferences (such as your currency) in your browser's local storage. We don't use advertising or tracking cookies.

## Why we use it
To deliver what you bought, send receipts and download links, reply to you, keep the site secure, and improve the site and the assistant.

## Who else processes it
Razorpay (payments), Google (the assistant and email delivery through Gmail), Cloudflare (hosting and file storage) and Supabase (database). They process data only to provide their service to us.

## How long we keep it
Orders and receipts: as long as tax and accounting law requires. Visitor records: [365] days. Assistant chats: 90 days. Messages: until you ask us to delete them or we no longer need them.

## Your rights
You can ask to see, correct or delete your personal data, or withdraw consent, by writing to [YOUR CONTACT EMAIL]. We'll reply within [30] days. These rights are in line with India's Digital Personal Data Protection Act, 2023.

## Changes
If we change this policy, the new version will be posted here with a new date.

Last updated: [DATE]`
};

// Anything still in [BRACKETS] is a detail only the owner can fill in.
export const hasBlanks = (text) => /\[[A-Z0-9][^\]\n]{0,60}\]/.test(String(text || ''));
