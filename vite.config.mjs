import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { validationCapturePlugin } from './scripts/validation-capture-plugin.mjs';
import { compressedModelDataPlugin } from './scripts/compressed-model-data.mjs';

export default defineConfig({
  base: process.env.VITE_BASE_PATH || "/",
  build: {
    outDir: "dist/client",
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.endsWith('/world/loadCompressedModelData.js')) return 'model-loader';
          if (/\/world\/shallow\w+Data\.js$/i.test(id))
            return `model-${id.split('/').at(-1).replace(/\.js$/, '')}`;
        },
      },
    },
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react(), compressedModelDataPlugin(), validationCapturePlugin()],
});
