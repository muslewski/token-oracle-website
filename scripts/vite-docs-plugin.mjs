/**
 * Shared Vite MPA helpers for fleet docs SSG.
 * Usage in vite.config.js:
 *   import { docsInputs, docsDevPlugin } from "./scripts/vite-docs-plugin.mjs";
 *   export default defineConfig({
 *     plugins: [docsDevPlugin()],
 *     build: { rollupOptions: { input: { main: resolve(__dirname,"index.html"), ...docsInputs() } } },
 *     appType: "mpa",
 *   });
 */
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync, statSync, existsSync, readFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE = join(__dirname, "..");

export function docsInputs(siteRoot = SITE) {
  const root = resolve(siteRoot, "generated/docs");
  const inputs = {};
  if (!existsSync(root)) return inputs;

  function walk(dir, base = "") {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) {
        walk(p, base ? `${base}/${name}` : name);
      } else if (name === "index.html") {
        const key = base ? `docs-${base.replace(/\//g, "-")}` : "docs";
        inputs[key] = p;
      }
    }
  }
  walk(root);
  return inputs;
}

function tryServeDocs(urlPath, siteRoot = SITE) {
  if (!urlPath.startsWith("/docs")) return null;
  let rel = urlPath.replace(/^\/docs\/?/, "");
  if (!rel || rel.endsWith("/")) rel = `${rel}index.html`;
  else if (!rel.endsWith(".html") && !rel.includes(".")) rel = `${rel}/index.html`;
  const file = resolve(siteRoot, "generated/docs", rel);
  if (existsSync(file) && statSync(file).isFile()) return file;
  const alt = resolve(
    siteRoot,
    "generated/docs",
    urlPath.replace(/^\/docs\/?/, "").replace(/\/$/, ""),
    "index.html",
  );
  if (existsSync(alt) && statSync(alt).isFile()) return alt;
  return null;
}

export function docsDevPlugin(siteRoot = SITE) {
  return {
    name: "fleet-docs-dev",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0] || "";
        const file = tryServeDocs(url, siteRoot);
        if (!file) return next();
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(readFileSync(file));
      });
    },
  };
}
