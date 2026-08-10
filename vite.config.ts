import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

/**
 * No Replit plugins. The last one was
 * @replit/vite-plugin-shadcn-theme-json, which generated shadcn CSS variables
 * from theme.json — variables client/src/index.css already declares itself,
 * with identical values (primary 167 23% 79%, radius 0.5rem). It was a
 * build-time dependency on a vendor we no longer use, doing work that was
 * already done. theme.json went with it.
 *
 * The @assets alias to attached_assets went too: nothing imported through it.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
});
