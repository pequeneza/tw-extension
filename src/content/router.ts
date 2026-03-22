/**
 * xBot — Content script, runs at document_end on every TW game page.
 *
 * 1. Always injects the overlay (trigger button + panel).
 * 2. Reads storage → injects only modules that are:
 *    a) explicitly enabled (settings[id] === true)  ← strict equality, no default-on
 *    b) whose matchPattern matches the current URL
 *
 * The strict `=== true` check is the critical fix: a missing key in storage
 * now means DISABLED, not enabled. This prevents scripts from running on
 * page navigation before the user has intentionally enabled them.
 */

import { MODULE_CONFIGS, STORAGE_KEY, ModuleSettings } from "../types/modules";
import { MODULE_CONFIG_SCHEMAS } from "../types/config-schemas";

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

// Overlay is always injected — it's the control panel, not a module
injectScript(chrome.runtime.getURL("content/overlay.js"));

// Read storage once, then inject only explicitly-enabled matching modules
chrome.storage.sync.get(buildStorageKeys(), (result) => {
  const settings = (result[STORAGE_KEY] as ModuleSettings) ?? {};

  // Expose per-module config on window for userscripts
  const cfgMap: Record<string, Record<string, unknown>> = {};
  for (const [modId, schema] of Object.entries(MODULE_CONFIG_SCHEMAS)) {
    if (!schema) continue;
    cfgMap[modId] = (result[schema.storageKey] as Record<string, unknown>) ?? {};
  }

  const exposeScript = document.createElement("script");
  exposeScript.textContent = `window.__XBOT_CFG__ = ${JSON.stringify(cfgMap)};`;
  (document.head ?? document.documentElement).appendChild(exposeScript);

  for (const mod of MODULE_CONFIGS) {
    // STRICT: must be explicitly true — missing key = disabled
    if (settings[mod.id] !== true) continue;
    if (!mod.matchPattern.test(window.location.href)) continue;
    injectScript(chrome.runtime.getURL(`modules/${mod.scriptFile}`));
  }
});
