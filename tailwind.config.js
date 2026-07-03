/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '"IBM Plex Sans"',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'sans-serif',
        ],
        // Editorial serif for headings/wordmarks — used sparingly for a premium accent
        display: [
          '"Fraunces"',
          '"IBM Plex Sans"',
          'ui-serif',
          'Georgia',
          'serif',
        ],
      },
      colors: {
        // Trust navy — replaces the default Tailwind blue scale across the app
        blue: {
          50: '#F0F4FA',
          100: '#DCE6F5',
          200: '#B9CCE8',
          300: '#8FACD6',
          400: '#5D82BD',
          500: '#35588F',
          600: '#14264A',
          700: '#0F172A',
          800: '#0B1220',
          900: '#060911',
        },
        // Premium champagne gold accent — for highlights, badges, and finance emphasis
        gold: {
          50: '#FFFBF0',
          100: '#FCF0CC',
          200: '#F8E093',
          300: '#F0C955',
          400: '#DFAD2E',
          500: '#B8860B',
          600: '#8A5206',
          700: '#6B3F05',
          800: '#4D2D04',
          900: '#331E03',
        },
        // Warm graphite neutrals — replaces the default cool slate scale for a
        // boutique, warm-luxury feel instead of a cold corporate grey
        slate: {
          50: '#FAF9F6',
          100: '#F3F1EC',
          200: '#E7E2D9',
          300: '#D2C9BA',
          400: '#A89C88',
          500: '#7C7362',
          600: '#5A5245',
          700: '#3D3830',
          800: '#26221D',
          900: '#171410',
        },
      },
      boxShadow: {
        luxury: '0 2px 8px -2px rgba(23, 20, 16, 0.08), 0 12px 32px -12px rgba(23, 20, 16, 0.12)',
        'luxury-lg': '0 8px 24px -6px rgba(23, 20, 16, 0.12), 0 24px 60px -20px rgba(23, 20, 16, 0.22)',
        'gold-glow': '0 0 0 1px rgba(223, 173, 46, 0.25), 0 8px 30px -8px rgba(184, 134, 11, 0.35)',
        'inner-gold': 'inset 0 1px 0 0 rgba(240, 201, 85, 0.4)',
      },
      keyframes: {
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        float: {
          '0%, 100%': { transform: 'translate(0, 0)' },
          '50%': { transform: 'translate(12px, -16px)' },
        },
        floatSlow: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '50%': { transform: 'translate(-16px, 14px) scale(1.05)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
      },
      animation: {
        'fade-in-up': 'fadeInUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) both',
        'fade-in': 'fadeIn 0.4s ease-out both',
        'scale-in': 'scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) both',
        shimmer: 'shimmer 2.5s linear infinite',
        float: 'float 8s ease-in-out infinite',
        'float-slow': 'floatSlow 12s ease-in-out infinite',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
      },
      transitionTimingFunction: {
        luxury: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
};
