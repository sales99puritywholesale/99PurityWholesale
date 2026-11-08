import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        brand: {
          bg: "#090C11",
          accent: "#4FC3D0",
          text: "#EDF2F7"
        },
        // Authenticated portal only (light canvas, dark sidebar). Namespaced so public-site classes are unaffected.
        portal: {
          canvas: "#F5F7FA",
          sidebar: "#090C11",
          'sidebar-hover': "#141A22",
          'sidebar-text': "#C8D1DC",
          accent: "#4FC3D0",
          'accent-strong': "#1B7F8C",
          text: "#17212B",
          muted: "#687582",
          card: "#FFFFFF",
          border: "#E5EAF0",
          danger: "#B42318",
          'danger-soft': "#FEF3F2",
          warning: "#B54708",
          'warning-soft': "#FFFAEB",
          success: "#067647",
          'success-soft': "#ECFDF3",
        }
      },
      fontFamily: {
        rajdhani: ['var(--font-rajdhani)'],
        'dm-sans': ['var(--font-dm-sans)'],
        'dm-mono': ['var(--font-dm-mono)'],
        'portal-heading': ['var(--font-portal-heading)', 'sans-serif'],
        'portal-body': ['var(--font-portal-body)', 'system-ui', 'sans-serif'],
        'portal-mono': ['var(--font-portal-mono)', 'ui-monospace', 'monospace'],
      },
      typography: (theme: any) => ({
        brand: {
          css: {
            '--tw-prose-body': theme('colors.gray[300]'),
            '--tw-prose-headings': theme('colors.white'),
            '--tw-prose-links': theme('colors.brand[accent]'),
            '--tw-prose-bold': theme('colors.white'),
            '--tw-prose-counters': theme('colors.brand[accent]'),
            '--tw-prose-bullets': theme('colors.brand[accent]'),
            '--tw-prose-hr': theme('colors.white / 0.1'),
            '--tw-prose-quotes': theme('colors.gray[300]'),
            '--tw-prose-quote-borders': theme('colors.brand[accent]'),
            '--tw-prose-captions': theme('colors.gray[400]'),
            '--tw-prose-code': theme('colors.white'),
            '--tw-prose-pre-code': theme('colors.gray[300]'),
            '--tw-prose-pre-bg': '#0e131b',
            '--tw-prose-th-borders': theme('colors.white / 0.1'),
            '--tw-prose-td-borders': theme('colors.white / 0.1'),
            '--tw-prose-invert-body': theme('colors.gray[300]'),
            '--tw-prose-invert-headings': theme('colors.white'),
            '--tw-prose-invert-links': theme('colors.brand[accent]'),
            '--tw-prose-invert-bold': theme('colors.white'),
            '--tw-prose-invert-counters': theme('colors.brand[accent]'),
            '--tw-prose-invert-bullets': theme('colors.brand[accent]'),
            '--tw-prose-invert-hr': theme('colors.white / 0.1'),
            '--tw-prose-invert-quotes': theme('colors.gray[300]'),
            '--tw-prose-invert-quote-borders': theme('colors.brand[accent]'),
            '--tw-prose-invert-captions': theme('colors.gray[400]'),
            '--tw-prose-invert-code': theme('colors.white'),
            '--tw-prose-invert-pre-code': theme('colors.gray[300]'),
            '--tw-prose-invert-pre-bg': '#0e131b',
            '--tw-prose-invert-th-borders': theme('colors.white / 0.1'),
            '--tw-prose-invert-td-borders': theme('colors.white / 0.1'),
          },
        },
      }),
      animation: {
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 1s ease-out forwards',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      backdropBlur: {
        '3xl': '64px',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
};
export default config;
