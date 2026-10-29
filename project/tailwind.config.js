/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        serif: ['DM Serif Display', 'Georgia', 'serif'],
        mono: ['Inter', 'sans-serif'],
      },
      fontSize: {
        xs: ['12px', { lineHeight: '1.4' }],
        sm: ['14px', { lineHeight: '1.6' }],
        base: ['16px', { lineHeight: '1.65' }],
        lg: ['18px', { lineHeight: '1.45' }],
        xl: ['20px', { lineHeight: '1.3' }],
        '2xl': ['24px', { lineHeight: '1.25' }],
        '3xl': ['30px', { lineHeight: '1.15' }],
        '4xl': ['42px', { lineHeight: '1.12' }],
        '5xl': ['56px', { lineHeight: '1.08' }],
        '6xl': ['64px', { lineHeight: '1.05' }],
        '7xl': ['72px', { lineHeight: '1.05' }],
        '8xl': ['80px', { lineHeight: '1.05' }],
      },
      fontWeight: {
        normal: '400',
        medium: '500',
        semibold: '600',
        bold: '600',
      },
      letterSpacing: {
        wide: '0.01em',
        wider: '0.04em',
        widest: '0.12em',
      },
    },
  },
  plugins: [],
};
