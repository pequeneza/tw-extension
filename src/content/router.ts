/**
 * Content script: runs at document_end on every TW game page.
 *
 * 1. Reads enabled-modules settings from chrome.storage.sync.
 * 2. For each enabled module whose matchPattern hits the current URL,
 *    reads its per-module config and exposes it on window.__TW_SUITE_CFG__
 *    so the injected userscript can pick it up without needing storage access.
 * 3. Injects the userscript into the page context via a <script src> tag.
 */

import { MODULE_CONFIGS, STORAGE_KEY, ModuleSettings } from "../types/modules";
import { MODULE_CONFIG_SCHEMAS } from "../types/config-schemas";

/** Keys we need to fetch: module-enable map + every per-module config key */
function buildStorageKeys(): string[] {
  const keys: string[] = [STORAGE_KEY];
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
  const settings = (result[STORAGE_KEY] as ModuleSettings) ?? {};

  // Collect per-module configs from storage
  const cfgMap: Record<string, Record<string, unknown>> = {};
  for (const [modId, schema] of Object.entries(MODULE_CONFIG_SCHEMAS)) {
    if (!schema) continue;
    cfgMap[modId] = (result[schema.storageKey] as Record<string, unknown>) ?? {};
  }

  // Expose combined config on window for userscripts to consume
  const exposeScript = document.createElement("script");
  exposeScript.textContent = `window.__TW_SUITE_CFG__ = ${JSON.stringify(cfgMap)};`;
  (document.head ?? document.documentElement).appendChild(exposeScript);

  // Inject each enabled+matching module
  for (const mod of MODULE_CONFIGS) {
    const enabled = settings[mod.id] !== false; // default: enabled
    if (!enabled) continue;
    if (!mod.matchPattern.test(window.location.href)) continue;
    injectScript(chrome.runtime.getURL(`modules/${mod.scriptFile}`));
  }
});
