/**
 * Media for the homepage "Highlights" carousel.
 *
 * Each slide is a wide scene (`image`, optionally with a looping muted `video` on top) and a small
 * portrait "detail" card (`detail`, rendered like a phone screen). To swap media, drop the file in
 * /public and change the path. Set `video` to a path such as '/videos/lab.mp4' to play a silent loop
 * on the active slide (the `image` is used as the poster). Use only media you own or have licensed.
 */
export interface HighlightMedia {
  key: 'lab' | 'coa' | 'shipping' | 'private';
  image: string;
  video: string | null;
  detail: string;
}

export const HIGHLIGHT_MEDIA: HighlightMedia[] = [
  { key: 'lab', image: '/images/spps-automated-synthesizer-lab.jpg', video: null, detail: '/product-images/SEMAGLUTIDE 5mg-2.webp' },
  { key: 'coa', image: '/images/analytical_verification.png', video: null, detail: '/product-images/TIRZEPATIDE 10mg-3.webp' },
  { key: 'shipping', image: '/images/cold-chain-transit-shipping.jpg', video: null, detail: '/product-images/BPC-157 5mg-5.webp' },
  { key: 'private', image: '/images/vial_kit_luxury.png', video: null, detail: '/product-images/IPAMORELIN 5mg-2.webp' },
];
