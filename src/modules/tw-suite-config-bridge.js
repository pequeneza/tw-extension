/**
 * tw-suite-config-bridge.js
 *
 * Injected into the page context BEFORE each userscript.
 * Reads window.__XBOT_CFG__ (placed by the content router) and exposes
 * window.__twSuiteCfg(moduleId) for userscripts to call.
 *
 * Usage inside a userscript:
 *   const cfg = window.__twSuiteCfg('fakes');
 */
(function () {
  'use strict';

  if (window.__twSuiteCfg) return; // already defined — only run once

  window.__twSuiteCfg = function (moduleId) {
    try {
      const all = window.__XBOT_CFG__;
      if (all && typeof all === 'object' && all[moduleId]) {
        return all[moduleId];
      }
    } catch (_) {}
    return {};
  };
})();
