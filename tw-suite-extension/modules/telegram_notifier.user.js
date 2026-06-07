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
    cooldownMs: 5 * 60 * 1000,
  };

  let _settings = loadSettings();
  let _captchaDetected = false;
  let _lastSentAt = {};

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
        cooldownMs: _settings.cooldownMs,
        lastSentAt: { ..._lastSentAt },
        captchaDetected: _captchaDetected,
      },
    }));
  }

  async function sendTelegram(text) {
    const { botToken, chatId } = _settings;
    if (!botToken || !chatId) return;
    try {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text }),
      });
    } catch (e) {
      console.error("[xBot Telegram] send failed", e);
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

  // Initial broadcast
  broadcastState();

  window.addEventListener("unload", () => {
    clearInterval(_pollId);
    _observer.disconnect();
  });
})();
