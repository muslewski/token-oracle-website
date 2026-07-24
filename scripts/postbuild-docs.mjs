#!/usr/bin/env node
/**
 * Vite emits generated/docs → dist/generated/docs.
 * Move to dist/docs for clean /docs/ URLs on Vercel.
 * Also emit robots.txt + sitemap.xml (home + docs) for Search Console.
 */
import {
  existsSync,
  cpSync,
  rmSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const site = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(site, "dist");
const from = join(dist, "generated", "docs");
const to = join(dist, "docs");

if (existsSync(from)) {
  rmSync(to, { recursive: true, force: true });
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
  rmSync(join(dist, "generated"), { recursive: true, force: true });
  console.error("postbuild-docs: dist/docs ready");
} else {
  console.error("postbuild-docs: no dist/generated/docs — skip docs move");
}

function loadSiteUrl() {
  const cfgPath = join(site, "docs-site.config.json");
  if (existsSync(cfgPath)) {
    const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
    if (cfg.siteUrl) return String(cfg.siteUrl).replace(/\/$/, "");
  }
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "");
  // agentic-sage-site (no docs-site.config): read canonical from marketing index
  for (const candidate of [join(site, "index.html"), join(dist, "index.html")]) {
    if (!existsSync(candidate)) continue;
    const m = readFileSync(candidate, "utf8").match(
      /rel="canonical"\s+href="(https?:\/\/[^"]+)"/i,
    );
    if (m) return m[1].replace(/\/$/, "");
  }
  return null;
}

/** Collect clean trailing-slash paths from dist index.html files. */
function walkIndexUrls(rootDir) {
  const urls = [];
  if (!existsSync(rootDir)) return urls;

  function walk(dir) {
    for (const name of readdirSync(dir)) {
      if (name.startsWith(".")) continue;
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) {
        // skip hashed asset trees
        if (name === "assets" || name === "video" || name === "posters") continue;
        walk(p);
        continue;
      }
      if (name !== "index.html") continue;
      const relDir = relative(rootDir, dirname(p)).replace(/\\/g, "/");
      urls.push(relDir === "" || relDir === "." ? "/" : `/${relDir}/`);
    }
  }

  walk(rootDir);
  return urls;
}

const siteUrl = loadSiteUrl();
if (!siteUrl) {
  console.error("postbuild-docs: no siteUrl — skip robots/sitemap");
  process.exit(0);
}

const paths = walkIndexUrls(dist)
  .filter((p) => p === "/" || p.startsWith("/docs/"))
  .sort((a, b) => a.localeCompare(b));

if (!paths.includes("/")) paths.unshift("/");

const now = new Date().toISOString();
const body = paths
  .map(
    (path) => `  <url>
    <loc>${siteUrl}${path}</loc>
    <lastmod>${now}</lastmod>
  </url>`,
  )
  .join("\n");

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;

const robots = `User-agent: *
Allow: /

Sitemap: ${siteUrl}/sitemap.xml
`;

writeFileSync(join(dist, "sitemap.xml"), sitemap, "utf8");
writeFileSync(join(dist, "robots.txt"), robots, "utf8");
console.error(
  `postbuild-docs: wrote robots.txt + sitemap.xml (${paths.length} urls) → ${siteUrl}`,
);
for (const p of paths) console.error(`  ${siteUrl}${p}`);
