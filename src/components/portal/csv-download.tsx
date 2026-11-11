'use client';

/**
 * Saves a CSV that the SERVER already built (src/lib/portal/aftersales/model.ts toCsv: formula-safe, fully quoted) as a file, entirely in the browser. Nothing is sent anywhere.
 * A UTF-8 byte order mark makes spreadsheet programs read non-English names correctly.
 */
export function CsvDownload({ filename, csv, label = 'Download CSV' }: { filename: string; csv: string; label?: string }) {
  const save = () => {
    const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };
  return <button type="button" onClick={save} className="portal-btn-quiet">{label}</button>;
}
