import crypto from 'node:crypto';

const derivedKeyCache = new Map<string, Buffer>();

function getVaultKey(version: 'v1' | 'v2'): Buffer {
  if (version === 'v2') {
    const raw = process.env.FIELD_ENCRYPTION_KEY?.trim();
    if (!raw) {
      throw new Error('FIELD_ENCRYPTION_KEY is required to decrypt v2 encrypted secrets.');
    }
    const cacheKey = `v2:${raw}`;
    let buf = derivedKeyCache.get(cacheKey);
    if (!buf) {
      buf = crypto.scryptSync(raw, 'fasofix-vault-v2', 32);
      derivedKeyCache.set(cacheKey, buf);
    }
    return buf;
  }

  // Stable app-scoped key (intentionally decoupled from DATABASE_URL so DB credential rotation never invalidates TOTP secrets)
  const raw = process.env.SESSION_SECRET?.trim() || 'fasofix-pos-vault-v1-stable-key';
  const cacheKey = `v1:${raw}`;
  let buf = derivedKeyCache.get(cacheKey);
  if (!buf) {
    buf = crypto.scryptSync(raw, 'fasofix-vault-v1', 32);
    derivedKeyCache.set(cacheKey, buf);
  }
  return buf;
}

/**
 * Encrypt sensitive at-rest application secrets (e.g. TOTP shared keys) using AES-256-GCM.
 */
export function encryptSecret(plaintext: string): string {
  const useV2 = Boolean(process.env.FIELD_ENCRYPTION_KEY?.trim());
  const version: 'v1' | 'v2' = useV2 ? 'v2' : 'v1';
  const key = getVaultKey(version);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:${version}:${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
}

/**
 * Decrypt AES-256-GCM secrets produced by encryptSecret() (supports v1, v2, and legacy plaintext).
 */
export function decryptSecret(stored: string | null | undefined): string {
  if (!stored) return '';
  if (!stored.startsWith('enc:v1:') && !stored.startsWith('enc:v2:')) {
    return stored;
  }

  const parts = stored.split(':');
  if (parts.length !== 5) {
    throw new Error('Malformed encrypted secret payload.');
  }
  const version = parts[1] as 'v1' | 'v2';
  const iv = Buffer.from(parts[2], 'base64');
  const tag = Buffer.from(parts[3], 'base64');
  const ciphertext = Buffer.from(parts[4], 'base64');
  const key = getVaultKey(version);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
