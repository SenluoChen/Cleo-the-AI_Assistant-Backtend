import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react()],
    root: "src/renderer",
    base: "./",
    publicDir: path.resolve(__dirname, "public"),
    server: {
      port: 5173,
      strictPort: true,
    },
    build: {
      target: "node18",
      outDir: path.resolve(__dirname, "dist/renderer"),
      emptyOutDir: true,
      sourcemap: true,
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, "src/renderer/index.html"),
          bubble: path.resolve(__dirname, "src/renderer/bubble.html"),
        },
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src/renderer"),
        "@/common": path.resolve(__dirname, "src/common"),
      },
    },
    define: {
      "import.meta.env.VITE_ANALYZE_URL": JSON.stringify(env.VITE_ANALYZE_URL ?? ""),
    },
  };
});