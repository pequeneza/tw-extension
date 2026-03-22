/**
 * xBot — Overlay entry point.
 *
 * Runs as a CONTENT SCRIPT (declared in manifest.json), NOT as an injected
 * page script. This gives it access to chrome.storage, chrome.runtime, etc.
 *
 * Mounts into a Shadow DOM so xBot CSS cannot bleed into the TW page and
 * TW CSS cannot reach inside and break xBot styles.
 */

import React from "react";
import { createRoot } from "react-dom/client";
import { OverlayRoot } from "./overlay/Overlay";
import { OVERLAY_CSS } from "./overlay/overlay-css";

function mount(): void {
  // Guard: only mount once per page (document_end can fire on SPA navigation)
  if (document.getElementById("xbot-overlay-host")) return;

  const host = document.createElement("div");
  host.id = "xbot-overlay-host";
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

  createRoot(mountPoint).render(<OverlayRoot />);
}

if (document.body) {
  mount();
} else {
  document.addEventListener("DOMContentLoaded", mount, { once: true });
}
