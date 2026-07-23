#!/usr/bin/env node
/**
 * Fleet docs SSG — multi-page HTML from product package docs/ tree.
 * Config: docs-site.config.json in site root (see template).
 * Output: generated/docs/**.html  (gitignored; prebuild / predev)
 *
 * Resolve order for docs source:
 *   1. DOCS_ROOT env
 *   2. Sibling ../{product}/docs
 *   3. Shallow-clone public GitHub product repo into .cache/ (Vercel)
 */
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
  statSync,
  rmSync,
} from "node:fs";
import { execSync } from "node:child_process";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import MarkdownIt from "markdown-it";
import anchor from "markdown-it-anchor";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE = join(__dirname, "..");
const OUT = join(SITE, "generated", "docs");

function die(msg) {
  console.error(`build-docs: ${msg}`);
  process.exit(1);
}

function loadConfig() {
  const p = join(SITE, "docs-site.config.json");
  if (!existsSync(p)) die(`missing ${p}`);
  const cfg = JSON.parse(readFileSync(p, "utf8"));
  for (const k of ["product", "brandWord", "siteUrl", "githubRepo"]) {
    if (!cfg[k]) die(`docs-site.config.json missing "${k}"`);
  }
  return {
    product: cfg.product,
    brandWord: cfg.brandWord,
    siteName: cfg.siteName || cfg.brandWord,
    siteUrl: cfg.siteUrl.replace(/\/$/, ""),
    githubRepo: cfg.githubRepo,
    siblingDir: cfg.siblingDir || cfg.product,
    themeColor: cfg.themeColor || "#0e0d0c",
    bg: cfg.bg || "#0e0d0c",
    fg: cfg.fg || "#efe7d8",
    fontsCss: cfg.fontsCss ||
      "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Inter:wght@400;600&display=swap",
    favicon: cfg.favicon || "/favicon.ico",
    ogImage: cfg.ogImage || "/og.jpg",
    footDoctrine: cfg.footDoctrine || "",
    ghEditPath: cfg.ghEditPath || "docs/",
  };
}

const CFG = loadConfig();
// siblingDir is relative to SITE (e.g. "../../token-oracle" for fleet-site-ships layout)
const DEFAULT_DOCS = join(SITE, CFG.siblingDir, "docs");
const DEFAULT_PKG = join(SITE, CFG.siblingDir, "package.json");
const PRODUCT_REPO = `https://github.com/${CFG.githubRepo}.git`;

function resolveProductDocs() {
  if (process.env.DOCS_ROOT) {
    const root = process.env.DOCS_ROOT.startsWith("/")
      ? process.env.DOCS_ROOT
      : join(process.cwd(), process.env.DOCS_ROOT);
    if (!existsSync(root)) die(`DOCS_ROOT not found: ${root}`);
    return {
      docsRoot: root,
      pkgJson: join(root, "..", "package.json"),
      source: "DOCS_ROOT",
    };
  }
  if (existsSync(DEFAULT_DOCS)) {
    return { docsRoot: DEFAULT_DOCS, pkgJson: DEFAULT_PKG, source: "sibling" };
  }
  const cacheRoot = join(SITE, ".cache", CFG.product);
  const cachedDocs = join(cacheRoot, "docs");
  if (!existsSync(cachedDocs)) {
    console.error(
      `build-docs: sibling ${CFG.siblingDir}/docs missing — shallow-cloning ${PRODUCT_REPO}…`,
    );
    mkdirSync(join(SITE, ".cache"), { recursive: true });
    rmSync(cacheRoot, { recursive: true, force: true });
    try {
      execSync(`git clone --depth 1 ${PRODUCT_REPO} "${cacheRoot}"`, {
        stdio: "inherit",
      });
    } catch (err) {
      die(`failed to clone ${PRODUCT_REPO}: ${err.message}`);
    }
  }
  if (!existsSync(cachedDocs)) die(`clone completed but docs/ missing under ${cacheRoot}`);
  return {
    docsRoot: cachedDocs,
    pkgJson: join(cacheRoot, "package.json"),
    source: "clone",
  };
}

const { docsRoot: DOCS_ROOT, pkgJson: PKG_JSON, source: DOCS_SOURCE } =
  resolveProductDocs();

function walkMd(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".")) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkMd(p, acc);
    else if (name.endsWith(".md")) acc.push(p);
  }
  return acc;
}

function parseFrontmatter(text) {
  if (!text.startsWith("---\n") && !text.startsWith("---\r\n")) {
    return { data: {}, body: text };
  }
  const end = text.indexOf("\n---", 3);
  if (end === -1) return { data: {}, body: text };
  const block = text.slice(4, end).replace(/\r/g, "");
  const body = text.slice(end + 4).replace(/^\r?\n/, "");
  const data = {};
  for (const line of block.split("\n")) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    data[m[1]] = v;
  }
  return { data, body };
}

function mdToHref(mdRel) {
  let n = mdRel.replace(/\\/g, "/").replace(/\.md$/, "");
  if (n === "index") return "/docs/";
  if (n.endsWith("/index")) n = n.slice(0, -"/index".length);
  return `/docs/${n}/`;
}

function collectHrefs(node, acc = []) {
  if (!node) return acc;
  if (Array.isArray(node)) {
    for (const n of node) collectHrefs(n, acc);
    return acc;
  }
  if (node.href) acc.push(String(node.href).replace(/^\.\//, ""));
  if (node.items) collectHrefs(node.items, acc);
  return acc;
}

function renderSidebar(sidebar, currentHref, depth = 0) {
  let html =
    depth === 0
      ? `<nav class="docs-nav" aria-label="Documentation">`
      : `<ul class="docs-nav-group">`;
  for (const item of sidebar) {
    if (item.items) {
      html += `<div class="docs-nav-section">`;
      html += `<div class="docs-nav-label">${esc(item.title)}</div>`;
      html += renderSidebar(item.items, currentHref, depth + 1);
      html += `</div>`;
      continue;
    }
    const href = mdToHref(item.href);
    const md = item.href.replace(/^\.\//, "");
    const active =
      currentHref === md || (md === "index.md" && currentHref === "index.md");
    const cls = active ? "docs-nav-link is-active" : "docs-nav-link";
    if (depth === 0) {
      html += `<a class="${cls}" href="${href}">${esc(item.title)}</a>`;
    } else {
      html += `<li><a class="${cls}" href="${href}">${esc(item.title)}</a></li>`;
    }
  }
  html += depth === 0 ? `</nav>` : `</ul>`;
  return html;
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function rewriteMdLinks(html) {
  const gh = `https://github.com/${CFG.githubRepo}/blob/main/`;
  return html
    .replace(
      /href="(\.\.\/)*([a-zA-Z0-9_./-]+)\.md(#[^"]*)?"/g,
      (_, _up, path, hash) => {
        if (path.includes("-mind") || path.startsWith("../")) {
          return `href="${gh}${path.replace(/^(\.\.\/)+/, "")}.md${hash || ""}"`;
        }
        const p = path.replace(/\.md$/, "");
        const href = p === "index" ? "/docs/" : `/docs/${p}/`;
        return `href="${href}${hash || ""}"`;
      },
    )
    .replace(/href="\.\/([a-zA-Z0-9_./-]+)\.md(#[^"]*)?"/g, (_, path, hash) => {
      const p = path.replace(/\.md$/, "");
      const href = p === "index" ? "/docs/" : `/docs/${p}/`;
      return `href="${href}${hash || ""}"`;
    });
}

function pageShell({ title, description, version, sidebarHtml, bodyHtml, currentPath }) {
  const pageTitle = `${title} · ${CFG.brandWord} docs`;
  const doctrine = CFG.footDoctrine
    ? `<p class="docs-doctrine">${CFG.footDoctrine}</p>`
    : "";
  const fav = CFG.favicon.endsWith(".svg")
    ? `type="image/svg+xml" href="${CFG.favicon}"`
    : `href="${CFG.favicon}"`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(pageTitle)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${CFG.siteUrl}${currentPath}">
  <meta name="theme-color" content="${esc(CFG.themeColor)}">
  <link rel="icon" ${fav}>
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="${esc(CFG.siteName)}">
  <meta property="og:title" content="${esc(pageTitle)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${CFG.siteUrl}${currentPath}">
  <meta property="og:image" content="${CFG.siteUrl}${CFG.ogImage}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="robots" content="index,follow">
  <style>html,body{background:${esc(CFG.bg)};color:${esc(CFG.fg)};}</style>
  <link rel="stylesheet" href="/src/style.css">
  <link rel="stylesheet" href="/src/docs.css">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="${esc(CFG.fontsCss)}" rel="stylesheet">
</head>
<body class="docs-body">
<a class="docs-skip" href="#docs-main">Skip to content</a>

<header class="docs-top">
  <div class="docs-top-inner">
    <a class="docs-brand" href="/">
      <span class="docs-brand-word">${esc(CFG.brandWord)}</span>
      <span class="docs-brand-tag">// docs</span>
    </a>
    <div class="docs-top-actions">
      <span class="docs-ver" title="Package version documented">v${esc(version)}</span>
      <a class="docs-top-link" href="/">Home</a>
      <a class="docs-top-link" href="/docs/">Docs</a>
      <a class="docs-gh" href="https://github.com/${CFG.githubRepo}" target="_blank" rel="noopener">GitHub →</a>
    </div>
  </div>
</header>

<div class="docs-shell">
  <aside class="docs-aside">
    <div class="docs-aside-label">// documentation</div>
    ${sidebarHtml}
    <div class="docs-aside-foot">
      <a href="https://github.com/${CFG.githubRepo}/edit/main/${CFG.ghEditPath}">Edit on GitHub →</a>
    </div>
  </aside>

  <main id="docs-main" class="docs-main">
    <div class="docs-prose">
      <div class="sec-label">// ${esc(title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 32))}</div>
      ${bodyHtml}
    </div>
    <footer class="docs-page-foot">
      <p>Source of truth: <code>${esc(CFG.product)}/docs/</code> · rendered for <strong>v${esc(version)}</strong></p>
      ${doctrine}
    </footer>
  </main>
</div>

<script type="module">
  const btn = document.querySelector('[data-docs-menu]');
  const aside = document.querySelector('.docs-aside');
  btn?.addEventListener('click', () => aside?.classList.toggle('is-open'));
  document.querySelectorAll('.docs-prose pre').forEach((pre) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'docs-copy';
    b.textContent = 'copy';
    b.addEventListener('click', async () => {
      const t = pre.querySelector('code')?.textContent || pre.textContent;
      try {
        await navigator.clipboard.writeText(t);
        b.textContent = 'copied';
        setTimeout(() => { b.textContent = 'copy'; }, 1200);
      } catch { b.textContent = 'fail'; }
    });
    pre.style.position = 'relative';
    pre.appendChild(b);
  });
</script>
</body>
</html>
`;
}

// --- main ---
if (!existsSync(DOCS_ROOT)) {
  die(`docs root not found: ${DOCS_ROOT}`);
}
console.error(`build-docs: source=${DOCS_SOURCE} root=${DOCS_ROOT} product=${CFG.product}`);

let version = "0.0.0";
try {
  version = JSON.parse(readFileSync(PKG_JSON, "utf8")).version || version;
} catch {
  /* optional — Python pkgs may use pyproject */
  const py = join(dirname(PKG_JSON), "pyproject.toml");
  if (existsSync(py)) {
    const m = readFileSync(py, "utf8").match(/version\s*=\s*"([^"]+)"/);
    if (m) version = m[1];
  }
}
// Root package.json may be a private helper with 0.0.0; prefer npm/ or pyproject
if (!version || version === "0.0.0") {
  const npmPkg = join(SITE, CFG.siblingDir, "npm", "package.json");
  if (existsSync(npmPkg)) {
    try {
      version = JSON.parse(readFileSync(npmPkg, "utf8")).version || version;
    } catch {
      /* ignore */
    }
  }
}
if (!version || version === "0.0.0") {
  const py = join(SITE, CFG.siblingDir, "pyproject.toml");
  if (existsSync(py)) {
    const m = readFileSync(py, "utf8").match(/version\s*=\s*"([^"]+)"/);
    if (m) version = m[1];
  }
}

const metaPath = join(DOCS_ROOT, "_meta.json");
if (!existsSync(metaPath)) die(`missing ${metaPath}`);
const meta = JSON.parse(readFileSync(metaPath, "utf8"));
const sidebar = meta.sidebar || [];
const hrefs = [...new Set(collectHrefs(sidebar))];
if (!hrefs.includes("index.md")) hrefs.unshift("index.md");

// If sidebar is sparse, also include all md files under docs/
if (hrefs.length < 2) {
  for (const f of walkMd(DOCS_ROOT)) {
    const rel = relative(DOCS_ROOT, f).replace(/\\/g, "/");
    if (!hrefs.includes(rel)) hrefs.push(rel);
  }
}

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  highlight(str, lang) {
    const safe = esc(str);
    const cls = lang ? ` class="language-${esc(lang)}"` : "";
    return `<pre class="docs-pre"><code${cls}>${safe}</code></pre>`;
  },
});
md.use(anchor, {
  permalink: anchor.permalink.ariaHidden({
    placement: "before",
    class: "docs-anchor",
    symbol: "#",
  }),
  slugify: (s) =>
    String(s)
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-"),
});
md.renderer.rules.fence = (tokens, idx) => {
  const token = tokens[idx];
  const lang = token.info ? token.info.trim().split(/\s+/)[0] : "";
  return md.options.highlight(token.content, lang);
};

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const pages = [];
const ghBlob = `https://github.com/${CFG.githubRepo}/blob/main/`;
for (const href of hrefs) {
  const file = join(DOCS_ROOT, href);
  if (!existsSync(file)) {
    console.warn(`build-docs: skip missing ${href}`);
    continue;
  }
  const raw = readFileSync(file, "utf8");
  const { data, body } = parseFrontmatter(raw);
  const title = data.title || href.replace(/\.md$/, "");
  const description = data.description || meta.description || "";
  let bodyHtml = md.render(body);
  bodyHtml = rewriteMdLinks(bodyHtml);
  bodyHtml = bodyHtml.replace(
    /href="\.\.\/\.\.\/([A-Za-z0-9_.-]+\.md)"/g,
    `href="${ghBlob}$1"`,
  );
  bodyHtml = bodyHtml.replace(
    /href="\.\.\/([A-Za-z0-9_.-]+\.md)"/g,
    `href="${ghBlob}$1"`,
  );

  const currentHref = href.replace(/^\.\//, "");
  const sidebarHtml = renderSidebar(sidebar, currentHref);
  const currentPath = mdToHref(href);
  const html = pageShell({
    title,
    description,
    version,
    sidebarHtml,
    bodyHtml,
    currentPath,
  });

  let outFile;
  const stem = href.replace(/\\/g, "/").replace(/\.md$/, "");
  if (stem === "index") {
    outFile = join(OUT, "index.html");
  } else if (stem.endsWith("/index")) {
    const dir = join(OUT, stem.slice(0, -"/index".length));
    mkdirSync(dir, { recursive: true });
    outFile = join(dir, "index.html");
  } else {
    const dir = join(OUT, stem);
    mkdirSync(dir, { recursive: true });
    outFile = join(dir, "index.html");
  }
  writeFileSync(outFile, html, "utf8");
  pages.push(relative(SITE, outFile));
}

for (const p of pages) {
  const full = join(SITE, p);
  let h = readFileSync(full, "utf8");
  if (!h.includes("data-docs-menu")) {
    h = h.replace(
      '<div class="docs-top-actions">',
      `<button type="button" class="docs-menu-btn" data-docs-menu aria-label="Open docs menu">Menu</button>
    <div class="docs-top-actions">`,
    );
    writeFileSync(full, h);
  }
}

writeFileSync(
  join(OUT, "manifest.json"),
  JSON.stringify(
    { version, pages, docsRoot: DOCS_ROOT, product: CFG.product, builtAt: new Date().toISOString() },
    null,
    2,
  ),
);

console.error(`build-docs: wrote ${pages.length} page(s) → generated/docs/ (v${version})`);
for (const p of pages) console.error(`  ${p}`);
