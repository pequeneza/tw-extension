/**
 * build-scripts.mjs
 *
 * Compiles the three non-popup Chrome extension scripts using Rollup.
 * Vite is only used for the popup (see vite.config.ts).
 *
 * Outputs:
 *   dist/content/router.js             IIFE — content script
 *   dist/content/overlay.js            IIFE — in-page React overlay
 *   dist/background/service-worker.js  ESM  — background worker
 */

import { rollup }          from "rollup";
import typescript          from "@rollup/plugin-typescript";
import { nodeResolve }     from "@rollup/plugin-node-resolve";
import commonjs            from "@rollup/plugin-commonjs";
import replace             from "@rollup/plugin-replace";
import terser               from "@rollup/plugin-terser";

import { mkdirSync }       from "node:fs";
import { fileURLToPath }   from "node:url";
import { dirname, resolve } from "node:path";

// fileURLToPath handles spaces and special characters in paths correctly
// (e.g. OneDrive "Ambiente de Trabalho" on Windows)
const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// Previously these three bundles shipped completely unminified, PLUS a full
// source map — the map alone defeats any obscurity minification would have
// bought, since it reconstructs near-original source directly in DevTools.
// Neither costs anything to fix: minification only ever reduces parse/load
// time, and dev source maps are still generated locally by `npm run dev`
// (via WATCH, which callers of build() control) — only the production
// artifact that ships in dist/ drops them.
const PRODUCTION = process.env.NODE_ENV !== "development";

// ─── Shared base plugins ──────────────────────────────────────────────────────
const EXTENSIONS = [".tsx", ".ts", ".jsx", ".js", ".json"];

function basePlugins() {
  return [
    nodeResolve({ browser: true, extensions: EXTENSIONS }),
    commonjs(),
    typescript({
      tsconfig:       resolve(__dirname, "tsconfig.json"),
      noEmitOnError:  false,
      declaration:    false,
      declarationMap: false,
      sourceMap:      !PRODUCTION,
    }),
    // mangle: renames locals/params (not the module-level globals every
    // userscript/content-script bridge relies on, e.g. window.__twSuiteCfg —
    // those are property accesses, never touched by mangling). compress with
    // defaults only — no aggressive passes that risk behavior changes for a
    // marginal size win.
    ...(PRODUCTION ? [terser({ format: { comments: false } })] : []),
  ];
}

// ─── React plugins (bundles React into the overlay IIFE) ─────────────────────
function reactPlugins() {
  return [
    replace({
      preventAssignment: true,
      values: { "process.env.NODE_ENV": JSON.stringify("production") },
    }),

    ...basePlugins(),
  ];
}

// ─── Builds ───────────────────────────────────────────────────────────────────

async function buildRouter() {
  console.log("[scripts] Building content/router.js (iife)…");
  mkdirSync("dist/content", { recursive: true });

  const bundle = await rollup({
    input:   resolve(__dirname, "src/content/router.ts"),
    plugins: basePlugins(),
  });

  await bundle.write({
    file:                 "dist/content/router.js",
    format:               "iife",
    name:                 "TWRouter",
    sourcemap:            !PRODUCTION,
    inlineDynamicImports: true,
    generatedCode:        { constBindings: true },
  });

  await bundle.close();
  console.log("[scripts] ✓ dist/content/router.js");
}

async function buildOverlay() {
  console.log("[scripts] Building content/overlay.js (iife + React)…");
  mkdirSync("dist/content", { recursive: true });

  const bundle = await rollup({
    input:   resolve(__dirname, "src/content/overlay.entry.tsx"),
    plugins: reactPlugins(),
  });

  await bundle.write({
    file:                 "dist/content/overlay.js",
    format:               "iife",
    name:                 "TWOverlay",
    sourcemap:            !PRODUCTION,
    inlineDynamicImports: true,
    generatedCode:        { constBindings: true },
  });

  await bundle.close();
  console.log("[scripts] ✓ dist/content/overlay.js");
}

async function buildServiceWorker() {
  console.log("[scripts] Building background/service-worker.js (es)…");
  mkdirSync("dist/background", { recursive: true });

  const bundle = await rollup({
    input:   resolve(__dirname, "src/background/service-worker.ts"),
    plugins: basePlugins(),
  });

  await bundle.write({
    file:                 "dist/background/service-worker.js",
    format:               "es",
    sourcemap:            !PRODUCTION,
    inlineDynamicImports: true,
    generatedCode:        { constBindings: true },
  });

  await bundle.close();
  console.log("[scripts] ✓ dist/background/service-worker.js");
}

// ─── Run sequentially ─────────────────────────────────────────────────────────
try {
  await buildRouter();
  await buildOverlay();
  await buildServiceWorker();
  console.log("[scripts] ✓ All scripts built successfully.");
} catch (err) {
  console.error("[scripts] ✗ Build failed:", err);
  process.exit(1);
}
