/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bread: { yellow: '#FFC20E', brown: '#3A2410', outline: '#7A5C0F', cream: '#FFF6D6' },
      },
      fontFamily: { rounded: ['Nunito', 'ui-rounded', 'system-ui', 'sans-serif'] },
      boxShadow: { soft: '0 8px 24px rgba(58,36,16,.09)' },
    },
  },
  plugins: [],
}
