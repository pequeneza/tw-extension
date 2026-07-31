/**
 * xBot — Content script, runs at document_end on every TW game page.
 *
 * Checks the global bot enabled flag and a valid license first.
 * If either is missing, nothing runs.
 * If both pass:
 *  1. Writes per-module config to sessionStorage["__xbot_cfg__"] — CSP-safe,
 *     no inline <script> needed. Content scripts and page scripts share the
 *     same sessionStorage for a given tab.
 *  2. Injects each enabled, URL-matched module script via <script src="...">.
 *
 * NOTE: The config bridge (window.__twSuiteCfg) is baked into every userscript
 * by vite.config.ts at build time — no separate bridge injection needed here.
 */

import { MODULE_CONFIGS, STORAGE_KEY, ModuleSettings, LICENSE_STORAGE_KEY, LICENSE_CACHE_KEY } from "../types/modules";
import { MODULE_CONFIG_SCHEMAS } from "../types/config-schemas";

const BOT_ENABLED_KEY = "xbot_enabled";
const SESSION_CFG_KEY = "__xbot_cfg__";
// Read by main-world modules (e.g. attack_intel.user.js) that need to prove
// license validity to an external service of their own (server-attack-intel)
// — mirrors the SESSION_CFG_KEY bridge below. Only ever written after the
// license check a few lines down has already passed, so anything reading
// this key is reading an already-validated key, not an unverified one.
const SESSION_LICENSE_KEY = "__xbot_license_key__";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Mirrors bot-enabled + license-valid into localStorage for fingerprint-shield.ts.
// That script runs MAIN-world at document_start — before chrome.storage is
// reachable and before this file (document_end) even starts on the same load —
// so it can only ever read the state THIS callback wrote on the PREVIOUS load.
const FP_ENABLED_LOCAL_KEY = "xbot_fp_enabled_v1";

function setFpShieldEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(FP_ENABLED_LOCAL_KEY, enabled ? "1" : "0");
  } catch (_) {
    // localStorage blocked — fingerprint-shield.ts fails open to real values
  }
}

// Random UUID, generated once, sent alongside every license check so the
// license server can tell how many distinct installs are using one key —
// logging only for now, nothing here changes whether a check passes or
// fails. Deliberately chrome.storage.sync (not .local): syncing means the
// same Chrome account's own multiple devices naturally share one ID, so
// legitimate multi-device use doesn't inflate the count — only a key handed
// to a genuinely different person (different Chrome account, no sync) shows
// up as a second install. Same non-identity-tied-random-ID pattern already
// used elsewhere in this codebase (e.g. attack_intel's reporter_id).
const INSTALL_ID_KEY = "xbot_install_id";

interface LicenseCache {
  valid: boolean;
  expiresAt: string | null;
  ts: number;
}

async function getOrCreateInstallId(): Promise<string> {
  const existing = await new Promise<string | undefined>((res) =>
    chrome.storage.sync.get(INSTALL_ID_KEY, (r) => res(r[INSTALL_ID_KEY] as string | undefined))
  );
  if (existing) return existing;

  const id = crypto.randomUUID();
  chrome.storage.sync.set({ [INSTALL_ID_KEY]: id });
  return id;
}

function buildStorageKeys(): string[] {
  const keys: string[] = [BOT_ENABLED_KEY, STORAGE_KEY, LICENSE_STORAGE_KEY];
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

async function checkLicense(key: string): Promise<LicenseCache> {
  const cached = await new Promise<LicenseCache | null>((res) =>
    chrome.storage.local.get(LICENSE_CACHE_KEY, (r) =>
      res((r[LICENSE_CACHE_KEY] as LicenseCache) ?? null)
    )
  );

  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached;
  }

  try {
    const installId = await getOrCreateInstallId();
    const { valid, expiresAt } = await new Promise<{ valid: boolean; expiresAt: string | null }>((res, rej) =>
      chrome.runtime.sendMessage({ type: "VALIDATE_LICENSE", key, installId }, (r) =>
        chrome.runtime.lastError ? rej(chrome.runtime.lastError) : res(r)
      )
    );
    const fresh: LicenseCache = { valid, expiresAt, ts: Date.now() };
    chrome.storage.local.set({ [LICENSE_CACHE_KEY]: fresh });
    return fresh;
  } catch {
    return cached ?? { valid: false, expiresAt: null, ts: Date.now() };
  }
}

// Lets a main-world userscript open a tab via window.open() unfocused + pinned.
// chrome.tabs is only reachable from here, so the userscript asks us to "arm"
// its window first. chrome.runtime.sendMessage is asynchronous — we must wait
// for the background's ack and signal the page back via xbot:tabs:armed before
// it's safe to call window.open(); otherwise the tab can be created before the
// background has actually armed, and the pin/unfocus silently never fires.
document.addEventListener("xbot:tabs:armNextTab", () => {
  chrome.runtime.sendMessage({ type: "ARM_NEXT_TAB" }, () => {
    document.dispatchEvent(new CustomEvent("xbot:tabs:armed"));
  });
});

chrome.storage.sync.get(buildStorageKeys(), async (result) => {
  const botEnabled = (result[BOT_ENABLED_KEY] as boolean) === true;
  if (!botEnabled) { setFpShieldEnabled(false); return; }

  const licenseKey = (result[LICENSE_STORAGE_KEY] as string) ?? "";
  if (!licenseKey) { setFpShieldEnabled(false); return; }

  const license = await checkLicense(licenseKey);
  if (!license.valid) { setFpShieldEnabled(false); return; }

  setFpShieldEnabled(true);

  try {
    sessionStorage.setItem(SESSION_LICENSE_KEY, licenseKey);
  } catch (_) {
    // sessionStorage blocked — modules needing this fall back to their own
    // manually-configured key, same as a bare Tampermonkey install would.
  }

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

// Dynamically inject modules toggled ON in the popup without requiring a page reload.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;

  const settingsChange = changes[STORAGE_KEY];
  if (!settingsChange) return;

  const oldSettings = (settingsChange.oldValue as ModuleSettings) ?? {};
  const newSettings = (settingsChange.newValue as ModuleSettings) ?? {};

  for (const mod of MODULE_CONFIGS) {
    const wasEnabled = oldSettings[mod.id] === true;
    const nowEnabled = newSettings[mod.id] === true;
    if (!wasEnabled && nowEnabled && mod.matchPattern.test(window.location.href)) {
      injectScript(chrome.runtime.getURL(`modules/${mod.scriptFile}`));
    }
  }
});
