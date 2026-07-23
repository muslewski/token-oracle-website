#!/usr/bin/env node
/**
 * Vite emits generated/docs → dist/generated/docs.
 * Move to dist/docs for clean /docs/ URLs on Vercel.
 */
import { existsSync, cpSync, rmSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const site = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(site, "dist", "generated", "docs");
const to = join(site, "dist", "docs");

if (!existsSync(from)) {
  console.error("postbuild-docs: no dist/generated/docs — skip");
  process.exit(0);
}

rmSync(to, { recursive: true, force: true });
mkdirSync(dirname(to), { recursive: true });
cpSync(from, to, { recursive: true });
rmSync(join(site, "dist", "generated"), { recursive: true, force: true });
console.error("postbuild-docs: dist/docs ready");
