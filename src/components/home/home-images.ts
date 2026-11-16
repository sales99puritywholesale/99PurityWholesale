/**
 * Homepage photography slots.
 *
 * Every image on the homepage is read from here. To swap a photo, drop the new file
 * in /public and change the path below. Set a slot to `null` to show a neutral
 * placeholder block instead (nothing breaks while an image is missing).
 */
export const HOME_IMAGES = {
  hero: '/images/chromatography_lab.png',
  documentation: '/images/hero-lab-bg-v2.png',
} as const;
