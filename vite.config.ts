import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/TorusMouse/" : "/",
  server: {
    host: "0.0.0.0",
    port: 4173,
    strictPort: true,
  },
}));
