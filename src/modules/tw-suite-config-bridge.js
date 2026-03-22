/**
 * tw-suite-config-bridge.js
 *
 * Prepended to every userscript at build time by vite.config.ts.
 * Reads per-module config from sessionStorage["__xbot_cfg__"] and exposes
 * window.__twSuiteCfg(moduleId) for userscripts to call.
 *
 * Why sessionStorage instead of window.__XBOT_CFG__:
 *   The content script cannot write to page-context globals via inline <script>
 *   because TW's CSP blocks 'unsafe-inline'. sessionStorage is shared between
 *   the content script world and the page, so it works without any CSP exemption.
 *
 * Usage inside a userscript:
 *   const cfg = window.__twSuiteCfg('fakes');
 */
(function () {
  'use strict';

  if (window.__twSuiteCfg) return; // already defined — only run once

  var _cache = null;

  function loadCfg() {
    if (_cache !== null) return _cache;
    try {
      var raw = sessionStorage.getItem('__xbot_cfg__');
      _cache = raw ? JSON.parse(raw) : {};
    } catch (_) {
      _cache = {};
    }
    return _cache;
  }

  window.__twSuiteCfg = function (moduleId) {
    try {
      var all = loadCfg();
      if (all && typeof all === 'object' && all[moduleId]) {
        return all[moduleId];
      }
    } catch (_) {}
    return {};
  };
})();