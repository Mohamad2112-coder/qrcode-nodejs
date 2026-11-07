/**
 * VAPID key configuration for Web Push API.
 * Generates ephemeral keys in development if none provided (with warning).
 */
import webpush from 'web-push';

const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

let publicKey = process.env.VAPID_PUBLIC_KEY;
let privateKey = process.env.VAPID_PRIVATE_KEY;

if (!publicKey || !privateKey || publicKey.includes('REPLACE_WITH') || privateKey.includes('REPLACE_WITH')) {
  const generated = webpush.generateVAPIDKeys();
  publicKey = generated.publicKey;
  privateKey = generated.privateKey;
  console.warn(
    '[VAPID] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set; using ephemeral keys for development only.',
  );
}

webpush.setVapidDetails(VAPID_SUBJECT, publicKey, privateKey);

export { webpush, publicKey as VAPID_PUBLIC_KEY, privateKey as VAPID_PRIVATE_KEY };
export default { webpush, VAPID_PUBLIC_KEY: publicKey };
