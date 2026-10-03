/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    screens: { xs: '375px', sm: '640px', md: '768px', lg: '1024px', xl: '1280px', '2xl': '1440px' },
    extend: {
      fontFamily: { sans: ['"Inter Variable"', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'] },
      colors: {
        canvas: v('canvas'), surface: v('surface'), card: v('card'), sunken: v('sunken'),
        ink: v('ink'), muted: v('muted'), line: v('line'), inverse: v('inverse'),
        accent: { DEFAULT: v('accent'), strong: v('accent-strong'), soft: v('accent-soft'), text: v('accent-text') },
        success: { DEFAULT: v('success'), soft: v('success-soft') },
        warning: { DEFAULT: v('warning'), soft: v('warning-soft') },
        danger: { DEFAULT: v('danger'), soft: v('danger-soft') },
        info: { DEFAULT: v('info'), soft: v('info-soft') },
      },
      borderRadius: { sm: '6px', md: '10px', lg: '14px', xl: '20px' },
      boxShadow: {
        card: '0 1px 2px rgb(40 36 34 / 0.04), 0 8px 24px -12px rgb(40 36 34 / 0.12)',
        lift: '0 2px 4px rgb(40 36 34 / 0.05), 0 20px 40px -16px rgb(40 36 34 / 0.22)',
      },
      maxWidth: { page: '1200px' },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'rise-in': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'none' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: { 'fade-in': 'fade-in 180ms ease-out', 'rise-in': 'rise-in 200ms ease-out', shimmer: 'shimmer 1.4s infinite' },
    },
  },
  plugins: [],
};
