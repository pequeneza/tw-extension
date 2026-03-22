/**
 * xBot — Content script, runs at document_end on every TW game page.
 *
 * Checks the global bot enabled flag first. If the bot is off, nothing runs.
 * If on:
 *  1. Writes per-module config to sessionStorage["__xbot_cfg__"] — CSP-safe,
 *     no inline <script> needed. Content scripts and page scripts share the
 *     same sessionStorage for a given tab.
 *  2. Injects each enabled, URL-matched module script via <script src="...">.
 *
 * NOTE: The config bridge (window.__twSuiteCfg) is baked into every userscript
 * by vite.config.ts at build time — no separate bridge injection needed here.
 */

import { MODULE_CONFIGS, STORAGE_KEY, ModuleSettings } from "../types/modules";
import { MODULE_CONFIG_SCHEMAS } from "../types/config-schemas";

const BOT_ENABLED_KEY = "xbot_enabled";
const SESSION_CFG_KEY = "__xbot_cfg__";

function buildStorageKeys(): string[] {
  const keys: string[] = [BOT_ENABLED_KEY, STORAGE_KEY];
  for (const schema of Object.values(MODULE_CONFIG_SCHEMAS)) {
    if (schema) keys.push(schema.storageKey);
  }
  return keys;
}

function injectScript(src: string): void {
  const s = document.createElement("script");
  s.src = src;
  s.type = "text/javascript";
  (document.head ?? document.documentElement).appendChild(s);
}

chrome.storage.sync.get(buildStorageKeys(), (result) => {
  const botEnabled = (result[BOT_ENABLED_KEY] as boolean) === true;
  if (!botEnabled) return;

  const settings = (result[STORAGE_KEY] as ModuleSettings) ?? {};

  // Build per-module config map
  const cfgMap: Record<string, Record<string, unknown>> = {};
  for (const [modId, schema] of Object.entries(MODULE_CONFIG_SCHEMAS)) {
    if (!schema) continue;
    cfgMap[modId] = (result[schema.storageKey] as Record<string, unknown>) ?? {};
  }

  // Expose config via sessionStorage (CSP-safe alternative to inline <script>)
  try {
    sessionStorage.setItem(SESSION_CFG_KEY, JSON.stringify(cfgMap));
  } catch (_) {
    // sessionStorage blocked (e.g. private browsing) — userscripts fall back to {}
  }

  // Inject enabled + URL-matched modules
  for (const mod of MODULE_CONFIGS) {
    if (settings[mod.id] !== true) continue;
    if (!mod.matchPattern.test(window.location.href)) continue;
    injectScript(chrome.runtime.getURL(`modules/${mod.scriptFile}`));
  }
});
