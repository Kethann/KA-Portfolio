// Formal texts for the four legal pages, written for how this store actually works (digital downloads, Razorpay, emailed
// links, the per-item refund rule, visitor logs, the AI assistant) and for Indian law (Consumer Protection Act 2019 and the
// E-Commerce Rules 2020, the IT Act 2000, the Digital Personal Data Protection Act 2023). They are careful starting points,
// not legal advice. Nothing is public until the owner publishes a page in the portal.
//
// {{placeholders}} are filled every time a page is shown, from Settings > Store (business name, address, support email)
// and the site's own settings, so the pages stay correct when those change. fillLegal() does it.
export const LEGAL_TITLES = { terms: 'Terms of Sale', privacy: 'Privacy Policy', refunds: 'Refund Policy', delivery: 'Delivery Policy' };

const SELLER = `- **Seller:** {{seller_name}}, {{seller_address}}
- **Website:** {{site_url}}
- **Contact:** {{contact_email}}`;

const GRIEVANCE = `## Grievance officer
In line with the Consumer Protection (E-Commerce) Rules, 2020 and the Information Technology Act, 2000, the grievance officer for this website is **{{seller_name}}**, who can be reached {{contact}}. We acknowledge complaints within 48 hours and aim to resolve them within one month of receipt.`;

export const LEGAL_DRAFTS = {
  terms: `${SELLER}

These Terms of Sale (“Terms”) govern every purchase and download from {{site_url}} (the “Store”), which is operated by {{seller_name}} (“we”, “us”, “our”). By placing an order or downloading an item you agree to these Terms, the Refund Policy, the Delivery Policy and the license that comes with the item.

## 1. Eligibility
You must be at least 18 years old, or use the Store with the consent and supervision of a parent or legal guardian, and be able to enter into a binding contract under Indian law.

## 2. What we sell
The Store sells digital products only: artwork, design resources and related files (“Items”). Nothing is shipped physically. Each Item’s page describes its contents, file format and the license that applies.

## 3. Prices and taxes
- Prices are shown in Indian rupees (₹) for buyers in India and in US dollars ($) for buyers elsewhere. The total shown at checkout, including any applicable taxes, is the amount you pay.
- We may change prices at any time. A change never affects an order that has already been paid.
- If an Item is shown at an obviously wrong price because of an error, we may cancel the order and refund any amount paid in full.

## 4. Payment
Payments are processed securely by Razorpay Software Private Limited. We never see or store your card, UPI or bank details. An order is accepted only when Razorpay confirms the payment to us. Discount codes are subject to the conditions shown with them, and can’t be exchanged for cash.

## 5. Delivery
Items are delivered digitally, by an on-screen download and a download link sent to the email address you enter at checkout. Links are valid for a limited time and a limited number of downloads, as described in the Delivery Policy. You are responsible for entering a correct email address and for saving your files.

## 6. Your license
Every Item comes with a license (Personal, Commercial or Extended Commercial, as shown on the Item’s page). The license is attached to your purchase email as LICENSE.txt and can be verified at any time from the license certificate. The license states what you may and may not do with the Item. You keep the version of the license in force when you bought the Item.

## 7. Intellectual property
All Items, artwork, designs, text and other content on the Store are owned by {{seller_name}} and protected by the Copyright Act, 1957 and international copyright law. Buying an Item gives you the rights in its license only, not ownership of the work or its copyright.

## 8. Acceptable use
You must not: share, resell or redistribute Items except as your license allows; copy or download content from the Store by automated means; interfere with the Store’s security or operation; or use the Store for any unlawful purpose.

## 9. Refunds
Refunds are handled under the Refund Policy, which forms part of these Terms.

## 10. Warranties
Items are provided as described on their page. Except as stated in these Terms and to the extent permitted by law, Items are provided “as is”, without any other warranty. Nothing in these Terms limits your rights under the Consumer Protection Act, 2019 that cannot lawfully be excluded.

## 11. Limitation of liability
To the maximum extent permitted by law, our total liability for any claim relating to an order is limited to the amount you paid for that order. We are not liable for indirect or consequential loss, loss of data or loss of profit.

## 12. Changes to these Terms
We may update these Terms from time to time. The version published on this page when you place an order applies to that order.

## 13. Governing law and disputes
These Terms are governed by the laws of India. We will first try to resolve any dispute with you informally. Subject to your rights as a consumer, the courts having jurisdiction over the seller’s place of business have exclusive jurisdiction.

${GRIEVANCE}

_Last updated: {{last_updated}}_`,

  refunds: `${SELLER}

This Refund Policy explains when you can get your money back for an Item bought from {{site_url}}. Because Items are digital files delivered instantly, refunds are handled differently from physical goods.

## 1. When you are entitled to a full refund
- **Not downloaded:** you have not downloaded the Item and you ask within 7 days of purchase.
- **Faulty Item:** the file is corrupt, incomplete, or materially different from its description, and we cannot fix it or provide a working replacement within 3 working days of your report.
- **Duplicate payment:** you were charged more than once for the same order.
- **Not delivered:** you did not receive the Item and we cannot deliver it within 3 working days of your report.

## 2. After an Item has been downloaded
Once an Item has been downloaded, it cannot be returned. Each Item’s page states whether a refund is still available after download. Where it is not, we will still repair or replace a faulty Item, and the rights in section 1 for faulty or undelivered Items continue to apply.

## 3. Free Items
Free Items involve no payment and so are not refundable.

## 4. How to request a refund
Contact us {{contact}} with your order number (it starts with “KA-”), the email address used at checkout, and the reason for your request. We will acknowledge your request within 48 hours.

## 5. How refunds are paid
Approved refunds are made to your original payment method through Razorpay within 7 working days of approval. Your bank may take a further 5–7 working days to show the amount. When an order is refunded, its download links and license are cancelled and the license certificate shows the license as revoked.

## 6. Misuse
We may refuse a refund where there is clear evidence of abuse, such as repeated refund requests after downloading.

${GRIEVANCE}

_Last updated: {{last_updated}}_`,

  delivery: `${SELLER}

All products sold on {{site_url}} are digital downloads. Nothing is shipped physically and no shipping charges apply.

## 1. When you receive your Item
- **Paid Items:** as soon as Razorpay confirms your payment, the download is shown on screen and a download link is emailed to the address you entered at checkout. This normally takes a few seconds and always within 30 minutes.
- **Free Items:** the download link is sent immediately to your email address.

## 2. Download links
- Unless an Item’s page says otherwise, each link is valid for {{link_hours}} hours and allows {{max_downloads}} downloads.
- The purchase email shows the exact expiry time and number of downloads for your link.
- Please download your files promptly and keep a backup copy.

## 3. Lost or expired links
Use “Email me my download links” in the Store, with the email address used at checkout, to receive fresh links for all your purchases at any time. You can also contact us with your order number.

## 4. If your Item doesn’t arrive
First check your spam, junk or promotions folder. If nothing has arrived within 30 minutes of payment, contact us {{contact}} with your order number. If we cannot deliver the Item within 3 working days, you are entitled to a full refund under the Refund Policy.

${GRIEVANCE}

_Last updated: {{last_updated}}_`,

  privacy: `${SELLER}

This Privacy Policy explains how {{seller_name}} (“we”, “us”) collects and uses personal data through {{site_url}}, and the rights you have. We act as the “Data Fiduciary” under the Digital Personal Data Protection Act, 2023 (“DPDP Act”). We collect only what we need, and we never sell your personal data.

## 1. Data we collect
- **Purchases and downloads:** your email address, the name you give for your license, the items you buy, amounts, currency, order and payment status, and download activity. Payments are handled by Razorpay; we never receive your card, UPI or bank details.
- **Messages:** your name, email address and message when you use the Contact form, and your email address if you join a “notify me” list.
- **Visits:** your IP address, approximate location (country and city, derived from the IP address), device and browser type, language, pages viewed, time spent and the referring page. We use this to understand how the site is used and to protect it from abuse.
- **Precise location (optional):** after about a minute on the site your browser may ask whether to share your location. Only if you choose “Allow” do we store a position rounded to roughly 100 metres, which is deleted after 7 days. If you decline, nothing is collected and you are not asked again.
- **Assistant chats:** your messages to the site assistant and its replies.

## 2. Why we use it (purposes)
- To process orders, deliver Items, issue licenses, receipts and invoices, and handle refunds.
- To reply to your messages and send emails you asked for.
- To keep the Store secure, prevent fraud and abuse, and meet legal, tax and accounting obligations.
- To understand and improve the website and the assistant.

We process this data on the basis of your consent, or for the legitimate uses permitted by the DPDP Act, such as completing a purchase you requested and complying with the law. We do not send marketing emails unless you ask for them.

## 3. Cookies and storage on your device
We do not use advertising or tracking cookies. Your browser stores a random visitor ID, your assistant chat and a few preferences (such as currency) in local storage on your device. You can clear these at any time in your browser settings.

## 4. Service providers
We share personal data only with providers that help us run the Store, under contracts or terms that require them to protect it:
- **Razorpay** – payment processing.
- **Cloudflare** – website hosting, database and file storage.
- **Google (Gmail) or Brevo** – sending emails.
- **Google (Gemini) or Anthropic** – generating the assistant’s replies.
Some of these providers may process data outside India. We do not share data with anyone else unless required by law.

## 5. How long we keep it
- **Orders, invoices and payment records:** for as long as Indian tax and accounting laws require (generally up to 8 years).
- **Visit records:** {{visit_retention}}.
- **Precise location:** 7 days.
- **Assistant chats:** 90 days.
- **Messages:** until the conversation is resolved, or earlier if you ask us to delete them.

## 6. Security
Data is transmitted over encrypted connections (HTTPS). Access to the Store’s administration is protected by strong passwords, optional two-factor authentication and access controls. Download links are signed and time-limited. No system is completely secure, but we take reasonable security safeguards as required by the DPDP Act.

## 7. Your rights
Under the DPDP Act you have the right to:
- obtain a summary of the personal data we hold about you and how it is processed;
- have inaccurate or incomplete data corrected or updated;
- have your data erased when it is no longer needed, unless the law requires us to keep it;
- withdraw your consent at any time (this does not affect processing already carried out);
- nominate another person to exercise your rights in the event of death or incapacity; and
- have your grievances addressed.
To exercise any of these rights, contact us {{contact}}. If you are not satisfied with our response, you may complain to the Data Protection Board of India.

## 8. Children
The Store is not intended for children under 18. We do not knowingly collect personal data from children without verifiable consent from a parent or guardian.

## 9. Changes to this policy
We may update this policy from time to time. The new version will be posted on this page with a new date.

${GRIEVANCE}

_Last updated: {{last_updated}}_`
};

// Anything still in [BRACKETS] is a detail only the owner can fill in (older saved texts may still have some).
export const hasBlanks = (text) => /\[[A-Z0-9][^\]\n]{0,60}\]/.test(String(text || ''));

/** Fills the {{placeholders}} in a legal text from the store settings. Unknown placeholders are left as they are. */
export function fillLegal(text, { store = {}, visitors = {}, siteName = 'Kethan Artzz', siteUrl = '', updatedAt = null } = {}){
  const site = String(siteUrl || '').replace(/\/+$/, '');
  const email = String(store.supportEmail || '').trim();
  const contactPage = site ? `${site}/?page=contact` : 'the Contact page';
  const days = Number(visitors.retentionDays) || 0;
  const vars = {
    seller_name: String(store.sellerName || '').trim() || siteName,
    seller_address: String(store.sellerAddress || '').trim().replace(/\s*\n\s*/g, ', ') || 'India',
    site_name: siteName,
    site_url: site || 'this website',
    contact: email ? `by email at ${email} or through the Contact page at ${contactPage}` : `through the Contact page at ${contactPage}`,
    contact_email: email || contactPage,
    last_updated: new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(updatedAt ? new Date(updatedAt) : new Date()),
    visit_retention: days > 0 ? `${days} days` : 'until they are no longer needed for the purposes above',
    link_hours: String(Number(store.downloadLinkHours) || 48),
    max_downloads: String(Number(store.downloadMaxDownloads) || 5)
  };
  return String(text || '').replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, k) => (k in vars ? vars[k] : m));
}
