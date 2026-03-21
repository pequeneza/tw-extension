/**
 * Background service worker (MV3).
 *
 * Deliberately has NO fetch handler — MV3 extension service workers don't
 * intercept page fetches and Chrome emits a console warning if you register
 * a no-op fetch listener.
 *
 * Responsibilities:
 *  - On install: write default enabled-state for all modules.
 *  - Message bus: GET_ACTIVE_TAB_URL / RELOAD_ACTIVE_TAB for the popup.
 */

import { MODULE_CONFIGS, STORAGE_KEY } from "../types/modules";
import type { ModuleSettings } from "../types/modules";

// ─── Types ────────────────────────────────────────────────────────────────────
type BgMessage =
  | { type: "GET_ACTIVE_TAB_URL" }
  | { type: "RELOAD_ACTIVE_TAB" };

type BgResponse =
  | { type: "ACTIVE_TAB_URL"; url: string | null }
  | { type: "ACK" };

// ─── Install: set defaults ────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason !== "install") return;

  const defaults: ModuleSettings = {};
  for (const mod of MODULE_CONFIGS) defaults[mod.id] = true;

  chrome.storage.sync.set({ [STORAGE_KEY]: defaults }, () => {
    console.log("[TW Suite] First install — all modules enabled by default.");
  });
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
        return true; // keep message channel open for async reply

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
