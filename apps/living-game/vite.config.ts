import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

// The standalone server is a plain Vue SPA over the fixtures in
// `src/client/fixtures`. The embedded build that talks to Homebase is
// `vite.embedded.config.ts`.
export default defineConfig({
  plugins: [vue()],
});
