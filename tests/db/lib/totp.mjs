// RFC 6238 TOTP (SHA-1, 6 digits, 30 s) computed in memory for the disposable stack. Seeds are never logged.
import { createHmac } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(s) {
  const clean = s.replace(/=+$/g, '').replace(/\s+/g, '').toUpperCase();
  let bits = 0; let value = 0; const out = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error('invalid base32');
    value = (value << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}

export function totp(secretBase32, atMs = Date.now()) {
  const counter = Math.floor(atMs / 1000 / 30);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', base32Decode(secretBase32)).update(buf).digest();
  const off = h[h.length - 1] & 0x0f;
  const code = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(code % 1_000_000).padStart(6, '0');
}

/** Waits until the next 30 s step (a code already used in a window is rejected by GoTrue). */
export async function nextStep() {
  const ms = 30000 - (Date.now() % 30000) + 250;
  await new Promise((r) => setTimeout(r, ms));
}
