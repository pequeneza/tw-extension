/**
 * tw-suite-config-bridge.js
 *
 * Tiny runtime helper injected into the page context BEFORE each userscript.
 * Reads window.__TW_SUITE_CFG__ (placed there by the content router) and
 * exposes a single helper that modules can call to get their merged config.
 *
 * Usage inside a userscript wrapper:
 *   const cfg = window.__twSuiteCfg('fakes');
 *   // cfg is an object with the user's saved values (or defaults if none saved)
 */
(function () {
  'use strict';

  if (window.__twSuiteCfg) return; // already defined

  /**
   * Returns the saved config for a given module id.
   * Falls back to an empty object if nothing has been stored yet —
   * each userscript already has its own internal defaults, so this is safe.
   *
   * @param {string} moduleId  e.g. "fakes", "wh_balancer"
   * @returns {Record<string, any>}
   */
  window.__twSuiteCfg = function (moduleId) {
    try {
      const all = window.__TW_SUITE_CFG__;
      if (all && typeof all === 'object' && all[moduleId]) {
        return all[moduleId];
      }
    } catch (_) {}
    return {};
  };
})();
