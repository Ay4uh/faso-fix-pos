import crypto from 'node:crypto';
import QRCode from 'qrcode';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Encode bytes as unpadded uppercase RFC 4648 Base32. */
export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

/** Decode RFC 4648 Base32 string (tolerant of spaces, hyphens, and case). */
export function base32Decode(str: string): Buffer {
  const clean = str.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Generate a 160-bit cryptographically random Base32 TOTP secret. */
export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

/** Compute an RFC 6238 6-digit TOTP code for the given counter step. */
export function generateTotpCode(secretBase32: string, counter: number): string {
  const key = base32Decode(secretBase32);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter), 0);
  const hmac = crypto.createHmac('sha1', key).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binCode =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binCode % 1_000_000).padStart(6, '0');
}

/**
 * Constant-time TOTP verification across +/- `window` 30-second steps.
 * Returns the matched counter index so callers can enforce single-use replay protection.
 */
export function verifyTotpCode(
  secretBase32: string,
  rawCode: string,
  window = 1,
  nowMs = Date.now()
): { valid: boolean; counter: number } {
  const normalized = String(rawCode || '').replace(/[\s-]/g, '');
  if (!/^\d{6}$/.test(normalized)) {
    return { valid: false, counter: -1 };
  }

  const currentCounter = Math.floor(nowMs / 1000 / 30);
  const inputBuf = Buffer.from(normalized, 'utf8');

  for (let delta = -window; delta <= window; delta++) {
    const candidateCounter = currentCounter + delta;
    if (candidateCounter < 0) continue;
    const expectedBuf = Buffer.from(generateTotpCode(secretBase32, candidateCounter), 'utf8');
    if (expectedBuf.length === inputBuf.length && crypto.timingSafeEqual(expectedBuf, inputBuf)) {
      return { valid: true, counter: candidateCounter };
    }
  }
  return { valid: false, counter: -1 };
}

export function buildOtpauthUri(secretBase32: string, accountName: string, issuer = 'Faso Fix POS'): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}`;
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Render a local CSP-safe SVG data URL QR code (zero external network calls). */
export async function renderQrSvgDataUrl(otpauthUri: string): Promise<string> {
  const svg = await QRCode.toString(otpauthUri, {
    type: 'svg',
    width: 220,
    margin: 2,
    errorCorrectionLevel: 'M',
  });
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}

function normalizeRecoveryCode(raw: string): string {
  return String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function hashRecoveryCode(normalized: string): string {
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

export function generateRecoveryCodes(count = 8): { plainCodes: string[]; hashedCodes: string[] } {
  const plainCodes: string[] = [];
  const hashedCodes: string[] = [];

  for (let i = 0; i < count; i++) {
    const bytes = crypto.randomBytes(8);
    let raw = '';
    for (let j = 0; j < 8; j++) {
      raw += RECOVERY_ALPHABET[bytes[j] % RECOVERY_ALPHABET.length];
    }
    plainCodes.push(`${raw.slice(0, 4)}-${raw.slice(4)}`);
    hashedCodes.push(hashRecoveryCode(raw));
  }
  return { plainCodes, hashedCodes };
}

export function parseRecoveryHashes(hashedJson: string | null | undefined): string[] {
  if (!hashedJson) return [];
  try {
    const parsed = JSON.parse(hashedJson);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function consumeRecoveryCode(
  rawCode: string,
  hashedJson: string | null | undefined
): { valid: boolean; remainingJson: string; remainingCount: number } {
  const hashes = parseRecoveryHashes(hashedJson);
  const normalized = normalizeRecoveryCode(rawCode);
  if (normalized.length < 8 || hashes.length === 0) {
    return { valid: false, remainingJson: JSON.stringify(hashes), remainingCount: hashes.length };
  }

  const candidateBuf = Buffer.from(hashRecoveryCode(normalized), 'hex');
  let matchedIndex = -1;

  for (let i = 0; i < hashes.length; i++) {
    try {
      const targetBuf = Buffer.from(hashes[i], 'hex');
      if (targetBuf.length === candidateBuf.length && crypto.timingSafeEqual(targetBuf, candidateBuf)) {
        matchedIndex = i;
      }
    } catch {}
  }

  if (matchedIndex === -1) {
    return { valid: false, remainingJson: JSON.stringify(hashes), remainingCount: hashes.length };
  }

  const next = hashes.filter((_, idx) => idx !== matchedIndex);
  return { valid: true, remainingJson: JSON.stringify(next), remainingCount: next.length };
}
