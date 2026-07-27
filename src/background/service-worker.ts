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

const VALIDATION_URL = "https://license.vivaomadeira.com/validate";

type BgMessage =
  | { type: "GET_ACTIVE_TAB_URL" }
  | { type: "RELOAD_ACTIVE_TAB" }
  | { type: "VALIDATE_LICENSE"; key: string }
  | { type: "ARM_NEXT_TAB" };

type BgResponse =
  | { type: "ACTIVE_TAB_URL"; url: string | null }
  | { type: "ACK" }
  | { type: "LICENSE_RESULT"; valid: boolean; expiresAt: string | null };

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

// ─── Open the next tab pinned and non-focused ──────────────────────────────
// A userscript that's about to call window.open() first asks us (via ARM_NEXT_TAB)
// to "arm" its window and WAITS for our ack before actually opening the tab —
// chrome.runtime.sendMessage is asynchronous, so without that handshake
// window.open() could fire before this listener is registered, silently
// dropping the pin/unfocus.
// Once armed, the very next tab created in that window gets pinned and
// deactivated. Deactivating the new tab alone isn't reliable enough — Chrome
// doesn't guarantee it falls back to specifically the opener tab (confirmed:
// the tab still visibly took over even with active:false applied), so we also
// explicitly re-activate the opener tab by id. A brief flash before focus
// snaps back is possible — there's no JS/extension API to stop window.open()
// from focusing the tab it creates in the first place — but this guarantees
// where focus actually lands afterward. Disarms after one use or after
// ARM_TIMEOUT_MS, whichever comes first.
const ARM_TIMEOUT_MS = 4_000;
let armedWindowId: number | null = null;
let armedOpenerTabId: number | null = null;
let armTimer: ReturnType<typeof setTimeout> | null = null;

function armNextTab(windowId: number, openerTabId: number): void {
  armedWindowId = windowId;
  armedOpenerTabId = openerTabId;
  if (armTimer) clearTimeout(armTimer);
  armTimer = setTimeout(() => {
    armedWindowId = null;
    armedOpenerTabId = null;
    armTimer = null;
  }, ARM_TIMEOUT_MS);
}

chrome.tabs.onCreated.addListener((tab) => {
  if (armedWindowId == null || tab.windowId !== armedWindowId) return;
  const openerTabId = armedOpenerTabId;
  armedWindowId = null;
  armedOpenerTabId = null;
  if (armTimer) {
    clearTimeout(armTimer);
    armTimer = null;
  }
  if (tab.id != null) chrome.tabs.update(tab.id, { active: false, pinned: true });
  if (openerTabId != null) chrome.tabs.update(openerTabId, { active: true });
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

      case "ARM_NEXT_TAB": {
        const windowId = _sender.tab?.windowId;
        const tabId = _sender.tab?.id;
        if (windowId != null && tabId != null) armNextTab(windowId, tabId);
        sendResponse({ type: "ACK" });
        return true;
      }

      case "VALIDATE_LICENSE":
        fetch(VALIDATION_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: message.key }),
        })
          .then((r) => r.json())
          .then((data: { valid: boolean; expires_at?: string | null }) =>
            sendResponse({ type: "LICENSE_RESULT", valid: data.valid, expiresAt: data.expires_at ?? null }))
          .catch(() => sendResponse({ type: "LICENSE_RESULT", valid: false, expiresAt: null }));
        return true;

      default:
        return undefined;
    }
  },
);