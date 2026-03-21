/**
 * overlay.entry.tsx
 * Mounts the TW Suite overlay into a Shadow DOM for full CSS isolation.
 *
 * CSS is imported from overlay-css.ts (a plain TS string constant) —
 * no Rollup CSS plugin needed, works with any bundler.
 */

import React from "react";
import { createRoot } from "react-dom/client";
import { OverlayRoot } from "./overlay/Overlay";
import { OVERLAY_CSS } from "./overlay/overlay-css";

function mount(): void {
  if (document.getElementById("tw-suite-overlay-host")) return;

  const host = document.createElement("div");
  host.id = "tw-suite-overlay-host";
  host.style.cssText =
    "position:fixed;top:0;left:0;z-index:2147483639;pointer-events:none;";
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = OVERLAY_CSS;
  shadow.appendChild(style);

  const mountPoint = document.createElement("div");
  mountPoint.style.cssText = "pointer-events:auto;";
  shadow.appendChild(mountPoint);

  createRoot(mountPoint).render(<OverlayRoot/>);
}

if (document.body) {
  mount();
} else {
  document.addEventListener("DOMContentLoaded", mount, { once: true });
}
