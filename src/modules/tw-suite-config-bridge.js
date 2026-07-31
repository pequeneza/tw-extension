/**
 * tw-suite-config-bridge.js
 *
 * Prepended to every userscript at build time by vite.config.ts.
 * Reads per-module config from window.__xbotCfg (set by background service worker's
 * chrome.scripting.executeScript func-injection — never touches sessionStorage/localStorage).
 * Exposes window.__twSuiteCfg(moduleId) for userscripts to call.
 *
 * Usage inside a userscript:
 *   const cfg = window.__twSuiteCfg('fakes');
 */
(function () {
  'use strict';

  if (window.__twSuiteCfg) return; // already defined — only run once

  window.__twSuiteCfg = function (moduleId) {
    try {
      var all = window.__xbotCfg;
      if (all && typeof all === 'object' && all[moduleId]) {
        return all[moduleId];
      }
    } catch (_) {}
    return {};
  };
})();
