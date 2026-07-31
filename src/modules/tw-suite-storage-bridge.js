/**
 * tw-suite-storage-bridge.js — prepended to every userscript at build time.
 *
 * Exposes window.__twStorage = { get(key), set(key, value), remove(key) },
 * each returning a Promise, implemented as dispatch-and-listen with a unique
 * requestId and a 2-second timeout so missing listeners don't hang callers.
 *
 * Usage inside a userscript:
 *   const val = await window.__twStorage.get('my_key');
 *   await window.__twStorage.set('my_key', { data: 123 });
 *   await window.__twStorage.remove('my_key');
 */
(function () {
  'use strict';

  if (window.__twStorage) return; // already defined — only run once

  var _requestId = 0;

  function request(eventName, detail) {
    return new Promise(function (resolve) {
      var reqId = ++_requestId;
      var timeout = setTimeout(function () {
        document.removeEventListener('xbot:storage:result', handler);
        resolve(undefined);
      }, 2000);

      function handler(e) {
        if ((e.detail || {}).requestId !== reqId) return;
        clearTimeout(timeout);
        document.removeEventListener('xbot:storage:result', handler);
        resolve(e.detail);
      }

      document.addEventListener('xbot:storage:result', handler);
      document.dispatchEvent(new CustomEvent(eventName, { detail: Object.assign({ requestId: reqId }, detail) }));
    });
  }

  window.__twStorage = {
    get: function (key) {
      return request('xbot:storage:get', { key }).then(function (r) {
        return r ? r.value : undefined;
      });
    },
    set: function (key, value) {
      return request('xbot:storage:set', { key: key, value: value });
    },
    remove: function (key) {
      return request('xbot:storage:remove', { key: key });
    },
  };
})();
