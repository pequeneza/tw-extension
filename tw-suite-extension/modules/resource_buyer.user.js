// ==UserScript==
// @name         Tribal Wars Resource Buyer (Manual Start + Storage Target)
// @namespace    http://tampermonkey.net/
// @version      2.0.0
// @description  Manual-start resource buyer for Tribal Wars premium market. UI is provided by the xBot React overlay.
// @author       ricardofauch (modified) + copilot rewrite
// @match        https://*.tribalwars.com.pt/*game.php?*&screen=market&mode=exchange*
// @grant        none
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  // ────────────────────────────────────────────────
  // CONFIGURATION
  // ────────────────────────────────────────────────
  const DEFAULT_CONFIG = {
    ENABLED: true,
    buy_wood: true,
    buy_stone: true,
    buy_iron: true,
    priority: ['wood', 'stone', 'iron'],
    MAX_PREMIUM_POINTS: 5000,
    PREMIUM_POINTS_TIMEOUT: 600000, // 10 min
    PURCHASE_PERCENTAGE: 0.70,
    MIN_STOCK_THRESHOLD: 50,
    PAGE_RELOAD_INTERVAL: 10000,
    RANDOM_INTERVAL_MIN: 50,
    RANDOM_INTERVAL_MAX: 180
  };

  function loadConfig() {
    try { return JSON.parse(localStorage.getItem('tw_buyer_config') || '{}'); } catch { return {}; }
  }
  function persistConfig(cfg) {
    localStorage.setItem('tw_buyer_config', JSON.stringify(cfg));
  }

  let config = Object.assign({}, DEFAULT_CONFIG, loadConfig());
  let running = false;
  let reloadInterval = null;
  let cycleTimeout = null;

  // ────────────────────────────────────────────────
  // REACT OVERLAY BRIDGE
  // ────────────────────────────────────────────────
  function dispatchState() {
    document.dispatchEvent(new CustomEvent('xbot:buyer:state', {
      detail: { running, config }
    }));
  }

  // React → userscript: start
  document.addEventListener('xbot:buyer:start', () => {
    if (!config.ENABLED || running) return;
    setRunning(true);
  });

  // React → userscript: stop
  document.addEventListener('xbot:buyer:stop', () => {
    setRunning(false);
  });

  // React → userscript: save new config
  document.addEventListener('xbot:buyer:save', (e) => {
    const incoming = e.detail && e.detail.config;
    if (!incoming) return;
    config = Object.assign({}, DEFAULT_CONFIG, incoming);
    persistConfig(config);
    restartIntervals();
    dispatchState();
    console.log('[Buyer] Config saved via overlay');
  });

  // React → userscript: state probe (overlay just opened)
  document.addEventListener('xbot:buyer:getState', () => {
    dispatchState();
  });

  // ────────────────────────────────────────────────
  // RUN LOOP
  // ────────────────────────────────────────────────
  function setRunning(state) {
    running = state;
    dispatchState();

    if (cycleTimeout) { clearTimeout(cycleTimeout); cycleTimeout = null; }
    restartIntervals();

    if (running) {
      scheduleNextCycle(50 + Math.random() * 250);
      console.log('[Buyer] Started');
    } else {
      console.log('[Buyer] Stopped');
    }
  }

  function scheduleNextCycle(ms) {
    if (!running) return;
    cycleTimeout = setTimeout(async () => {
      try {
        await checkAndBuyResources();
      } catch (e) {
        console.error('[Buyer] Cycle error:', e);
      } finally {
        if (running) scheduleNextCycle(1000 + Math.random() * 2000);
      }
    }, ms);
  }

  function restartIntervals() {
    if (reloadInterval) clearInterval(reloadInterval);
    reloadInterval = null;
    if (!config.ENABLED || !running) return;
    reloadInterval = setInterval(() => {
      console.log('[Buyer] Scheduled safety reload');
      location.reload();
    }, config.PAGE_RELOAD_INTERVAL);
  }

  // ────────────────────────────────────────────────
  // DOM READERS
  // ────────────────────────────────────────────────
  function readStorageCapacity() {
    const el = document.querySelector('#storage');
    if (!el) return null;
    const n = parseInt(el.textContent.replace(/\D/g, ''), 10);
    return Number.isNaN(n) ? null : n;
  }

  function readVillageResource(res) {
    const el = document.getElementById(res);
    if (!el) return null;
    const n = parseInt(el.textContent.replace(/\D/g, ''), 10);
    return Number.isNaN(n) ? null : n;
  }

  function readExchangeStock(res) {
    const el = document.getElementById(`premium_exchange_stock_${res}`);
    if (!el) return null;
    const n = parseInt(el.textContent.replace(/\D/g, ''), 10);
    return Number.isNaN(n) ? null : n;
  }

  function readPremiumPoints() {
    const candidates = [
      document.querySelector('#premium_points'),
      document.querySelector('.premium_points'),
      document.querySelector('#premium'),
      document.querySelector('.icon.header.premium')?.closest('th'),
      document.querySelector('[class*="premium"] [class*="amount"]')
    ].filter(Boolean);

    for (const el of candidates) {
      const n = parseInt(el.textContent.replace(/\D/g, ''), 10);
      if (!Number.isNaN(n) && n >= 0) return n;
    }
    return null;
  }

  // ────────────────────────────────────────────────
  // CORE ACTIONS
  // ────────────────────────────────────────────────
  async function checkPremiumPointsGuard() {
    const pp = readPremiumPoints();
    if (pp === null) {
      console.warn('[Buyer] Could not read premium points → blocking buying (fail-safe).');
      return false;
    }
    console.log(`[Buyer] Premium points currently: ${pp}`);
    if (pp > config.MAX_PREMIUM_POINTS) {
      console.warn(`[Buyer] PP (${pp}) > MAX (${config.MAX_PREMIUM_POINTS}) → waiting ${Math.round(config.PREMIUM_POINTS_TIMEOUT / 60000)} min`);
      await new Promise((r) => setTimeout(r, config.PREMIUM_POINTS_TIMEOUT));
      return false;
    }
    return true;
  }

  function checkForUsageWarningAndReload() {
    const errors = document.querySelectorAll('.error_box');
    for (const el of errors) {
      const t = (el.textContent || '').toLowerCase();
      if (t.includes('premium') || t.includes('börse') || t.includes('exchange') || t.includes('market')) {
        console.warn('[Buyer] Usage warning detected → reloading');
        location.reload();
        return true;
      }
    }
    return false;
  }

  function clickBuyButton() {
    const btn = document.querySelector('.btn-premium-exchange-buy');
    if (btn) { console.log('[Buyer] Clicking BUY'); btn.click(); }
    else console.warn('[Buyer] Buy button not found');
  }

  function clickConfirmButton() {
    let attempts = 0;
    const iv = setInterval(() => {
      attempts++;
      const dialog = document.querySelector('.confirmation-box');
      if (dialog && dialog.style.display !== 'none') {
        clearInterval(iv);
        const yes = document.querySelector('.btn-confirm-yes');
        if (yes) {
          console.log('[Buyer] Clicking YES in confirmation');
          yes.click();
          setTimeout(() => location.reload(), 800 + Math.random() * 400);
        }
      }
      if (attempts > 80) clearInterval(iv);
    }, 40);
  }

  async function checkAndBuyResources() {
    if (!running || !config.ENABLED) return;
    console.log('─ Resource check cycle ─');

    if (checkForUsageWarningAndReload()) return;

    const ppOk = await checkPremiumPointsGuard();
    if (!ppOk) return;

    const storageCap = readStorageCapacity();
    if (storageCap === null) {
      console.warn('[Buyer] Cannot read storage capacity. Aborting cycle.');
      return;
    }

    let purchased = false;

    for (const res of config.priority) {
      if (!config[`buy_${res}`]) { console.log(`[Buyer] ${res} disabled`); continue; }

      const stock = readExchangeStock(res);
      if (stock === null) { console.warn(`[Buyer] Cannot read stock for ${res}`); continue; }
      if (stock <= config.MIN_STOCK_THRESHOLD) { console.log(`[Buyer] ${res} stock too low`); continue; }

      const current = readVillageResource(res);
      if (current === null) { console.warn(`[Buyer] Cannot read village ${res}`); continue; }

      const target  = Math.floor(storageCap * config.PURCHASE_PERCENTAGE);
      const missing = target - current;
      console.log(`[Buyer] ${res.toUpperCase()} ${current} → target ${target} | missing ${missing} | stock ${stock}`);

      if (missing <= 0) continue;

      const amount = Math.min(missing, stock);
      if (amount <= 0) continue;

      const input = document.querySelector(`#premium_exchange_buy_${res} input`);
      if (!input) { console.warn(`[Buyer] Input not found for ${res}`); continue; }

      console.log(`[Buyer] → Buying ${amount} ${res.toUpperCase()}`);
      input.value = amount;

      const buyDelay  = Math.random() * (config.RANDOM_INTERVAL_MAX - config.RANDOM_INTERVAL_MIN) + config.RANDOM_INTERVAL_MIN;
      const confDelay = buyDelay + 80 + Math.random() * 120;

      setTimeout(clickBuyButton,   buyDelay);
      setTimeout(clickConfirmButton, confDelay);

      purchased = true;
      break;
    }

    if (!purchased) {
      const delay = 600 + Math.random() * 5000;
      console.log(`[Buyer] Nothing to buy → reload in ~${Math.round(delay / 1000)}s`);
      setTimeout(() => location.reload(), delay);
    }
  }

  // ────────────────────────────────────────────────
  // STARTUP
  // ────────────────────────────────────────────────
  console.log('Resource Buyer v2.0.0 • xBot overlay mode');
  dispatchState(); // announce presence to overlay
})();
