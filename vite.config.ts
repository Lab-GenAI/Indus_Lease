import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const originalConsoleWarn = console.warn;
console.warn = (...args: unknown[]) => {
  if (args.some(a => typeof a === "string" && a.includes("postcss.parse"))) return;
  originalConsoleWarn.apply(console, args);
};

export default defineConfig({
  plugins: [
    react(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  optimizeDeps: {
    include: ["framer-motion"],
  },
  server: {
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
    proxy: {
      "/api": {
        target: "http://localhost:5001",
        changeOrigin: true,
      },
    },
  },
});
