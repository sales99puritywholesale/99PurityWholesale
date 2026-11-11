import { DOCUMENT_MAX_BYTES } from './steps';

/**
 * Upload checks (pure). The claimed MIME type of a browser upload is not trusted: the first bytes must match a PDF, PNG or JPEG signature, and the type derived from
 * the bytes is the one stored. SVG, HTML and every other type are refused, whatever the file name says.
 */
export type SniffedType = 'application/pdf' | 'image/png' | 'image/jpeg';

export function sniffContentType(bytes: Uint8Array): SniffedType | null {
  const b = bytes;
  if (b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) return 'application/pdf'; // %PDF-
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  return null;
}

/** A display file name: no path parts, no control characters, at most 200 characters, never empty. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 200);
  return cleaned.length > 0 ? cleaned : 'file';
}

export type UploadCheck = { ok: true; contentType: SniffedType; fileName: string; sizeBytes: number } | { ok: false; code: 'document_invalid' };
export function checkUpload(fileName: string, head: Uint8Array, sizeBytes: number): UploadCheck {
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > DOCUMENT_MAX_BYTES) return { ok: false, code: 'document_invalid' };
  const contentType = sniffContentType(head);
  return contentType ? { ok: true, contentType, fileName: safeFileName(fileName), sizeBytes } : { ok: false, code: 'document_invalid' };
}
