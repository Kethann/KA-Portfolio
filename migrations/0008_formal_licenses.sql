-- Formal license texts (server/content/license-templates.js) in place of the demo placeholder text. Licenses the owner
-- has written themselves are never touched; the other tiers can be added from the portal (Start from a formal template).

update licenses set summary = 'For personal, non-commercial use only. You may not sell, share or redistribute the file, or use it in commercial or client work.', body_md = '# Personal License

This Personal License is an agreement between you and Kethan Artzz (“Kethan Artzz”, “we”) for the Item named on your license certificate. By downloading or using the Item you accept these terms.

## 1. Definitions
- **“Item”** means the digital file or files you obtained from the Kethan Artzz store, including any updates.
- **“You”** means the person or organisation named as the license holder on the license certificate.
- **“End Product”** means a new work you create that incorporates the Item, in which the Item is not the main value and cannot be extracted as a stand-alone file.

## 2. What this license grants
A worldwide, non-exclusive, non-transferable right to use the Item for **personal, non-commercial purposes only**.

## 3. You may
- Use the Item in your own personal projects, such as personal artwork, study, practice and personal devices (for example as a wallpaper).
- Print the Item for display in your own home.
- Share images of your own non-commercial End Products on personal social media, provided the account is not used to sell or advertise, and you do not share the Item itself. Credit to Kethan Artzz is appreciated.
- Show your End Product in your personal portfolio.

## 4. You may not
- Use the Item, or any End Product containing it, for any commercial purpose: client work, advertising, marketing, sponsored or monetised content, or anything sold or used to earn income.
- Sell, resell, share, give away, rent, lend or redistribute the Item, in whole or in part, modified or not, including on file-sharing sites, marketplaces, stock libraries or template stores.
- Make the Item available for others to download or extract.
- Use the Item on merchandise or physical products for sale.
- Use the Item in a logo, trademark, service mark or brand identity.
- Use the Item to create or train artificial-intelligence or machine-learning models or datasets, or offer it as AI-generated output.
- Mint the Item, or a work based on it, as an NFT or other blockchain token.
- Claim the Item as your own original work, or remove any copyright notice or watermark.
- Use the Item in any unlawful, defamatory, obscene or hateful way.

## 5. Ownership
The Item and all intellectual property rights in it remain the property of Kethan Artzz. This license gives you the rights described above; it does not transfer ownership or copyright. All rights not expressly granted are reserved.

## 6. Term and termination
This license starts when your payment is confirmed (or, for a free Item, when you download it) and continues indefinitely. It ends automatically, without notice, if you breach any of its terms or if your purchase is refunded or reversed. When it ends you must stop using the Item and delete all copies of it. End Products lawfully published before termination for a reason other than your breach may remain in use.

## 7. No warranty
The Item is provided “as is”. Kethan Artzz does not warrant that it is error-free or fit for a particular purpose, beyond the description on its store page. Nothing in this license limits any right you have under applicable consumer protection law that cannot be excluded.

## 8. Limitation of liability
To the maximum extent permitted by law, the total liability of Kethan Artzz arising from the Item or this license is limited to the amount you paid for the Item. Kethan Artzz is not liable for indirect or consequential loss.

## 9. Verification
Your license certificate shows your name, order number and license code. Anyone can confirm that a license is valid by scanning its seal or visiting the license page of the store. Keep the purchase email and LICENSE.txt as proof of your license.

## 10. General
This license is personal to you and may not be transferred, sold or sublicensed. If any part of it is found unenforceable, the rest remains in effect. It is governed by the laws of India, and the courts having jurisdiction over the seller’s registered place of business have exclusive jurisdiction. For questions or a broader license, contact Kethan Artzz through the store.', version = version + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  where key = 'personal' and (trim(body_md) = '' or body_md like '%(demo text)%');

update licenses set summary = 'For commercial projects for yourself or one client per license: marketing, advertising, websites and social media. Not for merchandise for sale or redistribution of the file.', body_md = '# Commercial License

This Commercial License is an agreement between you and Kethan Artzz (“Kethan Artzz”, “we”) for the Item named on your license certificate. By downloading or using the Item you accept these terms.

## 1. Definitions
- **“Item”** means the digital file or files you obtained from the Kethan Artzz store, including any updates.
- **“You”** means the person or organisation named as the license holder on the license certificate.
- **“End Product”** means a new work you create that incorporates the Item, in which the Item is not the main value and cannot be extracted as a stand-alone file.

## 2. What this license grants
A worldwide, non-exclusive, non-transferable right to use the Item in **commercial End Products for yourself or for one client**. A separate license is needed for each additional client.

## 3. You may
- Use the Item in End Products for your own business or for one client, including advertising, marketing materials, presentations, websites, apps, social media posts, videos, packaging artwork and printed promotional material, with no limit on views or print runs.
- Use the Item in monetised or sponsored content and in paid advertising.
- Modify, crop, recolour and combine the Item with other material.
- Do everything permitted under the Personal License.

## 4. You may not
- Sell, resell, share, give away, rent or redistribute the Item itself, in whole or in part, modified or not, including as a template, asset, mock-up or stock item, or in a bundle.
- Use the Item on merchandise or products where the Item is the main reason for purchase (for example posters, prints, apparel, phone cases or stickers for sale). This needs the Extended Commercial License.
- Use the Item in End Products for more than one client under one license.
- Use the Item in a logo, trademark, service mark or brand identity.
- Use the Item to create or train artificial-intelligence or machine-learning models or datasets.
- Mint the Item, or a work based on it, as an NFT or other blockchain token.
- Claim the Item as your own original work, or remove any copyright notice.
- Use the Item in any unlawful, defamatory, obscene or hateful way.

## 5. Your client
You may transfer an End Product (not the Item itself) to your one client, who may use that End Product under these same terms. You remain responsible for your client’s compliance.

## 6. Ownership
The Item and all intellectual property rights in it remain the property of Kethan Artzz. This license gives you the rights described above; it does not transfer ownership or copyright. All rights not expressly granted are reserved.

## 7. Term and termination
This license starts when your payment is confirmed (or, for a free Item, when you download it) and continues indefinitely. It ends automatically, without notice, if you breach any of its terms or if your purchase is refunded or reversed. When it ends you must stop using the Item and delete all copies of it. End Products lawfully published before termination for a reason other than your breach may remain in use.

## 8. No warranty
The Item is provided “as is”. Kethan Artzz does not warrant that it is error-free or fit for a particular purpose, beyond the description on its store page. Nothing in this license limits any right you have under applicable consumer protection law that cannot be excluded.

## 9. Limitation of liability
To the maximum extent permitted by law, the total liability of Kethan Artzz arising from the Item or this license is limited to the amount you paid for the Item. Kethan Artzz is not liable for indirect or consequential loss.

## 10. Verification
Your license certificate shows your name, order number and license code. Anyone can confirm that a license is valid by scanning its seal or visiting the license page of the store. Keep the purchase email and LICENSE.txt as proof of your license.

## 11. General
This license is personal to you and may not be transferred, sold or sublicensed. If any part of it is found unenforceable, the rest remains in effect. It is governed by the laws of India, and the courts having jurisdiction over the seller’s registered place of business have exclusive jurisdiction. For questions or a broader license, contact Kethan Artzz through the store.', version = version + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  where key = 'commercial' and (trim(body_md) = '' or body_md like '%(demo text)%');

update licenses set summary = 'Everything in the Commercial License plus merchandise and products for sale, with no unit limit. The file itself may never be resold or redistributed.', body_md = '# Extended Commercial License

This Extended Commercial License is an agreement between you and Kethan Artzz (“Kethan Artzz”, “we”) for the Item named on your license certificate. By downloading or using the Item you accept these terms.

## 1. Definitions
- **“Item”** means the digital file or files you obtained from the Kethan Artzz store, including any updates.
- **“You”** means the person or organisation named as the license holder on the license certificate.
- **“End Product”** means a new work you create that incorporates the Item, in which the Item is not the main value and cannot be extracted as a stand-alone file.

## 2. What this license grants
A worldwide, non-exclusive, non-transferable right to use the Item in **commercial End Products, including products for sale**, for yourself or for one client per license.

## 3. You may
- Do everything permitted under the Commercial License.
- Use the Item on merchandise and physical or digital products for sale, such as posters, prints, apparel, phone cases, stickers, book covers, games and print-on-demand products, with no limit on the number of units sold.
- Use the Item in End Products that are themselves sold, as long as the Item cannot be extracted from them as a stand-alone file.

## 4. You may not
- Sell, resell, share, give away, rent or redistribute the Item itself, in whole or in part, modified or not, including as a template, asset, mock-up, brush, texture or stock item, or in a bundle.
- Use the Item in a logo, trademark, service mark or brand identity.
- Use the Item to create or train artificial-intelligence or machine-learning models or datasets.
- Mint the Item, or a work based on it, as an NFT or other blockchain token.
- Claim the Item as your own original work, or remove any copyright notice.
- Use the Item in any unlawful, defamatory, obscene or hateful way.

## 5. Your client
You may transfer an End Product (not the Item itself) to your one client, who may use and sell that End Product under these same terms. You remain responsible for your client’s compliance.

## 6. Ownership
The Item and all intellectual property rights in it remain the property of Kethan Artzz. This license gives you the rights described above; it does not transfer ownership or copyright. All rights not expressly granted are reserved.

## 7. Term and termination
This license starts when your payment is confirmed (or, for a free Item, when you download it) and continues indefinitely. It ends automatically, without notice, if you breach any of its terms or if your purchase is refunded or reversed. When it ends you must stop using the Item and delete all copies of it. End Products lawfully published before termination for a reason other than your breach may remain in use.

## 8. No warranty
The Item is provided “as is”. Kethan Artzz does not warrant that it is error-free or fit for a particular purpose, beyond the description on its store page. Nothing in this license limits any right you have under applicable consumer protection law that cannot be excluded.

## 9. Limitation of liability
To the maximum extent permitted by law, the total liability of Kethan Artzz arising from the Item or this license is limited to the amount you paid for the Item. Kethan Artzz is not liable for indirect or consequential loss.

## 10. Verification
Your license certificate shows your name, order number and license code. Anyone can confirm that a license is valid by scanning its seal or visiting the license page of the store. Keep the purchase email and LICENSE.txt as proof of your license.

## 11. General
This license is personal to you and may not be transferred, sold or sublicensed. If any part of it is found unenforceable, the rest remains in effect. It is governed by the laws of India, and the courts having jurisdiction over the seller’s registered place of business have exclusive jurisdiction. For questions or a broader license, contact Kethan Artzz through the store.', version = version + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  where key = 'extended' and (trim(body_md) = '' or body_md like '%(demo text)%');
