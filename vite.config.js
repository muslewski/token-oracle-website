import { defineConfig } from "vite";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { docsInputs, docsDevPlugin } from "./scripts/vite-docs-plugin.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: "/",
  appType: "mpa",
  plugins: [docsDevPlugin()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        ...docsInputs(),
      },
    },
  },
});
