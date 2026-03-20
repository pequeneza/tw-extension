import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync
} from "node:fs";
import { join } from "node:path";

function copyDir(from: string, to: string) {
  if (!existsSync(from)) return;
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from)) {
    const src = join(from, entry);
    const dst = join(to, entry);
    const st = statSync(src);
    if (st.isDirectory()) copyDir(src, dst);
    else copyFileSync(src, dst);
  }
}

function extensionAssetsPlugin() {
  return {
    name: "tw-extension-assets",
    closeBundle() {
      mkdirSync("dist", { recursive: true });

      // Move popup HTML to match manifest path: popup/popup.html
      // Vite outputs: dist/src/popup/popup.html
      if (existsSync("dist/src/popup/popup.html")) {
        mkdirSync("dist/popup", { recursive: true });
        renameSync("dist/src/popup/popup.html", "dist/popup/popup.html");
      }

      // (optional) remove the now-empty dist/src tree if you want:
      // - you can ignore it, or delete it with a small recursive delete helper.

      copyFileSync("src/manifest.json", "dist/manifest.json");
      copyDir("tw-suite-extension/modules", "dist/modules");

      writeFileSync(
        "dist/README-LOAD-THIS.txt",
        "Load this folder as unpacked extension in Chrome: chrome://extensions -> Developer mode -> Load unpacked -> select dist/\n",
        "utf8"
      );
    }
  };
}

export default defineConfig({
  plugins: [react(), extensionAssetsPlugin()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "src/popup/popup.html"),
        router: resolve(__dirname, "src/content/router.ts"),
        overlay: resolve(__dirname, "src/content/overlay.entry.tsx")
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === "router") return "content/router.js";
          if (chunk.name === "overlay") return "content/overlay.js";
          return "assets/[name]-[hash].js";
        },
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]"
      }
    }
  }
});