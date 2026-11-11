import { describe, expect, it } from 'vitest';
import { checkUpload, safeFileName, sniffContentType } from '@/lib/portal/onboarding/files';

const bytes = (...n: number[]) => new Uint8Array(n);
const PDF = bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0);
const JPG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10);
const text = (s: string) => new TextEncoder().encode(s);

describe('upload checks (the file bytes decide, not the claimed type)', () => {
  it('recognizes PDF, PNG and JPEG signatures', () => {
    expect(sniffContentType(PDF)).toBe('application/pdf');
    expect(sniffContentType(PNG)).toBe('image/png');
    expect(sniffContentType(JPG)).toBe('image/jpeg');
  });
  it('refuses SVG, HTML, scripts, GIF, ZIP and empty input even when the name says otherwise', () => {
    expect(sniffContentType(text('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(sniffContentType(text('<!doctype html><script>alert(1)</script>'))).toBeNull();
    expect(sniffContentType(text('GIF89a'))).toBeNull();
    expect(sniffContentType(bytes(0x50, 0x4b, 0x03, 0x04))).toBeNull();
    expect(sniffContentType(bytes())).toBeNull();
    expect(sniffContentType(bytes(0x25, 0x50, 0x44))).toBeNull(); // truncated PDF signature
    expect(checkUpload('artwork.png', text('<html>'), 100)).toEqual({ ok: false, code: 'document_invalid' });
  });
  it('enforces the size window of 1 byte to 10 MB', () => {
    expect(checkUpload('a.pdf', PDF, 1).ok).toBe(true);
    expect(checkUpload('a.pdf', PDF, 10 * 1024 * 1024).ok).toBe(true);
    expect(checkUpload('a.pdf', PDF, 10 * 1024 * 1024 + 1).ok).toBe(false);
    expect(checkUpload('a.pdf', PDF, 0).ok).toBe(false);
    expect(checkUpload('a.pdf', PDF, 1.5).ok).toBe(false);
  });
  it('stores the type derived from the bytes, not from the name', () => {
    const r = checkUpload('totally-a.png', PDF, 500);
    expect(r.ok && r.contentType).toBe('application/pdf');
  });
  it('cleans display file names (no paths, no control characters, never empty, bounded)', () => {
    expect(safeFileName('../../etc/passwd')).toBe('passwd');
    expect(safeFileName('C:\\Users\\x\\label.pdf')).toBe('label.pdf');
    expect(safeFileName('a\u0000b\nc.pdf')).toBe('abc.pdf');
    expect(safeFileName('   ')).toBe('file');
    expect(safeFileName('x'.repeat(500)).length).toBe(200);
  });
});
