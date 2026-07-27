/**
 * vite.config.ts — TW Suite Chrome Extension
 *
 * This file only builds the POPUP (React, ESM, code-split).
 *
 * Content scripts and the service worker are compiled by build-scripts.mjs,
 * which is called automatically via the "postbuild" npm script.
 * That script uses Rollup directly with explicit per-file format control:
 *   • content/router.js    → IIFE  (Chrome loads it as a classic script)
 *   • background/sw.js     → ESM   (manifest declares type:"module")
 *
 * This separation is the only reliable way to get IIFE output for content
 * scripts while keeping Vite's React/HMR features for the popup.
 */

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

// ─── PNG placeholder ──────────────────────────────────────────────────────────
function solidPng(r: number, g: number, b: number): Buffer {
  const sig  = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
  const ihdr = pngChunk("IHDR", Buffer.from([0,0,0,1,0,0,0,1,8,2,0,0,0]));
  const row  = Buffer.from([0x00, r, g, b]);
  let a = 1, bv = 0;
  for (const byte of row) { a = (a + byte) % 65521; bv = (bv + a) % 65521; }
  const adler = ((bv << 16) | a) >>> 0;
  const idat = pngChunk("IDAT", Buffer.concat([
    Buffer.from([0x78, 0x01, 0x01]),
    Buffer.from([row.length & 0xff, (row.length >> 8) & 0xff]),
    Buffer.from([(~row.length) & 0xff, ((~row.length) >> 8) & 0xff]),
    row,
    Buffer.from([(adler>>>24)&0xff,(adler>>>16)&0xff,(adler>>>8)&0xff,adler&0xff]),
  ]));
  const iend = pngChunk("IEND", Buffer.alloc(0));
  return Buffer.concat([sig, ihdr, idat, iend]);
}
function pngChunk(type: string, data: Buffer): Buffer {
  const len   = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeB = Buffer.from(type, "ascii");
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  let crc = 0xffffffff;
  for (const byte of Buffer.concat([typeB, data]))
    crc = (crc >>> 8) ^ (table[(crc ^ byte) & 0xff] ?? 0);
  const crcB = Buffer.alloc(4); crcB.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 0);
  return Buffer.concat([len, typeB, data, crcB]);
}

// ─── Userscript map ───────────────────────────────────────────────────────────
const MODULES_DIR = "tw-suite-extension/modules";
const USERSCRIPT_MAP: Record<string, string> = {
  [`${MODULES_DIR}/attack_generator.user.js`]:     "attack_generator.user.js",
  [`${MODULES_DIR}/auto_mint.user.js`]:            "auto_mint.user.js",
  [`${MODULES_DIR}/auto_sender.user.js`]:          "auto_sender.user.js",
  [`${MODULES_DIR}/desviador.user.js`]:            "desviador.user.js",
  [`${MODULES_DIR}/kumin_gluer.user.js`]:          "kumin_gluer.user.js",
  [`${MODULES_DIR}/extended_profile.user.js`]:     "extended_profile.user.js",
  [`${MODULES_DIR}/fakes.user.js`]:                "fakes.user.js",
  [`${MODULES_DIR}/mano_de_deus.user.js`]:         "mano_de_deus.user.js",
  [`${MODULES_DIR}/mass_label_renamer.user.js`]:        "mass_label_renamer.user.js",
  [`${MODULES_DIR}/noble_sender_trainer.user.js`]: "noble_sender_trainer.user.js",
  [`${MODULES_DIR}/resource_buyer.user.js`]:       "resource_buyer.user.js",
  [`${MODULES_DIR}/tw_snipe_scheduler.user.js`]:   "tw_snipe_scheduler.user.js",
  [`${MODULES_DIR}/wh_balancer.user.js`]:          "wh_balancer.user.js",
  [`${MODULES_DIR}/planeador.user.js`]:             "planeador.user.js",
  [`${MODULES_DIR}/telegram_notifier.user.js`]:     "telegram_notifier.user.js",
  [`${MODULES_DIR}/tw_utils.user.js`]:              "tw_utils.user.js",
};

const BRIDGE_SRC  = "src/modules/tw-suite-config-bridge.js";
const AS_MSGS_SRC = `${MODULES_DIR}/autosender_messages.json`;
const ICON_SIZES = [16, 48, 128] as const;
const ICON_GOLD: [number, number, number] = [200, 144, 42];

// ─── Asset plugin (runs after popup build) ────────────────────────────────────
function extensionAssetsPlugin() {
  return {
    name: "tw-extension-assets",
    enforce: "post" as const,
    closeBundle() {
      mkdirSync("dist/modules",    { recursive: true });
      mkdirSync("dist/popup",      { recursive: true });
      mkdirSync("dist/icons",      { recursive: true });
      mkdirSync("dist/content",    { recursive: true });
      mkdirSync("dist/background", { recursive: true });

      // Hoist popup.html from Vite's nested MPA output path
      const viteOut = "dist/src/popup/popup.html";
      if (existsSync(viteOut)) renameSync(viteOut, "dist/popup/popup.html");

      copyFileSync("src/manifest.json", "dist/manifest.json");
      if (existsSync("src/rules.json"))
        copyFileSync("src/rules.json", "dist/rules.json");

      if (existsSync("src/icons/icon.svg"))
        copyFileSync("src/icons/icon.svg", "dist/icons/icon.svg");
      for (const size of ICON_SIZES) {
        const srcPng  = `src/icons/icon${size}.png`;
        const destPng = `dist/icons/icon${size}.png`;
        if (existsSync(srcPng)) copyFileSync(srcPng, destPng);
        else if (!existsSync(destPng)) writeFileSync(destPng, solidPng(...ICON_GOLD));
      }

      if (existsSync(BRIDGE_SRC))
        copyFileSync(BRIDGE_SRC, "dist/modules/tw-suite-config-bridge.js");

      const bridge = existsSync(BRIDGE_SRC) ? readFileSync(BRIDGE_SRC, "utf8") : "";
      const asMsgs = existsSync(AS_MSGS_SRC)
        ? `var __xbot_msgs = ${readFileSync(AS_MSGS_SRC, "utf8").trim()};\n`
        : "";
      for (const [srcFile, dstFile] of Object.entries(USERSCRIPT_MAP)) {
        if (!existsSync(srcFile)) {
          console.warn(`[tw-ext] Missing: ${srcFile}`);
          continue;
        }
        const original = readFileSync(srcFile, "utf8");
        const extras   = dstFile === "auto_sender.user.js" ? asMsgs : "";
        const combined = bridge
          ? `${bridge}\n\n${extras}/* ─── ${dstFile} ─── */\n\n${original}`
          : extras + original;
        writeFileSync(join("dist/modules", dstFile), combined, "utf8");
      }

      // Copy custom module icons
      if (existsSync("colatudo.png"))
        copyFileSync("colatudo.png", "dist/icons/colatudo.png");

      // Copy misc UI-chrome icons (drawer/trigger-visibility toggle, etc.)
      if (existsSync("Icons/drawer-svgrepo-com.svg"))
        copyFileSync("Icons/drawer-svgrepo-com.svg", "dist/icons/drawer-svgrepo-com.svg");

      const jqSrc = `${MODULES_DIR}/jquery-3.7.1.min.js`;
      if (existsSync(jqSrc))
        copyFileSync(jqSrc, "dist/modules/jquery-3.7.1.min.js");

      writeFileSync("dist/README-LOAD-THIS.txt", [
        "TW Suite — Chrome Extension",
        "1. chrome://extensions → Developer mode → Load unpacked → select dist/",
        "Popup: toggle modules. ⚙: edit settings.",
      ].join("\n"), "utf8");

      console.log("[tw-ext] ✓ Assets ready. Running build-scripts…");
    },
  };
}

// ─── Vite config (popup only) ─────────────────────────────────────────────────
export default defineConfig({
  plugins: [react(), extensionAssetsPlugin()],

  build: {
    outDir:      "dist",
    emptyOutDir: true,
    sourcemap:   true,
    target:      "es2022",

    rollupOptions: {
      // Only the popup. Router + SW are handled by build-scripts.mjs (postbuild).
      input: {
        popup: resolve(__dirname, "src/popup/popup.html"),
      },
      output: {
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});