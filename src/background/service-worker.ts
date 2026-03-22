/**
 * xBot — Background service worker (MV3).
 *
 * On install: all modules default to DISABLED (opt-in model).
 * Users explicitly enable what they want — this prevents scripts from
 * running unintentionally when navigating between TW pages.
 *
 * On update: any newly added module IDs are written as false (disabled)
 * so existing users don't get unexpected new scripts running.
 */

import { MODULE_CONFIGS, STORAGE_KEY } from "../types/modules";
import type { ModuleSettings } from "../types/modules";

type BgMessage =
  | { type: "GET_ACTIVE_TAB_URL" }
  | { type: "RELOAD_ACTIVE_TAB" };

type BgResponse =
  | { type: "ACTIVE_TAB_URL"; url: string | null }
  | { type: "ACK" };

// ─── Install / update ─────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === "install") {
    // Fresh install — all modules OFF by default (explicit opt-in)
    const defaults: ModuleSettings = {};
    for (const mod of MODULE_CONFIGS) defaults[mod.id] = false;

    chrome.storage.sync.set({ [STORAGE_KEY]: defaults }, () => {
      console.log("[xBot] Installed — all modules disabled. Enable what you need.");
    });
    return;
  }

  if (reason === "update") {
    // Extension updated — keep existing settings, but add any new module IDs as false
    chrome.storage.sync.get(STORAGE_KEY, (result) => {
      const existing = (result[STORAGE_KEY] as ModuleSettings) ?? {};
      let changed = false;

      for (const mod of MODULE_CONFIGS) {
        if (!(mod.id in existing)) {
          existing[mod.id] = false; // new module → disabled by default
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
