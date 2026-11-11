import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// shadcn's cn() helper. The portal uses its own colour names (text-portal-muted, bg-portal-accent ...), which tailwind-merge must know are COLOURS, otherwise it would treat
// "text-portal-muted" as a font size and silently drop "text-sm" (or the other way round).
const twMerge = extendTailwindMerge({ extend: { theme: { colors: [(v: string) => v.startsWith('portal-')] } } });

export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));
