/**
 * xBot — Content script, runs at document_end on every TW game page.
 *
 * Checks the global bot enabled flag first. If the bot is off, nothing runs.
 * If on, injects only modules that are explicitly enabled and URL-matched.
 */

import { MODULE_CONFIGS, STORAGE_KEY, ModuleSettings } from "../types/modules";
import { MODULE_CONFIG_SCHEMAS } from "../types/config-schemas";

const BOT_ENABLED_KEY = "xbot_enabled";

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
  // Global kill-switch: if bot is not explicitly enabled, do nothing
  const botEnabled = (result[BOT_ENABLED_KEY] as boolean) === true;
  if (!botEnabled) return;

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
    if (settings[mod.id] !== true) continue;
    if (!mod.matchPattern.test(window.location.href)) continue;
    injectScript(chrome.runtime.getURL(`modules/${mod.scriptFile}`));
  }
});
