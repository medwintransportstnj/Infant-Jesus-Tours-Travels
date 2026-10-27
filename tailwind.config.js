/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    screens: { xs: '375px', sm: '640px', md: '768px', lg: '1024px', xl: '1280px', '2xl': '1440px' },
    extend: {
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['"Sora Variable"', 'Sora', '"Inter Variable"', 'system-ui', 'sans-serif'],
      },
      colors: {
        canvas: v('canvas'), surface: v('surface'), card: v('card'), sunken: v('sunken'),
        ink: v('ink'), muted: v('muted'), line: v('line'), inverse: v('inverse'),
        accent: { DEFAULT: v('accent'), strong: v('accent-strong'), soft: v('accent-soft'), text: v('accent-text') },
        success: { DEFAULT: v('success'), soft: v('success-soft') },
        warning: { DEFAULT: v('warning'), soft: v('warning-soft') },
        danger: { DEFAULT: v('danger'), soft: v('danger-soft') },
        info: { DEFAULT: v('info'), soft: v('info-soft') },
      },
      borderRadius: { sm: '6px', md: '10px', lg: '14px', xl: '16px', '2xl': '20px', '3xl': '28px' },
      boxShadow: {
        card: '0 1px 2px rgb(19 19 19 / 0.04), 0 10px 28px -14px rgb(19 19 19 / 0.14)',
        lift: '0 2px 6px rgb(19 19 19 / 0.06), 0 28px 56px -20px rgb(19 19 19 / 0.28)',
      },
      maxWidth: { page: '1240px' },
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
