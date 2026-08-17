// Tailwind 4 ships a Vite plugin, but it peers on Vite 7 and this app is on 8.
// The PostCSS entry point is the same compiler without the version constraint.
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
