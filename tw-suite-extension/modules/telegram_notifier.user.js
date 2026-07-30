// ==UserScript==
// @name         Tribal Wars - xBot Telegram Notifier
// @match        https://*.tribalwars.com.pt/game.php*
// @grant        none
// ==/UserScript==
(function () {
  "use strict";
  if (window.__xbotTelegramRunning) return;
  window.__xbotTelegramRunning = true;

  const SETTINGS_KEY = "tm_telegram_settings";
  const DEFAULT_SETTINGS = {
    active: false,
    botToken: "",
    chatId: "",
    notifyOnCaptcha: true,
    notifyOnSend: true,
    notifyOnNoble: true,
    cooldownMs: 5 * 60 * 1000,
  };

  let _settings = loadSettings();
  let _captchaDetected = false;
  let _lastSentAt = {};
  let _lastError = null; // last Telegram API rejection/failure, for visibility in the panel

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS };
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch { return { ...DEFAULT_SETTINGS }; }
  }

  function saveSettings(s) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    _settings = s;
  }

  function broadcastState() {
    document.dispatchEvent(new CustomEvent("xbot:telegram:state", {
      detail: {
        active: _settings.active,
        botToken: _settings.botToken,
        chatId: _settings.chatId,
        notifyOnCaptcha: _settings.notifyOnCaptcha,
        notifyOnSend: _settings.notifyOnSend,
        notifyOnNoble: _settings.notifyOnNoble,
        cooldownMs: _settings.cooldownMs,
        lastSentAt: { ..._lastSentAt },
        captchaDetected: _captchaDetected,
        lastError: _lastError,
      },
    }));
  }

  // Returns whether the message was actually accepted by Telegram — callers
  // that need retry-on-failure (see the noble queue below) rely on this,
  // since a resolved fetch() with a non-2xx/ok:false body previously looked
  // identical to success here (only a network-level exception was ever
  // caught), silently swallowing rate limits, a bad token, or an unknown
  // chat_id with zero visibility into why a message never arrived.
  async function sendTelegram(text) {
    const { botToken, chatId } = _settings;
    if (!botToken || !chatId) return false;
    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error("[xBot Telegram] send rejected", res.status, body);
        _lastError = `HTTP ${res.status}: ${body.slice(0, 200)}`;
        broadcastState();
        return false;
      }
      _lastError = null;
      return true;
    } catch (e) {
      console.error("[xBot Telegram] send failed", e);
      _lastError = String(e && e.message || e);
      broadcastState();
      return false;
    }
  }

  function maybeSend(eventType, text) {
    if (!_settings.active) return;
    const now = Date.now();
    const last = _lastSentAt[eventType] ?? 0;
    if (now - last < _settings.cooldownMs) return;
    _lastSentAt[eventType] = now;
    sendTelegram(text);
    broadcastState();
  }

  function buildCaptchaMsg() {
    const gd = window.game_data ?? {};
    const world = gd.world ?? "?";
    const village = gd.village
      ? `${gd.village.name} (${gd.village.x}|${gd.village.y})`
      : "?";
    const time = new Date().toLocaleTimeString("pt-PT");
    return `⚠️ xBot: Captcha detetado!\nMundo: ${world}\nAldeia: ${village}\nHora: ${time}`;
  }

  function onCaptchaDetected() {
    if (_captchaDetected) return;
    _captchaDetected = true;
    broadcastState();
    if (_settings.notifyOnCaptcha) {
      maybeSend("captcha", buildCaptchaMsg());
    }
  }

  // ── Captcha detection ─────────────────────────────────────────────────────

  function isCaptchaElement(el) {
    if (!el || el.nodeType !== 1) return false;
    const id = el.id ?? "";
    const cls = typeof el.className === "string" ? el.className : "";
    const title = el.getAttribute ? (el.getAttribute("data-title") ?? "") : "";
    return (
      id === "bot_check" ||
      id === "botcheck_content" ||
      id === "botprotection_quest" ||
      cls.includes("botcheck") ||
      cls.includes("bot-check") ||
      cls.includes("bot-protection-row") ||
      title === "Proteção contra Bots" ||
      (cls.includes("quest_new") && !!(el.closest?.("#botprotection_quest") || el.closest?.("[data-title='Proteção contra Bots']")))
    );
  }

  function checkDomForCaptcha() {
    return !!(
      document.getElementById("bot_check") ||
      document.getElementById("botcheck_content") ||
      document.getElementById("botprotection_quest") ||
      document.querySelector(".botcheck") ||
      document.querySelector(".bot-check") ||
      document.querySelector(".bot-protection-row") ||
      document.querySelector("[data-title='Proteção contra Bots']") ||
      document.querySelector("#botprotection_quest .quest_new")
    );
  }

  // URL check
  if (/bot_check|botcheck|botprotection/.test(window.location.search + window.location.href)) {
    onCaptchaDetected();
  }

  // DOM check on load
  if (checkDomForCaptcha()) {
    onCaptchaDetected();
  }

  // MutationObserver
  const _observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (isCaptchaElement(node)) { onCaptchaDetected(); return; }
        if (node.nodeType === 1) {
          const inner = node.querySelector
            ? node.querySelector("#bot_check, #botcheck_content, #botprotection_quest, .botcheck, .bot-check, .bot-protection-row, [data-title='Proteção contra Bots'], #botprotection_quest .quest_new")
            : null;
          if (inner) { onCaptchaDetected(); return; }
        }
      }
    }
  });
  _observer.observe(document.body ?? document.documentElement, { childList: true, subtree: true });

  // Periodic poll fallback
  const _pollId = setInterval(() => {
    if (!_captchaDetected && checkDomForCaptcha()) onCaptchaDetected();
  }, 5000);

  // ── CustomEvent bridge ────────────────────────────────────────────────────

  document.addEventListener("xbot:telegram:getState", broadcastState);

  document.addEventListener("xbot:telegram:save", (e) => {
    const d = e.detail;
    if (d && d.settings) {
      saveSettings({ ...DEFAULT_SETTINGS, ...d.settings });
    }
    broadcastState();
  });

  document.addEventListener("xbot:telegram:test", () => {
    const gd = window.game_data ?? {};
    const world = gd.world ?? "?";
    const time = new Date().toLocaleTimeString("pt-PT");
    sendTelegram(`✅ xBot: Teste de notificacao!\nMundo: ${world}\nHora: ${time}`);
  });

  function fmtTime(ms) {
    if (!ms) return "—";
    const d = new Date(ms);
    const p2 = (n) => String(n).padStart(2, "0");
    const p3 = (n) => String(n).padStart(3, "0");
    return `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}.${p3(d.getMilliseconds())}`;
  }

  function readDomArrivalMs(tgt) {
    // Find a command-row whose quickedit-label contains the target coords
    const rows = document.querySelectorAll(".command-row");
    for (const row of rows) {
      const label = row.querySelector(".quickedit-label");
      if (!label || !label.textContent.includes(tgt)) continue;
      const endEl = row.querySelector("[data-endtime]");
      if (!endEl) continue;
      const s = parseInt(endEl.getAttribute("data-endtime"), 10);
      if (!isNaN(s) && s > 0) return s * 1000;
    }
    return null;
  }

  function buildSentMsg(e) {
    const confirmedArrival = readDomArrivalMs(e.tgt);
    const arrivalMs  = confirmedArrival || e.arrival || null;
    const sendMs     = (arrivalMs && e.travelMs) ? arrivalMs - e.travelMs : (e.launch || null);
    const unitsStr   = Object.entries(e.units || {})
      .filter(([, n]) => n > 0)
      .map(([u, n]) => `${u}:${n}`)
      .join(", ") || "—";
    const isSnipe   = !!e.cancelAfterMs;
    const typeLabel = isSnipe ? "🎯 Snipe" : (e.type === "support" ? "🛡 Support" : "⚔️ Attack");
    let msg = `${typeLabel} enviado!\nDe: ${e.src}\nPara: ${e.tgt}`;
    msg += `\nEnvio: ${fmtTime(sendMs)}\nChegada: ${fmtTime(arrivalMs)}`;
    if (isSnipe && e.gapAfterMs && e.gapBeforeMs) {
      msg += `\nGap: ${fmtTime(e.gapAfterMs)} → ${fmtTime(e.gapBeforeMs)}`;
    }
    msg += `\nUnidades: ${unitsStr}`;
    if (e.note) msg += `\nNota: ${e.note}`;
    return msg;
  }

  document.addEventListener("xbot:autosender:sent", (ev) => {
    if (!_settings.notifyOnSend) return;
    maybeSend("autosend", buildSentMsg(ev.detail));
  });

  // ── Nobre (noble) detection on the incomings overview ────────────────────
  // Notified once per distinct command, not gated by cooldownMs: a blanket
  // cooldown would silence a genuinely different noble arriving minutes
  // after the first one, which defeats the point of the alert. Dedup is by
  // command ID instead, persisted so a command already alerted on doesn't
  // re-fire on the next poll or after a page reload.

  const NOTIFIED_NOBLES_KEY = "tm_telegram_notified_nobles";
  const NOBLE_NOTIFY_STALE_MS = 48 * 3600_000; // safety-net prune only

  function loadNotifiedNobles() {
    try {
      const raw = localStorage.getItem(NOTIFIED_NOBLES_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return (parsed && typeof parsed === "object") ? parsed : {};
    } catch (e) { return {}; }
  }

  function saveNotifiedNobles(map) {
    const now = Date.now();
    for (const [id, ts] of Object.entries(map)) {
      if (typeof ts !== "number" || (now - ts) > NOBLE_NOTIFY_STALE_MS) delete map[id];
    }
    try { localStorage.setItem(NOTIFIED_NOBLES_KEY, JSON.stringify(map)); } catch (e) { /* ignore */ }
  }

  // Icon check first, same "snob"/"nobre" substring convention already
  // proven for this exact purpose in mass_label_renamer.user.js's own
  // isNoble() — the noble-train icon doesn't change no matter what happens
  // to the label afterwards, unlike the text below. Label is only a
  // fallback, and matched as a SUBSTRING, not an exact match: mass_label_
  // renamer's own autoFake (or manual tagging, or anything else) can rename
  // "Nobre" to "Nobre [Fake]" between one poll and the next, and an exact
  // match would then silently and permanently stop matching that row —
  // which is exactly how a message could go missing before this fix.
  function isNobleRow(row) {
    const imgs = row.querySelectorAll("img");
    for (const img of imgs) {
      const src = img.getAttribute("src") || "";
      if (src.indexOf("snob") >= 0 || src.indexOf("nobre") >= 0) return true;
    }
    const labelEl = row.querySelector(":scope > td:first-child .quickedit-label");
    const label = labelEl ? labelEl.textContent.trim().toLowerCase() : "";
    return label.indexOf("nobre") >= 0;
  }

  // Same table/row shape as attack_intel.user.js and mass_label_renamer.user.js
  // (they all read the same incomings overview) — tr.nowrap marks a real
  // command row, td[0] carries the data-command-id, td[2]/td[3]/td[5] are
  // origin/player/arrival.
  function parseNobleRow(row) {
    const tds = row.querySelectorAll(":scope > td");
    if (tds.length < 6) return null;
    if (!isNobleRow(row)) return null;

    const idEl = tds[0].querySelector("[data-command-id]");
    const cmdId = idEl ? idEl.getAttribute("data-command-id") : null;
    if (!cmdId) return null;

    return {
      cmdId,
      srcText: tds[2] ? tds[2].textContent.trim().replace(/\s+/g, " ") : "?",
      player: tds[3] ? tds[3].textContent.trim() : "?",
      arrivalText: tds[5] ? tds[5].textContent.trim().replace(/\s+/g, " ") : "?",
    };
  }

  function buildNobleMsg(n) {
    const gd = window.game_data ?? {};
    const world = gd.world ?? "?";
    return `♟️ xBot: Nobre detetado nos incomings!\nMundo: ${world}\nOrigem: ${n.srcText}\nJogador: ${n.player}\nChegada: ${n.arrivalText}`;
  }

  // Returns whether the send actually succeeded — the queue below only
  // marks a command as notified once this is true, so a rejected/failed
  // send (rate limit, transient network issue, etc.) leaves the command
  // eligible to be retried on the very next poll instead of being silently
  // dropped forever.
  async function notifyNoble(n) {
    _lastSentAt["noble"] = Date.now();
    const ok = await sendTelegram(buildNobleMsg(n));
    broadcastState();
    return ok;
  }

  // Sequential queue, ~700ms apart: Telegram recommends no more than ~1
  // message/second to a single chat, and a page that just loaded with
  // several already-pending nobles would otherwise fire all of them at
  // once, risking exactly the kind of rate-limit rejection that used to be
  // invisible before the sendTelegram fix above. _noblePending (in-memory,
  // not persisted) stops the same command being queued twice while it's
  // already queued or in flight — the persisted "notified" map is only
  // updated on confirmed success.
  const _noblePending = new Set();
  let _nobleQueue = [];
  let _nobleQueueRunning = false;

  function drainNobleQueue() {
    if (!_nobleQueue.length) { _nobleQueueRunning = false; return; }
    _nobleQueueRunning = true;
    const n = _nobleQueue.shift();
    notifyNoble(n).then((ok) => {
      _noblePending.delete(n.cmdId);
      if (ok) {
        const notified = loadNotifiedNobles();
        notified[n.cmdId] = Date.now();
        saveNotifiedNobles(notified);
      }
      setTimeout(drainNobleQueue, 700);
    });
  }

  function scanForNobles() {
    if (!_settings.active || !_settings.notifyOnNoble) return;
    const rows = document.querySelectorAll("#incomings_table tr.nowrap");
    if (!rows.length) return;

    const notified = loadNotifiedNobles();

    rows.forEach((row) => {
      const n = parseNobleRow(row);
      if (!n || notified[n.cmdId] || _noblePending.has(n.cmdId)) return;
      _noblePending.add(n.cmdId);
      _nobleQueue.push(n);
    });

    if (_nobleQueue.length && !_nobleQueueRunning) drainNobleQueue();
  }

  const isIncomingsPage = /screen=overview_villages/.test(window.location.href) &&
                          /mode=incomings/.test(window.location.href);
  let _noblePollId = null;
  if (isIncomingsPage) {
    scanForNobles(); // instant check on load, don't wait for the first poll tick
    _noblePollId = setInterval(scanForNobles, 5000);
  }

  // Initial broadcast
  broadcastState();

  window.addEventListener("unload", () => {
    clearInterval(_pollId);
    if (_noblePollId) clearInterval(_noblePollId);
    _observer.disconnect();
  });
})();
