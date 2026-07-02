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
        // Premium gold accent — for highlights, badges, and finance emphasis
        gold: {
          50: '#FEF9EC',
          100: '#FCF0CC',
          200: '#F8E093',
          300: '#F0C955',
          400: '#DFAD2E',
          500: '#A16207',
          600: '#8A5206',
          700: '#6B3F05',
          800: '#4D2D04',
          900: '#331E03',
        },
      },
    },
  },
  plugins: [],
};
