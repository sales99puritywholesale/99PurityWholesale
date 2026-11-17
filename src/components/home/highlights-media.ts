/**
 * Media for the homepage "Highlights" carousel (storefront builds).
 *
 * Each slide shows a desktop screenshot inside a browser frame, with a mobile screenshot in a phone frame on
 * top. Files live in /public/highlights. To change a slide, replace the files or edit the paths below.
 */
export interface HighlightMedia {
  key: 'purity' | 'certified' | 'helix' | 'longevia' | 'veracue';
  name: string;
  host: string;
  href: string;
  poster: string;
  phone: string;
}

export const HIGHLIGHT_MEDIA: HighlightMedia[] = [
  { key: 'purity', name: '99 Purity Peptides', host: '99puritypeptides.com', href: 'https://99puritypeptides.com', poster: '/highlights/purity-desktop.png', phone: '/highlights/purity-mobile.png' },
  { key: 'certified', name: 'Certified Aminos', host: 'certified-aminos.com', href: 'https://certified-aminos.com', poster: '/highlights/certified-desktop.png', phone: '/highlights/certified-mobile.png' },
  { key: 'helix', name: 'Helix Bio Chem', host: 'helixbiochem.com', href: 'https://helixbiochem.com', poster: '/highlights/helix-desktop.png', phone: '/highlights/helix-mobile.png' },
  { key: 'longevia', name: 'Longevia Research', host: 'longeviaresearch.com', href: 'https://longeviaresearch.com', poster: '/highlights/longevia-desktop.png', phone: '/highlights/longevia-mobile.png' },
  { key: 'veracue', name: 'Veracue Labs', host: 'veracuelabs.com', href: 'https://veracuelabs.com', poster: '/highlights/veracue-desktop.png', phone: '/highlights/veracue-mobile.png' },
];
