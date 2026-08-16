import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/living-game-preview/",
  define: {
    "import.meta.env.VITE_ROUTER_BASE": JSON.stringify("/living-game/"),
    "import.meta.env.VITE_LIVE_MOVES": JSON.stringify("true"),
  },
  plugins: [vue()],
  build: {
    outDir: "../../public/living-game-preview",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: "assets/app.js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: (assetInfo) => assetInfo.names.some((name) => name.endsWith(".css"))
          ? "assets/app.css"
          : "assets/[name][extname]",
      },
    },
  },
});
