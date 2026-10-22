// Makes a VAPID key pair for reply notifications (server/core/webpush.js). Prints the two lines to add to .dev.vars
// and the commands that store them as Worker secrets.
import { generateKeyPairSync } from 'node:crypto';
const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const jwk = privateKey.export({ format: 'jwk' });
const raw = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]).toString('base64url');
console.log(`VAPID_PUBLIC_KEY=${raw}\nVAPID_PRIVATE_KEY=${jwk.d}\n\n# for the live site:\n#   npx wrangler secret put VAPID_PUBLIC_KEY\n#   npx wrangler secret put VAPID_PRIVATE_KEY`);
