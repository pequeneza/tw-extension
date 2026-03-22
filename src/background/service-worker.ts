/**
 * xBot — Background service worker (MV3).
 *
 * On install: all modules default to DISABLED (opt-in model).
 * On update:  any newly added module IDs are written as false (disabled).
 *
 * The no-op fetch listener below silences Chrome's "no-op fetch handler may
 * bring overhead during navigation" warning. Without it Chrome registers a
 * default passthrough anyway, but flags it as unintentional overhead. An
 * explicit listener that returns undefined (letting the browser handle the
 * request normally) is the recommended suppression pattern.
 */

import { MODULE_CONFIGS, STORAGE_KEY } from "../types/modules";
import type { ModuleSettings } from "../types/modules";

type BgMessage =
  | { type: "GET_ACTIVE_TAB_URL" }
  | { type: "RELOAD_ACTIVE_TAB" };

type BgResponse =
  | { type: "ACTIVE_TAB_URL"; url: string | null }
  | { type: "ACK" };

// ─── Suppress "no-op fetch handler" warning ───────────────────────────────────
// Returning nothing (undefined) lets the browser handle the request normally.
// This is intentionally a pass-through — the extension has no need to intercept
// network requests; we just need Chrome to know the handler is deliberate.
self.addEventListener("fetch", (_event) => {
  // intentional no-op pass-through
});

// ─── Install / update ─────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === "install") {
    const defaults: ModuleSettings = {};
    for (const mod of MODULE_CONFIGS) defaults[mod.id] = false;

    chrome.storage.sync.set({ [STORAGE_KEY]: defaults }, () => {
      console.log("[xBot] Installed — all modules disabled. Enable what you need.");
    });
    return;
  }

  if (reason === "update") {
    chrome.storage.sync.get(STORAGE_KEY, (result) => {
      const existing = (result[STORAGE_KEY] as ModuleSettings) ?? {};
      let changed = false;

      for (const mod of MODULE_CONFIGS) {
        if (!(mod.id in existing)) {
          existing[mod.id] = false;
          changed = true;
        }
      }

      if (changed) {
        chrome.storage.sync.set({ [STORAGE_KEY]: existing }, () => {
          console.log("[xBot] Updated — new modules added as disabled.");
        });
      }
    });
  }
});

// ─── Message bus ──────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener(
  (
    message: BgMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (r: BgResponse) => void,
  ): true | undefined => {
    switch (message.type) {
      case "GET_ACTIVE_TAB_URL":
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          sendResponse({ type: "ACTIVE_TAB_URL", url: tabs[0]?.url ?? null });
        });
        return true;

      case "RELOAD_ACTIVE_TAB":
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const id = tabs[0]?.id;
          if (id != null) chrome.tabs.reload(id);
          sendResponse({ type: "ACK" });
        });
        return true;

      default:
        return undefined;
    }
  },
);