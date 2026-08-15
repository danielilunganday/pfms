// Field-level encryption for sensitive borrower PII (national ID, address,
// phone number) — AES-256-GCM via Node's built-in crypto, no extra
// dependency. Values are encrypted before every write to the `borrowers`
// table and decrypted right after every read, entirely inside
// LendingService — nothing outside that service ever sees ciphertext or
// needs to know encryption is happening.
//
// Key: PII_ENCRYPTION_KEY, a 64-character hex string (32 bytes), set in the
// backend .env. Generate one with: openssl rand -hex 32
//
// If PII_ENCRYPTION_KEY is not set:
//   - in production (NODE_ENV=production) the app refuses to start.
//   - otherwise a fixed, clearly-insecure dev key is used and a warning is
//     logged, so local development keeps working without extra setup.
//
// Backward compatibility: values written before encryption was introduced
// are plain text. decryptPII() detects the "v1:" prefix used by this module
// and returns anything without it unchanged, so old rows keep working and
// are transparently re-encrypted the next time they're saved. See also
// src/scripts/encrypt-existing-pii.ts, which proactively re-encrypts any
// remaining plaintext rows in one pass.
import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const DEV_FALLBACK_KEY_MATERIAL = 'dev-only-insecure-pii-key-change-me-before-production';

let warnedOnce = false;

function getKey(): Buffer {
  const keyHex = process.env.PII_ENCRYPTION_KEY;
  if (!keyHex) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'PII_ENCRYPTION_KEY is not set. Refusing to start in production without it — ' +
          'borrower national ID / address / phone number would otherwise be at risk. ' +
          'Generate one with `openssl rand -hex 32` and set it in the backend .env.',
      );
    }
    if (!warnedOnce) {
      // eslint-disable-next-line no-console
      console.warn(
        '[pii-crypto] PII_ENCRYPTION_KEY not set — using an insecure DEV-ONLY key. ' +
          'Set a real key (openssl rand -hex 32) before deploying with real borrower data.',
      );
      warnedOnce = true;
    }
    return crypto.createHash('sha256').update(DEV_FALLBACK_KEY_MATERIAL).digest();
  }
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== 32) {
    throw new Error('PII_ENCRYPTION_KEY must be a 64-character hex string (32 bytes). See .env.example.');
  }
  return key;
}

/** Encrypts a plaintext PII value for storage. Returns null for empty input
 *  so optional fields (nationalId, address) stay nullable in the DB. */
export function encryptPII(plaintext: string | null | undefined): string | null {
  if (plaintext === null || plaintext === undefined || plaintext === '') return null;
  const key = getKey();
  const iv = crypto.randomBytes(12); // GCM standard IV length
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext.toString('base64')}`;
}

/** Decrypts a value stored by encryptPII(). Values without the "v1:" prefix
 *  are treated as legacy plaintext and returned as-is (see module doc). */
export function decryptPII(stored: string | null | undefined): string | null {
  if (stored === null || stored === undefined || stored === '') return null;
  if (!stored.startsWith('v1:')) return stored; // legacy plaintext
  const parts = stored.split(':');
  if (parts.length !== 4) return stored; // malformed — fail open to avoid data loss, don't crash reads
  const [, ivB64, tagB64, dataB64] = parts;
  try {
    const key = getKey();
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const data = Buffer.from(dataB64, 'base64');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
    return plaintext.toString('utf8');
  } catch {
    return '[unreadable — wrong PII_ENCRYPTION_KEY?]';
  }
}

export function isEncrypted(stored: string | null | undefined): boolean {
  return !!stored && stored.startsWith('v1:');
}
