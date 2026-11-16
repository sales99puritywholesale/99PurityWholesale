/**
 * Media for the homepage "Highlights" carousel (storefront builds).
 *
 * Each slide shows a desktop screen recording / poster inside a browser frame, with a mobile screenshot
 * in a phone frame on top. Files live in /public/highlights. To change a slide, replace the files or edit
 * the paths below; set `video` to null to show the still poster only.
 */
export interface HighlightMedia {
  key: 'veracue' | 'helix' | 'primetime' | 'vlr';
  name: string;
  host: string;
  href: string;
  poster: string;
  video: string | null;
  phone: string;
}

export const HIGHLIGHT_MEDIA: HighlightMedia[] = [
  { key: 'veracue', name: 'Veracue Labs', host: 'veracuelabs.com', href: 'https://veracuelabs.com', poster: '/highlights/veracue-desktop.jpg', video: '/highlights/veracue.mp4', phone: '/highlights/veracue-mobile.jpg' },
  { key: 'helix', name: 'Helix Bio Chem', host: 'helixbiochem.com', href: 'https://helixbiochem.com', poster: '/highlights/helix-desktop.jpg', video: '/highlights/helix.mp4', phone: '/highlights/helix-mobile.jpg' },
  { key: 'primetime', name: 'PrimeTime BioLabs', host: 'primetimebiolabs.com', href: 'https://primetimebiolabs.com', poster: '/highlights/primetime-desktop.jpg', video: '/highlights/primetime.mp4', phone: '/highlights/primetime-mobile.jpg' },
  { key: 'vlr', name: 'Vanta Labs Research', host: 'vantalabsresearch.com', href: 'https://vantalabsresearch.com', poster: '/highlights/vlr-desktop.jpg', video: '/highlights/vlr.mp4', phone: '/highlights/vlr-mobile.jpg' },
];
